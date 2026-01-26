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
