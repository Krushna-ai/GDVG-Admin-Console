import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET - Fetch watch links for content
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('content_watch_links')
            .select('*')
            .eq('content_id', id)
            .order('priority', { ascending: true });

        if (error) {
            // Table might not exist yet - return empty array
            return NextResponse.json({ links: [] });
        }

        return NextResponse.json({ links: data || [] });
    } catch (error) {
        return NextResponse.json({ links: [] });
    }
}

// PUT - Replace all watch links for content
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { links } = body;

        const supabase = await createClient();

        // Delete existing links
        await supabase
            .from('content_watch_links')
            .delete()
            .eq('content_id', id);

        // Insert new links if any
        if (links && links.length > 0) {
            const linksToInsert = links.map((link: any, idx: number) => ({
                content_id: id,
                platform_name: link.platform_name,
                region: link.region || 'ALL',
                link_url: link.link_url,
                is_affiliate: link.is_affiliate || false,
                priority: idx,
            }));

            const { error } = await supabase
                .from('content_watch_links')
                .insert(linksToInsert);

            if (error) {
                console.error('Error saving watch links:', error);
                // Don't fail the whole request if table doesn't exist
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Watch links save error:', error);
        return NextResponse.json({ success: true }); // Don't fail main save
    }
}
