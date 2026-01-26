'use client';

import { useState, useEffect } from 'react';

interface QueueStats {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    skipped: number;
}

interface QueueItem {
    id: string;
    tmdb_id: number;
    content_type: string;
    status: string;
    priority: number;
    attempts: number;
    error_message?: string;
    batch_name?: string;
    source?: string;
    created_at: string;
    processed_at?: string;
}

export default function QueueStatusPage() {
    const [stats, setStats] = useState<QueueStats | null>(null);
    const [items, setItems] = useState<QueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [filter, setFilter] = useState<string>('all');
    const [lastAction, setLastAction] = useState<string | null>(null);

    // Fetch stats and items
    const fetchData = async () => {
        try {
            // Fetch stats
            const statsRes = await fetch('/api/queue/process');
            const statsData = await statsRes.json();
            setStats(statsData);

            // Fetch items
            const itemsRes = await fetch('/api/queue');
            const itemsData = await itemsRes.json();
            setItems(itemsData.items || []);
        } catch (error) {
            console.error('Failed to fetch queue data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // Auto-refresh every 5 seconds
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    // Process batch
    const handleProcess = async (batchSize: number = 10) => {
        setProcessing(true);
        setLastAction(null);
        try {
            const res = await fetch('/api/queue/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batchSize }),
            });
            const data = await res.json();
            setLastAction(`Processed ${data.processed}: ${data.succeeded} succeeded, ${data.failed} failed, ${data.skipped} skipped`);
            await fetchData();
        } catch (error) {
            setLastAction('Processing failed');
        } finally {
            setProcessing(false);
        }
    };

    // Process all pending items
    const handleProcessAll = async () => {
        setProcessing(true);
        setLastAction('Processing all pending items...');
        try {
            const res = await fetch('/api/queue/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ processAll: true }),
            });
            const data = await res.json();
            setLastAction(`Completed! Processed ${data.processed}: ${data.succeeded} succeeded, ${data.failed} failed, ${data.skipped} skipped`);
            await fetchData();
        } catch (error) {
            setLastAction('Processing failed');
        } finally {
            setProcessing(false);
        }
    };

    // Clear processed
    const handleClear = async () => {
        try {
            const res = await fetch('/api/queue/process', { method: 'DELETE' });
            const data = await res.json();
            setLastAction(`Cleared ${data.cleared} items`);
            await fetchData();
        } catch (error) {
            setLastAction('Clear failed');
        }
    };

    // Retry failed
    const handleRetry = async () => {
        try {
            const res = await fetch('/api/queue/process', { method: 'PUT' });
            const data = await res.json();
            setLastAction(`Reset ${data.retried} failed items`);
            await fetchData();
        } catch (error) {
            setLastAction('Retry failed');
        }
    };

    // Filter items
    const filteredItems = filter === 'all'
        ? items
        : items.filter(i => i.status === filter);

    const statusColors: Record<string, string> = {
        pending: 'bg-amber-600',
        processing: 'bg-blue-600',
        completed: 'bg-green-600',
        failed: 'bg-red-600',
        skipped: 'bg-slate-600',
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 -m-8 p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">📋 Queue Status</h1>
                <p className="text-slate-400">Monitor and process import queue</p>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                        <div className="text-2xl font-bold text-white">{stats.total}</div>
                        <div className="text-slate-400 text-sm">Total</div>
                    </div>
                    <div className="bg-amber-900/30 rounded-xl p-4 border border-amber-700/50">
                        <div className="text-2xl font-bold text-amber-400">{stats.pending}</div>
                        <div className="text-amber-400/70 text-sm">Pending</div>
                    </div>
                    <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-700/50">
                        <div className="text-2xl font-bold text-blue-400">{stats.processing}</div>
                        <div className="text-blue-400/70 text-sm">Processing</div>
                    </div>
                    <div className="bg-green-900/30 rounded-xl p-4 border border-green-700/50">
                        <div className="text-2xl font-bold text-green-400">{stats.completed}</div>
                        <div className="text-green-400/70 text-sm">Completed</div>
                    </div>
                    <div className="bg-red-900/30 rounded-xl p-4 border border-red-700/50">
                        <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
                        <div className="text-red-400/70 text-sm">Failed</div>
                    </div>
                    <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600/50">
                        <div className="text-2xl font-bold text-slate-400">{stats.skipped}</div>
                        <div className="text-slate-500 text-sm">Skipped</div>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 mb-6 border border-slate-700/50">
                <div className="flex flex-wrap gap-3 items-center">
                    <span className="text-slate-400 text-sm">Process Queue:</span>
                    <button
                        onClick={() => handleProcess(10)}
                        disabled={processing || !stats?.pending}
                        className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-medium rounded-lg transition-all disabled:opacity-50"
                    >
                        {processing ? '⏳ Processing...' : '▶️ Process 10'}
                    </button>
                    <button
                        onClick={() => handleProcess(50)}
                        disabled={processing || !stats?.pending}
                        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-lg transition-all disabled:opacity-50"
                    >
                        ▶️ Process 50
                    </button>
                    <button
                        onClick={() => handleProcess(100)}
                        disabled={processing || !stats?.pending}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-medium rounded-lg transition-all disabled:opacity-50"
                    >
                        ▶️ Process 100
                    </button>
                    <button
                        onClick={handleProcessAll}
                        disabled={processing || !stats?.pending}
                        className="px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-medium rounded-lg transition-all disabled:opacity-50"
                    >
                        🚀 Process All
                    </button>

                    <div className="flex-1" />

                    <button
                        onClick={handleRetry}
                        disabled={!stats?.failed}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg transition-all disabled:opacity-50"
                    >
                        🔄 Retry Failed
                    </button>
                    <button
                        onClick={handleClear}
                        disabled={!stats?.completed && !stats?.failed && !stats?.skipped}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-all disabled:opacity-50"
                    >
                        🗑️ Clear Done
                    </button>
                </div>

                {lastAction && (
                    <div className="mt-3 text-sm text-green-400">
                        ✓ {lastAction}
                    </div>
                )}
            </div>

            {/* Filter */}
            <div className="flex gap-2 mb-4">
                {['all', 'pending', 'processing', 'completed', 'failed', 'skipped'].map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${filter === f
                            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Queue Table */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                </div>
            ) : (
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
                    {filteredItems.length > 0 ? (
                        <table className="w-full">
                            <thead className="bg-slate-900/50">
                                <tr>
                                    <th className="text-left text-slate-400 text-sm font-medium px-4 py-3">TMDB ID</th>
                                    <th className="text-left text-slate-400 text-sm font-medium px-4 py-3">Type</th>
                                    <th className="text-left text-slate-400 text-sm font-medium px-4 py-3">Status</th>
                                    <th className="text-left text-slate-400 text-sm font-medium px-4 py-3">Priority</th>
                                    <th className="text-left text-slate-400 text-sm font-medium px-4 py-3">Attempts</th>
                                    <th className="text-left text-slate-400 text-sm font-medium px-4 py-3">Source</th>
                                    <th className="text-left text-slate-400 text-sm font-medium px-4 py-3">Error</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {filteredItems.slice(0, 100).map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-700/30">
                                        <td className="px-4 py-3 text-white font-mono text-sm">{item.tmdb_id}</td>
                                        <td className="px-4 py-3">
                                            <span className="bg-purple-600/30 text-purple-300 text-xs px-2 py-0.5 rounded uppercase">
                                                {item.content_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`${statusColors[item.status]} text-white text-xs px-2 py-0.5 rounded capitalize`}>
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-300 text-sm">{item.priority}</td>
                                        <td className="px-4 py-3 text-slate-300 text-sm">{item.attempts}</td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">{item.source || 'manual'}</td>
                                        <td className="px-4 py-3 text-red-400 text-xs max-w-xs truncate">
                                            {item.error_message || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-20 text-slate-400">
                            <p className="text-6xl mb-4">✨</p>
                            <p className="text-xl">Queue is empty</p>
                            <a href="/admin/bulk-import" className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block">
                                Go to Bulk Import →
                            </a>
                        </div>
                    )}
                </div>
            )}

            {filteredItems.length > 100 && (
                <p className="text-slate-500 text-sm mt-4 text-center">
                    Showing first 100 of {filteredItems.length} items
                </p>
            )}
        </div>
    );
}
