import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/sync/history
 * Get past sync job history with stats
 */
export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Get jobs with pagination
        const { data: jobs, count } = await supabase
            .from('sync_jobs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        // Get aggregate stats
        const { data: todayStats } = await supabase
            .from('sync_jobs')
            .select('total_imported, total_queued, total_skipped')
            .gte('created_at', new Date().toISOString().split('T')[0]);

        const today = {
            imported: todayStats?.reduce((sum, j) => sum + (j.total_imported || 0), 0) || 0,
            queued: todayStats?.reduce((sum, j) => sum + (j.total_queued || 0), 0) || 0,
            skipped: todayStats?.reduce((sum, j) => sum + (j.total_skipped || 0), 0) || 0,
        };

        // Get this week stats
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const { data: weekStats } = await supabase
            .from('sync_jobs')
            .select('total_imported, total_queued, total_skipped')
            .gte('created_at', weekAgo.toISOString());

        const week = {
            imported: weekStats?.reduce((sum, j) => sum + (j.total_imported || 0), 0) || 0,
            queued: weekStats?.reduce((sum, j) => sum + (j.total_queued || 0), 0) || 0,
            skipped: weekStats?.reduce((sum, j) => sum + (j.total_skipped || 0), 0) || 0,
        };

        return NextResponse.json({
            jobs,
            total: count,
            stats: { today, week },
        });

    } catch (error) {
        console.error('Failed to get sync history:', error);
        return NextResponse.json(
            { error: 'Failed to get history' },
            { status: 500 }
        );
    }
}
