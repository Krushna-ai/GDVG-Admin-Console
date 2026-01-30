import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PATCH /api/import/jobs/[id]
 * Update import job (status, progress, etc.)
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

            // Auto-set timestamps based on status
            if (body.status === 'running' && !body.started_at) {
                updateData.started_at = new Date().toISOString();
            }
            if (['completed', 'failed', 'cancelled'].includes(body.status) && !body.completed_at) {
                updateData.completed_at = new Date().toISOString();
            }
        }

        if (body.progress) {
            updateData.progress = body.progress;
        }

        if (body.priority !== undefined) {
            updateData.priority = body.priority;
        }

        if (body.error_log) {
            updateData.error_log = body.error_log;
        }

        const { data, error } = await supabase
            .from('import_jobs')
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
        console.error('Error updating import job:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * DELETE /api/import/jobs/[id]
 * Delete an import job
 */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient();
        const { id } = await params;

        const { error } = await supabase
            .from('import_jobs')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({
            success: true,
            message: 'Import job deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting import job:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
