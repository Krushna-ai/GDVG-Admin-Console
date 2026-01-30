import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PATCH /api/sync/logs/[id]
 * Update sync log (mark as completed/failed, add summary)
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { id } = await params;

        const updateData: any = {};

        if (body.status) {
            updateData.status = body.status;

            // Auto-set completed_at for terminal statuses
            if (['completed', 'failed', 'cancelled'].includes(body.status)) {
                updateData.completed_at = new Date().toISOString();
            }
        }

        if (body.summary) {
            updateData.summary = body.summary;
        }

        if (body.error_details) {
            updateData.error_details = body.error_details;
        }

        if (body.metadata) {
            updateData.metadata = body.metadata;
        }

        const { data, error } = await supabase
            .from('sync_logs')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            success: true,
            data,
        });
    } catch (error) {
        console.error('Error updating sync log:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
