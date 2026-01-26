'use client';

import { useState } from 'react';

interface PreviewResult {
    totalChanges: number;
    matchingMovies: number;
    matchingTv: number;
    movieIds: number[];
    tvIds: number[];
}

interface SyncResult {
    processed: number;
    updated: number;
    failed: number;
    errors: Array<{ tmdbId: number; type: string; error: string }>;
}

export default function DataSyncPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [preview, setPreview] = useState<PreviewResult | null>(null);
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Date range (default: last 24 hours)
    const [startDate, setStartDate] = useState(() => {
        const date = new Date();
        date.setDate(date.getDate() - 1);
        return date.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });

    const handlePreview = async () => {
        setIsLoading(true);
        setError(null);
        setSyncResult(null);

        try {
            const response = await fetch(
                `/api/sync/preview?startDate=${startDate}&endDate=${endDate}`
            );
            const data = await response.json();

            if (data.success) {
                setPreview(data);
            } else {
                setError(data.error || 'Failed to preview changes');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSync = async () => {
        if (!preview) return;

        setIsSyncing(true);
        setError(null);

        try {
            const response = await fetch('/api/sync/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    movieIds: preview.movieIds,
                    tvIds: preview.tvIds,
                }),
            });
            const data = await response.json();

            if (data.success) {
                setSyncResult(data);
                setPreview(null);
            } else {
                setError(data.error || 'Failed to run sync');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -m-8 p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">
                    🔄 Data Sync
                </h1>
                <p className="text-slate-400">
                    Sync content changes from TMDB to keep your database up to date
                </p>
            </div>

            {/* Configuration */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 mb-6">
                <h2 className="text-xl font-semibold text-white mb-4">Date Range</h2>
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-2">End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <button
                        onClick={handlePreview}
                        disabled={isLoading}
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-lg shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                <span>Checking...</span>
                            </>
                        ) : (
                            <>
                                <span>🔍</span>
                                <span>Preview Changes</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 mb-6">
                    <p className="text-red-400">{error}</p>
                </div>
            )}

            {/* Preview Results */}
            {preview && (
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 mb-6">
                    <h2 className="text-xl font-semibold text-white mb-4">Preview Results</h2>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-slate-700/50 rounded-xl p-4">
                            <p className="text-slate-400 text-sm">Total TMDB Changes</p>
                            <p className="text-2xl font-bold text-white">{preview.totalChanges}</p>
                        </div>
                        <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-4">
                            <p className="text-blue-400 text-sm">Movies to Update</p>
                            <p className="text-2xl font-bold text-blue-300">{preview.matchingMovies}</p>
                        </div>
                        <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-4">
                            <p className="text-purple-400 text-sm">TV Shows to Update</p>
                            <p className="text-2xl font-bold text-purple-300">{preview.matchingTv}</p>
                        </div>
                        <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4">
                            <p className="text-emerald-400 text-sm">Total to Sync</p>
                            <p className="text-2xl font-bold text-emerald-300">
                                {preview.matchingMovies + preview.matchingTv}
                            </p>
                        </div>
                    </div>

                    {preview.matchingMovies + preview.matchingTv > 0 ? (
                        <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSyncing ? (
                                <>
                                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                                    <span>Syncing...</span>
                                </>
                            ) : (
                                <>
                                    <span>🔄</span>
                                    <span>Run Sync</span>
                                </>
                            )}
                        </button>
                    ) : (
                        <p className="text-slate-400">No content needs updating.</p>
                    )}
                </div>
            )}

            {/* Sync Results */}
            {syncResult && (
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
                    <h2 className="text-xl font-semibold text-white mb-4">Sync Complete</h2>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-slate-700/50 rounded-xl p-4">
                            <p className="text-slate-400 text-sm">Processed</p>
                            <p className="text-2xl font-bold text-white">{syncResult.processed}</p>
                        </div>
                        <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4">
                            <p className="text-emerald-400 text-sm">Updated</p>
                            <p className="text-2xl font-bold text-emerald-300">{syncResult.updated}</p>
                        </div>
                        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4">
                            <p className="text-red-400 text-sm">Failed</p>
                            <p className="text-2xl font-bold text-red-300">{syncResult.failed}</p>
                        </div>
                    </div>

                    {syncResult.errors.length > 0 && (
                        <div className="mt-4">
                            <h3 className="text-lg font-medium text-white mb-2">Errors</h3>
                            <div className="bg-slate-900/50 rounded-lg p-4 max-h-40 overflow-y-auto">
                                {syncResult.errors.map((err, i) => (
                                    <div key={i} className="text-sm text-red-400 mb-1">
                                        {err.type} #{err.tmdbId}: {err.error}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
