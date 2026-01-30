'use client';

import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, AlertCircle, Clock } from 'lucide-react';
import { getLatestReport, QualityReport, calculateReportSummary } from '@/lib/api/quality-reports';

export default function QualityDashboard() {
    const [report, setReport] = useState<QualityReport | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLatestReport();
    }, []);

    async function fetchLatestReport() {
        setLoading(true);
        const data = await getLatestReport('content');
        setReport(data);
        setLoading(false);
    }

    if (loading) {
        return <LoadingSkeleton />;
    }

    if (!report) {
        return <EmptyState onRefresh={fetchLatestReport} />;
    }

    const summary = calculateReportSummary(report);

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total Checked"
                    value={report.total_checked.toLocaleString()}
                    icon={<BarChart3 className="w-5 h-5" />}
                    color="blue"
                />
                <StatCard
                    label="Complete"
                    value={`${summary.completion_percentage}%`}
                    icon={<TrendingUp className="w-5 h-5" />}
                    color="green"
                />
                <StatCard
                    label="Issues Found"
                    value={report.total_issues.toLocaleString()}
                    icon={<AlertCircle className="w-5 h-5" />}
                    color="yellow"
                />
                <StatCard
                    label="Last Run"
                    value={new Date(report.created_at).toLocaleDateString()}
                    icon={<Clock className="w-5 h-5" />}
                    color="purple"
                />
            </div>

            {/* Issues by Field */}
            <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Issues by Field</h3>
                <div className="space-y-3">
                    {summary.top_missing_fields.map(({ field, count }) => (
                        <FieldIssueBar
                            key={field}
                            field={field}
                            count={count}
                            total={report.total_checked}
                        />
                    ))}
                </div>
            </div>

            {/* Priority List */}
            <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Top 20 Priority Items</h3>
                    <span className="text-sm text-zinc-400">Sorted by popularity</span>
                </div>
                <div className="space-y-2">
                    {report.priority_items.slice(0, 20).map((item, idx) => (
                        <PriorityItem
                            key={item.id}
                            rank={idx + 1}
                            name={item.name}
                            tmdbId={item.tmdb_id}
                            missing={item.missing}
                            popularity={item.popularity}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon, color }: {
    label: string;
    value: string;
    icon: React.ReactNode;
    color: 'blue' | 'green' | 'yellow' | 'purple';
}) {
    const colors = {
        blue: 'text-blue-400 bg-blue-500/10',
        green: 'text-green-400 bg-green-500/10',
        yellow: 'text-yellow-400 bg-yellow-500/10',
        purple: 'text-purple-400 bg-purple-500/10',
    };

    return (
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-zinc-400 mb-1">{label}</p>
                    <p className="text-2xl font-bold text-white">{value}</p>
                </div>
                <div className={`p-3 rounded-lg ${colors[color]}`}>
                    {icon}
                </div>
            </div>
        </div>
    );
}

function FieldIssueBar({ field, count, total }: {
    field: string;
    count: number;
    total: number;
}) {
    const percentage = Math.round((count / total) * 100);

    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-zinc-300">{field}</span>
                <span className="text-sm text-zinc-400">{count} ({percentage}%)</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}

function PriorityItem({ rank, name, tmdbId, missing, popularity }: {
    rank: number;
    name: string;
    tmdbId: number;
    missing: string[];
    popularity: number;
}) {
    return (
        <div className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors">
            <span className="text-xs font-mono text-zinc-500 w-6">{rank}</span>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{name}</p>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-zinc-500">TMDB: {tmdbId}</span>
                    <span className="text-xs text-zinc-500">•</span>
                    <span className="text-xs text-zinc-500">Popularity: {(popularity || 0).toFixed(1)}</span>
                </div>
            </div>
            <div className="flex flex-wrap gap-1 justify-end">
                {missing.slice(0, 3).map((field) => (
                    <span
                        key={field}
                        className="px-2 py-0.5 text-xs bg-yellow-500/10 text-yellow-400 rounded"
                    >
                        {field}
                    </span>
                ))}
                {missing.length > 3 && (
                    <span className="px-2 py-0.5 text-xs bg-zinc-700 text-zinc-400 rounded">
                        +{missing.length - 3}
                    </span>
                )}
            </div>
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 h-24" />
                ))}
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 h-64" />
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 h-96" />
        </div>
    );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
    return (
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-12 text-center">
            <AlertCircle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Quality Report Found</h3>
            <p className="text-zinc-400 mb-6">
                Run the GitHub Actions workflow to generate a quality report.
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
