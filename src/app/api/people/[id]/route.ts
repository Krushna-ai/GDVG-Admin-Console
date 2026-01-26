import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - Fetch single person
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('people')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }

        return NextResponse.json({ person: data });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch person' }, { status: 500 });
    }
}

// DELETE - Delete person
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        // First delete related cast/crew entries
        await supabase.from('content_cast').delete().eq('person_id', id);
        await supabase.from('content_crew').delete().eq('person_id', id);

        // Then delete the person
        const { error } = await supabase
            .from('people')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete person' }, { status: 500 });
    }
}
