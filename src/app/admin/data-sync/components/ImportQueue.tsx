'use client';

import { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, Pause, Play, X, AlertCircle } from 'lucide-react';

interface ImportJob {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused' | 'cancelled';
    config: any;
    progress: number;
    total_items: number;
    processed_items: number;
    created_at: string;
    started_at?: string;
    completed_at?: string;
    error?: string;
}

export default function ImportQueue() {
    const [jobs, setJobs] = useState<ImportJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCompleted, setShowCompleted] = useState(false);

    const fetchJobs = async () => {
        try {
            const response = await fetch('/api/import/jobs');
            if (response.ok) {
                const data = await response.json();
                setJobs(data.jobs || []);
            }
        } catch (error) {
            console.error('Failed to fetch jobs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchJobs();
        // Auto-refresh removed - use manual refresh button instead to avoid overwhelming backend
    }, []);

    const handlePause = async (jobId: string) => {
        try {
            await fetch(`/api/import/jobs/${jobId}/pause`, { method: 'POST' });
            fetchJobs();
        } catch (error) {
            console.error('Failed to pause job:', error);
        }
    };

    const handleResume = async (jobId: string) => {
        try {
            await fetch(`/api/import/jobs/${jobId}/resume`, { method: 'POST' });
            fetchJobs();
        } catch (error) {
            console.error('Failed to resume job:', error);
        }
    };

    const handleCancel = async (jobId: string) => {
        if (!confirm('Are you sure you want to cancel this job?')) return;

        try {
            await fetch(`/api/import/jobs/${jobId}/cancel`, { method: 'POST' });
            fetchJobs();
        } catch (error) {
            console.error('Failed to cancel job:', error);
        }
    };

    const getStatusBadge = (status: ImportJob['status']) => {
        const badges = {
            pending: { bg: 'bg-blue-900/20 border-blue-500/30', text: 'text-blue-400', icon: Clock },
            processing: { bg: 'bg-purple-900/20 border-purple-500/30', text: 'text-purple-400', icon: Play },
            completed: { bg: 'bg-green-900/20 border-green-500/30', text: 'text-green-400', icon: CheckCircle },
            failed: { bg: 'bg-red-900/20 border-red-500/30', text: 'text-red-400', icon: XCircle },
            paused: { bg: 'bg-yellow-900/20 border-yellow-500/30', text: 'text-yellow-400', icon: Pause },
            cancelled: { bg: 'bg-zinc-900/20 border-zinc-500/30', text: 'text-zinc-400', icon: X },
        };

        const badge = badges[status];
        const Icon = badge.icon;

        return (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${badge.bg} ${badge.text}`}>
                <Icon className="w-3.5 h-3.5" />
                {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
        );
    };

    const runningJobs = jobs.filter(j => j.status === 'processing');
    const pendingJobs = jobs.filter(j => j.status === 'pending');
    const pausedJobs = jobs.filter(j => j.status === 'paused');
    const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled');

    if (loading) {
        return (
            <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
                <div className="text-center py-12 text-zinc-500">
                    <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                    <p className="text-sm">Loading import queue...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Import Queue</h2>
                <button
                    onClick={() => fetchJobs()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                </button>
            </div>

            {/* Running Jobs */}
            {runningJobs.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                        Running ({runningJobs.length})
                    </h3>
                    <div className="space-y-3">
                        {runningJobs.map(job => (
                            <JobCard key={job.id} job={job} onPause={handlePause} onCancel={handleCancel} />
                        ))}
                    </div>
                </div>
            )}

            {/* Pending Jobs */}
            {pendingJobs.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-3">Pending ({pendingJobs.length})</h3>
                    <div className="space-y-3">
                        {pendingJobs.map(job => (
                            <JobCard key={job.id} job={job} onCancel={handleCancel} />
                        ))}
                    </div>
                </div>
            )}

            {/* Paused Jobs */}
            {pausedJobs.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-3">Paused ({pausedJobs.length})</h3>
                    <div className="space-y-3">
                        {pausedJobs.map(job => (
                            <JobCard key={job.id} job={job} onResume={handleResume} onCancel={handleCancel} />
                        ))}
                    </div>
                </div>
            )}

            {/* Completed/Failed Jobs (Collapsible) */}
            {completedJobs.length > 0 && (
                <div>
                    <button
                        onClick={() => setShowCompleted(!showCompleted)}
                        className="text-lg font-semibold text-white mb-3 flex items-center gap-2 hover:text-zinc-300 transition-colors"
                    >
                        <span className={`transform transition-transform ${showCompleted ? 'rotate-90' : ''}`}>▶</span>
                        Completed ({completedJobs.length})
                    </button>
                    {showCompleted && (
                        <div className="space-y-3">
                            {completedJobs.map(job => (
                                <JobCard key={job.id} job={job} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {jobs.length === 0 && (
                <div className="text-center py-12 text-zinc-500">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No import jobs found</p>
                </div>
            )}
        </div>
    );
}

function JobCard({
    job,
    onPause,
    onResume,
    onCancel
}: {
    job: ImportJob;
    onPause?: (id: string) => void;
    onResume?: (id: string) => void;
    onCancel?: (id: string) => void;
}) {
    const config = job.config || {};
    const contentType = config.content_type === 'both' ? 'Movies & TV' : config.content_type === 'movie' ? 'Movies' : 'TV Series';
    const countries = config.origin_countries?.join(', ') || 'All';

    // Status badge inline
    const getStatusBadge = () => {
        const badges = {
            pending: { bg: 'bg-blue-900/20 border-blue-500/30', text: 'text-blue-400', icon: Clock },
            processing: { bg: 'bg-purple-900/20 border-purple-500/30', text: 'text-purple-400', icon: Play },
            completed: { bg: 'bg-green-900/20 border-green-500/30', text: 'text-green-400', icon: CheckCircle },
            failed: { bg: 'bg-red-900/20 border-red-500/30', text: 'text-red-400', icon: XCircle },
            paused: { bg: 'bg-yellow-900/20 border-yellow-500/30', text: 'text-yellow-400', icon: Pause },
            cancelled: { bg: 'bg-zinc-900/20 border-zinc-500/30', text: 'text-zinc-400', icon: X },
        };

        const badge = badges[job.status];
        const Icon = badge.icon;

        return (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${badge.bg} ${badge.text}`}>
                <Icon className="w-3.5 h-3.5" />
                {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
            </span>
        );
    };

    return (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <h4 className="text-white font-medium">
                            Import Job #{job.id.slice(0, 8)}
                        </h4>
                        {getStatusBadge()}
                    </div>
                    <p className="text-sm text-zinc-400">
                        {contentType} • {countries}
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                    {job.status === 'processing' && onPause && (
                        <button
                            onClick={() => onPause(job.id)}
                            className="p-2 bg-yellow-900/20 hover:bg-yellow-900/30 border border-yellow-500/30 text-yellow-400 rounded transition-colors"
                            title="Pause"
                        >
                            <Pause className="w-4 h-4" />
                        </button>
                    )}
                    {job.status === 'paused' && onResume && (
                        <button
                            onClick={() => onResume(job.id)}
                            className="p-2 bg-purple-900/20 hover:bg-purple-900/30 border border-purple-500/30 text-purple-400 rounded transition-colors"
                            title="Resume"
                        >
                            <Play className="w-4 h-4" />
                        </button>
                    )}
                    {(job.status === 'pending' || job.status === 'paused' || job.status === 'processing') && onCancel && (
                        <button
                            onClick={() => onCancel(job.id)}
                            className="p-2 bg-red-900/20 hover:bg-red-900/30 border border-red-500/30 text-red-400 rounded transition-colors"
                            title="Cancel"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Progress Bar */}
            {(job.status === 'processing' || job.status === 'paused') && (
                <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                        <span>Progress: {job.progress}%</span>
                        <span>{job.processed_items || 0} / {job.total_items || 0} items</span>
                    </div>
                    <div className="w-full bg-zinc-700 rounded-full h-2 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${job.status === 'processing'
                                ? 'bg-gradient-to-r from-purple-500 to-blue-500'
                                : 'bg-yellow-500'
                                }`}
                            style={{ width: `${job.progress}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {/* Stats */}
            {job.status === 'completed' && (
                <div className="text-sm text-green-400">
                    ✓ Completed: {job.total_items} items imported
                </div>
            )}

            {job.status === 'failed' && job.error && (
                <div className="text-sm text-red-400">
                    ✗ Failed: {job.error}
                </div>
            )}

            {/* Timestamps */}
            <div className="text-xs text-zinc-500 mt-2">
                Created: {new Date(job.created_at).toLocaleString()}
            </div>
        </div>
    );
}
