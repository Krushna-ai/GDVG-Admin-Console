import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/sync/status
 * Get comprehensive sync status including pause state, last run, next run, stats
 */
export async function GET() {
    try {
        const supabase = await createClient();

        // Get all sync settings
        const { data: settings, error: settingsError } = await supabase
            .from('sync_settings')
            .select('*');

        if (settingsError) throw settingsError;

        // Transform to object
        const settingsObj: Record<string, any> = {};
        settings?.forEach((setting) => {
            settingsObj[setting.setting_key] = setting.setting_value;
        });

        // Get latest sync log
        const { data: lastRun } = await supabase
            .from('sync_logs')
            .select('*')
            .eq('sync_type', 'cron')
            .order('started_at', { ascending: false })
            .limit(1)
            .single();

        // Get active import jobs count
        const { count: activeJobs } = await supabase
            .from('import_jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', ['pending', 'running']);

        // Get unresolved gaps count
        const { count: pendingGaps } = await supabase
            .from('gap_registry')
            .select('*', { count: 'exact', head: true })
            .eq('is_resolved', false);

        // Get content stats
        const { count: totalContent } = await supabase
            .from('content')
            .select('*', { count: 'exact', head: true });

        const { count: movieCount } = await supabase
            .from('content')
            .select('*', { count: 'exact', head: true })
            .eq('content_type', 'movie');

        const { count: tvCount } = await supabase
            .from('content')
            .select('*', { count: 'exact', head: true })
            .eq('content_type', 'tv_series');

        // Calculate next run (simplified - just add 6 hours to last run)
        let nextRun = null;
        if (lastRun?.started_at && !settingsObj.cron_status?.is_paused) {
            const lastRunDate = new Date(lastRun.started_at);
            const nextRunDate = new Date(lastRunDate.getTime() + 6 * 60 * 60 * 1000); // +6 hours
            nextRun = nextRunDate.toISOString();
        }

        return NextResponse.json({
            success: true,
            is_paused: settingsObj.cron_status?.is_paused || false,
            paused_at: settingsObj.cron_status?.paused_at || null,
            paused_by: settingsObj.cron_status?.paused_by || null,
            resumed_at: settingsObj.cron_status?.resumed_at || null,
            last_run: lastRun ? {
                started_at: lastRun.started_at,
                completed_at: lastRun.completed_at,
                status: lastRun.status,
                summary: lastRun.summary,
            } : null,
            next_run: nextRun,
            active_jobs: activeJobs || 0,
            pending_gaps: pendingGaps || 0,
            content_stats: {
                total: totalContent || 0,
                movies: movieCount || 0,
                tv_series: tvCount || 0,
            },
            schedule: settingsObj.sync_schedule,
        });
    } catch (error) {
        console.error('Error fetching sync status:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
