'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import PaginationControls from '@/components/PaginationControls';
import { useDebounce } from '@/hooks/useDebounce';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w185';

interface Person {
    id: string;
    tmdb_id: number;
    imdb_id?: string;
    name: string;
    biography?: string;
    birthday?: string;
    deathday?: string;
    place_of_birth?: string;
    profile_path?: string;
    known_for_department?: string;
    popularity?: number;
    gender?: number;
    also_known_as?: string[];
    homepage?: string;
    created_at: string;
    imported_at?: string;
    enriched_at?: string;
}

interface PersonCredits {
    cast: Array<{
        content_id: string;
        content_title: string;
        character: string;
        poster_path?: string;
    }>;
    crew: Array<{
        content_id: string;
        content_title: string;
        job: string;
        department: string;
        poster_path?: string;
    }>;
}

// Reuse QualityBadge from Content Manager (inline for simplicity or could be shared component)
function QualityBadge({ score }: { score: number }) {
    let color = 'bg-red-500/20 text-red-400 border-red-500/50';
    if (score >= 80) color = 'bg-green-500/20 text-green-400 border-green-500/50';
    else if (score >= 50) color = 'bg-amber-500/20 text-amber-400 border-amber-500/50';

    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden w-24">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${score}%` }}
                />
            </div>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${color}`}>
                {score}%
            </span>
        </div>
    );
}

// Calculate quality score for a person relative to desired data richness
function calculatePersonQuality(person: Person): number {
    let score = 0;
    const weights = {
        basic: 40,   // Name, Bio, Birthday, Place of Birth
        media: 30,   // Profile Path
        meta: 30     // IMDB, Homepage, Known For
    };

    // Basic Info (40%)
    let basicScore = 0;
    if (person.name) basicScore += 10;
    if (person.biography && person.biography.length > 50) basicScore += 10;
    if (person.birthday) basicScore += 10;
    if (person.place_of_birth) basicScore += 10;
    score += (basicScore / 40) * weights.basic;

    // Media (30%)
    if (person.profile_path) score += weights.media;

    // Metadata (30%)
    let metaScore = 0;
    if (person.imdb_id) metaScore += 10;
    if (person.homepage) metaScore += 10;
    if (person.known_for_department) metaScore += 10;
    score += (metaScore / 30) * weights.meta;

    return Math.round(score);
}

export default function PeopleManagerPage() {
    const [people, setPeople] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Filters & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState<string>('all');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    // Debounce search query
    const debouncedSearch = useDebounce(searchQuery, 300);

    // Modals
    const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
    const [personCredits, setPersonCredits] = useState<PersonCredits | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Fetch people with pagination
    const fetchPeople = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                pageSize: pageSize.toString(),
                search: debouncedSearch,
                department: departmentFilter === 'all' ? '' : departmentFilter,
            });

            const response = await fetch(`/api/people?${params}`);
            const data = await response.json();

            setPeople(data.people || []);
            setTotalCount(data.totalCount || 0);
            setTotalPages(data.totalPages || 0);
        } catch (error) {
            console.error('Failed to fetch people:', error);
        } finally {
            setLoading(false);
        }
    };

    // Fetch on page/filter/search change
    useEffect(() => {
        fetchPeople();
    }, [currentPage, pageSize, debouncedSearch, departmentFilter]);

    // Reset to page 1 when filters/search change
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch, departmentFilter]);

    // Use people directly (no client-side filtering)
    const filteredPeople = people;

    // Selection logic
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredPeople.map(p => p.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectOne = (id: string, checked: boolean) => {
        const newSelected = new Set(selectedIds);
        if (checked) newSelected.add(id);
        else newSelected.delete(id);
        setSelectedIds(newSelected);
    };

    // Fetch person credits
    const fetchPersonCredits = async (personId: string) => {
        try {
            const response = await fetch(`/api/people/${personId}/credits`);
            const data = await response.json();
            setPersonCredits(data);
        } catch (error) {
            console.error('Failed to fetch credits:', error);
            setPersonCredits({ cast: [], crew: [] });
        }
    };

    // Open detail modal
    const openDetailModal = async (person: Person) => {
        setSelectedPerson(person);
        setIsDetailModalOpen(true);
        await fetchPersonCredits(person.id);
    };

    // Handle delete
    const handleDelete = async () => {
        if (!selectedPerson) return;
        setIsDeleting(true);
        try {
            const response = await fetch(`/api/people/${selectedPerson.id}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                setPeople(prev => prev.filter(p => p.id !== selectedPerson.id));
                setIsDeleteModalOpen(false);
                setSelectedPerson(null);
                setSelectedIds(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(selectedPerson.id);
                    return newSet;
                });
            }
        } catch (error) {
            console.error('Delete failed:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedIds.size} people?`)) return;

        // This would ideally be a bulk API endpoint, but looping for now
        setIsDeleting(true);
        try {
            for (const id of Array.from(selectedIds)) {
                await fetch(`/api/people/${id}`, { method: 'DELETE' });
            }
            setPeople(prev => prev.filter(p => !selectedIds.has(p.id)));
            setSelectedIds(new Set());
        } catch (error) {
            console.error('Bulk delete failed:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    // Stats
    const totalPeople = people.length;
    const avgQuality = Math.round(people.reduce((acc, p) => acc + calculatePersonQuality(p), 0) / (totalPeople || 1));

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                        People Manager
                    </h1>
                    <p className="text-slate-400 mt-2">Manage actors, directors, and crew members</p>
                </div>
                <div className="flex gap-4">
                    <Link
                        href="/admin/tmdb-import?tab=search"
                        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-lg font-medium transition-all shadow-lg hover:shadow-blue-500/25"
                    >
                        + Import New Person
                    </Link>
                </div>
            </div>

            {/* Pagination Controls - Top */}
            <div className="mb-6">
                <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalCount={totalCount}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                    isLoading={loading}
                />
            </div>

            {/* Filter Bar */}
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 mb-6 backdrop-blur-sm">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex items-center gap-4 w-full md:w-auto flex-1">
                        <div className="relative flex-1 max-w-md">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                            <input
                                type="text"
                                placeholder="Search by name or TMDB ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>
                        <select
                            value={departmentFilter}
                            onChange={(e) => setDepartmentFilter(e.target.value)}
                            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="all">All Departments</option>
                            <option value="Acting">Acting</option>
                            <option value="Directing">Directing</option>
                            <option value="Writing">Writing</option>
                            <option value="Production">Production</option>
                        </select>
                    </div>

                    {/* Date Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
                            <label className="text-xs text-slate-400 mb-2 block">📥 Filter by Import Date</label>
                            <div className="flex gap-2">
                                <input
                                    type="date"
                                    placeholder="From"
                                    className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                                />
                                <input
                                    type="date"
                                    placeholder="To"
                                    className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                        <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
                            <label className="text-xs text-slate-400 mb-2 block">✨ Filter by Last Updated</label>
                            <div className="flex gap-2">
                                <input
                                    type="date"
                                    placeholder="From"
                                    className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                                />
                                <input
                                    type="date"
                                    placeholder="To"
                                    className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4">
                        <span className="text-sm text-slate-400">{selectedIds.size} selected</span>
                        <button
                            onClick={handleBulkDelete}
                            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            🗑️ Delete Selected
                        </button>
                    </div>
                )}
            </div>

            {/* People Table */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden backdrop-blur-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-800/50 border-b border-slate-700">
                                <th className="p-4 w-10">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-slate-600 bg-slate-800"
                                        checked={filteredPeople.length > 0 && selectedIds.size === filteredPeople.length}
                                        onChange={handleSelectAll}
                                    />
                                </th>
                                <th className="p-4 w-16">Image</th>
                                <th className="p-4">Name</th>
                                <th className="p-4">Department</th>
                                <th className="p-4">TMDB ID</th>
                                <th className="p-4">Import On</th>
                                <th className="p-4">Last Updated</th>
                                <th className="p-4 w-32">Quality</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-400">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                            Loading people...
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredPeople.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-400">
                                        No people found matching your filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredPeople.map((person) => (
                                    <tr key={person.id} className="hover:bg-slate-800/30 transition-colors group">
                                        <td className="p-4">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-slate-600 bg-slate-800"
                                                checked={selectedIds.has(person.id)}
                                                onChange={(e) => handleSelectOne(person.id, e.target.checked)}
                                            />
                                        </td>
                                        <td className="p-4">
                                            <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                                                {person.profile_path ? (
                                                    <img
                                                        src={`${TMDB_IMAGE_BASE}${person.profile_path}`}
                                                        alt={person.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                                                        👤
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="font-medium text-white group-hover:text-blue-400 transition-colors">
                                                {person.name}
                                            </div>
                                            {person.birthday && (
                                                <div className="text-xs text-slate-500">
                                                    Born: {new Date(person.birthday).getFullYear()}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <span className="px-2 py-1 rounded-full bg-slate-800 text-xs text-slate-300 border border-slate-700">
                                                {person.known_for_department || 'Unknown'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-400 font-mono text-xs">
                                            {person.tmdb_id}
                                        </td>
                                        <td className="p-4">
                                            {person.imported_at ? (
                                                <div className="text-xs text-slate-400">
                                                    📥 {new Date(person.imported_at).toLocaleDateString()}
                                                </div>
                                            ) : (
                                                <span className="text-slate-500 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            {person.enriched_at ? (
                                                <div className="text-xs text-green-400">
                                                    ✨ {new Date(person.enriched_at).toLocaleDateString()}
                                                </div>
                                            ) : (
                                                <span className="text-slate-500 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <QualityBadge score={calculatePersonQuality(person)} />
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => openDetailModal(person)}
                                                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                                                    title="View Details"
                                                >
                                                    👁️
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setSelectedPerson(person);
                                                        setIsDeleteModalOpen(true);
                                                    }}
                                                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail Modal */}
            {
                isDetailModalOpen && selectedPerson && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
                            <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-700 p-6 flex justify-between items-center z-10">
                                <h2 className="text-2xl font-bold">{selectedPerson.name}</h2>
                                <button
                                    onClick={() => setIsDetailModalOpen(false)}
                                    className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="p-8">
                                <div className="flex flex-col md:flex-row gap-8">
                                    <div className="w-full md:w-64 shrink-0">
                                        <div className="aspect-[2/3] rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shadow-xl mb-4">
                                            {selectedPerson.profile_path ? (
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w500${selectedPerson.profile_path}`}
                                                    alt={selectedPerson.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-6xl">👤</div>
                                            )}
                                        </div>
                                        <div className="space-y-3">
                                            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Quality Score</p>
                                                <QualityBadge score={calculatePersonQuality(selectedPerson)} />
                                            </div>
                                            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Known For</p>
                                                <p className="font-medium">{selectedPerson.known_for_department}</p>
                                            </div>
                                            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Birthday</p>
                                                <p className="font-medium">{selectedPerson.birthday || 'Unknown'}</p>
                                            </div>
                                            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Place of Birth</p>
                                                <p className="font-medium">{selectedPerson.place_of_birth || 'Unknown'}</p>
                                            </div>
                                            {selectedPerson.imdb_id && (
                                                <a
                                                    href={`https://www.imdb.com/name/${selectedPerson.imdb_id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block text-center w-full py-2 bg-[#F5C518] hover:bg-[#E2B616] text-black font-bold rounded-lg transition-colors"
                                                >
                                                    View on IMDB
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 space-y-8">
                                        {selectedPerson.biography && (
                                            <section>
                                                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                                    <span className="text-blue-400">📝</span> Biography
                                                </h3>
                                                <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                                                    {selectedPerson.biography}
                                                </p>
                                            </section>
                                        )}

                                        <section>
                                            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                                <span className="text-purple-400">🎬</span> Filmography
                                            </h3>
                                            {personCredits ? (
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {[...personCredits.cast, ...personCredits.crew]
                                                        .slice(0, 12)
                                                        .map((credit: any, idx) => (
                                                            <div key={idx} className="flex gap-3 bg-slate-800/30 p-2 rounded-lg border border-slate-700/30 hover:bg-slate-800/50 transition-colors">
                                                                <div className="w-12 h-16 bg-slate-800 rounded flex-shrink-0 overflow-hidden">
                                                                    {credit.poster_path ? (
                                                                        <img src={`https://image.tmdb.org/t/p/w92${credit.poster_path}`} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-xs">🎬</div>
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-sm font-medium truncate">{credit.content_title}</p>
                                                                    <p className="text-xs text-slate-500 truncate">
                                                                        {credit.character ? `as ${credit.character}` : credit.job}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            ) : (
                                                <div className="animate-pulse space-y-2">
                                                    <div className="h-10 bg-slate-800 rounded"></div>
                                                    <div className="h-10 bg-slate-800 rounded"></div>
                                                </div>
                                            )}
                                        </section>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Modal */}
            {
                isDeleteModalOpen && selectedPerson && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl">
                            <h3 className="text-xl font-bold text-white mb-2">Delete Person?</h3>
                            <p className="text-slate-400 mb-6">
                                Are you sure you want to delete <span className="text-white font-medium">{selectedPerson.name}</span>?
                                This action cannot be undone and will remove them from all related content cast lists.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setIsDeleteModalOpen(false)}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    {isDeleting ? 'Deleting...' : 'Delete Person'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
