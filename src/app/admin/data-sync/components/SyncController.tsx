'use client';

import { useState, useEffect } from 'react';
import { Play, Pause, RefreshCw } from 'lucide-react';

interface SyncStatus {
    is_paused: boolean;
    paused_at: string | null;
    paused_by: string | null;
    resumed_at: string | null;
    last_run: {
        started_at: string;
        completed_at: string;
        status: string;
        summary: any;
    } | null;
    next_run: string | null;
    active_jobs: number;
    pending_gaps: number;
    content_stats: {
        total: number;
        movies: number;
        tv_series: number;
    };
}

export default function SyncController() {
    const [status, setStatus] = useState<SyncStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/sync/status');
            const data = await res.json();
            if (data.success !== false) {
                setStatus(data);
            }
        } catch (error) {
            console.error('Error fetching sync status:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    const handlePause = async () => {
        setActionLoading(true);
        try {
            const res = await fetch('/api/sync/pause', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                await fetchStatus();
            }
        } catch (error) {
            console.error('Error pausing sync:', error);
        } finally {
            setActionLoading(false);
        }
    };

    const handleResume = async () => {
        setActionLoading(true);
        try {
            const res = await fetch('/api/sync/resume', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                await fetchStatus();
            }
        } catch (error) {
            console.error('Error resuming sync:', error);
        } finally {
            setActionLoading(false);
        }
    };

    const handleRunNow = async () => {
        // Confirmation dialog
        const confirmed = window.confirm(
            '🚀 Run Auto-Import Now?\n\n' +
            'This will trigger the daily auto-import workflow immediately.\n' +
            'It will discover and import new content from TMDB.\n\n' +
            'Continue?'
        );

        if (!confirmed) return;

        setActionLoading(true);
        try {
            const res = await fetch('/api/workflows/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workflow: 'auto-import' }),
            });
            const data = await res.json();

            if (data.success) {
                alert('✅ Auto-import workflow triggered successfully!\n\nCheck GitHub Actions for progress.');
            } else {
                alert(`❌ Failed to trigger workflow:\n${data.error}`);
            }
        } catch (error) {
            console.error('Error triggering workflow:', error);
            alert('❌ Error triggering workflow. Check console for details.');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
                <div className="animate-pulse">
                    <div className="h-6 bg-zinc-800 rounded w-1/3 mb-4"></div>
                    <div className="h-4 bg-zinc-800 rounded w-2/3"></div>
                </div>
            </div>
        );
    }

    const isPaused = status?.is_paused || false;

    return (
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-green-500'} animate-pulse`}></div>
                    <h2 className="text-xl font-semibold text-white">
                        Sync Status: {isPaused ? 'Paused' : 'Active'}
                    </h2>
                </div>

                <div className="flex gap-2">
                    {isPaused ? (
                        <button
                            onClick={handleResume}
                            disabled={actionLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-lg transition-colors"
                        >
                            <Play className="w-4 h-4" />
                            Resume
                        </button>
                    ) : (
                        <button
                            onClick={handlePause}
                            disabled={actionLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-800 text-white rounded-lg transition-colors"
                        >
                            <Pause className="w-4 h-4" />
                            Pause
                        </button>
                    )}

                    <button
                        onClick={handleRunNow}
                        disabled={actionLoading || isPaused}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                        title={isPaused ? 'Resume sync to run manually' : 'Trigger auto-import now'}
                    >
                        <Play className="w-4 h-4" />
                        Run Now
                    </button>

                    <button
                        onClick={fetchStatus}
                        disabled={actionLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white rounded-lg transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-zinc-800/50 rounded-lg p-4">
                    <div className="text-zinc-400 text-sm mb-1">Total Content</div>
                    <div className="text-2xl font-bold text-white">{status?.content_stats.total || 0}</div>
                    <div className="text-xs text-zinc-500 mt-1">
                        {status?.content_stats.movies || 0} movies · {status?.content_stats.tv_series || 0} series
                    </div>
                </div>

                <div className="bg-zinc-800/50 rounded-lg p-4">
                    <div className="text-zinc-400 text-sm mb-1">Active Jobs</div>
                    <div className="text-2xl font-bold text-white">{status?.active_jobs || 0}</div>
                    <div className="text-xs text-zinc-500 mt-1">Import jobs running</div>
                </div>

                <div className="bg-zinc-800/50 rounded-lg p-4">
                    <div className="text-zinc-400 text-sm mb-1">Pending Gaps</div>
                    <div className="text-2xl font-bold text-white">{status?.pending_gaps || 0}</div>
                    <div className="text-xs text-zinc-500 mt-1">Items to fill</div>
                </div>
            </div>

            {/* Last Run Info */}
            {status?.last_run && (
                <div className="bg-zinc-800/30 rounded-lg p-4 mb-4">
                    <div className="text-sm text-zinc-400 mb-2">Last Sync Run</div>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-white">
                                {new Date(status.last_run.started_at).toLocaleString()}
                            </div>
                            <div className="text-xs text-zinc-500 mt-1">
                                Status: <span className={`${status.last_run.status === 'completed' ? 'text-green-400' : 'text-red-400'}`}>
                                    {status.last_run.status}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Next Run Info */}
            {status?.next_run && !isPaused && (
                <div className="bg-zinc-800/30 rounded-lg p-4">
                    <div className="text-sm text-zinc-400 mb-2">Next Scheduled Run</div>
                    <div className="text-white">
                        {new Date(status.next_run).toLocaleString()}
                    </div>
                </div>
            )}

            {/* Paused Info */}
            {isPaused && status?.paused_at && (
                <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4">
                    <div className="text-sm text-yellow-400 mb-2">⏸️ Sync Paused</div>
                    <div className="text-white text-sm">
                        Paused at: {new Date(status.paused_at).toLocaleString()}
                    </div>
                </div>
            )}
        </div>
    );
}
