import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PUT /api/import/presets/[id]
 * Update a preset
 */
export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { id } = params;
        const { name, description, configuration } = body;

        const updateData: any = {};
        if (name) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (configuration) updateData.configuration = configuration;

        const { data, error } = await supabase
            .from('import_presets')
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
        console.error('Error updating preset:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * DELETE /api/import/presets/[id]
 * Delete a preset
 */
export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createClient();
        const { id } = params;

        const { error } = await supabase
            .from('import_presets')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({
            success: true,
            message: 'Preset deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting preset:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * PATCH /api/import/presets/[id]
 * Mark preset as used (increment use_count, update last_used_at)
 */
export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createClient();
        const { id } = params;

        // Get current use_count
        const { data: current } = await supabase
            .from('import_presets')
            .select('use_count')
            .eq('id', id)
            .single();

        const { data, error } = await supabase
            .from('import_presets')
            .update({
                use_count: (current?.use_count || 0) + 1,
                last_used_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            success: true,
            data,
        });
    } catch (error) {
        console.error('Error updating preset usage:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
