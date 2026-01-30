'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Calendar, AlertCircle, CheckCircle, Loader2, Filter } from 'lucide-react';

interface SyncLog {
    id: string;
    sync_type: 'cron' | 'manual' | 'bulk_import' | 'gap_fill';
    started_at: string;
    completed_at: string | null;
    status: 'running' | 'completed' | 'failed';
    summary: any;
    error_details: any;
}

export default function SyncHistory() {
    const [logs, setLogs] = useState<SyncLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    // Filters
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);

    useEffect(() => {
        fetchLogs();
    }, [typeFilter, statusFilter, page, pageSize]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: pageSize.toString(),
                ...(typeFilter !== 'all' && { sync_type: typeFilter }),
                ...(statusFilter !== 'all' && { status: statusFilter }),
            });

            const res = await fetch(`/api/sync/logs?${params}`);
            const data = await res.json();

            if (data.success) {
                setLogs(data.data || []);
                setTotalCount(data.total || 0);
            }
        } catch (error) {
            console.error('Error fetching sync logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getStatusBadge = (status: string) => {
        const badges = {
            completed: 'bg-green-500/20 text-green-400 border-green-500/30',
            failed: 'bg-red-500/20 text-red-400 border-red-500/30',
            running: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        };
        const icons = {
            completed: <CheckCircle className="w-3 h-3" />,
            failed: <AlertCircle className="w-3 h-3" />,
            running: <Loader2 className="w-3 h-3 animate-spin" />,
        };

        return (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium ${badges[status as keyof typeof badges]}`}>
                {icons[status as keyof typeof icons]}
                {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
        );
    };

    const getTypeBadge = (type: string) => {
        const labels = {
            cron: 'Auto',
            manual: 'Manual',
            bulk_import: 'Bulk',
            gap_fill: 'Gap Fill',
        };
        return (
            <span className="inline-flex items-center px-2 py-1 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-medium">
                {labels[type as keyof typeof labels] || type}
            </span>
        );
    };

    const totalPages = Math.ceil(totalCount / pageSize);

    if (loading && logs.length === 0) {
        return (
            <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-zinc-800 rounded w-1/4"></div>
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 bg-zinc-800 rounded"></div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
            {/* Header with Filters */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-400" />
                    Sync History
                </h2>

                <div className="flex items-center gap-3">
                    {/* Type Filter */}
                    <select
                        value={typeFilter}
                        onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                        className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="all">All Types</option>
                        <option value="cron">Auto</option>
                        <option value="manual">Manual</option>
                        <option value="bulk_import">Bulk Import</option>
                        <option value="gap_fill">Gap Fill</option>
                    </select>

                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                        className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="all">All Status</option>
                        <option value="completed">Completed</option>
                        <option value="failed">Failed</option>
                        <option value="running">Running</option>
                    </select>

                    {/* Page Size */}
                    <select
                        value={pageSize}
                        onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                        className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                    </select>
                </div>
            </div>

            {/* Logs List */}
            {logs.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No sync logs found</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {logs.map((log) => (
                        <div key={log.id} className="bg-zinc-800/50 rounded-lg border border-zinc-700/50 overflow-hidden">
                            {/* Main Row */}
                            <div
                                className="p-4 cursor-pointer hover:bg-zinc-800/80 transition-colors"
                                onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 flex-1">
                                        {/* Expand Icon */}
                                        <div className="text-zinc-400">
                                            {expandedRow === log.id ? (
                                                <ChevronDown className="w-4 h-4" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4" />
                                            )}
                                        </div>

                                        {/* Date & Time */}
                                        <div className="min-w-[160px]">
                                            <div className="text-white text-sm">{formatDate(log.started_at)}</div>
                                        </div>

                                        {/* Type */}
                                        <div className="min-w-[100px]">
                                            {getTypeBadge(log.sync_type)}
                                        </div>

                                        {/* Status */}
                                        <div className="min-w-[120px]">
                                            {getStatusBadge(log.status)}
                                        </div>

                                        {/* Summary */}
                                        <div className="flex-1 text-sm text-zinc-400">
                                            {log.summary?.action || 'Sync operation'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {expandedRow === log.id && (
                                <div className="px-4 pb-4 border-t border-zinc-700/50 pt-4 bg-zinc-900/30">
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="text-zinc-500">Started:</span>
                                            <span className="text-zinc-300 ml-2">{formatDate(log.started_at)}</span>
                                        </div>
                                        {log.completed_at && (
                                            <div>
                                                <span className="text-zinc-500">Completed:</span>
                                                <span className="text-zinc-300 ml-2">{formatDate(log.completed_at)}</span>
                                            </div>
                                        )}
                                        {log.summary && (
                                            <div className="col-span-2">
                                                <span className="text-zinc-500">Summary:</span>
                                                <pre className="text-zinc-300 mt-2 bg-zinc-900 p-3 rounded text-xs overflow-x-auto">
                                                    {JSON.stringify(log.summary, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                        {log.error_details && (
                                            <div className="col-span-2">
                                                <span className="text-red-400">Error Details:</span>
                                                <pre className="text-red-300 mt-2 bg-red-900/20 border border-red-500/30 p-3 rounded text-xs overflow-x-auto">
                                                    {JSON.stringify(log.error_details, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-6 border-t border-zinc-800">
                    <div className="text-sm text-zinc-400">
                        Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, totalCount)} of {totalCount}
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            Previous
                        </button>

                        <div className="flex items-center gap-1">
                            {[...Array(Math.min(5, totalPages))].map((_, i) => {
                                const pageNum = i + 1;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => setPage(pageNum)}
                                        className={`px-3 py-1 rounded text-sm ${page === pageNum
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                            }`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-3 py-1 bg-zinc-800 text-zinc-300 rounded border border-zinc-700 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
