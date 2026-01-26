import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - Fetch single content
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('content')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }

        return NextResponse.json({ content: data });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
    }
}

// PATCH - Update content
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const supabase = await createClient();

        // Remove read-only fields
        const { id: _, tmdb_id, created_at, ...updateData } = body;

        const { data, error } = await supabase
            .from('content')
            .update({
                ...updateData,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ content: data });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
    }
}

// DELETE - Delete content
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        // First delete related cast/crew entries
        await supabase.from('content_cast').delete().eq('content_id', id);
        await supabase.from('content_crew').delete().eq('content_id', id);

        // Then delete the content
        const { error } = await supabase
            .from('content')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete content' }, { status: 500 });
    }
}
