import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// POST - Publish all drafts
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Fetch ALL draft IDs (just IDs, not full records)
        const { data: drafts, error } = await supabase
            .from('content')
            .select('id')
            .eq('status', 'draft');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!drafts || drafts.length === 0) {
            return NextResponse.json({
                success: true,
                count: 0,
                message: 'No draft items to publish'
            });
        }

        // Update all drafts to published
        const { error: updateError } = await supabase
            .from('content')
            .update({ status: 'published' })
            .eq('status', 'draft');

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            count: drafts.length,
            message: `Successfully published ${drafts.length} items`
        });

    } catch (error) {
        console.error('Publish all error:', error);
        return NextResponse.json({
            error: 'Failed to publish all drafts'
        }, { status: 500 });
    }
}
