'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Clock, Loader2, CheckCircle, XCircle, Trash2, RotateCcw } from 'lucide-react';

interface QueueItem {
    id: string;
    content_id: string;
    queue_type: 'content' | 'people' | 'quality';
    priority: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    retry_count: number;
    max_retries: number;
    error_message: string | null;
    metadata: {
        title?: string;
        name?: string;
        tmdb_id?: number;
        missing_fields?: string[];
    };
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
}

export default function EnrichmentQueueTable() {
    const [contentQueue, setContentQueue] = useState<QueueItem[]>([]);
    const [peopleQueue, setPeopleQueue] = useState<QueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchQueue();
    }, []);

    async function fetchQueue() {
        setLoading(true);
        try {
            // Fetch content queue
            const contentRes = await fetch('/api/enrichment-queue?type=content&limit=50');
            const contentData = await contentRes.json();
            setContentQueue(contentData.data || []);

            // Fetch people queue
            const peopleRes = await fetch('/api/enrichment-queue?type=people&limit=50');
            const peopleData = await peopleRes.json();
            setPeopleQueue(peopleData.data || []);
        } catch (error) {
            console.error('Error fetching queue:', error);
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
                await fetchQueue();
            } else {
                alert(`❌ Failed to refresh queue:\n${data.error}`);
            }
        } catch (error) {
            console.error('Error refreshing queue:', error);
            alert('❌ Error refreshing queue');
        } finally {
            setRefreshing(false);
        }
    }

    if (loading) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="space-y-6">
            {/* Header with Refresh Button */}
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Enrichment Queue</h2>
                <button
                    onClick={handleRefreshQueue}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                    {refreshing ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Refreshing Queue...
                        </>
                    ) : (
                        <>
                            <RefreshCw className="w-4 h-4" />
                            Refresh Queue
                        </>
                    )}
                </button>
            </div>

            {/* Content Queue Section */}
            <QueueSection
                title="Content Enrichment Queue"
                items={contentQueue}
                emptyMessage="No content items in queue"
                onRefresh={fetchQueue}
            />

            {/* People Queue Section */}
            <QueueSection
                title="People Enrichment Queue"
                items={peopleQueue}
                emptyMessage="No people items in queue"
                onRefresh={fetchQueue}
            />
        </div>
    );
}

function QueueSection({ title, items, emptyMessage, onRefresh }: {
    title: string;
    items: QueueItem[];
    emptyMessage: string;
    onRefresh: () => void;
}) {
    const pendingCount = items.filter(i => i.status === 'pending').length;

    return (
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 bg-zinc-800/50 border-b border-zinc-700">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">{title}</h3>
                    <span className="text-sm text-zinc-400">
                        {pendingCount} pending / {items.length} total
                    </span>
                </div>
            </div>

            {items.length === 0 ? (
                <div className="p-12 text-center">
                    <p className="text-zinc-400">{emptyMessage}</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-zinc-800/30 border-b border-zinc-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                    Content
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                    Missing Fields
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                    Priority
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                    Created
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            {items.map((item) => (
                                <QueueRow key={item.id} item={item} onRefresh={onRefresh} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function QueueRow({ item, onRefresh }: { item: QueueItem; onRefresh: () => void }) {
    async function handleRemove() {
        if (!window.confirm('Remove this item from queue?')) return;
        // TODO: Implement remove API
        alert('Remove functionality coming soon!');
    }

    async function handleRetry() {
        if (!window.confirm('Retry enriching this item?')) return;
        // TODO: Implement retry API
        alert('Retry functionality coming soon!');
    }

    const title = item.metadata.title || item.metadata.name || 'Unknown';
    const missingFields = item.metadata.missing_fields || [];

    return (
        <tr className="hover:bg-zinc-800/50 transition-colors">
            <td className="px-6 py-4 whitespace-nowrap">
                <div>
                    <p className="text-sm font-medium text-white">{title}</p>
                    {item.metadata.tmdb_id && (
                        <p className="text-xs text-zinc-500 mt-0.5">
                            TMDB: {item.metadata.tmdb_id}
                        </p>
                    )}
                </div>
            </td>
            <td className="px-6 py-4">
                <div className="flex flex-wrap gap-1">
                    {missingFields.slice(0, 3).map((field, idx) => (
                        <span
                            key={idx}
                            className="inline-block px-2 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded text-xs"
                        >
                            {field}
                        </span>
                    ))}
                    {missingFields.length > 3 && (
                        <span className="inline-block px-2 py-0.5 bg-zinc-700 text-zinc-400 rounded text-xs">
                            +{missingFields.length - 3} more
                        </span>
                    )}
                </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <span className="text-sm text-white font-mono">{item.priority}</span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <StatusBadge status={item.status} retryCount={item.retry_count} />
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-400">
                {new Date(item.created_at).toLocaleDateString()}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-2">
                    {item.status === 'failed' && (
                        <button
                            onClick={handleRetry}
                            className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
                            title="Retry"
                        >
                            <RotateCcw className="w-4 h-4 text-yellow-400" />
                        </button>
                    )}
                    <button
                        onClick={handleRemove}
                        className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
                        title="Remove from queue"
                    >
                        <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                </div>
            </td>
        </tr>
    );
}

function StatusBadge({ status, retryCount }: { status: string; retryCount: number }) {
    const variants = {
        pending: {
            icon: <Clock className="w-3.5 h-3.5" />,
            className: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            label: 'Pending',
        },
        processing: {
            icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
            className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
            label: 'Processing',
        },
        completed: {
            icon: <CheckCircle className="w-3.5 h-3.5" />,
            className: 'bg-green-500/10 text-green-400 border-green-500/20',
            label: 'Completed',
        },
        failed: {
            icon: <XCircle className="w-3.5 h-3.5" />,
            className: 'bg-red-500/10 text-red-400 border-red-500/20',
            label: `Failed (${retryCount}x)`,
        },
    };

    const variant = variants[status as keyof typeof variants] || variants.pending;

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${variant.className}`}>
            {variant.icon}
            {variant.label}
        </span>
    );
}

function LoadingSkeleton() {
    return (
        <div className="space-y-6">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-3 animate-pulse">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 bg-zinc-800/50 rounded" />
                ))}
            </div>
        </div>
    );
}
