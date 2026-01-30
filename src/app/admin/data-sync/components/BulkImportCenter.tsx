'use client';

import { useState } from 'react';
import ImportFilters from './ImportFilters';
import { Package, Sparkles } from 'lucide-react';

export interface ImportFiltersState {
    content_type: 'movie' | 'tv' | 'both';
    origin_countries: string[];
    min_popularity: number;
    max_items: number;
    release_date_from?: string;
    release_date_to?: string;
    genres?: number[];
    popularity_priority?: number;
    check_duplicates?: boolean;
    update_existing?: boolean;
}

export default function BulkImportCenter() {
    const [filters, setFilters] = useState<ImportFiltersState>({
        content_type: 'both',
        origin_countries: [],
        min_popularity: 20,
        max_items: 500,
        release_date_from: undefined,
        release_date_to: undefined,
        genres: [],
        popularity_priority: 50,
        check_duplicates: true,
        update_existing: false,
    });

    const [previewData, setPreviewData] = useState<any>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    const handleFiltersChange = (newFilters: Partial<ImportFiltersState>) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
    };

    const handlePreview = async () => {
        setPreviewLoading(true);
        setPreviewData(null);

        try {
            const response = await fetch('/api/import/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(filters),
            });

            if (!response.ok) {
                throw new Error('Preview failed');
            }

            const data = await response.json();
            setPreviewData(data);
        } catch (error) {
            console.error('Preview error:', error);
            alert('Failed to generate preview. Please try again.');
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleStartImport = async () => {
        try {
            const response = await fetch('/api/import/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(filters),
            });

            if (!response.ok) {
                throw new Error('Failed to start import');
            }

            const result = await response.json();
            alert(`Import job created successfully! Job ID: ${result.job_id}\n\nThe import will process in the background. Check the queue for progress.`);

            // Reset preview after starting import
            setPreviewData(null);
        } catch (error) {
            console.error('Import error:', error);
            alert('Failed to start import. Please try again.');
        }
    };

    return (
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
                <Package className="w-6 h-6 text-purple-400" />
                <h2 className="text-2xl font-bold text-white">Bulk Import Center</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Filters */}
                <div>
                    <ImportFilters
                        filters={filters}
                        onChange={handleFiltersChange}
                    />

                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={handlePreview}
                            disabled={previewLoading || filters.origin_countries.length === 0}
                            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                        >
                            {previewLoading ? 'Loading...' : 'Preview Available Content'}
                        </button>

                        <button
                            onClick={handleStartImport}
                            disabled={!previewData || filters.origin_countries.length === 0}
                            className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <Sparkles className="w-4 h-4" />
                            Start Import
                        </button>
                    </div>
                </div>

                {/* Right: Preview */}
                <div className="bg-zinc-800/50 rounded-lg border border-zinc-700/50 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Preview</h3>

                    {previewLoading ? (
                        <div className="text-center py-12">
                            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                            <p className="text-sm text-zinc-400">Loading preview...</p>
                        </div>
                    ) : !previewData ? (
                        <div className="text-center py-12 text-zinc-500">
                            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p className="text-sm">Configure filters and click Preview</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Stats Grid */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-zinc-900/50 rounded-lg p-3">
                                    <div className="text-xs text-zinc-400 mb-1">Estimated Total</div>
                                    <div className="text-xl font-bold text-white">
                                        {previewData.estimated_total?.toLocaleString()}
                                    </div>
                                </div>
                                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                                    <div className="text-xs text-green-400 mb-1">New Content</div>
                                    <div className="text-xl font-bold text-green-400">
                                        {previewData.new_content?.toLocaleString()}
                                    </div>
                                </div>
                                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3">
                                    <div className="text-xs text-yellow-400 mb-1">Duplicates</div>
                                    <div className="text-xl font-bold text-yellow-400">
                                        {previewData.duplicates?.toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            {/* Sample Items */}
                            {previewData.sample_items && previewData.sample_items.length > 0 && (
                                <div>
                                    <div className="text-sm text-zinc-400 mb-2">Sample Items:</div>
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {previewData.sample_items.map((item: any, i: number) => (
                                            <div
                                                key={i}
                                                className="flex items-center gap-3 bg-zinc-900/30 rounded p-2 border border-zinc-700/50"
                                            >
                                                {item.poster_path ? (
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                                                        alt={item.title}
                                                        className="w-10 h-14 object-cover rounded"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-14 bg-zinc-800 rounded flex items-center justify-center text-xs text-zinc-600">
                                                        No<br />Poster
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm text-white truncate">{item.title}</div>
                                                    <div className="text-xs text-zinc-500">
                                                        {item.year} • ⭐ {item.vote_average?.toFixed(1)}
                                                    </div>
                                                </div>
                                                {item.is_duplicate && (
                                                    <span className="text-xs px-2 py-1 bg-yellow-900/30 text-yellow-400 border border-yellow-500/30 rounded">
                                                        Exists
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="text-xs text-zinc-500 pt-4 border-t border-zinc-700">
                                Preview based on first 40 results. Actual import may vary.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
