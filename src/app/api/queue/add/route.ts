
import { NextResponse } from 'next/server';
import { bulkInsertQueue } from '@/lib/services/database.service';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { items } = body;

        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { error: 'No items provided' },
                { status: 400 }
            );
        }

        // Map items to queue format
        // Expecting items to be array of { tmdbId: number, contentType: string }
        const queueItems = items.map((item: any) => ({
            tmdb_id: item.tmdbId,
            content_type: item.contentType,
            priority: 1, // Higher priority for manual page imports
            source: 'manual_page_import',
            status: 'pending'
        }));

        const result = await bulkInsertQueue(queueItems);

        return NextResponse.json({
            success: true,
            inserted: result.inserted,
            skipped: result.skipped
        });

    } catch (error) {
        console.error('Queue add error:', error);
        return NextResponse.json(
            { error: 'Failed to add items to queue' },
            { status: 500 }
        );
    }
}
