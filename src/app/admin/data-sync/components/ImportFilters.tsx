'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import type { ImportFiltersState } from './BulkImportCenter';

interface ImportFiltersProps {
    filters: ImportFiltersState;
    onChange: (filters: Partial<ImportFiltersState>) => void;
}

const POPULAR_COUNTRIES = [
    { code: 'KR', name: 'Korea', flag: '🇰🇷' },
    { code: 'JP', name: 'Japan', flag: '🇯🇵' },
    { code: 'CN', name: 'China', flag: '🇨🇳' },
    { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
    { code: 'TR', name: 'Turkey', flag: '🇹🇷' },
    { code: 'IN', name: 'India', flag: '🇮🇳' },
    { code: 'US', name: 'USA', flag: '🇺🇸' },
    { code: 'GB', name: 'UK', flag: '🇬🇧' },
];

// Common TMDB Genres
const GENRES = [
    { id: 18, name: 'Drama' },
    { id: 10749, name: 'Romance' },
    { id: 28, name: 'Action' },
    { id: 35, name: 'Comedy' },
    { id: 53, name: 'Thriller' },
    { id: 27, name: 'Horror' },
    { id: 878, name: 'Sci-Fi' },
    { id: 14, name: 'Fantasy' },
    { id: 9648, name: 'Mystery' },
    { id: 80, name: 'Crime' },
    { id: 10751, name: 'Family' },
    { id: 16, name: 'Animation' },
    { id: 36, name: 'History' },
    { id: 10752, name: 'War' },
    { id: 37, name: 'Western' },
    { id: 99, name: 'Documentary' },
];

const MORE_COUNTRIES = [
    { code: 'TW', name: 'Taiwan', flag: '🇹🇼' },
    { code: 'HK', name: 'Hong Kong', flag: '🇭🇰' },
    { code: 'FR', name: 'France', flag: '🇫🇷' },
    { code: 'DE', name: 'Germany', flag: '🇩🇪' },
    { code: 'ES', name: 'Spain', flag: '🇪🇸' },
    { code: 'IT', name: 'Italy', flag: '🇮🇹' },
    { code: 'CA', name: 'Canada', flag: '🇨🇦' },
    { code: 'AU', name: 'Australia', flag: '🇦🇺' },
    { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
    { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
];

export default function ImportFilters({ filters, onChange }: ImportFiltersProps) {
    const [showMoreCountries, setShowMoreCountries] = useState(false);

    const handleContentTypeChange = (type: 'movie' | 'tv' | 'both') => {
        onChange({ content_type: type });
    };

    const handleCountryToggle = (countryCode: string) => {
        const newCountries = filters.origin_countries.includes(countryCode)
            ? filters.origin_countries.filter(c => c !== countryCode)
            : [...filters.origin_countries, countryCode];

        onChange({ origin_countries: newCountries });
    };

    const handleClearAll = () => {
        onChange({
            content_type: 'both',
            origin_countries: [],
            min_popularity: 20,
            max_items: 500,
        });
    };

    return (
        <div className="space-y-6">
            {/* Content Type */}
            <div>
                <label className="block text-sm font-medium text-zinc-300 mb-3">
                    Content Type
                </label>
                <div className="grid grid-cols-3 gap-3">
                    {(['movie', 'tv', 'both'] as const).map((type) => (
                        <button
                            key={type}
                            onClick={() => handleContentTypeChange(type)}
                            className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${filters.content_type === type
                                ? 'bg-purple-600 border-purple-500 text-white'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                                }`}
                        >
                            {type === 'movie' ? '🎬 Movies' : type === 'tv' ? '📺 TV Series' : '🎭 Both'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Origin Countries */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-zinc-300">
                        Origin Countries
                        {filters.origin_countries.length > 0 && (
                            <span className="ml-2 text-xs text-purple-400">
                                ({filters.origin_countries.length} selected)
                            </span>
                        )}
                    </label>
                    {filters.origin_countries.length > 0 && (
                        <button
                            onClick={() => onChange({ origin_countries: [] })}
                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                        >
                            <X className="w-3 h-3" />
                            Clear
                        </button>
                    )}
                </div>

                {/* Popular Countries */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                    {POPULAR_COUNTRIES.map((country) => (
                        <button
                            key={country.code}
                            onClick={() => handleCountryToggle(country.code)}
                            className={`flex items-center gap-2 px-3 py-2 rounded border text-sm transition-all ${filters.origin_countries.includes(country.code)
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                                }`}
                        >
                            <span className="text-lg">{country.flag}</span>
                            <span className="flex-1 text-left">{country.name}</span>
                        </button>
                    ))}
                </div>

                {/* More Countries (Collapsible) */}
                <div>
                    <button
                        onClick={() => setShowMoreCountries(!showMoreCountries)}
                        className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-300 mb-2"
                    >
                        {showMoreCountries ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        More countries...
                    </button>

                    {showMoreCountries && (
                        <div className="grid grid-cols-2 gap-2 pl-6">
                            {MORE_COUNTRIES.map((country) => (
                                <button
                                    key={country.code}
                                    onClick={() => handleCountryToggle(country.code)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded border text-sm transition-all ${filters.origin_countries.includes(country.code)
                                        ? 'bg-blue-600 border-blue-500 text-white'
                                        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                                        }`}
                                >
                                    <span className="text-lg">{country.flag}</span>
                                    <span className="flex-1 text-left">{country.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Popularity Priority */}
            <div className="space-y-3 pt-4 border-t border-zinc-700">
                <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-zinc-300">
                        Popularity Priority
                    </label>
                    <span className="text-xs text-zinc-500">Sorting order, not a filter</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={filters.popularity_priority || 50}
                    onChange={(e) => onChange({ popularity_priority: Number(e.target.value) })}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500">Low (0)</span>
                    <span className="text-sm font-medium text-blue-400">{filters.popularity_priority || 50}</span>
                    <span className="text-xs text-zinc-500">High (100)</span>
                </div>
                <p className="text-xs text-zinc-500 italic">
                    Higher values fetch most popular content first. All matching content is imported.
                </p>
            </div>

            {/* Import Options */}
            <div className="space-y-3 pt-4 border-t border-zinc-700">
                <label className="block text-sm font-medium text-zinc-300 mb-3">
                    Import Options
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={filters.check_duplicates ?? true}
                        onChange={(e) => onChange({ check_duplicates: e.target.checked })}
                        className="mt-0.5 w-4 h-4 bg-zinc-800 border-zinc-700 rounded focus:ring-2 focus:ring-blue-500 text-blue-600"
                    />
                    <div className="flex-1">
                        <div className="text-sm text-zinc-300 group-hover:text-white transition-colors">
                            Check for duplicates before import
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                            Skip items that already exist in the database
                        </div>
                    </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={filters.update_existing ?? false}
                        onChange={(e) => onChange({ update_existing: e.target.checked })}
                        className="mt-0.5 w-4 h-4 bg-zinc-800 border-zinc-700 rounded focus:ring-2 focus:ring-blue-500 text-blue-600"
                    />
                    <div className="flex-1">
                        <div className="text-sm text-zinc-300 group-hover:text-white transition-colors">
                            Update existing content if found
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                            Re-import items even if TMDB ID exists (refreshes metadata)
                        </div>
                    </div>
                </label>
            </div>

            {/* Advanced Options */}
            <div className="space-y-4 pt-4 border-t border-zinc-700">
                <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Minimum Popularity: {filters.min_popularity}
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={filters.min_popularity}
                        onChange={(e) => onChange({ min_popularity: Number(e.target.value) })}
                        className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
                    />
                    <div className="flex justify-between text-xs text-zinc-500 mt-1">
                        <span>All</span>
                        <span>Popular</span>
                        <span>Very Popular</span>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Max Items to Import
                    </label>
                    <select
                        value={filters.max_items}
                        onChange={(e) => onChange({ max_items: Number(e.target.value) })}
                        className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                        <option value="100">100 items</option>
                        <option value="250">250 items</option>
                        <option value="500">500 items</option>
                        <option value="1000">1,000 items</option>
                        <option value="2000">2,000 items</option>
                    </select>
                </div>
            </div>

            {/* Date Range Filter */}
            <div className="space-y-3 pt-4 border-t border-zinc-700">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Release Date Range
                </label>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs text-zinc-400 mb-1">From Year</label>
                        <select
                            value={filters.release_date_from?.split('-')[0] || ''}
                            onChange={(e) => {
                                const year = e.target.value;
                                if (year) {
                                    onChange({ release_date_from: `${year}-01-01` });
                                } else {
                                    onChange({ release_date_from: undefined });
                                }
                            }}
                            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                            <option value="">Any</option>
                            {Array.from({ length: 7 }, (_, i) => 2020 + i).map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs text-zinc-400 mb-1">To Year</label>
                        <select
                            value={filters.release_date_to?.split('-')[0] || ''}
                            onChange={(e) => {
                                const year = e.target.value;
                                if (year) {
                                    onChange({ release_date_to: `${year}-12-31` });
                                } else {
                                    onChange({ release_date_to: undefined });
                                }
                            }}
                            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                            <option value="">Any</option>
                            {Array.from({ length: 7 }, (_, i) => 2020 + i).map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {(filters.release_date_from || filters.release_date_to) && (
                    <button
                        onClick={() => onChange({ release_date_from: undefined, release_date_to: undefined })}
                        className="text-xs text-red-400 hover:text-red-300"
                    >
                        Clear date range
                    </button>
                )}
            </div>

            {/* Genre Filter */}
            <div className="space-y-3 pt-4 border-t border-zinc-700">
                <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-zinc-300">
                        Genres
                        {filters.genres && filters.genres.length > 0 && (
                            <span className="ml-2 text-xs text-purple-400">
                                ({filters.genres.length} selected)
                            </span>
                        )}
                    </label>
                    {filters.genres && filters.genres.length > 0 && (
                        <button
                            onClick={() => onChange({ genres: [] })}
                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                        >
                            <X className="w-3 h-3" />
                            Clear
                        </button>
                    )}
                </div>

                {/* Selected Genres as Tags */}
                {filters.genres && filters.genres.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                        {filters.genres.map((genreId) => {
                            const genre = GENRES.find(g => g.id === genreId);
                            return genre ? (
                                <span
                                    key={genreId}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-purple-600 text-white rounded text-xs"
                                >
                                    {genre.name}
                                    <button
                                        onClick={() => {
                                            const newGenres = filters.genres?.filter(id => id !== genreId) || [];
                                            onChange({ genres: newGenres });
                                        }}
                                        className="hover:text-purple-200"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ) : null;
                        })}
                    </div>
                )}

                {/* Genre Selection */}
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2">
                    {GENRES.map((genre) => (
                        <button
                            key={genre.id}
                            onClick={() => {
                                const isSelected = filters.genres?.includes(genre.id);
                                const newGenres = isSelected
                                    ? filters.genres?.filter(id => id !== genre.id) || []
                                    : [...(filters.genres || []), genre.id];
                                onChange({ genres: newGenres });
                            }}
                            className={`px-3 py-2 rounded border text-xs transition-all text-left ${filters.genres?.includes(genre.id)
                                ? 'bg-purple-600 border-purple-500 text-white'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                                }`}
                        >
                            {genre.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Clear All Button */}
            <button
                onClick={handleClearAll}
                className="w-full px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
            >
                Clear All Filters
            </button>
        </div>
    );
}
