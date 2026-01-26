import { NextResponse } from 'next/server';
import { processBatch, processAllPending, getQueueStats, clearProcessedItems, retryFailedItems } from '@/lib/services/queue.processor';

// POST - Process queue items
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const batchSize = body.batchSize || 10;
        const processAll = body.processAll || false;

        let stats;
        if (processAll) {
            // Process all pending items (for auto-processing)
            stats = await processAllPending();
        } else {
            // Process a specific batch size
            stats = await processBatch({ batchSize });
        }

        return NextResponse.json({
            success: true,
            ...stats,
        });
    } catch (error: any) {
        console.error('Queue processing error:', error);
        return NextResponse.json(
            { error: error.message || 'Processing failed' },
            { status: 500 }
        );
    }
}

// GET - Get queue stats
export async function GET() {
    try {
        const stats = await getQueueStats();
        return NextResponse.json(stats);
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Failed to get stats' },
            { status: 500 }
        );
    }
}

// DELETE - Clear processed items
export async function DELETE() {
    try {
        const cleared = await clearProcessedItems();
        return NextResponse.json({ cleared });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Failed to clear queue' },
            { status: 500 }
        );
    }
}

// PUT - Retry failed items
export async function PUT() {
    try {
        const retried = await retryFailedItems();
        return NextResponse.json({ retried });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Failed to retry items' },
            { status: 500 }
        );
    }
}
