'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, GitBranch, Clock, Zap } from 'lucide-react';
import { getLatestEnrichmentRun, EnrichmentLog } from '@/lib/api/enrichment-logs';

const GITHUB_ACTIONS_URL = 'https://github.com/Krushna-ai/GDVG-Admin-Console/actions';

export default function WorkflowStatus() {
    const [lastRun, setLastRun] = useState<EnrichmentLog | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLastRun();
    }, []);

    async function fetchLastRun() {
        setLoading(true);
        const data = await getLatestEnrichmentRun();
        setLastRun(data);
        setLoading(false);
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

            {/* Workflow Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-purple-500/20">
                <WorkflowCard
                    name="Data Quality"
                    schedule="Daily @ 2:00 AM UTC"
                    description="Validates all content and people data"
                />
                <WorkflowCard
                    name="Content Enrichment"
                    schedule="Manual Trigger"
                    description="Fetches comprehensive TMDB data"
                />
                <WorkflowCard
                    name="Import Processor"
                    schedule="Every 15 minutes"
                    description="Processes pending import jobs"
                />
            </div>
        </div>
    );
}

function WorkflowCard({ name, schedule, description }: {
    name: string;
    schedule: string;
    description: string;
}) {
    return (
        <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
            <h4 className="text-sm font-semibold text-white mb-1">{name}</h4>
            <p className="text-xs text-purple-400 mb-2">{schedule}</p>
            <p className="text-xs text-zinc-400">{description}</p>
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
