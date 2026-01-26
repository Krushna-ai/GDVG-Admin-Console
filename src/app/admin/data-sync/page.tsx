import { createClient } from '@/lib/supabase/server';

// Types for sync data
interface SyncJob {
    id: string;
    status: string;
    sync_type: string;
    daily_quota: number;
    total_discovered: number;
    total_queued: number;
    total_imported: number;
    total_skipped: number;
    total_failed: number;
    kr_count: number;
    cn_count: number;
    th_count: number;
    tr_count: number;
    jp_count: number;
    anime_count: number;
    in_count: number;
    western_count: number;
    other_count: number;
    started_at: string;
    completed_at: string;
    created_at: string;
}

interface SyncStats {
    today: { imported: number; queued: number; skipped: number };
    week: { imported: number; queued: number; skipped: number };
}

async function getSyncData() {
    const supabase = await createClient();

    // Get recent jobs
    const { data: jobs } = await supabase
        .from('sync_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    // Get today's stats
    const today = new Date().toISOString().split('T')[0];
    const { data: todayJobs } = await supabase
        .from('sync_jobs')
        .select('total_imported, total_queued, total_skipped')
        .gte('created_at', today);

    // Get this week's stats
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: weekJobs } = await supabase
        .from('sync_jobs')
        .select('total_imported, total_queued, total_skipped')
        .gte('created_at', weekAgo.toISOString());

    const stats: SyncStats = {
        today: {
            imported: todayJobs?.reduce((sum, j) => sum + (j.total_imported || 0), 0) || 0,
            queued: todayJobs?.reduce((sum, j) => sum + (j.total_queued || 0), 0) || 0,
            skipped: todayJobs?.reduce((sum, j) => sum + (j.total_skipped || 0), 0) || 0,
        },
        week: {
            imported: weekJobs?.reduce((sum, j) => sum + (j.total_imported || 0), 0) || 0,
            queued: weekJobs?.reduce((sum, j) => sum + (j.total_queued || 0), 0) || 0,
            skipped: weekJobs?.reduce((sum, j) => sum + (j.total_skipped || 0), 0) || 0,
        },
    };

    return { jobs: jobs || [], stats };
}

