'use client';

import { Suspense, useState } from 'react';
import { BarChart3, FileText, Database } from 'lucide-react';
import QualityDashboard from './components/QualityDashboard';
import EnrichmentQueueTable from './components/EnrichmentQueueTable';
import QualityReportsTable from './components/QualityReportsTable';
import WorkflowStatus from './components/WorkflowStatus';
import EnrichmentQueueStatus from './components/EnrichmentQueueStatus';

type Tab = 'overview' | 'import-queue' | 'reports';

export default function GapEnrichmentPage() {
    const [activeTab, setActiveTab] = useState<Tab>('overview');

    return (
        <div className="min-h-screen bg-slate-900 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Gap & Enrichment Management</h1>
                    <p className="text-zinc-400">
                        Monitor data quality, track enrichment progress, and manage import jobs
                    </p>
                </div>

                {/* Tabs */}
                <div className="border-b border-zinc-800">
                    <nav className="flex gap-4">
                        <TabButton
                            active={activeTab === 'overview'}
                            onClick={() => setActiveTab('overview')}
                            icon={<BarChart3 className="w-4 h-4" />}
                            label="Overview"
                        />
                        <TabButton
                            active={activeTab === 'import-queue'}
                            onClick={() => setActiveTab('import-queue')}
                            icon={<Database className="w-4 h-4" />}
                            label="Enrichment Queue"
                        />
                        <TabButton
                            active={activeTab === 'reports'}
                            onClick={() => setActiveTab('reports')}
                            icon={<FileText className="w-4 h-4" />}
                            label="Reports"
                        />
                    </nav>
                </div>

                {/* Tab Content */}
                <div className="mt-6">
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            <Suspense fallback={<WorkflowStatusSkeleton />}>
                                <WorkflowStatus />
                            </Suspense>
                            <Suspense fallback={<ContentSkeleton />}>
                                <EnrichmentQueueStatus />
                            </Suspense>
                            <Suspense fallback={<ContentSkeleton />}>
                                <QualityDashboard />
                            </Suspense>
                        </div>
                    )}

                    {activeTab === 'import-queue' && (
                        <Suspense fallback={<ContentSkeleton />}>
                            <EnrichmentQueueTable />
                        </Suspense>
                    )}

                    {activeTab === 'reports' && (
                        <Suspense fallback={<ContentSkeleton />}>
                            <QualityReportsTable />
                        </Suspense>
                    )}
                </div>
            </div>
        </div>
    );
}

function TabButton({ active, onClick, icon, label }: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${active
                ? 'border-purple-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
        >
            {icon}
            <span className="font-medium">{label}</span>
        </button>
    );
}

function WorkflowStatusSkeleton() {
    return (
        <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/20 rounded-xl p-6 animate-pulse">
            <div className="h-6 bg-zinc-800 rounded w-1/3 mb-4" />
            <div className="h-4 bg-zinc-800 rounded w-2/3" />
        </div>
    );
}

function ContentSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 h-64" />
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 h-96" />
        </div>
    );
}
