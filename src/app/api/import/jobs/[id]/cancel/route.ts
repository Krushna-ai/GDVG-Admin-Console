import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient();
        const { id } = await params;
        const jobId = id;

        // Update job status to cancelled
        const { error } = await supabase
            .from('import_jobs')
            .update({
                status: 'cancelled',
                completed_at: new Date().toISOString(),
            })
            .eq('id', jobId)
            .in('status', ['pending', 'processing', 'paused']); // Can only cancel active jobs

        if (error) {
            return NextResponse.json(
                { error: 'Failed to cancel job' },
                { status: 500 }
            );
        }

        // Log the cancellation
        await supabase.from('sync_logs').insert({
            type: 'bulk_import',
            status: 'info',
            message: `Import job cancelled: ${jobId}`,
            details: { job_id: jobId, action: 'cancel' },
            created_at: new Date().toISOString(),
        });

        return NextResponse.json({ success: true, message: 'Job cancelled' });

    } catch (error) {
        console.error('Cancel job error:', error);
        return NextResponse.json(
            { error: 'Failed to cancel job' },
            { status: 500 }
        );
    }
}