export default async function DataSyncPage() {
    const { jobs, stats } = await getSyncData();
    const latestJob = jobs[0] as SyncJob | undefined;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">🔄 Data Sync</h1>
                    <p className="text-gray-400">
                        Auto-import content from TMDB with priority-based discovery
                    </p>
                </div>

                {/* Manual Trigger Button */}
                <form action="/api/sync/auto-import" method="POST">
                    <button
                        type="submit"
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg transition-all"
                    >
                        ▶️ Run Sync Now
                    </button>
                </form>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Today */}
                <div className="bg-gradient-to-br from-green-900/40 to-green-800/20 border border-green-700/30 rounded-2xl p-6">
                    <h3 className="text-green-400 font-medium mb-4">📅 Today</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between text-white">
                            <span>Queued</span>
                            <span className="font-bold">{stats.today.queued}</span>
                        </div>
                        <div className="flex justify-between text-white">
                            <span>Imported</span>
                            <span className="font-bold">{stats.today.imported}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                            <span>Skipped (duplicates)</span>
                            <span>{stats.today.skipped}</span>
                        </div>
                    </div>
                </div>

                {/* This Week */}
                <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-700/30 rounded-2xl p-6">
                    <h3 className="text-blue-400 font-medium mb-4">📊 This Week</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between text-white">
                            <span>Queued</span>
                            <span className="font-bold">{stats.week.queued}</span>
                        </div>
                        <div className="flex justify-between text-white">
                            <span>Imported</span>
                            <span className="font-bold">{stats.week.imported}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                            <span>Skipped (duplicates)</span>
                            <span>{stats.week.skipped}</span>
                        </div>
                    </div>
                </div>

                {/* Next Run */}
                <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-purple-700/30 rounded-2xl p-6">
                    <h3 className="text-purple-400 font-medium mb-4">⏰ Next Scheduled Run</h3>
                    <div className="text-2xl font-bold text-white mb-2">3:00 AM IST</div>
                    <p className="text-gray-400 text-sm">Daily auto-import via cron</p>
                    <div className="mt-3 text-sm text-purple-300">
                        Quota: 1000 content/day
                    </div>
                </div>
            </div>

            {/* Latest Job Details */}
            {latestJob && (
                <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6">
                    <h3 className="text-xl font-semibold text-white mb-4">
                        📋 Latest Sync Job
                        <span className={`ml-3 px-3 py-1 rounded-full text-sm ${latestJob.status === 'completed' ? 'bg-green-900/50 text-green-400' :
                                latestJob.status === 'running' ? 'bg-blue-900/50 text-blue-400' :
                                    latestJob.status === 'failed' ? 'bg-red-900/50 text-red-400' :
                                        'bg-gray-700 text-gray-300'
                            }`}>
                            {latestJob.status}
                        </span>
                    </h3>

                    {/* Priority Distribution */}
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-4 mb-6">
                        <PriorityBadge label="🇰🇷 Korean" count={latestJob.kr_count} color="from-pink-600/30 to-pink-800/30" />
                        <PriorityBadge label="🇨🇳 Chinese" count={latestJob.cn_count} color="from-red-600/30 to-red-800/30" />
                        <PriorityBadge label="🇹🇭 Thai" count={latestJob.th_count} color="from-blue-600/30 to-blue-800/30" />
                        <PriorityBadge label="🇹🇷 Turkish" count={latestJob.tr_count} color="from-red-700/30 to-red-900/30" />
                        <PriorityBadge label="🇯🇵 Japanese" count={latestJob.jp_count} color="from-white/10 to-red-900/30" />
                        <PriorityBadge label="🎌 Anime" count={latestJob.anime_count} color="from-purple-600/30 to-purple-800/30" />
                        <PriorityBadge label="🇮🇳 Indian" count={latestJob.in_count} color="from-orange-600/30 to-green-800/30" />
                        <PriorityBadge label="🌍 Western" count={latestJob.western_count} color="from-blue-700/30 to-blue-900/30" />
                        <PriorityBadge label="🌐 Other" count={latestJob.other_count} color="from-gray-600/30 to-gray-800/30" />
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-4 gap-4 text-center">
                        <div className="bg-gray-700/30 rounded-lg p-3">
                            <div className="text-2xl font-bold text-white">{latestJob.total_discovered}</div>
                            <div className="text-sm text-gray-400">Discovered</div>
                        </div>
                        <div className="bg-gray-700/30 rounded-lg p-3">
                            <div className="text-2xl font-bold text-green-400">{latestJob.total_queued}</div>
                            <div className="text-sm text-gray-400">Queued</div>
                        </div>
                        <div className="bg-gray-700/30 rounded-lg p-3">
                            <div className="text-2xl font-bold text-blue-400">{latestJob.total_imported}</div>
                            <div className="text-sm text-gray-400">Imported</div>
                        </div>
                        <div className="bg-gray-700/30 rounded-lg p-3">
                            <div className="text-2xl font-bold text-yellow-400">{latestJob.total_skipped}</div>
                            <div className="text-sm text-gray-400">Skipped</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sync History Table */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-700">
                    <h3 className="text-xl font-semibold text-white">📜 Sync History</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-900/50 text-gray-400 text-sm">
                            <tr>
                                <th className="px-6 py-3 text-left">Date</th>
                                <th className="px-6 py-3 text-left">Type</th>
                                <th className="px-6 py-3 text-left">Status</th>
                                <th className="px-6 py-3 text-right">Discovered</th>
                                <th className="px-6 py-3 text-right">Queued</th>
                                <th className="px-6 py-3 text-right">Skipped</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {jobs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                        No sync jobs yet. Click "Run Sync Now" to start!
                                    </td>
                                </tr>
                            ) : (
                                jobs.map((job: SyncJob) => (
                                    <tr key={job.id} className="hover:bg-gray-700/20">
                                        <td className="px-6 py-4 text-white">
                                            {new Date(job.created_at).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 bg-gray-700 rounded text-sm text-gray-300">
                                                {job.sync_type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-sm ${job.status === 'completed' ? 'bg-green-900/50 text-green-400' :
                                                    job.status === 'running' ? 'bg-blue-900/50 text-blue-400' :
                                                        job.status === 'failed' ? 'bg-red-900/50 text-red-400' :
                                                            'bg-gray-700 text-gray-300'
                                                }`}>
                                                {job.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right text-gray-300">{job.total_discovered}</td>
                                        <td className="px-6 py-4 text-right text-green-400">{job.total_queued}</td>
                                        <td className="px-6 py-4 text-right text-yellow-400">{job.total_skipped}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// Priority Badge Component
function PriorityBadge({ label, count, color }: { label: string; count: number; color: string }) {
    return (
        <div className={`bg-gradient-to-br ${color} border border-gray-700/30 rounded-xl p-3 text-center`}>
            <div className="text-lg font-bold text-white">{count || 0}</div>
            <div className="text-xs text-gray-300">{label}</div>
        </div>
    );
}
