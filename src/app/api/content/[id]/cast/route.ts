import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - Fetch cast for content
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('content_cast')
            .select(`
                id,
                character_name,
                order_index,
                role_type,
                person:person_id (
                    id,
                    name,
                    profile_path
                )
            `)
            .eq('content_id', id)
            .order('order_index', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ cast: data || [] });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch cast' }, { status: 500 });
    }
}

// PUT - Update cast list (wholesale replace)
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { cast } = body;

        if (!Array.isArray(cast)) {
            return NextResponse.json({ error: 'Invalid cast data format' }, { status: 400 });
        }

        const supabase = await createClient();

        // 1. Delete existing cast mappings for this content
        const { error: deleteError } = await supabase
            .from('content_cast')
            .delete()
            .eq('content_id', id);

        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        // 2. Prepare new cast rows ensuring required IDs
        const rowsToInsert = cast.map((c: any, index: number) => ({
            content_id: id,
            person_id: c.person_id || c.person?.id, // Extract ID properly
            character_name: c.character_name || '',
            role_type: c.role_type || 'support',
            order_index: index, // Enforce order array sequence
        })).filter((r: any) => r.person_id); // Drop invalid rows

        if (rowsToInsert.length > 0) {
            const { error: insertError } = await supabase
                .from('content_cast')
                .insert(rowsToInsert);

            if (insertError) {
                return NextResponse.json({ error: insertError.message }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true, count: rowsToInsert.length });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update cast' }, { status: 500 });
    }
}
