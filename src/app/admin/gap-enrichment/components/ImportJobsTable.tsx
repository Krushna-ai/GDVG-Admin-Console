'use client';

import { useEffect, useState } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, Loader2, Play } from 'lucide-react';
import { getImportJobs, ImportJob } from '@/lib/api/import-jobs';

const POLL_INTERVAL = 10000; // 10 seconds

export default function ImportJobsTable() {
    const [jobs, setJobs] = useState<ImportJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null);

    useEffect(() => {
        fetchJobs();

        // Poll for active jobs
        const interval = setInterval(() => {
            const hasActiveJobs = jobs.some(j => j.status === 'pending' || j.status === 'running');
            if (hasActiveJobs) {
                fetchJobs();
            }
        }, POLL_INTERVAL);

        return () => clearInterval(interval);
    }, [jobs]);

    async function fetchJobs() {
        const data = await getImportJobs();
        setJobs(data);
        setLoading(false);
    }

    if (loading) {
        return <LoadingSkeleton />;
    }

    if (jobs.length === 0) {
        return <EmptyState />;
    }

    return (
        <>
            <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-zinc-800/50 border-b border-zinc-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                    Name
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                    Progress
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                    Created
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                    Completed
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            {jobs.map((job) => (
                                <JobRow
                                    key={job.id}
                                    job={job}
                                    onClick={() => setSelectedJob(job)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedJob && (
                <JobDetailsModal
                    job={selectedJob}
                    onClose={() => setSelectedJob(null)}
                />
            )}
        </>
    );
}

function JobRow({ job, onClick }: { job: ImportJob; onClick: () => void }) {
    return (
        <tr
            onClick={onClick}
            className="hover:bg-zinc-800/50 cursor-pointer transition-colors"
        >
            <td className="px-6 py-4 whitespace-nowrap">
                <div>
                    <p className="text-sm font-medium text-white">{job.name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        {job.configuration.content_type} • {job.configuration.origin_countries.join(', ')}
                    </p>
                </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <StatusBadge status={job.status} />
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <ProgressBar progress={job.progress} />
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-400">
                {new Date(job.created_at).toLocaleString()}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-400">
                {job.completed_at ? new Date(job.completed_at).toLocaleString() : '-'}
            </td>
        </tr>
    );
}

function StatusBadge({ status }: { status: ImportJob['status'] }) {
    const variants = {
        pending: {
            icon: <Clock className="w-3.5 h-3.5" />,
            className: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            label: 'Pending',
        },
        running: {
            icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
            className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
            label: 'Running',
        },
        completed: {
            icon: <CheckCircle className="w-3.5 h-3.5" />,
            className: 'bg-green-500/10 text-green-400 border-green-500/20',
            label: 'Completed',
        },
        failed: {
            icon: <XCircle className="w-3.5 h-3.5" />,
            className: 'bg-red-500/10 text-red-400 border-red-500/20',
            label: 'Failed',
        },
        paused: {
            icon: <AlertCircle className="w-3.5 h-3.5" />,
            className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
            label: 'Paused',
        },
        cancelled: {
            icon: <XCircle className="w-3.5 h-3.5" />,
            className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
            label: 'Cancelled',
        },
    };

    const variant = variants[status];

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${variant.className}`}>
            {variant.icon}
            {variant.label}
        </span>
    );
}

function ProgressBar({ progress }: { progress: ImportJob['progress'] }) {
    const percentage = progress.percentage || 0;

    return (
        <div className="w-full max-w-xs">
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-zinc-400">
                    {progress.processed} / {progress.total}
                </span>
                <span className="text-xs text-zinc-400">{percentage}%</span>
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

function JobDetailsModal({ job, onClose }: { job: ImportJob; onClose: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 border-b border-zinc-800">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-white">{job.name}</h2>
                        <button
                            onClick={onClose}
                            className="text-zinc-400 hover:text-white transition-colors"
                        >
                            <XCircle className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    <div>
                        <h3 className="text-sm font-medium text-zinc-400 mb-2">Status</h3>
                        <StatusBadge status={job.status} />
                    </div>

                    <div>
                        <h3 className="text-sm font-medium text-zinc-400 mb-2">Progress</h3>
                        <ProgressBar progress={job.progress} />
                    </div>

                    <div>
                        <h3 className="text-sm font-medium text-zinc-400 mb-2">Configuration</h3>
                        <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
                            <ConfigItem label="Content Type" value={job.configuration.content_type} />
                            <ConfigItem label="Countries" value={job.configuration.origin_countries.join(', ')} />
                            <ConfigItem label="Max Items" value={job.configuration.max_items?.toString() || 'Unlimited'} />
                            {job.configuration.min_popularity && (
                                <ConfigItem label="Min Popularity" value={job.configuration.min_popularity.toString()} />
                            )}
                        </div>
                    </div>

                    {job.error_log && job.error_log.length > 0 && (
                        <div>
                            <h3 className="text-sm font-medium text-red-400 mb-2">Errors</h3>
                            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 space-y-1">
                                {job.error_log.map((error, idx) => (
                                    <p key={idx} className="text-sm text-red-400">{error}</p>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-zinc-400 mb-1">Created</p>
                            <p className="text-white">{new Date(job.created_at).toLocaleString()}</p>
                        </div>
                        {job.completed_at && (
                            <div>
                                <p className="text-zinc-400 mb-1">Completed</p>
                                <p className="text-white">{new Date(job.completed_at).toLocaleString()}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">{label}</span>
            <span className="text-sm text-white font-medium">{value}</span>
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

function EmptyState() {
    return (
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-12 text-center">
            <Play className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Import Jobs</h3>
            <p className="text-zinc-400">
                Create an import job from the Bulk Import Center to get started.
            </p>
        </div>
    );
}
