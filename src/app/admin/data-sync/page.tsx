import { Suspense } from 'react';
import SyncController from './components/SyncController';
import OverviewPanel from './components/OverviewPanel';
import AnalyticsSection from './components/AnalyticsSection';
import SyncHistory from './components/SyncHistory';
import BulkImportCenter from './components/BulkImportCenter';
import ImportQueue from './components/ImportQueue';
import GapManagement from './components/GapManagement';

export const metadata = {
    title: 'Data Sync | GDVG Admin',
    description: 'Manage content synchronization and bulk imports',
};

export default function DataSyncPage() {
    return (
        <div className="min-h-screen bg-slate-900 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Data Sync Dashboard</h1>
                    <p className="text-zinc-400">Manage content synchronization, bulk imports, and gap filling</p>
                </div>

                {/* Sync Controller */}
                <Suspense fallback={<LoadingSkeleton />}>
                    <SyncController />
                </Suspense>

                {/* Overview Panel */}
                <Suspense fallback={<LoadingSkeleton />}>
                    <OverviewPanel />
                </Suspense>

                {/* Analytics Section */}
                <Suspense fallback={<LoadingSkeleton />}>
                    <AnalyticsSection />
                </Suspense>

                {/* Sync History */}
                <Suspense fallback={<LoadingSkeleton />}>
                    <SyncHistory />
                </Suspense>

                {/* Grid Layout for Sections */}
                <div className="grid grid-cols-1 gap-6">
                    {/* Bulk Import Section */}
                    <Suspense fallback={<LoadingSkeleton />}>
                        <BulkImportCenter />
                    </Suspense>

                    {/* Import Queue */}
                    <Suspense fallback={<LoadingSkeleton />}>
                        <ImportQueue />
                    </Suspense>

                    {/* Gap Management Section */}
                    <Suspense fallback={<LoadingSkeleton />}>
                        <GapManagement />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-xl p-6">
            <div className="animate-pulse space-y-4">
                <div className="h-6 bg-zinc-800 rounded w-1/3"></div>
                <div className="h-4 bg-zinc-800 rounded w-2/3"></div>
                <div className="h-4 bg-zinc-800 rounded w-1/2"></div>
            </div>
        </div>
    );
}
