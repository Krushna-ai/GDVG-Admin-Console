'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PaginationControls from '@/components/PaginationControls';
import { useDebounce } from '@/hooks/useDebounce';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w185';

interface Content {
    id: string;
    tmdb_id: number;
    title: string;
    original_title?: string;
    content_type: string;
    status: string;
    poster_path?: string;
    backdrop_path?: string;
    overview?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    popularity?: number;
    origin_country?: string[];
    original_language?: string;
    genres?: any[];
    number_of_seasons?: number;
    number_of_episodes?: number;
    tagline?: string;
    // New Phase 6 fields
    content_rating?: string;
    keywords?: any[];
    videos?: any[];
    watch_providers?: any;
    alternative_titles?: any[];
    // Timestamps
    created_at: string;
    imported_at?: string;
    enriched_at?: string;
}

// Calculate quality score based on data completeness
function calculateQuality(item: Content): number {
    let score = 0;
    const maxScore = 10;

    // Basic info (4 points)
    if (item.title) score += 1;
    if (item.original_title) score += 0.5;
    if (item.overview && item.overview.length > 50) score += 1;
    if (item.tagline) score += 0.5;
    if (item.genres && item.genres.length > 0) score += 1;

    // Media (2 points)
    if (item.poster_path) score += 1;
    if (item.backdrop_path) score += 1;

    // Metadata (2 points)
    if (item.vote_average && item.vote_average > 0) score += 0.5;
    if (item.content_rating) score += 0.5;
    if (item.keywords && item.keywords.length > 0) score += 0.5;
    if (item.origin_country && item.origin_country.length > 0) score += 0.5;

    // Rich data (2 points)
    if (item.videos && item.videos.length > 0) score += 1;
    if (item.watch_providers) score += 1;

    return Math.round((score / maxScore) * 100);
}

// Quality badge component
function QualityBadge({ score }: { score: number }) {
    const getColor = () => {
        if (score >= 80) return 'bg-green-500/20 text-green-400 border-green-500/50';
        if (score >= 50) return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
        return 'bg-red-500/20 text-red-400 border-red-500/50';
    };

    const getBarColor = () => {
        if (score >= 80) return 'bg-green-500';
        if (score >= 50) return 'bg-amber-500';
        return 'bg-red-500';
    };

    return (
        <div className="flex items-center gap-2">
            <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                    className={`h-full ${getBarColor()} transition-all`}
                    style={{ width: `${score}%` }}
                />
            </div>
            <span className={`text-xs px-2 py-0.5 rounded border ${getColor()}`}>
                {score}%
            </span>
        </div>
    );
}

