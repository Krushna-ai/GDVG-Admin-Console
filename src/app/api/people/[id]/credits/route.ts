import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - Fetch person's credits (cast and crew roles)
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        // Fetch cast credits
        const { data: castCredits } = await supabase
            .from('content_cast')
            .select(`
        character_name,
        order_index,
        content:content_id (
          id,
          title,
          poster_path
        )
      `)
            .eq('person_id', id)
            .order('order_index', { ascending: true });

        // Fetch crew credits
        const { data: crewCredits } = await supabase
            .from('content_crew')
            .select(`
        job,
        department,
        content:content_id (
          id,
          title,
          poster_path
        )
      `)
            .eq('person_id', id);

        // Transform the data
        const cast = (castCredits || []).map((c: any) => ({
            content_id: c.content?.id,
            content_title: c.content?.title,
            character: c.character_name,
            poster_path: c.content?.poster_path,
        }));

        const crew = (crewCredits || []).map((c: any) => ({
            content_id: c.content?.id,
            content_title: c.content?.title,
            job: c.job,
            department: c.department,
            poster_path: c.content?.poster_path,
        }));

        return NextResponse.json({ cast, crew });
    } catch (error) {
        console.error('Error fetching credits:', error);
        return NextResponse.json({ error: 'Failed to fetch credits' }, { status: 500 });
    }
}
