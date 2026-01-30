import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createClient();
        const jobId = params.id;

        // Update job status to processing (resume from paused)
        const { error } = await supabase
            .from('import_jobs')
            .update({ status: 'processing' })
            .eq('id', jobId)
            .eq('status', 'paused'); // Only resume if currently paused

        if (error) {
            return NextResponse.json(
                { error: 'Failed to resume job' },
                { status: 500 }
            );
        }

        // Log the resume action
        await supabase.from('sync_logs').insert({
            type: 'bulk_import',
            status: 'info',
            message: `Import job resumed: ${jobId}`,
            details: { job_id: jobId, action: 'resume' },
            created_at: new Date().toISOString(),
        });

        return NextResponse.json({ success: true, message: 'Job resumed' });

    } catch (error) {
        console.error('Resume job error:', error);
        return NextResponse.json(
            { error: 'Failed to resume job' },
            { status: 500 }
        );
    }
}
