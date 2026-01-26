import { NextResponse } from 'next/server';
import { getFilteredExport, queueFromExport } from '@/lib/services/exports.service';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { type, minPopularity, maxItems } = body;

        if (!type || (type !== 'movie' && type !== 'tv')) {
            return NextResponse.json(
                { error: 'Invalid content type' },
                { status: 400 }
            );
        }

        // Get filtered export items
        const result = await getFilteredExport(type, {
            minPopularity: minPopularity || 20,
            maxItems: maxItems || 500,
            excludeAdult: true,
        });

        if (result.items.length === 0) {
            return NextResponse.json({
                queued: 0,
                skipped: 0,
                message: 'No items to queue',
            });
        }

        // Create batch name
        const batchName = `${type}_export_${new Date().toISOString().split('T')[0]}_${Date.now()}`;

        // Queue items
        const queueResult = await queueFromExport(result.items, type, batchName);

        return NextResponse.json({
            queued: queueResult.queued,
            skipped: queueResult.skipped,
            batchName,
        });
    } catch (error) {
        console.error('Bulk import error:', error);
        return NextResponse.json(
            { error: 'Failed to queue items for import' },
            { status: 500 }
        );
    }
}
