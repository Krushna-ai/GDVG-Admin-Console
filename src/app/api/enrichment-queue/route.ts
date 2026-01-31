import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/enrichment-queue
 * List pending/processing items from enrichment queue
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const queueType = searchParams.get('type'); // 'content' or 'people'
        const status = searchParams.get('status'); // 'pending', 'processing', etc.
        const limit = parseInt(searchParams.get('limit') || '1000'); // Increased from 100

        let query = supabase
            .from('enrichment_queue')
            .select(`
                id,
                content_id,
                queue_type,
                priority,
                status,
                retry_count,
                max_retries,
                error_message,
                metadata,
                created_at,
                started_at,
                completed_at,
                updated_at
            `)
            .order('priority', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(limit);

        if (queueType) {
            query = query.eq('queue_type', queueType);
        }

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error fetching queue:', error);
        return NextResponse.json(
            { error: 'Failed to fetch queue' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/enrichment-queue
 * Add items to enrichment queue
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { content_id, queue_type, priority, metadata } = body;

        if (!content_id || !queue_type) {
            return NextResponse.json(
                { error: 'content_id and queue_type are required' },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from('enrichment_queue')
            .upsert({
                content_id,
                queue_type,
                priority: priority || 0,
                status: 'pending',
                metadata: metadata || {},
                retry_count: 0,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error adding to queue:', error);
        return NextResponse.json(
            { error: 'Failed to add to queue' },
            { status: 500 }
        );
    }
}
