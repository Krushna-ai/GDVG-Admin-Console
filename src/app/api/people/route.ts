import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - Fetch all people
export async function GET() {
    try {
        const supabase = await createClient();

        const { data: people, error } = await supabase
            .from('people')
            .select('*')
            .order('popularity', { ascending: false, nullsFirst: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ people });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch people' }, { status: 500 });
    }
}
