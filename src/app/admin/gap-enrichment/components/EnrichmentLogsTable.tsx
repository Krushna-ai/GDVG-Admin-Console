'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Calendar, TrendingUp, XCircle, Database } from 'lucide-react';
import { getEnrichmentLogs, EnrichmentLog, extractEnrichmentSummary } from '@/lib/api/enrichment-logs';

export default function EnrichmentLogsTable() {
    const [logs, setLogs] = useState<EnrichmentLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchLogs();
    }, []);

    async function fetchLogs() {
        setLoading(true);
        const data = await getEnrichmentLogs(20);
        setLogs(data);
        setLoading(false);
    }

    function toggleRow(id: string) {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedRows(newExpanded);
    }

    if (loading) {
        return <LoadingSkeleton />;
    }

    if (logs.length === 0) {
        return <EmptyState onRefresh={fetchLogs} />;
    }

    return (
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-zinc-800/50 border-b border-zinc-700">
                        <tr>
                            <th className="w-8"></th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                Run Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                Batch Size
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                Succeeded
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                Failed
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                Last ID
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                        {logs.map((log) => (
                            <LogRow
                                key={log.id}
                                log={log}
                                isExpanded={expandedRows.has(log.id)}
                                onToggle={() => toggleRow(log.id)}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function LogRow({ log, isExpanded, onToggle }: {
    log: EnrichmentLog;
    isExpanded: boolean;
    onToggle: () => void;
}) {
    const summary = extractEnrichmentSummary(log);

    return (
        <>
            <tr className="hover:bg-zinc-800/50 transition-colors">
                <td className="px-4 py-4">
                    <button
                        onClick={onToggle}
                        className="text-zinc-400 hover:text-white transition-colors"
                    >
                        {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                        ) : (
                            <ChevronRight className="w-4 h-4" />
                        )}
                    </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-zinc-500" />
                        <div>
                            <p className="text-sm text-white">
                                {new Date(log.started_at).toLocaleDateString()}
                            </p>
                            <p className="text-xs text-zinc-500">
                                {new Date(log.started_at).toLocaleTimeString()}
                            </p>
                        </div>
                    </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-white font-medium">
                            {summary.total_processed}
                        </span>
                    </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-green-400 font-medium">
                            {summary.succeeded}
                        </span>
                    </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-400" />
                        <span className="text-sm text-red-400 font-medium">
                            {summary.failed}
                        </span>
                    </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={log.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-zinc-400 font-mono">
                        {summary.last_processed_id || '-'}
                    </span>
                </td>
            </tr>

            {isExpanded && (
                <tr>
                    <td></td>
                    <td colSpan={6} className="px-6 py-4 bg-zinc-800/30">
                        <ExpandedDetails log={log} />
                    </td>
                </tr>
            )}
        </>
    );
}

function StatusBadge({ status }: { status: EnrichmentLog['status'] }) {
    const variants = {
        running: {
            className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
            label: 'Running',
        },
        completed: {
            className: 'bg-green-500/10 text-green-400 border-green-500/20',
            label: 'Completed',
        },
        failed: {
            className: 'bg-red-500/10 text-red-400 border-red-500/20',
            label: 'Failed',
        },
        cancelled: {
            className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
            label: 'Cancelled',
        },
    };

    const variant = variants[status];

    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${variant.className}`}>
            {variant.label}
        </span>
    );
}

function ExpandedDetails({ log }: { log: EnrichmentLog }) {
    return (
        <div className="space-y-4">
            {/* Metadata */}
            {log.metadata && Object.keys(log.metadata).length > 0 && (
                <div>
                    <h4 className="text-sm font-medium text-white mb-2">Metadata</h4>
                    <div className="bg-zinc-900/50 rounded-lg p-4 space-y-2">
                        {Object.entries(log.metadata).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between">
                                <span className="text-sm text-zinc-400">{key}</span>
                                <span className="text-sm text-white font-mono">
                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Summary */}
            {log.summary && Object.keys(log.summary).length > 0 && (
                <div>
                    <h4 className="text-sm font-medium text-white mb-2">Summary</h4>
                    <div className="bg-zinc-900/50 rounded-lg p-4 space-y-2">
                        {Object.entries(log.summary).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between">
                                <span className="text-sm text-zinc-400">{key}</span>
                                <span className="text-sm text-white font-mono">
                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Error Details */}
            {log.error_details && log.error_details.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium text-red-400 mb-2">Errors</h4>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 space-y-1">
                        {log.error_details.map((error, idx) => (
                            <p key={idx} className="text-sm text-red-400 font-mono">{error}</p>
                        ))}
                    </div>
                </div>
            )}

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <p className="text-zinc-400 mb-1">Started</p>
                    <p className="text-white">{new Date(log.started_at).toLocaleString()}</p>
                </div>
                {log.completed_at && (
                    <div>
                        <p className="text-zinc-400 mb-1">Completed</p>
                        <p className="text-white">{new Date(log.completed_at).toLocaleString()}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-zinc-800/50 rounded" />
            ))}
        </div>
    );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
    return (
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-12 text-center">
            <Database className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Enrichment Logs</h3>
            <p className="text-zinc-400 mb-6">
                Enrichment logs will appear here after running the enrichment workflow.
            </p>
            <button
                onClick={onRefresh}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
                Refresh
            </button>
        </div>
    );
}
