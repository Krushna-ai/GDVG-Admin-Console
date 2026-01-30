import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createClient();
        const jobId = params.id;

        // Update job status to paused
        const { error } = await supabase
            .from('import_jobs')
            .update({ status: 'paused' })
            .eq('id', jobId)
            .eq('status', 'processing'); // Only pause if currently processing

        if (error) {
            return NextResponse.json(
                { error: 'Failed to pause job' },
                { status: 500 }
            );
        }

        // Log the pause action
        await supabase.from('sync_logs').insert({
            type: 'bulk_import',
            status: 'info',
            message: `Import job paused: ${jobId}`,
            details: { job_id: jobId, action: 'pause' },
            created_at: new Date().toISOString(),
        });

        return NextResponse.json({ success: true, message: 'Job paused' });

    } catch (error) {
        console.error('Pause job error:', error);
        return NextResponse.json(
            { error: 'Failed to pause job' },
            { status: 500 }
        );
    }
}
