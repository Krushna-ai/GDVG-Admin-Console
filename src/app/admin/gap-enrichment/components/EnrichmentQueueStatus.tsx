'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Loader2, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

interface QueueStats {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    byType: {
        content: { total: number; pending: number };
        people: { total: number; pending: number };
        quality: { total: number; pending: number };
    };
}

export default function EnrichmentQueueStatus() {
    const [stats, setStats] = useState<QueueStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchStats();
    }, []);

    async function fetchStats() {
        try {
            const res = await fetch('/api/enrichment-queue/stats');
            const data = await res.json();
            if (data.success) {
                setStats(data.stats);
            }
        } catch (error) {
            console.error('Error fetching queue stats:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleRefreshQueue() {
        const confirmed = window.confirm(
            '🔄 Refresh Enrichment Queue?\n\n' +
            'This will:\n' +
            '• Clear the current queue\n' +
            '• Re-scan the entire database for gaps\n' +
            '• Rebuild queue with fresh priority\n\n' +
            'Continue?'
        );

        if (!confirmed) return;

        setRefreshing(true);
        try {
            const res = await fetch('/api/enrichment-queue/refresh', {
                method: 'POST',
            });
            const data = await res.json();

            if (data.success) {
                alert(`✅ Queue refreshed!\n\n${data.message}`);
                await fetchStats(); // Refresh stats
            } else {
                alert(`❌ Failed to refresh queue:\n${data.error}`);
            }
        } catch (error) {
            console.error('Error refreshing queue:', error);
            alert('❌ Error refreshing queue. Check console for details.');
        } finally {
            setRefreshing(false);
        }
    }

    async function handleClearCompleted() {
        if (!window.confirm('Clear all completed items from queue?')) return;

        // This would need a new API endpoint
        alert('Clear completed functionality coming soon!');
    }

    if (loading) {
        return <LoadingSkeleton />;
    }

    if (!stats) {
        return <ErrorState />;
    }

    const progressPercentage = stats.total > 0
        ? Math.round((stats.completed / stats.total) * 100)
        : 0;

    return (
        <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/20 rounded-xl p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-xl font-semibold text-white">Enrichment Queue Status</h3>
                    <p className="text-sm text-zinc-400 mt-1">
                        Track enrichment progress and manage the queue
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleClearCompleted}
                        disabled={stats.completed === 0}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
                    >
                        Clear Completed
                    </button>
                    <button
                        onClick={handleRefreshQueue}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    >
                        {refreshing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Refreshing...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="w-4 h-4" />
                                Refresh Queue
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <StatCard
                    icon={<Clock className="w-5 h-5 text-blue-400" />}
                    label="Pending"
                    value={stats.pending}
                    color="blue"
                />
                <StatCard
                    icon={<Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />}
                    label="Processing"
                    value={stats.processing}
                    color="yellow"
                />
                <StatCard
                    icon={<CheckCircle className="w-5 h-5 text-green-400" />}
                    label="Completed"
                    value={stats.completed}
                    color="green"
                />
                <StatCard
                    icon={<XCircle className="w-5 h-5 text-red-400" />}
                    label="Failed"
                    value={stats.failed}
                    color="red"
                />
            </div>

            {/* Progress Bar */}
            {stats.processing > 0 && (
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-zinc-400">Overall Progress</span>
                        <span className="text-sm text-white font-medium">{progressPercentage}%</span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                            style={{ width: `${progressPercentage}%` }}
                        />
                    </div>
                </div>
            )}

            {/* By Type */}
            <div className="grid grid-cols-3 gap-4">
                <TypeCard
                    label="Content Queue"
                    total={stats.byType.content.total}
                    pending={stats.byType.content.pending}
                />
                <TypeCard
                    label="People Queue"
                    total={stats.byType.people.total}
                    pending={stats.byType.people.pending}
                />
                <TypeCard
                    label="Quality Queue"
                    total={stats.byType.quality.total}
                    pending={stats.byType.quality.pending}
                />
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, color }: {
    icon: React.ReactNode;
    label: string;
    value: number;
    color: string;
}) {
    const bgColor = {
        blue: 'bg-blue-500/10',
        yellow: 'bg-yellow-500/10',
        green: 'bg-green-500/10',
        red: 'bg-red-500/10',
    }[color];

    const borderColor = {
        blue: 'border-blue-500/20',
        yellow: 'border-yellow-500/20',
        green: 'border-green-500/20',
        red: 'border-red-500/20',
    }[color];

    return (
        <div className={`${bgColor} border ${borderColor} rounded-lg p-4`}>
            <div className="flex items-center gap-2 mb-2">
                {icon}
                <span className="text-sm text-zinc-400">{label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
    );
}

function TypeCard({ label, total, pending }: {
    label: string;
    total: number;
    pending: number;
}) {
    return (
        <div className="bg-zinc-800/50 rounded-lg p-4">
            <p className="text-sm text-zinc-400 mb-2">{label}</p>
            <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-white">{pending}</span>
                <span className="text-sm text-zinc-500">/ {total}</span>
            </div>
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/20 rounded-xl p-6 animate-pulse">
            <div className="h-6 bg-zinc-800 rounded w-1/3 mb-4" />
            <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-24 bg-zinc-800 rounded" />
                ))}
            </div>
        </div>
    );
}

function ErrorState() {
    return (
        <div className="bg-red-900/20 border border-red-500/20 rounded-xl p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Failed to Load Queue Stats</h3>
            <p className="text-zinc-400">Try refreshing the page</p>
        </div>
    );
}
