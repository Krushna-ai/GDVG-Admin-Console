import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/enrichment-queue/stats
 * Get queue statistics
 */
export async function GET() {
    try {
        const { data, error } = await supabase
            .from('enrichment_queue')
            .select('status, queue_type');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const stats = {
            total: data?.length || 0,
            pending: data?.filter(i => i.status === 'pending').length || 0,
            processing: data?.filter(i => i.status === 'processing').length || 0,
            completed: data?.filter(i => i.status === 'completed').length || 0,
            failed: data?.filter(i => i.status === 'failed').length || 0,
            byType: {
                content: {
                    total: data?.filter(i => i.queue_type === 'content').length || 0,
                    pending: data?.filter(i => i.queue_type === 'content' && i.status === 'pending').length || 0,
                },
                people: {
                    total: data?.filter(i => i.queue_type === 'people').length || 0,
                    pending: data?.filter(i => i.queue_type === 'people' && i.status === 'pending').length || 0,
                },
                quality: {
                    total: data?.filter(i => i.queue_type === 'quality').length || 0,
                    pending: data?.filter(i => i.queue_type === 'quality' && i.status === 'pending').length || 0,
                },
            },
        };

        return NextResponse.json({ success: true, stats });
    } catch (error) {
        console.error('Error fetching queue stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch stats' },
            { status: 500 }
        );
    }
}
