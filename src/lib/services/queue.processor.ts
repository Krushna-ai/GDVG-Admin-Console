// Queue Processor Service
// Processes items from import_queue by enriching them from TMDB

import { getAdminClient } from '@/lib/supabase/admin';
import { enrichContent } from './tmdb.service';

export interface ProcessorStats {
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
}

export interface ProcessorOptions {
    batchSize?: number;
    maxAttempts?: number;
}

/**
 * Get pending items from the queue
 */
export async function getPendingItems(limit: number = 10) {
    const supabase = getAdminClient();

    const { data, error } = await supabase
        .from('import_queue')
        .select('*')
        .eq('status', 'pending')
        .lt('attempts', 3)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) {
        console.error('Error fetching queue items:', error);
        return [];
    }

    return data || [];
}

/**
 * Update queue item status
 */
async function updateQueueStatus(
    id: string,
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped',
    errorMessage?: string
) {
    const supabase = getAdminClient();

    const updates: any = {
        status,
    };

    if (status === 'completed' || status === 'failed' || status === 'skipped') {
        updates.processed_at = new Date().toISOString();
    }

    if (errorMessage) {
        updates.error_message = errorMessage;
    }

    // @ts-ignore - Admin client is untyped, but operation is valid
    const { error } = await supabase
        .from('import_queue')
        .update(updates as any)
        .eq('id', id);

    if (error) {
        console.error(`Error updating queue item ${id} to ${status}:`, error);
        throw error;
    }
}

/**
 * Increment attempt count for a queue item
 */
async function incrementAttempts(id: string) {
    const supabase = getAdminClient();

    // Direct increment to avoid RPC issues
    const { data: current } = await supabase
        .from('import_queue')
        .select('attempts')
        .eq('id', id)
        .single();

    const attempts = ((current as any)?.attempts || 0) + 1;

    await supabase
        .from('import_queue')
        .update({ attempts } as any)
        .eq('id', id);
}

/**
 * Process a single queue item
 */
export async function processQueueItem(item: any): Promise<'success' | 'failed' | 'skipped'> {
    try {
        // Mark as processing
        await updateQueueStatus(item.id, 'processing');
        await incrementAttempts(item.id);

        // Enrich from TMDB
        const result = await enrichContent(item.tmdb_id, item.content_type);

        if (result.success) {
            await updateQueueStatus(item.id, 'completed');
            return 'success';
        } else if (result.alreadyExists) {
            await updateQueueStatus(item.id, 'skipped', 'Already exists');
            return 'skipped';
        } else {
            await updateQueueStatus(item.id, 'failed', result.error);
            return 'failed';
        }
    } catch (error: any) {
        const errorMessage = error.message || 'Unknown error';
        console.error(`processQueueItem error for ${item.id}:`, errorMessage);
        try {
            await updateQueueStatus(item.id, 'failed', errorMessage);
        } catch (updateError) {
            console.error('Failed to update status after error:', updateError);
        }
        return 'failed';
    }
}

/**
 * Process a batch of queue items
 */
export async function processBatch(options: ProcessorOptions = {}): Promise<ProcessorStats> {
    const { batchSize = 10 } = options;

    const stats: ProcessorStats = {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
    };

    const items = await getPendingItems(batchSize);
    console.log(`Processing batch of ${items.length} items`);

    for (const item of items) {
        stats.processed++;
        console.log(`Processing item ${stats.processed}/${items.length}: TMDB ID ${(item as any).tmdb_id}`);

        const result = await processQueueItem(item);

        if (result === 'success') {
            stats.succeeded++;
        } else if (result === 'skipped') {
            stats.skipped++;
        } else {
            stats.failed++;
        }

        // Rate limiting delay (TMDB allows ~40 requests per 10 seconds)
        await new Promise(resolve => setTimeout(resolve, 350));
    }

    console.log(`Batch complete:`, stats);
    return stats;
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
    const supabase = getAdminClient();

    const { data: items } = await supabase
        .from('import_queue')
        .select('status');

    const stats = {
        total: items?.length || 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
    };

    for (const item of items || []) {
        const status = (item as any).status as keyof typeof stats;
        if (status in stats) {
            stats[status]++;
        }
    }

    return stats;
}

/**
 * Clear completed/failed items from queue
 */
export async function clearProcessedItems(): Promise<number> {
    const supabase = getAdminClient();

    const { data, error } = await supabase
        .from('import_queue')
        .delete()
        .in('status', ['completed', 'failed', 'skipped'])
        .select('id');

    if (error) {
        console.error('Error clearing queue:', error);
        return 0;
    }

    return data?.length || 0;
}

/**
 * Retry failed items (reset their status)
 */
export async function retryFailedItems(): Promise<number> {
    const supabase = getAdminClient();

    const { data, error } = await supabase
        .from('import_queue')
        .update({
            status: 'pending',
            error_message: null,
            attempts: 0,
        } as any)
        .eq('status', 'failed')
        .select('id');

    if (error) {
        console.error('Error retrying failed items:', error);
        return 0;
    }

    return data?.length || 0;
}

/**
 * Process all pending items in the queue (for auto-processing)
 */
export async function processAllPending(): Promise<ProcessorStats> {
    const totalStats: ProcessorStats = {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
    };

    let hasMore = true;

    while (hasMore) {
        const batchStats = await processBatch({ batchSize: 10 });

        totalStats.processed += batchStats.processed;
        totalStats.succeeded += batchStats.succeeded;
        totalStats.failed += batchStats.failed;
        totalStats.skipped += batchStats.skipped;

        // If we processed less than batch size, we're done
        hasMore = batchStats.processed >= 10;

        // Small delay between batches
        if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return totalStats;
}
