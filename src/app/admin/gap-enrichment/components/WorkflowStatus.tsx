'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, GitBranch, Clock, Zap, Play, Pause } from 'lucide-react';
import { getLatestEnrichmentRun, EnrichmentLog } from '@/lib/api/enrichment-logs';

const GITHUB_ACTIONS_URL = 'https://github.com/Krushna-ai/GDVG-Admin-Console/actions';

interface SyncStatus {
    is_paused: boolean;
    paused_at: string | null;
}

export default function WorkflowStatus() {
    const [lastRun, setLastRun] = useState<EnrichmentLog | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        fetchLastRun();
        fetchPauseStatus();
    }, []);

    async function fetchLastRun() {
        setLoading(true);
        const data = await getLatestEnrichmentRun();
        setLastRun(data);
        setLoading(false);
    }

    async function fetchPauseStatus() {
        try {
            const res = await fetch('/api/sync/status');
            const data = await res.json();
            setIsPaused(data.is_paused || false);
        } catch (error) {
            console.error('Error fetching pause status:', error);
        }
    }

    async function handlePause() {
        setActionLoading(true);
        try {
            const res = await fetch('/api/enrichment/pause', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setIsPaused(true);
            } else {
                alert(`❌ Failed to pause: ${data.error}`);
            }
        } catch (error) {
            console.error('Error pausing enrichment:', error);
            alert('❌ Error pausing enrichment');
        } finally {
            setActionLoading(false);
        }
    }

    async function handleResume() {
        setActionLoading(true);
        try {
            const res = await fetch('/api/enrichment/resume', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setIsPaused(false);
            } else {
                alert(`❌ Failed to resume: ${data.error}`);
            }
        } catch (error) {
            console.error('Error resuming enrichment:', error);
            alert('❌ Error resuming enrichment');
        } finally {
            setActionLoading(false);
        }
    }

    async function handleRunWorkflow(workflow: string, name: string) {
        const confirmed = window.confirm(
            `🚀 Run ${name} Now?\n\n` +
            `This will trigger the workflow immediately.\n\n` +
            'Continue?'
        );

        if (!confirmed) return;

        setActionLoading(true);
        try {
            const res = await fetch('/api/workflows/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workflow }),
            });
            const data = await res.json();

            if (data.success) {
                alert(`✅ ${name} triggered successfully!\n\nCheck GitHub Actions for progress.`);
                await fetchLastRun(); // Refresh to show new run
            } else {
                alert(`❌ Failed to trigger workflow:\n${data.error}`);
            }
        } catch (error) {
            console.error('Error triggering workflow:', error);
            alert('❌ Error triggering workflow');
        } finally {
            setActionLoading(false);
        }
    }

    if (loading) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 backdrop-blur-sm border border-purple-500/20 rounded-xl p-6">
            <div className="flex items-center justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-5 h-5 text-purple-400" />
                        <h3 className="text-lg font-semibold text-white">GitHub Actions Workflows</h3>
                        {isPaused && (
                            <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded-md border border-yellow-500/30">
                                ⏸️ Paused
                            </span>
                        )}
                    </div>

                    <p className="text-sm text-zinc-300 mb-4">
                        Heavy processing tasks (enrichment, gap detection, imports) run via GitHub Actions
                    </p>

                    {lastRun && (
                        <div className="flex items-center gap-6 text-sm">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-zinc-400" />
                                <span className="text-zinc-400">Last Run:</span>
                                <span className="text-white font-medium">
                                    {new Date(lastRun.started_at).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <GitBranch className="w-4 h-4 text-zinc-400" />
                                <span className="text-zinc-400">Status:</span>
                                <span className={`font-medium ${lastRun.status === 'completed' ? 'text-green-400' :
                                    lastRun.status === 'failed' ? 'text-red-400' :
                                        'text-yellow-400'
                                    }`}>
                                    {lastRun.status}
                                </span>
                            </div>
                        </div>
                    )}
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

                    <a
                        href={GITHUB_ACTIONS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                    >
                        <span>View Workflows</span>
                        <ExternalLink className="w-4 h-4" />
                    </a>
                </div>
            </div>

            {/* Workflow Cards with Run Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-purple-500/20">
                <WorkflowCard
                    name="Data Quality"
                    schedule="Daily @ 2:00 AM UTC"
                    description="Validates all content and people data"
                    workflowId="data-quality"
                    onRun={() => handleRunWorkflow('data-quality', 'Data Quality')}
                    isPaused={isPaused}
                    actionLoading={actionLoading}
                />
                <WorkflowCard
                    name="Content Enrichment"
                    schedule="Manual Trigger"
                    description="Fetches comprehensive TMDB data"
                    workflowId="enrich-content"
                    onRun={() => handleRunWorkflow('enrich-content', 'Content Enrichment')}
                    isPaused={isPaused}
                    actionLoading={actionLoading}
                />
                <WorkflowCard
                    name="People Enrichment"
                    schedule="Manual Trigger"
                    description="Enriches people/cast profiles"
                    workflowId="enrich-people"
                    onRun={() => handleRunWorkflow('enrich-people', 'People Enrichment')}
                    isPaused={isPaused}
                    actionLoading={actionLoading}
                />
            </div>
        </div>
    );
}

function WorkflowCard({ name, schedule, description, workflowId, onRun, isPaused, actionLoading }: {
    name: string;
    schedule: string;
    description: string;
    workflowId: string;
    onRun: () => void;
    isPaused: boolean;
    actionLoading: boolean;
}) {
    return (
        <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
            <h4 className="text-sm font-semibold text-white mb-1">{name}</h4>
            <p className="text-xs text-purple-400 mb-2">{schedule}</p>
            <p className="text-xs text-zinc-400 mb-3">{description}</p>
            <button
                onClick={onRun}
                disabled={isPaused || actionLoading}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 disabled:cursor-not-allowed text-white rounded-md transition-colors"
                title={isPaused ? 'Resume to run manually' : 'Trigger now'}
            >
                <Play className="w-3 h-3" />
                Run Now
            </button>
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/20 rounded-xl p-6 animate-pulse">
            <div className="h-6 bg-zinc-800 rounded w-1/3 mb-4" />
            <div className="h-4 bg-zinc-800 rounded w-2/3 mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-20 bg-zinc-800 rounded" />
                ))}
            </div>
        </div>
    );
}
