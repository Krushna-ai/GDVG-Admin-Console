import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - Fetch all content
export async function GET() {
    try {
        const supabase = await createClient();

        const { data: content, error } = await supabase
            .from('content')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ content });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
    }
}
