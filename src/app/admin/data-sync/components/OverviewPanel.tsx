'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, Film, Tv, Clock, Calendar } from 'lucide-react';

interface ContentStats {
    total: number;
    movies: number;
    tv_series: number;
}

interface SyncInfo {
    is_paused: boolean;
    last_run: {
        started_at: string;
        status: string;
    } | null;
    next_run: string | null;
    content_stats: ContentStats;
}

export default function OverviewPanel() {
    const [data, setData] = useState<SyncInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const res = await fetch('/api/sync/status');
            const result = await res.json();
            if (result.success !== false) {
                setData(result);
            }
        } catch (error) {
            console.error('Error fetching overview data:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-zinc-800 rounded w-1/3"></div>
                    <div className="h-20 bg-zinc-800 rounded"></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="h-16 bg-zinc-800 rounded"></div>
                        <div className="h-16 bg-zinc-800 rounded"></div>
                    </div>
                </div>
            </div>
        );
    }

    const total = data?.content_stats.total || 0;
    const movies = data?.content_stats.movies || 0;
    const tvSeries = data?.content_stats.tv_series || 0;
    const moviePercent = total > 0 ? (movies / total) * 100 : 0;
    const tvPercent = total > 0 ? (tvSeries / total) * 100 : 0;

    const formatTimeAgo = (dateString: string | null) => {
        if (!dateString) return 'Never';
        const date = new Date(dateString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        return 'Just now';
    };

    return (
        <div className="bg-gradient-to-br from-zinc-900/80 to-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-6 h-6 text-blue-400" />
                    Content Overview
                </h2>
            </div>

            {/* Total Content Count */}
            <div className="mb-6">
                <div className="text-zinc-400 text-sm mb-2">Total Content</div>
                <div className="text-5xl font-bold text-white mb-4">{total.toLocaleString()}</div>

                {/* Visual Bar */}
                <div className="h-3 bg-zinc-800 rounded-full overflow-hidden flex">
                    <div
                        className="bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-500"
                        style={{ width: `${moviePercent}%` }}
                    ></div>
                    <div
                        className="bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                        style={{ width: `${tvPercent}%` }}
                    ></div>
                </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
                    <div className="flex items-center gap-2 mb-2">
                        <Film className="w-4 h-4 text-purple-400" />
                        <span className="text-zinc-400 text-sm">Movies</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{movies.toLocaleString()}</div>
                    <div className="text-xs text-zinc-500 mt-1">{moviePercent.toFixed(1)}%</div>
                </div>

                <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
                    <div className="flex items-center gap-2 mb-2">
                        <Tv className="w-4 h-4 text-blue-400" />
                        <span className="text-zinc-400 text-sm">TV Series</span>
                    </div>
                    <div className="text-2xl font-bold text-white">{tvSeries.toLocaleString()}</div>
                    <div className="text-xs text-zinc-500 mt-1">{tvPercent.toFixed(1)}%</div>
                </div>
            </div>

            {/* Sync Info */}
            <div className="space-y-3 pt-4 border-t border-zinc-800">
                {/* Sync Status */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${data?.is_paused ? 'bg-yellow-500' : 'bg-green-500'} animate-pulse`}></div>
                        <span className="text-sm text-zinc-400">Sync Status</span>
                    </div>
                    <span className={`text-sm font-medium ${data?.is_paused ? 'text-yellow-400' : 'text-green-400'}`}>
                        {data?.is_paused ? 'Paused' : 'Active'}
                    </span>
                </div>

                {/* Last Sync */}
                {data?.last_run && (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-zinc-500" />
                            <span className="text-sm text-zinc-400">Last Sync</span>
                        </div>
                        <span className="text-sm text-zinc-300">
                            {formatTimeAgo(data.last_run.started_at)}
                        </span>
                    </div>
                )}

                {/* Next Sync */}
                {data?.next_run && !data?.is_paused && (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-zinc-500" />
                            <span className="text-sm text-zinc-400">Next Sync</span>
                        </div>
                        <span className="text-sm text-zinc-300">
                            {formatTimeAgo(data.next_run)}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
