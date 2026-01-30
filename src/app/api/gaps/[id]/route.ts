import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PATCH /api/gaps/[id]
 * Update gap status (mark as resolved, increment attempts, etc.)
 */
export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { id } = params;

        const updateData: any = {};

        if (body.is_resolved !== undefined) {
            updateData.is_resolved = body.is_resolved;
            if (body.is_resolved) {
                updateData.filled_at = new Date().toISOString();
            }
        }

        if (body.increment_attempts) {
            // Get current attempts
            const { data: current } = await supabase
                .from('gap_registry')
                .select('fill_attempts')
                .eq('id', id)
                .single();

            updateData.fill_attempts = (current?.fill_attempts || 0) + 1;
        }

        if (body.last_attempt_error) {
            updateData.last_attempt_error = body.last_attempt_error;
        }

        const { data, error } = await supabase
            .from('gap_registry')
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
        console.error('Error updating gap:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * DELETE /api/gaps/[id]
 * Delete a gap entry
 */
export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createClient();
        const { id } = params;

        const { error } = await supabase
            .from('gap_registry')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({
            success: true,
            message: 'Gap deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting gap:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
