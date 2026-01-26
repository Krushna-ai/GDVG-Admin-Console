import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/sync/status
 * Get current sync job status
 */
export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get('job_id');

        if (jobId) {
            // Get specific job
            const { data: job } = await supabase
                .from('sync_jobs')
                .select('*')
                .eq('id', jobId)
                .single();

            if (!job) {
                return NextResponse.json({ error: 'Job not found' }, { status: 404 });
            }

            // Get queue progress
            const { data: queueStats } = await supabase
                .from('sync_queue')
                .select('status')
                .eq('job_id', jobId);

            const pending = queueStats?.filter(q => q.status === 'pending').length || 0;
            const completed = queueStats?.filter(q => q.status === 'completed').length || 0;
            const failed = queueStats?.filter(q => q.status === 'failed').length || 0;

            return NextResponse.json({
                job,
                queue_stats: { pending, completed, failed, total: queueStats?.length || 0 },
            });
        }

        // Get latest running or recent job
        const { data: latestJob } = await supabase
            .from('sync_jobs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        return NextResponse.json({ job: latestJob });

    } catch (error) {
        console.error('Failed to get sync status:', error);
        return NextResponse.json(
            { error: 'Failed to get status' },
            { status: 500 }
        );
    }
}
