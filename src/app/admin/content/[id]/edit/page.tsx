'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w300';

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
    tagline?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    vote_count?: number;
    popularity?: number;
    origin_country?: string[];
    original_language?: string;
    genres?: any[];
    number_of_seasons?: number;
    number_of_episodes?: number;
    homepage?: string;
    imdb_id?: string;
    content_rating?: string;
    keywords?: any[];
    videos?: any[];
    watch_providers?: any;
    wiki_plot?: string;
    wiki_cast_notes?: string;
    wiki_production?: string;
    wiki_reception?: string;
    wiki_release?: string;
    wiki_soundtrack?: string;
    wiki_synopsis?: string;
    wiki_accolades?: string;
    wiki_episode_guide?: string;
    wikidata_id?: string;
    wikipedia_url?: string;
    overview_source?: string;
    budget?: number;
    revenue?: number;
    box_office?: number;
    seasons?: any[];
    wikidata_metadata?: any;
}

interface WatchLink {
    id?: string;
    platform_name: string;
    region: string;
    link_url: string;
    is_affiliate: boolean;
}

interface CastMember {
    id: string;
    person_id: string;
    character_name: string;
    order_index: number;
    role_type: string;
    person: { id: string; name: string; profile_path?: string };
}

// Collapsible section with edit mode
function EditSection({ title, icon, children, defaultOpen = true }: {
    title: string; icon: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden mb-4">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span>{icon}</span>
                    <h3 className="text-white font-medium">{title}</h3>
                </div>
                <span className="text-slate-400">{isOpen ? '▼' : '▶'}</span>
            </button>
            {isOpen && <div className="px-5 pb-5 border-t border-slate-700/30">{children}</div>}
        </div>
    );
}

