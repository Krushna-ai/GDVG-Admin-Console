'use client';

import { useState } from 'react';

// TMDB Image base URL
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

interface SearchResult {
    id: number;
    media_type: 'movie' | 'tv' | 'person';
    title?: string;
    name?: string;
    poster_path?: string;
    profile_path?: string;
    release_date?: string;
    first_air_date?: string;
    overview?: string;
    popularity: number;
    vote_average?: number;
}

interface DiscoverResult {
    id: number;
    title?: string;
    name?: string;
    poster_path?: string;
    release_date?: string;
    first_air_date?: string;
    popularity: number;
    vote_average: number;
    origin_country?: string[];
}

type ImportStatus = 'idle' | 'importing' | 'success' | 'error';

export default function TMDBImportPage() {
    const [activeTab, setActiveTab] = useState<'search' | 'discover'>('search');

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Discover state
    const [discoverType, setDiscoverType] = useState<string>('korean');
    const [discoverResults, setDiscoverResults] = useState<DiscoverResult[]>([]);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [discoverPage, setDiscoverPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Import state
    const [importingIds, setImportingIds] = useState<Set<number>>(new Set());
    const [importedIds, setImportedIds] = useState<Set<number>>(new Set());
    const [importErrors, setImportErrors] = useState<Map<number, string>>(new Map());
    const [isImportingPage, setIsImportingPage] = useState(false);

    // Search handler
    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const response = await fetch(`/api/tmdb/search?query=${encodeURIComponent(searchQuery)}`);
            const data = await response.json();
            setSearchResults(data.results?.filter((r: SearchResult) => r.media_type !== 'person') || []);
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setIsSearching(false);
        }
    };

    // Discover handler
    const handleDiscover = async (type: string, page: number = 1) => {
        setIsDiscovering(true);
        setDiscoverType(type);
        try {
            const response = await fetch(`/api/tmdb/discover?type=${type}&page=${page}`);
            const data = await response.json();
            setDiscoverResults(data.results || []);
            setDiscoverPage(data.page || 1);
            setTotalPages(data.total_pages || 1);
        } catch (error) {
            console.error('Discover failed:', error);
        } finally {
            setIsDiscovering(false);
        }
    };

    // Import single item
    const handleImport = async (e: React.MouseEvent, tmdbId: number, contentType: 'movie' | 'tv') => {
        e.stopPropagation();
        setImportingIds(prev => new Set(prev).add(tmdbId));
        setImportErrors(prev => { const next = new Map(prev); next.delete(tmdbId); return next; });

        try {
            const response = await fetch('/api/tmdb/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tmdbId, contentType }),
            });
            const data = await response.json();
            if (data.success) {
                setImportedIds(prev => new Set(prev).add(tmdbId));
            } else {
                setImportErrors(prev => new Map(prev).set(tmdbId, data.error || 'Import failed'));
            }
        } catch (error) {
            setImportErrors(prev => new Map(prev).set(tmdbId, 'Network error'));
        } finally {
            setImportingIds(prev => { const next = new Set(prev); next.delete(tmdbId); return next; });
        }
    };

    // Import all visible items
    const handleImportPage = async () => {
        const itemsToImport = activeTab === 'search'
            ? searchResults
            : discoverResults;

        if (itemsToImport.length === 0) return;

        setIsImportingPage(true);

        try {
            const queueItems = itemsToImport.map(item => ({
                tmdbId: item.id,
                contentType: (item as any).media_type || (currentCategory?.type || 'tv')
            }));

            const response = await fetch('/api/queue/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: queueItems }),
            });

            const data = await response.json();

            if (data.success) {
                // Mark all as importing technically, but really they are queued.
                // We'll just show show a success indicator or toast
                alert(`Successfully added ${data.inserted} items to the import queue! (${data.skipped} skipped)`);
            } else {
                alert('Failed to add items to queue');
            }
        } catch (error) {
            console.error('Batch import failed:', error);
            alert('Error adding items to queue');
        } finally {
            setIsImportingPage(false);
        }
    };

    const getImportStatus = (id: number): ImportStatus => {
        if (importingIds.has(id)) return 'importing';
        if (importedIds.has(id)) return 'success';
        if (importErrors.has(id)) return 'error';
        return 'idle';
    };

    // Discover categories
    const discoverCategories = [
        { id: 'korean', label: '🇰🇷 Korean', type: 'tv' },
        { id: 'chinese', label: '🇨🇳 Chinese', type: 'tv' },
        { id: 'japanese', label: '🇯🇵 Anime', type: 'tv' },
        { id: 'thai', label: '🇹🇭 Thai', type: 'tv' },
        { id: 'turkish', label: '🇹🇷 Turkish', type: 'tv' },
        { id: 'indian', label: '🇮🇳 Indian', type: 'tv' },
        { id: 'bollywood', label: '🎬 Bollywood', type: 'movie' },
    ];

    const currentCategory = discoverCategories.find(c => c.id === discoverType);

    // Render content card
    const renderCard = (item: SearchResult | DiscoverResult, contentType: 'movie' | 'tv') => {
        const title = (item as any).title || (item as any).name || 'Unknown';
        const date = (item as any).release_date || (item as any).first_air_date;
        const year = date ? date.substring(0, 4) : 'N/A';
        const poster = (item as any).poster_path;
        const imageUrl = poster ? `${TMDB_IMAGE_BASE}${poster}` : null;
        const rating = (item as any).vote_average;
        const status = getImportStatus(item.id);
        const country = (item as DiscoverResult).origin_country?.[0];

        return (
            <div
                key={item.id}
                className="group relative bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 border border-slate-700/50"
            >
                {/* Poster */}
                <div className="aspect-[2/3] relative overflow-hidden">
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                            <span className="text-slate-500 text-4xl">🎬</span>
                        </div>
                    )}

                    {/* Overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

                    {/* Rating badge */}
                    {rating > 0 && (
                        <div className="absolute top-3 right-3 bg-yellow-500/90 backdrop-blur-sm text-black text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                            <span>★</span>
                            <span>{rating.toFixed(1)}</span>
                        </div>
                    )}

                    {/* Country badge */}
                    {country && (
                        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-black text-xs font-bold px-2 py-1 rounded-full">
                            {country}
                        </div>
                    )}

                    {/* Type badge */}
                    <div className="absolute top-12 left-3 bg-purple-600/90 backdrop-blur-sm text-white text-xs font-medium px-2 py-1 rounded-full uppercase">
                        {contentType}
                    </div>

                    {/* Content info overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                        <h3 className="font-bold text-white text-sm line-clamp-2 mb-1 drop-shadow-lg">
                            {title}
                        </h3>
                        <p className="text-slate-300 text-xs">{year}</p>
                    </div>
                </div>

                {/* Import button */}
                <div className="p-3 bg-slate-800/50">
                    <button
                        onClick={(e) => handleImport(e, item.id, contentType)}
                        disabled={status === 'importing' || status === 'success'}
                        className={`
              w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all duration-200
              flex items-center justify-center gap-2
              ${status === 'success'
                                ? 'bg-emerald-600 text-white cursor-default'
                                : status === 'error'
                                    ? 'bg-red-600 hover:bg-red-500 text-white'
                                    : status === 'importing'
                                        ? 'bg-blue-600 text-white cursor-wait'
                                        : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg hover:shadow-blue-500/25'
                            }
            `}
                    >
                        {status === 'importing' && (
                            <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                <span>Importing...</span>
                            </>
                        )}
                        {status === 'success' && (
                            <>
                                <span>✓</span>
                                <span>Imported</span>
                            </>
                        )}
                        {status === 'error' && (
                            <>
                                <span>↻</span>
                                <span>Retry Import</span>
                            </>
                        )}
                        {status === 'idle' && (
                            <>
                                <span>📥</span>
                                <span>Import to Database</span>
                            </>
                        )}
                    </button>

                    {importErrors.has(item.id) && (
                        <p className="text-red-400 text-xs mt-2 text-center">{importErrors.get(item.id)}</p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -m-8 p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">
                    🎬 TMDB Import
                </h1>
                <p className="text-slate-400">Search and import content from The Movie Database</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setActiveTab('search')}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${activeTab === 'search'
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                        }`}
                >
                    🔍 Search
                </button>
                <button
                    onClick={() => setActiveTab('discover')}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${activeTab === 'discover'
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                        }`}
                >
                    🌍 Discover
                </button>
            </div>

            {/* Search Tab */}
            {activeTab === 'search' && (
                <div className="space-y-6">
                    {/* Search input */}
                    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
                        <h2 className="text-xl font-semibold text-white mb-4">Search TMDB</h2>
                        <div className="flex gap-3">
                            <input
                                type="text"
                                placeholder="Search movies, TV shows, dramas..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="flex-1 px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            />
                            <button
                                onClick={handleSearch}
                                disabled={isSearching}
                                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-blue-500/25 transition-all duration-200 disabled:opacity-50"
                            >
                                {isSearching ? 'Searching...' : 'Search'}
                            </button>
                        </div>
                    </div>

                    {/* Search Results */}
                    {searchResults.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-white mb-4">
                                Results ({searchResults.length})
                            </h3>
                            <button
                                onClick={handleImportPage}
                                disabled={isImportingPage}
                                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {isImportingPage ? (
                                    <>
                                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                        <span>Queueing...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>📥</span>
                                        <span>Import All to Queue</span>
                                    </>
                                )}
                            </button>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {searchResults.map((item) =>
                                    renderCard(item, item.media_type as 'movie' | 'tv')
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Discover Tab */}
            {
                activeTab === 'discover' && (
                    <div className="space-y-6">
                        {/* Category buttons */}
                        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
                            <h2 className="text-xl font-semibold text-white mb-4">Browse by Region</h2>
                            <div className="flex flex-wrap gap-3">
                                {discoverCategories.map((category) => (
                                    <button
                                        key={category.id}
                                        onClick={() => handleDiscover(category.id, 1)}
                                        disabled={isDiscovering}
                                        className={`px-5 py-2.5 rounded-xl font-medium transition-all duration-200 ${discoverType === category.id
                                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600 hover:text-white'
                                            }`}
                                    >
                                        {category.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Discover Results */}
                        {discoverResults.length > 0 && (
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-4">
                                        <h3 className="text-lg font-semibold text-white">
                                            {currentCategory?.label} Dramas
                                        </h3>
                                        <button
                                            onClick={handleImportPage}
                                            disabled={isImportingPage}
                                            className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium rounded-lg shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 text-sm"
                                        >
                                            {isImportingPage ? (
                                                <>
                                                    <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                                                    <span>Queueing...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span>📥</span>
                                                    <span>Import Page</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => handleDiscover(discoverType, discoverPage - 1)}
                                            disabled={discoverPage <= 1 || isDiscovering}
                                            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            ← Previous
                                        </button>
                                        <span className="text-slate-400 text-sm">
                                            Page {discoverPage} of {totalPages}
                                        </span>
                                        <button
                                            onClick={() => handleDiscover(discoverType, discoverPage + 1)}
                                            disabled={discoverPage >= totalPages || isDiscovering}
                                            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Next →
                                        </button>
                                    </div>
                                </div>

                                {isDiscovering ? (
                                    <div className="flex items-center justify-center py-20">
                                        <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                        {discoverResults.map((item) =>
                                            renderCard(item, (currentCategory?.type || 'tv') as 'movie' | 'tv')
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Empty state */}
                        {discoverResults.length === 0 && !isDiscovering && (
                            <div className="text-center py-20">
                                <p className="text-slate-400 text-lg">
                                    Click a category above to discover content
                                </p>
                            </div>
                        )}
                    </div>
                )
            }
        </div >
    );
}