export default function ContentManagerPage() {
    const router = useRouter();
    const [content, setContent] = useState<Content[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedContent, setSelectedContent] = useState<Content | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [filter, setFilter] = useState<'all' | 'draft' | 'published' | 'archived'>('all');

    // Search and selection state
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkActioning, setIsBulkActioning] = useState(false);

    // Date filter state
    const [importDateFrom, setImportDateFrom] = useState('');
    const [importDateTo, setImportDateTo] = useState('');
    const [enrichedDateFrom, setEnrichedDateFrom] = useState('');
    const [enrichedDateTo, setEnrichedDateTo] = useState('');

    // Additional filters
    const [genreFilter, setGenreFilter] = useState('');
    const [countryFilter, setCountryFilter] = useState('');

    // Applied filters (for Apply button functionality)
    const [appliedImportFrom, setAppliedImportFrom] = useState('');
    const [appliedImportTo, setAppliedImportTo] = useState('');
    const [appliedEnrichedFrom, setAppliedEnrichedFrom] = useState('');
    const [appliedEnrichedTo, setAppliedEnrichedTo] = useState('');
    const [appliedGenre, setAppliedGenre] = useState('');
    const [appliedCountry, setAppliedCountry] = useState('');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    // Debounce search query
    const debouncedSearch = useDebounce(searchQuery, 300);

    // Fetch content with pagination
    const fetchContent = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                pageSize: pageSize.toString(),
                search: debouncedSearch,
                status: filter === 'all' ? '' : filter,
            });

            const response = await fetch(`/api/content?${params}`);
            const data = await response.json();

            setContent(data.content || []);
            setTotalCount(data.totalCount || 0);
            setTotalPages(data.totalPages || 0);
        } catch (error) {
            console.error('Failed to fetch content:', error);
        } finally {
            setLoading(false);
        }
    };

    // Fetch on page/filter/search change
    useEffect(() => {
        fetchContent();
    }, [currentPage, pageSize, debouncedSearch, filter]);

    // Reset to page 1 when filters/search change
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch, filter]);

    // Use content directly (no client-side filtering)
    const filteredContent = content;

    // Filter handlers
    const handleApplyFilters = () => {
        setAppliedImportFrom(importDateFrom);
        setAppliedImportTo(importDateTo);
        setAppliedEnrichedFrom(enrichedDateFrom);
        setAppliedEnrichedTo(enrichedDateTo);
        setAppliedGenre(genreFilter);
        setAppliedCountry(countryFilter);
        setCurrentPage(1); // Reset to first page when applying filters
        // Note: Actual filtering logic needs backend API support or client-side implementation
    };

    const handleClearFilters = () => {
        setImportDateFrom('');
        setImportDateTo('');
        setEnrichedDateFrom('');
        setEnrichedDateTo('');
        setGenreFilter('');
        setCountryFilter('');
        setAppliedImportFrom('');
        setAppliedImportTo('');
        setAppliedEnrichedFrom('');
        setAppliedEnrichedTo('');
        setAppliedGenre('');
        setAppliedCountry('');
        setCurrentPage(1);
    };

    // Selection handlers
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredContent.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredContent.map(c => c.id)));
        }
    };

    // Bulk actions
    const handleBulkStatusChange = async (newStatus: string) => {
        if (selectedIds.size === 0) return;
        setIsBulkActioning(true);
        try {
            for (const id of selectedIds) {
                await fetch(`/api/content/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus }),
                });
            }
            setContent(prev => prev.map(c =>
                selectedIds.has(c.id) ? { ...c, status: newStatus } : c
            ));
            setSelectedIds(new Set());
        } catch (error) {
            console.error('Bulk status change failed:', error);
        } finally {
            setIsBulkActioning(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedIds.size} items?`)) return;
        setIsBulkActioning(true);
        try {
            for (const id of selectedIds) {
                await fetch(`/api/content/${id}`, { method: 'DELETE' });
            }
            setContent(prev => prev.filter(c => !selectedIds.has(c.id)));
            setSelectedIds(new Set());
        } catch (error) {
            console.error('Bulk delete failed:', error);
        } finally {
            setIsBulkActioning(false);
        }
    };

    // Handle status change
    const handleStatusChange = async (id: string, newStatus: string) => {
        try {
            const response = await fetch(`/api/content/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (response.ok) {
                setContent(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
            }
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    };

    // Handle delete
    const handleDelete = async () => {
        if (!selectedContent) return;
        setIsSaving(true);
        try {
            const response = await fetch(`/api/content/${selectedContent.id}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                setContent(prev => prev.filter(c => c.id !== selectedContent.id));
                setIsDeleteModalOpen(false);
                setSelectedContent(null);
            }
        } catch (error) {
            console.error('Failed to delete:', error);
        } finally {
            setIsSaving(false);
        }
    };

    // Handle save edit
    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedContent) return;
        setIsSaving(true);
        try {
            const response = await fetch(`/api/content/${selectedContent.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(selectedContent),
            });
            if (response.ok) {
                setContent(prev => prev.map(c => c.id === selectedContent.id ? selectedContent : c));
                setIsEditModalOpen(false);
            }
        } catch (error) {
            console.error('Failed to save:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -m-8 p-8">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">🎬 Content Manager</h1>
                    <p className="text-slate-400">Manage, edit, and delete your imported content</p>
                </div>
                <a
                    href="/admin/tmdb-import"
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all"
                >
                    + Import More
                </a>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-6">
                {(['all', 'draft', 'published', 'archived'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all capitalize ${filter === f
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Search Bar */}
            <div className="mb-6">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search by title, original title, or TMDB ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-3 pl-12 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* Date Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                    <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
                        <label className="text-xs text-slate-400 mb-2 block">📥 Import Date</label>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                value={importDateFrom}
                                onChange={(e) => setImportDateFrom(e.target.value)}
                                placeholder="From"
                                className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                            />
                            <input
                                type="date"
                                value={importDateTo}
                                onChange={(e) => setImportDateTo(e.target.value)}
                                placeholder="To"
                                className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                    <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
                        <label className="text-xs text-slate-400 mb-2 block">✨ Last Updated</label>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                value={enrichedDateFrom}
                                onChange={(e) => setEnrichedDateFrom(e.target.value)}
                                placeholder="From"
                                className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                            />
                            <input
                                type="date"
                                value={enrichedDateTo}
                                onChange={(e) => setEnrichedDateTo(e.target.value)}
                                placeholder="To"
                                className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                    <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
                        <label className="text-xs text-slate-400 mb-2 block">🎭 Genre</label>
                        <select
                            value={genreFilter}
                            onChange={(e) => setGenreFilter(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                        >
                            <option value="">All Genres</option>
                            <option value="Action">Action</option>
                            <option value="Drama">Drama</option>
                            <option value="Comedy">Comedy</option>
                            <option value="Thriller">Thriller</option>
                            <option value="Horror">Horror</option>
                            <option value="Romance">Romance</option>
                            <option value="Sci-Fi">Sci-Fi</option>
                            <option value="Fantasy">Fantasy</option>
                            <option value="Animation">Animation</option>
                        </select>
                    </div>
                    <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
                        <label className="text-xs text-slate-400 mb-2 block">🌍 Country</label>
                        <select
                            value={countryFilter}
                            onChange={(e) => setCountryFilter(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                        >
                            <option value="">All Countries</option>
                            <option value="US">United States</option>
                            <option value="GB">United Kingdom</option>
                            <option value="KR">South Korea</option>
                            <option value="JP">Japan</option>
                            <option value="IN">India</option>
                            <option value="FR">France</option>
                            <option value="DE">Germany</option>
                        </select>
                    </div>
                </div>

                {/* Filter Actions */}
                <div className="flex gap-3 mt-4">
                    <button
                        onClick={handleApplyFilters}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        Apply Filters
                    </button>
                    <button
                        onClick={handleClearFilters}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                    >
                        Clear All
                    </button>
                </div>
            </div>

            {/* Bulk Actions Bar */}
            {selectedIds.size > 0 && (
                <div className="bg-blue-600/20 border border-blue-500/50 rounded-xl p-4 mb-6 flex items-center justify-between">
                    <div className="text-blue-300">
                        <span className="font-bold">{selectedIds.size}</span> item{selectedIds.size > 1 ? 's' : ''} selected
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleBulkStatusChange('published')}
                            disabled={isBulkActioning}
                            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                            ✓ Publish Selected
                        </button>
                        <button
                            onClick={() => handleBulkStatusChange('draft')}
                            disabled={isBulkActioning}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                            📝 Draft Selected
                        </button>
                        <button
                            onClick={handleBulkDelete}
                            disabled={isBulkActioning}
                            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                            🗑️ Delete Selected
                        </button>
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded-lg transition-colors"
                        >
                            ✕ Clear
                        </button>
                    </div>
                </div>
            )}

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

            {/* Content Table */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                </div>
            ) : filteredContent.length > 0 ? (
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-slate-900/50">
                            <tr>
                                <th className="text-left px-4 py-4 w-12">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.size === filteredContent.length && filteredContent.length > 0}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                                    />
                                </th>
                                <th className="text-left text-slate-400 text-sm font-medium px-4 py-4">Content</th>
                                <th className="text-left text-slate-400 text-sm font-medium px-4 py-4">Type</th>
                                <th className="text-left text-slate-400 text-sm font-medium px-4 py-4">Status</th>
                                <th className="text-left text-slate-400 text-sm font-medium px-4 py-4">Rating</th>
                                <th className="text-left text-slate-400 text-sm font-medium px-4 py-4">Year</th>
                                <th className="text-left text-slate-400 text-sm font-medium px-4 py-4">Import On</th>
                                <th className="text-left text-slate-400 text-sm font-medium px-4 py-4">Last Updated</th>
                                <th className="text-left text-slate-400 text-sm font-medium px-4 py-4">Quality</th>
                                <th className="text-right text-slate-400 text-sm font-medium px-4 py-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {filteredContent.map((item) => (
                                <tr key={item.id} className={`hover:bg-slate-700/30 ${selectedIds.has(item.id) ? 'bg-blue-600/10' : ''}`}>
                                    {/* Checkbox */}
                                    <td className="px-4 py-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(item.id)}
                                            onChange={() => toggleSelect(item.id)}
                                            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                                        />
                                    </td>
                                    {/* Content */}
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-16 rounded overflow-hidden bg-slate-700 flex-shrink-0">
                                                {item.poster_path ? (
                                                    <img
                                                        src={`${TMDB_IMAGE_BASE}${item.poster_path}`}
                                                        alt={item.title}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-500">🎬</div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-white font-medium line-clamp-1">{item.title}</p>
                                                <p className="text-slate-500 text-xs">TMDB: {item.tmdb_id}</p>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Type */}
                                    <td className="px-4 py-4">
                                        <span className="bg-purple-600/30 text-purple-300 text-xs px-2 py-1 rounded uppercase">
                                            {item.content_type}
                                        </span>
                                    </td>

                                    {/* Status */}
                                    <td className="px-4 py-4">
                                        <select
                                            value={item.status}
                                            onChange={(e) => handleStatusChange(item.id, e.target.value)}
                                            className={`text-xs px-2 py-1 rounded font-medium bg-transparent border cursor-pointer ${item.status === 'published'
                                                ? 'border-green-500 text-green-400'
                                                : item.status === 'archived'
                                                    ? 'border-slate-500 text-slate-400'
                                                    : 'border-amber-500 text-amber-400'
                                                }`}
                                        >
                                            <option value="draft">Draft</option>
                                            <option value="published">Published</option>
                                            <option value="archived">Archived</option>
                                        </select>
                                    </td>

                                    {/* Rating */}
                                    <td className="px-4 py-4">
                                        {item.vote_average ? (
                                            <span className="text-yellow-400 text-sm">★ {item.vote_average.toFixed(1)}</span>
                                        ) : (
                                            <span className="text-slate-500">-</span>
                                        )}
                                    </td>

                                    {/* Year */}
                                    <td className="px-4 py-4 text-slate-300 text-sm">
                                        {item.release_date?.substring(0, 4) || item.first_air_date?.substring(0, 4) || 'N/A'}
                                    </td>

                                    {/* Import On */}
                                    <td className="px-4 py-4">
                                        {item.imported_at ? (
                                            <div className="text-xs text-slate-400">
                                                📥 {new Date(item.imported_at).toLocaleDateString()}
                                            </div>
                                        ) : (
                                            <span className="text-slate-500 text-xs">-</span>
                                        )}
                                    </td>

                                    {/* Last Updated (Enriched) */}
                                    <td className="px-4 py-4">
                                        {item.enriched_at ? (
                                            <div className="text-xs text-green-400">
                                                ✨ {new Date(item.enriched_at).toLocaleDateString()}
                                            </div>
                                        ) : (
                                            <span className="text-slate-500 text-xs">-</span>
                                        )}
                                    </td>

                                    {/* Quality */}
                                    <td className="px-4 py-4">
                                        <QualityBadge score={calculateQuality(item)} />
                                    </td>

                                    {/* Actions */}
                                    <td className="px-4 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <a
                                                href={`/admin/content/${item.id}/edit`}
                                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                                            >
                                                ✏️ Edit
                                            </a>
                                            <button
                                                onClick={() => { setSelectedContent(item); setIsDeleteModalOpen(true); }}
                                                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
                                            >
                                                🗑️ Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-20 bg-slate-800/50 rounded-2xl border border-slate-700/50">
                    <p className="text-6xl mb-4">📭</p>
                    <p className="text-xl text-slate-400">No content found</p>
                </div>
            )}

            {/* Edit Modal */}
            {isEditModalOpen && selectedContent && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-700">
                            <h2 className="text-xl font-bold text-white">Edit Content</h2>
                        </div>
                        <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                            {/* Title */}
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Title</label>
                                <input
                                    type="text"
                                    value={selectedContent.title}
                                    onChange={(e) => setSelectedContent({ ...selectedContent, title: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>

                            {/* Original Title */}
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Original Title</label>
                                <input
                                    type="text"
                                    value={selectedContent.original_title || ''}
                                    onChange={(e) => setSelectedContent({ ...selectedContent, original_title: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>

                            {/* Overview */}
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Overview</label>
                                <textarea
                                    value={selectedContent.overview || ''}
                                    onChange={(e) => setSelectedContent({ ...selectedContent, overview: e.target.value })}
                                    rows={4}
                                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white resize-none"
                                />
                            </div>

                            {/* Status */}
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Status</label>
                                <select
                                    value={selectedContent.status}
                                    onChange={(e) => setSelectedContent({ ...selectedContent, status: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </div>

                            {/* Content Type */}
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Content Type</label>
                                <select
                                    value={selectedContent.content_type}
                                    onChange={(e) => setSelectedContent({ ...selectedContent, content_type: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                >
                                    <option value="tv">TV</option>
                                    <option value="movie">Movie</option>
                                    <option value="drama">Drama</option>
                                    <option value="anime">Anime</option>
                                    <option value="variety">Variety</option>
                                    <option value="documentary">Documentary</option>
                                </select>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Modal */}
            {isDeleteModalOpen && selectedContent && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 rounded-2xl max-w-md w-full p-6">
                        <h2 className="text-xl font-bold text-white mb-4">Delete Content</h2>
                        <p className="text-slate-400 mb-6">
                            Are you sure you want to delete <span className="text-white font-medium">"{selectedContent.title}"</span>?
                            This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setIsDeleteModalOpen(false)}
                                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isSaving}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                                {isSaving ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