// Tag input component for genres/keywords
function TagEditor({
    tags,
    onChange,
    placeholder,
    color = 'purple'
}: {
    tags: string[];
    onChange: (tags: string[]) => void;
    placeholder: string;
    color?: 'purple' | 'blue' | 'green';
}) {
    const [inputValue, setInputValue] = useState('');
    const colors = {
        purple: 'bg-purple-600/30 text-purple-300 hover:bg-purple-600/50',
        blue: 'bg-blue-600/30 text-blue-300 hover:bg-blue-600/50',
        green: 'bg-green-600/30 text-green-300 hover:bg-green-600/50',
    };

    const addTag = () => {
        const value = inputValue.trim();
        if (value && !tags.includes(value)) {
            onChange([...tags, value]);
            setInputValue('');
        }
    };

    const removeTag = (tag: string) => {
        onChange(tags.filter(t => t !== tag));
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag, idx) => (
                    <span key={idx} className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 ${colors[color]}`}>
                        {tag}
                        <button onClick={() => removeTag(tag)} className="ml-1 hover:text-white">×</button>
                    </span>
                ))}
            </div>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    placeholder={placeholder}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                />
                <button onClick={addTag} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm">
                    + Add
                </button>
            </div>
        </div>
    );
}

// Watch link editor
function WatchLinkEditor({ links, onChange }: { links: WatchLink[]; onChange: (links: WatchLink[]) => void }) {
    const addLink = () => {
        onChange([...links, { platform_name: '', region: 'ALL', link_url: '', is_affiliate: false }]);
    };

    const updateLink = (idx: number, field: keyof WatchLink, value: any) => {
        const updated = [...links];
        updated[idx] = { ...updated[idx], [field]: value };
        onChange(updated);
    };

    const removeLink = (idx: number) => {
        onChange(links.filter((_, i) => i !== idx));
    };

    return (
        <div className="space-y-3">
            {links.map((link, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-900/50 p-3 rounded-lg">
                    <input
                        type="text"
                        value={link.platform_name}
                        onChange={(e) => updateLink(idx, 'platform_name', e.target.value)}
                        placeholder="Platform (e.g., Netflix)"
                        className="col-span-3 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    />
                    <select
                        value={link.region}
                        onChange={(e) => updateLink(idx, 'region', e.target.value)}
                        className="col-span-2 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    >
                        <option value="ALL">All Regions</option>
                        <option value="IN">India</option>
                        <option value="US">US</option>
                        <option value="KR">Korea</option>
                        <option value="GB">UK</option>
                    </select>
                    <input
                        type="url"
                        value={link.link_url}
                        onChange={(e) => updateLink(idx, 'link_url', e.target.value)}
                        placeholder="https://affiliate.link/..."
                        className="col-span-5 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    />
                    <label className="col-span-1 flex items-center gap-1 text-xs text-slate-400">
                        <input
                            type="checkbox"
                            checked={link.is_affiliate}
                            onChange={(e) => updateLink(idx, 'is_affiliate', e.target.checked)}
                            className="w-4 h-4"
                        />
                        Aff
                    </label>
                    <button onClick={() => removeLink(idx)} className="col-span-1 text-red-400 hover:text-red-300">
                        🗑️
                    </button>
                </div>
            ))}
            <button onClick={addLink} className="w-full py-2 border-2 border-dashed border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400 rounded-lg text-sm transition-colors">
                + Add Streaming Platform
            </button>
        </div>
    );
}

// Video editor
function VideoEditor({ videos, onChange }: { videos: any[]; onChange: (videos: any[]) => void }) {
    const addVideo = () => {
        onChange([...videos, { key: '', name: '', type: 'Trailer', site: 'YouTube' }]);
    };

    const updateVideo = (idx: number, field: string, value: any) => {
        const updated = [...videos];
        updated[idx] = { ...updated[idx], [field]: value };
        onChange(updated);
    };

    const removeVideo = (idx: number) => {
        onChange(videos.filter((_, i) => i !== idx));
    };

    return (
        <div className="space-y-3">
            {videos.map((video, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-900/50 p-3 rounded-lg">
                    <input
                        type="text"
                        value={video.name}
                        onChange={(e) => updateVideo(idx, 'name', e.target.value)}
                        placeholder="Video Title"
                        className="col-span-4 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    />
                    <input
                        type="text"
                        value={video.key}
                        onChange={(e) => updateVideo(idx, 'key', e.target.value)}
                        placeholder="YouTube ID (e.g., dQw4w9WgXcQ)"
                        className="col-span-4 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    />
                    <select
                        value={video.type}
                        onChange={(e) => updateVideo(idx, 'type', e.target.value)}
                        className="col-span-3 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                    >
                        <option value="Trailer">Trailer</option>
                        <option value="Teaser">Teaser</option>
                        <option value="Clip">Clip</option>
                        <option value="Behind the Scenes">Behind the Scenes</option>
                    </select>
                    <button onClick={() => removeVideo(idx)} className="col-span-1 text-red-400 hover:text-red-300">
                        🗑️
                    </button>
                </div>
            ))}
            <button onClick={addVideo} className="w-full py-2 border-2 border-dashed border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400 rounded-lg text-sm transition-colors">
                + Add Video
            </button>
        </div>
    );
}

// Person Search Modal for adding Cast
function PersonSearchModal({ isOpen, onClose, onSelect }: { isOpen: boolean; onClose: () => void; onSelect: (person: any) => void }) {
    const [query, setQuery] = useState('');
    const [localResults, setLocalResults] = useState<any[]>([]);
    const [tmdbResults, setTmdbResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [importingId, setImportingId] = useState<number | null>(null);

    const [tmdbSearching, setTmdbSearching] = useState(false);
    const [tmdbSearched, setTmdbSearched] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setQuery('');
            setLocalResults([]);
            setTmdbResults([]);
            setTmdbSearched(false);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!query.trim()) {
            setLocalResults([]);
            setTmdbResults([]);
            setTmdbSearched(false);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setLoading(true);
            try {
                // 1. Search Local DB ONLY on type
                const localRes = await fetch(`/api/people?search=${encodeURIComponent(query)}&pageSize=5`);
                if (localRes.ok) {
                    const data = await localRes.json();
                    setLocalResults(data.people || []);
                }
            } catch (err) {
                console.error("Failed to search people:", err);
            } finally {
                setLoading(false);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [query]);

    const handleSearchTmdb = async () => {
        if (!query.trim()) return;
        setTmdbSearching(true);
        setTmdbSearched(true);
        try {
            const tmdbRes = await fetch(`/api/tmdb/search?query=${encodeURIComponent(query)}`);
            if (tmdbRes.ok) {
                const data = await tmdbRes.json();
                // Filter to only 'person' and limit to 5
                const tmdbPeople = (data.results || [])
                    .filter((r: any) => r.media_type === 'person')
                    .slice(0, 5);
                setTmdbResults(tmdbPeople);
            }
        } catch (err) {
            console.error("Failed to search TMDB:", err);
        } finally {
            setTmdbSearching(false);
        }
    };

    // Handle importing a purely TMDB profile into our local DB before selecting it
    const handleTmdbSelect = async (tmdbPerson: any) => {
        setImportingId(tmdbPerson.id);
        try {
            const res = await fetch('/api/people/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tmdb_id: tmdbPerson.id })
            });
            const data = await res.json();
            if (data.person) {
                onSelect(data.person);
            } else {
                alert(data.error || 'Failed to import person');
            }
        } catch (error) {
            console.error('Import failed', error);
            alert('Failed to contact import endpoint');
        } finally {
            setImportingId(null);
        }
    };

    if (!isOpen) return null;

    // Remove local results from TMDB results visually
    const localTmdbIds = new Set(localResults.map(p => p.tmdb_id));
    const uniqueTmdbResults = tmdbResults.filter(p => !localTmdbIds.has(p.id));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center shrink-0">
                    <h3 className="text-white font-medium">Search & Import Person</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
                </div>
                <div className="p-4 flex-1 overflow-hidden flex flex-col">
                    <input
                        type="text"
                        autoFocus
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setTmdbSearched(false);
                            setTmdbResults([]);
                        }}
                        placeholder="Search by name or TMDB ID..."
                        className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white mb-4 focus:outline-none focus:border-blue-500 shrink-0"
                    />

                    <div className="overflow-y-auto space-y-4 pr-2 pb-2 flex-1">
                        {loading ? (
                            <p className="text-slate-400 text-center py-4">Searching Database...</p>
                        ) : query && localResults.length === 0 && !tmdbSearched ? (
                            <div className="text-center py-4 space-y-3">
                                <p className="text-slate-400 text-sm">No exact matches in your database for "{query}".</p>
                                <button
                                    onClick={handleSearchTmdb}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
                                >
                                    Search TMDB Instead
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Local Results */}
                                {localResults.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">In Database</h4>
                                            {!tmdbSearched && (
                                                <button onClick={handleSearchTmdb} className="text-xs text-blue-400 hover:text-blue-300">
                                                    Don't see them? Search TMDB
                                                </button>
                                            )}
                                        </div>
                                        {localResults.map(person => (
                                            <button
                                                key={`local-${person.id}`}
                                                onClick={() => onSelect(person)}
                                                className="w-full flex items-center gap-3 p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-left transition-colors border border-blue-900/30"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
                                                    {person.profile_path ? (
                                                        <img src={`https://image.tmdb.org/t/p/w92${person.profile_path}`} alt="" className="w-full h-full object-cover" />
                                                    ) : <div className="w-full h-full flex items-center justify-center">👤</div>}
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-medium">{person.name}</p>
                                                    <p className="text-blue-400 text-xs">Local ID: {person.id.substring(0, 8)}...</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* TMDB Import Results */}
                                {tmdbSearching ? (
                                    <p className="text-slate-400 text-center py-4 text-sm mt-4">Searching Global TMDB...</p>
                                ) : tmdbSearched && uniqueTmdbResults.length === 0 ? (
                                    <p className="text-slate-400 text-center py-4 text-sm mt-4">No global TMDB results found for "{query}".</p>
                                ) : uniqueTmdbResults.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4">Import from TMDB</h4>
                                        {uniqueTmdbResults.map(person => (
                                            <button
                                                key={`tmdb-${person.id}`}
                                                onClick={() => handleTmdbSelect(person)}
                                                disabled={importingId === person.id}
                                                className="w-full flex items-center justify-between p-2 bg-slate-800/40 hover:bg-slate-700 rounded-lg text-left transition-colors disabled:opacity-50"
                                            >
                                                <div className="flex items-center gap-3 flex-1">
                                                    <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden flex-shrink-0 grayscale">
                                                        {person.profile_path ? (
                                                            <img src={`https://image.tmdb.org/t/p/w92${person.profile_path}`} alt="" className="w-full h-full object-cover" />
                                                        ) : <div className="w-full h-full flex items-center justify-center">👤</div>}
                                                    </div>
                                                    <div>
                                                        <p className="text-white text-sm font-medium">{person.name}</p>
                                                        <p className="text-slate-500 text-xs">TMDB ID: {person.id}</p>
                                                    </div>
                                                </div>
                                                <div className="pr-2">
                                                    {importingId === person.id ? (
                                                        <span className="text-blue-400 text-xs">Importing...</span>
                                                    ) : (
                                                        <span className="text-slate-400 text-xs flex items-center gap-1">+ Import</span>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Cast Editor
function CastEditor({ cast, onChange }: { cast: CastMember[]; onChange: (cast: CastMember[]) => void }) {
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const updateCast = (idx: number, field: string, value: any) => {
        const updated = [...cast];
        updated[idx] = { ...updated[idx], [field]: value };
        onChange(updated);
    };

    const removeCast = (idx: number) => {
        onChange(cast.filter((_, i) => i !== idx));
    };

    const handleAddPerson = (person: any) => {
        const newCastMember: CastMember = {
            id: `temp-${Date.now()}`,
            person_id: person.id,
            character_name: '',
            order_index: cast.length,
            role_type: 'support',
            person: {
                id: person.id,
                name: person.name,
                profile_path: person.profile_path
            }
        };
        onChange([...cast, newCastMember]);
        setIsSearchOpen(false);
    };

    return (
        <div className="space-y-3">
            {cast.map((member, idx) => (
                <div key={member.id || idx} className="flex items-center gap-3 bg-slate-900/50 p-2 rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
                        {member.person?.profile_path ? (
                            <img src={`https://image.tmdb.org/t/p/w92${member.person.profile_path}`} alt="" className="w-full h-full object-cover" />
                        ) : <div className="w-full h-full flex items-center justify-center">👤</div>}
                    </div>

                    <div className="flex-1 grid grid-cols-12 gap-2">
                        <div className="col-span-12 md:col-span-4">
                            <p className="text-white text-sm font-medium">{member.person?.name}</p>
                            <p className="text-slate-500 text-xs">ID: {member.person?.id || member.person_id}</p>
                        </div>
                        <input
                            type="text"
                            value={member.character_name}
                            onChange={(e) => updateCast(idx, 'character_name', e.target.value)}
                            placeholder="Character Name"
                            className="col-span-12 md:col-span-5 px-3 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                        />
                        <select
                            value={member.role_type}
                            onChange={(e) => updateCast(idx, 'role_type', e.target.value)}
                            className="col-span-8 md:col-span-2 px-3 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                        >
                            <option value="main">Main</option>
                            <option value="support">Support</option>
                            <option value="guest">Guest</option>
                            <option value="cameo">Cameo</option>
                        </select>
                        <button onClick={() => removeCast(idx)} className="col-span-4 md:col-span-1 text-red-400 hover:text-red-300 flex justify-center items-center">
                            🗑️
                        </button>
                    </div>
                </div>
            ))}
            {cast.length === 0 && (
                <p className="text-slate-500 text-sm p-4 text-center border border-dashed border-slate-700 rounded-lg">No cast members assigned.</p>
            )}

            <button
                onClick={() => setIsSearchOpen(true)}
                className="w-full py-2 border-2 border-dashed border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400 rounded-lg text-sm transition-colors mt-2"
            >
                + Add Cast Member
            </button>
            <p className="text-slate-500 text-xs text-center pt-2">
                * Note: If the person doesn't exist in the database yet, please use the <b>TMDB Import</b> or <b>People Manager</b> first.
            </p>

            <PersonSearchModal
                isOpen={isSearchOpen}
                onClose={() => setIsSearchOpen(false)}
                onSelect={handleAddPerson}
            />
        </div>
    );
}

// TV Show Seasons & Episodes Guide Viewer (Tabbed & Editable)
function SeasonsViewer({ initialSeasons = [], contentId }: { initialSeasons: any[], contentId: string }) {
    const [seasons, setSeasons] = useState<any[]>(() => {
        const sorted = [...initialSeasons].sort((a, b) => (a.season_number || 0) - (b.season_number || 0));
        return sorted.map(s => ({
            ...s,
            episodes: s.episodes ? [...s.episodes].sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0)) : []
        }));
    });
    const [activeSeasonIdx, setActiveSeasonIdx] = useState(0);
    const [isSaving, setIsSaving] = useState(false);

    if (!seasons || seasons.length === 0) {
        return (
            <div className="space-y-4 text-center border border-dashed border-slate-700 rounded-lg p-6">
                <p className="text-slate-500 text-sm mb-4">No season data available for this TV show.</p>
                <button
                    onClick={() => {
                        setSeasons([{
                            id: `new-season-${Date.now()}`,
                            content_id: contentId,
                            season_number: 1,
                            name: `Season 1`,
                            overview: '',
                            air_date: null,
                            poster_path: '',
                            episodes: []
                        }]);
                        setActiveSeasonIdx(0);
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
                >
                    + Add First Season
                </button>
            </div>
        );
    }

    const activeSeason = seasons[activeSeasonIdx];

    const handleAddSeason = () => {
        const nextSeasonNum = seasons.length > 0 ? Math.max(...seasons.map(s => s.season_number || 0)) + 1 : 1;
        setSeasons([...seasons, {
            id: `new-season-${Date.now()}`,
            content_id: contentId,
            season_number: nextSeasonNum,
            name: `Season ${nextSeasonNum}`,
            overview: '',
            air_date: null,
            poster_path: '',
            episodes: []
        }]);
        setActiveSeasonIdx(seasons.length);
    };

    const handleUpdateSeason = (field: string, value: any) => {
        const newSeasons = [...seasons];
        newSeasons[activeSeasonIdx] = { ...newSeasons[activeSeasonIdx], [field]: value };
        setSeasons(newSeasons);
    };

    const handleAddEpisode = () => {
        const newSeasons = [...seasons];
        const targetSeason = newSeasons[activeSeasonIdx];
        const episodes = targetSeason.episodes || [];
        const nextEpNum = episodes.length > 0 ? Math.max(...episodes.map((e: any) => e.episode_number || 0)) + 1 : 1;
        targetSeason.episodes = [...episodes, {
            id: `new-episode-${Date.now()}`,
            season_id: targetSeason.id,
            episode_number: nextEpNum,
            name: `Episode ${nextEpNum}`,
            overview: '',
            air_date: null,
            still_path: '',
            vote_average: 0
        }];
        setSeasons(newSeasons);
    };

    const handleUpdateEpisode = (epIdx: number, field: string, value: any) => {
        const newSeasons = [...seasons];
        const targetSeason = newSeasons[activeSeasonIdx];
        targetSeason.episodes[epIdx] = { ...targetSeason.episodes[epIdx], [field]: value };
        setSeasons(newSeasons);
    };

    const handleRemoveEpisode = (epIdx: number) => {
        if (!confirm('Remove this episode?')) return;
        const newSeasons = [...seasons];
        newSeasons[activeSeasonIdx].episodes.splice(epIdx, 1);
        setSeasons(newSeasons);
    };

    const handleRemoveSeason = () => {
        if (!confirm('Remove this entire season and all its episodes?')) return;
        const newSeasons = [...seasons];
        newSeasons.splice(activeSeasonIdx, 1);
        setSeasons(newSeasons);
        setActiveSeasonIdx(Math.max(0, activeSeasonIdx - 1));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/content/${contentId}/seasons`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seasons }),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to save');
            }
            alert('Season Guide saved successfully!');
        } catch (e: any) {
            alert(`Save failed: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col border border-slate-700 rounded-xl overflow-hidden bg-slate-900/50">
            {/* Header / Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-700 bg-slate-800/50 p-2 overflow-x-auto custom-scrollbar">
                {seasons.map((season, idx) => (
                    <button
                        key={season.id}
                        onClick={() => setActiveSeasonIdx(idx)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${idx === activeSeasonIdx ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                    >
                        {season.name || `Season ${season.season_number || idx + 1}`}
                    </button>
                ))}
                <button
                    onClick={handleAddSeason}
                    className="px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg shrink-0 transition-colors ml-2 flex items-center gap-1"
                >
                    <span className="text-blue-400 text-lg leading-none">+</span> Add Season
                </button>
            </div>

            {/* Active Season Body */}
            {activeSeason && (
                <div className="p-6 space-y-6">
                    {/* Season Editor */}
                    <div className="flex flex-col md:flex-row gap-6 items-start relative group">
                        <div className="w-full md:w-32 shrink-0 space-y-2">
                            <div className="aspect-[2/3] bg-slate-800 rounded-lg overflow-hidden border border-slate-700 shadow-md">
                                {activeSeason.poster_path ? (
                                    <img src={`https://image.tmdb.org/t/p/w185${activeSeason.poster_path}`} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-500">No Image</div>
                                )}
                            </div>
                            <input
                                type="text"
                                value={activeSeason.poster_path || ''}
                                onChange={(e) => handleUpdateSeason('poster_path', e.target.value)}
                                placeholder="/path.jpg"
                                className="w-full px-2 py-1.5 text-[10px] bg-slate-900 border border-slate-600 rounded text-slate-300 focus:border-blue-500 outline-none block"
                            />
                        </div>

                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Season Name</label>
                                <input
                                    type="text"
                                    value={activeSeason.name || ''}
                                    onChange={(e) => handleUpdateSeason('name', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Number</label>
                                    <input
                                        type="number"
                                        value={activeSeason.season_number || 0}
                                        onChange={(e) => handleUpdateSeason('season_number', parseInt(e.target.value) || 0)}
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:border-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Air Date</label>
                                    <input
                                        type="date"
                                        value={activeSeason.air_date || ''}
                                        onChange={(e) => handleUpdateSeason('air_date', e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:border-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                            <div className="col-span-1 md:col-span-2">
                                <label className="block text-xs font-medium text-slate-400 mb-1">Overview</label>
                                <textarea
                                    value={activeSeason.overview || ''}
                                    onChange={(e) => handleUpdateSeason('overview', e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white resize-y focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleRemoveSeason}
                            className="absolute -top-2 -right-2 p-2 bg-slate-900 border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-900 rounded-full md:opacity-0 md:group-hover:opacity-100 transition-all shadow-lg"
                            title="Delete Entire Season"
                        >
                            🗑️
                        </button>
                    </div>

                    <hr className="border-slate-700/50" />

                    {/* Episodes Editor */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-lg font-medium text-white flex items-center gap-2">
                                <span className="text-blue-400">📺</span> Episodes ({activeSeason.episodes?.length || 0})
                            </h4>
                            <button
                                onClick={handleAddEpisode}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 rounded-lg text-sm transition-colors flex items-center gap-1 font-medium shadow-sm"
                            >
                                <span className="text-blue-400 text-lg leading-none">+</span> Add Episode
                            </button>
                        </div>

                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {(activeSeason.episodes || []).map((ep: any, eIdx: number) => (
                                <div key={ep.id || eIdx} className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row gap-4 items-start relative group">
                                    <div className="w-full sm:w-32 space-y-2 shrink-0">
                                        <div className="aspect-video bg-slate-900 rounded overflow-hidden border border-slate-700 shadow-inner">
                                            {ep.still_path ? (
                                                <img src={`https://image.tmdb.org/t/p/w185${ep.still_path}`} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">No Img</div>
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            value={ep.still_path || ''}
                                            onChange={(e) => handleUpdateEpisode(eIdx, 'still_path', e.target.value)}
                                            placeholder="/path.jpg"
                                            className="w-full px-2 py-1 text-[10px] bg-slate-900 border border-slate-600 rounded text-slate-400 text-center outline-none focus:border-blue-500"
                                        />
                                    </div>
                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-3 w-full">
                                        <div className="col-span-2 space-y-1">
                                            <label className="text-[10px] text-slate-500 uppercase font-medium">Ep #</label>
                                            <input type="number" value={ep.episode_number || 0} onChange={(e) => handleUpdateEpisode(eIdx, 'episode_number', parseInt(e.target.value) || 0)} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:border-blue-500 outline-none" />
                                        </div>
                                        <div className="col-span-5 space-y-1">
                                            <label className="text-[10px] text-slate-500 uppercase font-medium">Title</label>
                                            <input type="text" value={ep.name || ''} onChange={(e) => handleUpdateEpisode(eIdx, 'name', e.target.value)} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:border-blue-500 outline-none" placeholder="Episode Title" />
                                        </div>
                                        <div className="col-span-3 space-y-1">
                                            <label className="text-[10px] text-slate-500 uppercase font-medium">Air Date</label>
                                            <input type="date" value={ep.air_date || ''} onChange={(e) => handleUpdateEpisode(eIdx, 'air_date', e.target.value)} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:border-blue-500 outline-none" />
                                        </div>
                                        <div className="col-span-2 space-y-1">
                                            <label className="text-[10px] text-slate-500 uppercase font-medium">Rating</label>
                                            <input type="number" step="0.1" value={ep.vote_average || 0} onChange={(e) => handleUpdateEpisode(eIdx, 'vote_average', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:border-blue-500 outline-none" />
                                        </div>
                                        <div className="col-span-12 space-y-1 mt-1">
                                            <label className="text-[10px] text-slate-500 uppercase font-medium">Overview</label>
                                            <textarea rows={2} value={ep.overview || ''} onChange={(e) => handleUpdateEpisode(eIdx, 'overview', e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white focus:border-blue-500 outline-none resize-y" placeholder="Short plot summary..." />
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleRemoveEpisode(eIdx)}
                                        className="sm:absolute sm:top-2 sm:right-2 p-1.5 bg-slate-900 border border-slate-700 text-slate-500 hover:text-red-400 hover:border-red-900 rounded-lg sm:opacity-0 group-hover:opacity-100 transition-all shadow-sm self-end sm:self-auto"
                                        title="Remove Episode from Season"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                            {(!activeSeason.episodes || activeSeason.episodes.length === 0) && (
                                <p className="text-slate-500 text-sm italic text-center py-8 border border-dashed border-slate-700 rounded-lg">No episodes yet. Click "+ Add Episode" above to create one.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Footer / Save Action */}
            <div className="p-4 bg-slate-800/80 border-t border-slate-700 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:opacity-50 text-white font-medium rounded-lg transition-colors shadow flex items-center gap-2"
                >
                    {isSaving ? '⏳ Saving...' : '💾 Save Season Guide'}
                </button>
            </div>
        </div>
    );
}

export default function ContentEditPage() {
    const router = useRouter();
    const params = useParams();
    const contentId = params.id as string;

    const [content, setContent] = useState<Content | null>(null);
    const [cast, setCast] = useState<CastMember[]>([]);
    const [watchLinks, setWatchLinks] = useState<WatchLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    // Wikipedia enrichment state
    const [enrichingWiki, setEnrichingWiki] = useState(false);

    // Parse genres/keywords to string arrays for editing
    const [genreNames, setGenreNames] = useState<string[]>([]);
    const [keywordNames, setKeywordNames] = useState<string[]>([]);
    const [videos, setVideos] = useState<any[]>([]);

    // Fetch content details
    useEffect(() => {
        async function fetchData() {
            try {
                const contentRes = await fetch(`/api/content/${contentId}`);
                if (!contentRes.ok) throw new Error('Failed to fetch content');
                const contentData = await contentRes.json();
                const c = contentData.content || contentData;
                setContent(c);

                // Parse genres
                setGenreNames(c.genres?.map((g: any) => g.name || g) || []);
                setKeywordNames(c.keywords?.map((k: any) => k.name || k) || []);
                setVideos(c.videos || []);

                // 1. Try to fetch saved watch links from DB
                let initialLinks: WatchLink[] = [];
                try {
                    const linksRes = await fetch(`/api/content/${contentId}/watch-links`);
                    if (linksRes.ok) {
                        const linksData = await linksRes.json();
                        if (linksData.links && linksData.links.length > 0) {
                            initialLinks = linksData.links;
                        }
                    }
                } catch { }

                // 2. If no saved links, parse from TMDB metadata
                if (initialLinks.length === 0 && c.watch_providers) {
                    Object.entries(c.watch_providers).forEach(([region, data]: [string, any]) => {
                        if (data?.flatrate) {
                            data.flatrate.forEach((p: any) => {
                                initialLinks.push({
                                    platform_name: p.provider_name,
                                    region: region,
                                    link_url: data.link || '',
                                    is_affiliate: false,
                                });
                            });
                        }
                    });
                }
                setWatchLinks(initialLinks);

                // Fetch cast
                try {
                    const castRes = await fetch(`/api/content/${contentId}/cast`);
                    if (castRes.ok) {
                        const castData = await castRes.json();
                        setCast(castData.cast || []);
                    }
                } catch { }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load content');
            } finally {
                setLoading(false);
            }
        }
        if (contentId) fetchData();
    }, [contentId]);

    // Handle Wikipedia Enrichment
    const handleWikipediaEnrich = async () => {
        if (!content || !content.wikipedia_url) {
            alert('Please enter a Wikipedia URL first.');
            return;
        }

        setEnrichingWiki(true);
        try {
            const res = await fetch('/api/wikipedia/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: content.wikipedia_url }),
            });

            const result = await res.json();

            if (!res.ok) {
                throw new Error(result.error || 'Failed to extract Wikipedia data');
            }

            if (result.data) {
                // Update editable text areas in the UI immediately without firing a db save
                // This lets them review before clicking Update All Changes
                setContent(prev => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        wiki_plot: result.data.wiki_plot || prev.wiki_plot || '',
                        wiki_production: result.data.wiki_production || prev.wiki_production || '',
                        wiki_cast_notes: result.data.wiki_cast_notes || prev.wiki_cast_notes || '',
                        wiki_accolades: result.data.wiki_accolades || prev.wiki_accolades || '',
                        wiki_reception: result.data.wiki_reception || prev.wiki_reception || '',
                        wiki_soundtrack: result.data.wiki_soundtrack || prev.wiki_soundtrack || '',
                        wiki_release: result.data.wiki_release || prev.wiki_release || '',
                        wiki_episode_guide: result.data.wiki_episode_guide || prev.wiki_episode_guide || '',
                        wiki_synopsis: prev.wiki_synopsis || '' // Unmodified by enricher, kept for embeddings
                    };
                });
                alert('Wikipedia data extracted successfully! Please review the fields and click Save All Changes to persist to database.');
            }
        } catch (err: any) {
            console.error('Wikipedia Enrichment Error:', err);
            alert(`Extraction failed: ${err.message}`);
        } finally {
            setEnrichingWiki(false);
        }
    };

    // Handle save
    const handleSave = async () => {
        if (!content) return;
        setSaving(true);
        setSaveMessage(null);
        try {
            // Convert genre/keyword names back to objects
            const updatedContent = {
                ...content,
                genres: genreNames.map((name, i) => ({ id: i, name })),
                keywords: keywordNames.map((name, i) => ({ id: i, name })),
                videos: videos,
            };

            const response = await fetch(`/api/content/${contentId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedContent),
            });
            if (!response.ok) throw new Error('Failed to save content');

            // Save watch links
            await fetch(`/api/content/${contentId}/watch-links`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ links: watchLinks }),
            });

            // Save cast assignments
            await fetch(`/api/content/${contentId}/cast`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cast }), // The modified cast state
            });

            setSaveMessage('✓ Changes saved successfully!');
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field: keyof Content, value: any) => {
        if (!content) return;
        setContent({ ...content, [field]: value });
    };

    const updateWikidataField = (field: string, value: any) => {
        if (!content) return;
        setContent({
            ...content,
            wikidata_metadata: {
                ...(content.wikidata_metadata || {}),
                [field]: value
            }
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -m-8 p-8 flex items-center justify-center">
                <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (error || !content) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -m-8 p-8">
                <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-6 text-center">
                    <p className="text-red-400 text-lg">{error || 'Content not found'}</p>
                    <Link href="/admin/content" className="text-blue-400 hover:underline mt-4 inline-block">
                        ← Back to Content Manager
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -m-8 p-8">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between sticky top-0 bg-slate-900/90 backdrop-blur-sm -mx-8 px-8 py-4 z-10 border-b border-slate-700/50">
                <div className="flex items-center gap-4">
                    <Link href="/admin/content" className="text-slate-400 hover:text-white">← Back</Link>
                    <div>
                        <h1 className="text-xl font-bold text-white">Edit: {content.title}</h1>
                        <p className="text-slate-400 text-sm">TMDB: {content.tmdb_id} • {content.content_type?.toUpperCase()}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {saveMessage && <span className="text-green-400 text-sm">{saveMessage}</span>}
                    <button
                        onClick={() => router.push('/admin/content')}
                        className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : '💾 Save All Changes'}
                    </button>
                </div>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Media */}
                <div className="space-y-4">
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                        <h3 className="text-white font-medium mb-3">Poster</h3>
                        {content.poster_path ? (
                            <img src={`${TMDB_IMAGE_BASE}${content.poster_path}`} alt="" className="w-full rounded-lg" />
                        ) : (
                            <div className="w-full aspect-[2/3] bg-slate-700 rounded-lg flex items-center justify-center text-slate-500">No Poster</div>
                        )}
                        <input
                            type="text"
                            value={content.poster_path || ''}
                            onChange={(e) => updateField('poster_path', e.target.value)}
                            placeholder="/path/to/poster.jpg"
                            className="w-full mt-3 px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                        />
                    </div>

                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                        <h3 className="text-white font-medium mb-3">Statistics</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Rating</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="10"
                                    value={content.vote_average || ''}
                                    onChange={(e) => updateField('vote_average', parseFloat(e.target.value) || null)}
                                    className="w-16 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-yellow-400 text-right"
                                />
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Votes</span>
                                <input
                                    type="number"
                                    value={content.vote_count || ''}
                                    onChange={(e) => updateField('vote_count', parseInt(e.target.value) || null)}
                                    className="w-20 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-right"
                                />
                            </div>
                            {content.content_type === 'tv' && (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Seasons</span>
                                        <input
                                            type="number"
                                            value={content.number_of_seasons || ''}
                                            onChange={(e) => updateField('number_of_seasons', parseInt(e.target.value) || null)}
                                            className="w-16 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-right"
                                        />
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Episodes</span>
                                        <input
                                            type="number"
                                            value={content.number_of_episodes || ''}
                                            onChange={(e) => updateField('number_of_episodes', parseInt(e.target.value) || null)}
                                            className="w-16 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-white text-right"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column - Form */}
                <div className="lg:col-span-2">
                    {/* Basic Info */}
                    <EditSection title="Basic Information" icon="📝">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Title *</label>
                                <input
                                    type="text"
                                    value={content.title || ''}
                                    onChange={(e) => updateField('title', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Original Title</label>
                                <input
                                    type="text"
                                    value={content.original_title || ''}
                                    onChange={(e) => updateField('original_title', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-slate-400 text-sm mb-1">Tagline</label>
                                <input
                                    type="text"
                                    value={content.tagline || ''}
                                    onChange={(e) => updateField('tagline', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-slate-400 text-sm mb-1">Overview</label>
                                <textarea
                                    value={content.overview || ''}
                                    onChange={(e) => updateField('overview', e.target.value)}
                                    rows={4}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white resize-none"
                                />
                            </div>
                        </div>
                    </EditSection>

                    {/* Status */}
                    <EditSection title="Status & Classification" icon="⚙️">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Status</label>
                                <select
                                    value={content.status || 'draft'}
                                    onChange={(e) => updateField('status', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Content Type</label>
                                <select
                                    value={content.content_type || 'tv'}
                                    onChange={(e) => updateField('content_type', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                >
                                    <option value="tv">TV</option>
                                    <option value="movie">Movie</option>
                                    <option value="drama">Drama</option>
                                    <option value="anime">Anime</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Content Rating</label>
                                <input
                                    type="text"
                                    value={content.content_rating || ''}
                                    onChange={(e) => updateField('content_rating', e.target.value)}
                                    placeholder="TV-MA, 15+"
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Language</label>
                                <input
                                    type="text"
                                    value={content.original_language || ''}
                                    onChange={(e) => updateField('original_language', e.target.value)}
                                    placeholder="en, ko, ja"
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                        </div>
                    </EditSection>

                    {/* Genres */}
                    <EditSection title="Genres" icon="🎭">
                        <div className="pt-4">
                            <TagEditor
                                tags={genreNames}
                                onChange={setGenreNames}
                                placeholder="Add genre (e.g., Drama, Action)..."
                                color="purple"
                            />
                        </div>
                    </EditSection>

                    {/* Keywords */}
                    <EditSection title="Keywords / Tags" icon="🏷️">
                        <div className="pt-4">
                            <TagEditor
                                tags={keywordNames}
                                onChange={setKeywordNames}
                                placeholder="Add keyword (e.g., revenge, time travel)..."
                                color="blue"
                            />
                        </div>
                    </EditSection>

                    {/* Cast */}
                    <EditSection title="Cast & Crew (Editable Roles)" icon="👥" defaultOpen={false}>
                        <div className="pt-4">
                            <CastEditor cast={cast} onChange={setCast} />
                        </div>
                    </EditSection>

                    {/* TV Seasons & Episodes */}
                    {content.content_type === 'tv' && (
                        <EditSection title="Episodes & Season Guide" icon="📺" defaultOpen={false}>
                            <div className="pt-4">
                                <SeasonsViewer initialSeasons={content.seasons || []} contentId={content.id} />
                            </div>
                        </EditSection>
                    )}

                    {/* Wikipedia & Deep Enrichment Data */}
                    <EditSection title="Wikipedia Data & Deep Lore" icon="🌐" defaultOpen={false}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                            <div className="md:col-span-2">
                                <label className="block text-slate-400 text-sm mb-1">Wikipedia URL</label>
                                <div className="flex gap-2">
                                    <input
                                        type="url"
                                        value={content.wikipedia_url || ''}
                                        onChange={(e) => updateField('wikipedia_url', e.target.value)}
                                        placeholder="https://en.wikipedia.org/wiki/..."
                                        className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                    />
                                    <button
                                        onClick={handleWikipediaEnrich}
                                        disabled={enrichingWiki || !content.wikipedia_url}
                                        className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center gap-2 font-medium"
                                        title="Manually fetch plot, production, and reception details from this Wikipedia URL"
                                    >
                                        {enrichingWiki ? '⏳ Extracting...' : '✨ Enrich'}
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">Paste a full Wikipedia URL and click Enrich to instantly extract data sections into the text boxes below.</p>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-slate-400 text-sm mb-1">Wiki Plot / Synopsis</label>
                                <textarea
                                    value={content.wiki_plot || ''}
                                    onChange={(e) => updateField('wiki_plot', e.target.value)}
                                    rows={5}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white resize-y"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-slate-400 text-sm mb-1">Detailed Plot</label>
                                <textarea
                                    value={content.wiki_synopsis || ''}
                                    onChange={(e) => updateField('wiki_synopsis', e.target.value)}
                                    rows={8}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white resize-y"
                                    placeholder="Leave blank for now. Used for vector search embeddings."
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-slate-400 text-sm mb-1">Wiki Production Notes</label>
                                <textarea
                                    value={content.wiki_production || ''}
                                    onChange={(e) => updateField('wiki_production', e.target.value)}
                                    rows={5}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white resize-y"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-slate-400 text-sm mb-1">Wiki Reception / Reviews</label>
                                <textarea
                                    value={content.wiki_reception || ''}
                                    onChange={(e) => updateField('wiki_reception', e.target.value)}
                                    rows={5}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white resize-y"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-slate-400 text-sm mb-1">Wiki Accolades & Awards</label>
                                <textarea
                                    value={content.wiki_accolades || ''}
                                    onChange={(e) => updateField('wiki_accolades', e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white resize-y"
                                />
                            </div>
                            {content.content_type === 'tv' && (
                                <div className="md:col-span-2">
                                    <label className="block text-slate-400 text-sm mb-1">Wiki Episode Guide / Series Overview</label>
                                    <textarea
                                        value={content.wiki_episode_guide || ''}
                                        onChange={(e) => updateField('wiki_episode_guide', e.target.value)}
                                        rows={5}
                                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white resize-y"
                                    />
                                </div>
                            )}
                        </div>
                    </EditSection>

                    {/* Videos */}
                    <EditSection title="Videos & Trailers" icon="🎬" defaultOpen={false}>
                        <div className="pt-4">
                            <VideoEditor videos={videos} onChange={setVideos} />
                        </div>
                    </EditSection>

                    {/* Watch Links */}
                    <EditSection title="Where to Watch (Streaming Links)" icon="📺">
                        <div className="pt-4">
                            <p className="text-slate-400 text-sm mb-3">Add streaming platforms with affiliate links for monetization</p>
                            <WatchLinkEditor links={watchLinks} onChange={setWatchLinks} />
                        </div>
                    </EditSection>

                    {/* Metadata */}
                    <EditSection title="Metadata & External IDs" icon="📊" defaultOpen={false}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">
                                    {content.content_type === 'movie' ? 'Release Date' : 'First Air Date'}
                                </label>
                                <input
                                    type="date"
                                    value={content.content_type === 'movie' ? content.release_date || '' : content.first_air_date || ''}
                                    onChange={(e) => updateField(content.content_type === 'movie' ? 'release_date' : 'first_air_date', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Homepage URL</label>
                                <input
                                    type="url"
                                    value={content.homepage || ''}
                                    onChange={(e) => updateField('homepage', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">IMDB ID</label>
                                <input
                                    type="text"
                                    value={content.imdb_id || ''}
                                    onChange={(e) => updateField('imdb_id', e.target.value)}
                                    placeholder="tt1234567"
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">TMDB ID (read-only)</label>
                                <input
                                    type="text"
                                    value={content.tmdb_id || ''}
                                    readOnly
                                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-400 cursor-not-allowed"
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Wikidata ID</label>
                                <input
                                    type="text"
                                    value={content.wikidata_id || ''}
                                    onChange={(e) => updateField('wikidata_id', e.target.value)}
                                    placeholder="Q12345"
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                        </div>
                    </EditSection>

                    {/* Financials & Deep Metadata */}
                    <EditSection title="Financial & Production Data" icon="📊" defaultOpen={false}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                            {content.content_type === 'movie' && (
                                <>
                                    <div>
                                        <label className="block text-slate-400 text-sm mb-1">Budget ($)</label>
                                        <input
                                            type="number"
                                            value={content.budget || ''}
                                            onChange={(e) => updateField('budget', parseInt(e.target.value) || null)}
                                            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-slate-400 text-sm mb-1">Revenue ($)</label>
                                        <input
                                            type="number"
                                            value={content.revenue || content.box_office || ''}
                                            onChange={(e) => updateField('revenue', parseInt(e.target.value) || null)}
                                            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                        />
                                    </div>
                                </>
                            )}
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Runtime (mins)</label>
                                <input
                                    type="number"
                                    value={content.wikidata_metadata?.duration || ''}
                                    onChange={(e) => updateWikidataField('duration', parseInt(e.target.value) || null)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Filming Dates</label>
                                <div className="flex gap-2">
                                    <input type="date" value={content.wikidata_metadata?.filming_start || ''} onChange={(e) => updateWikidataField('filming_start', e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />
                                    <span className="text-slate-600 flex items-center">→</span>
                                    <input type="date" value={content.wikidata_metadata?.filming_end || ''} onChange={(e) => updateWikidataField('filming_end', e.target.value)} className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Aspect Ratio</label>
                                <input
                                    type="text"
                                    value={content.wikidata_metadata?.aspect_ratio || ''}
                                    onChange={(e) => updateWikidataField('aspect_ratio', e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-slate-400 text-sm mb-1">Distributors</label>
                                <input
                                    type="text"
                                    value={content.wikidata_metadata?.distributors?.join(', ') || ''}
                                    onChange={(e) => updateWikidataField('distributors', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                    placeholder="Distributor 1, Distributor 2"
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div className="md:col-span-3">
                                <label className="block text-slate-400 text-sm mb-1">Production Companies (Wikidata)</label>
                                <input
                                    type="text"
                                    value={content.wikidata_metadata?.production_companies?.join(', ') || ''}
                                    onChange={(e) => updateWikidataField('production_companies', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                    placeholder="Company 1, Company 2"
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white"
                                />
                            </div>
                            <div className="md:col-span-3">
                                <label className="block text-slate-400 text-sm mb-1">Raw Wikidata JSON</label>
                                <textarea
                                    value={JSON.stringify(content.wikidata_metadata || {}, null, 2)}
                                    readOnly
                                    rows={4}
                                    className="w-full px-3 py-2 bg-slate-950 font-mono text-xs border border-slate-800 rounded-lg text-slate-500 resize-none cursor-not-allowed"
                                />
                            </div>
                        </div>
                    </EditSection>
                </div>
            </div>
        </div>
    );
}
