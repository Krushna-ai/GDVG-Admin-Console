import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - Fetch queue items
export async function GET() {
    try {
        const supabase = await createClient();

        const { data: items, error } = await supabase
            .from('import_queue')
            .select('*')
            .order('priority', { ascending: false })
            .order('created_at', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ items });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 });
    }
}
