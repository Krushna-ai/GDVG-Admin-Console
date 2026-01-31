import { supabase } from './supabase';

/**
 * Add content to enrichment queue
 * @param contentId - UUID of content to enrich
 * @param queueType - Type of enrichment (content, people, quality)
 * @param issueCount - Number of missing fields (used for priority)
 * @param metadata - Optional metadata in JSON format
 */
export async function addToEnrichmentQueue(
    contentId: string,
    queueType: 'content' | 'people' | 'quality',
    issueCount: number,
    metadata: Record<string, any> = {}
) {
    // Priority: More issues = higher priority (lowest details first)
    const priority = issueCount;

    try {
        // Check if item already queued
        const { data: existing } = await supabase
            .from('enrichment_queue')
            .select('id, status')
            .eq('content_id', contentId)
            .eq('queue_type', queueType)
            .single();

        // Skip if already processing or completed
        if (existing && (existing.status === 'processing' || existing.status === 'completed')) {
            return { success: true, skipped: true };
        }

        // Upsert queue item
        const { data, error } = await supabase
            .from('enrichment_queue')
            .upsert({
                content_id: contentId,
                queue_type: queueType,
                priority,
                status: 'pending',
                metadata,
                retry_count: 0,
            }, {
                onConflict: 'content_id,queue_type'
            })
            .select()
            .single();

        if (error) {
            console.error(`Error adding to queue:`, error);
            return { success: false, error };
        }

        return { success: true, data };
    } catch (err) {
        console.error('Queue error:', err);
        return { success: false, error: err };
    }
}

/**
 * Get next items from queue
 * @param queueType - Type of queue to fetch from
 * @param limit - Number of items to fetch
 */
export async function getNextQueueItems(
    queueType: 'content' | 'people' | 'quality',
    limit: number = 50
) {
    const { data, error } = await supabase
        .from('enrichment_queue')
        .select(`
            id,
            content_id,
            queue_type,
            priority,
            retry_count,
            max_retries,
            metadata
        `)
        .eq('queue_type', queueType)
        .eq('status', 'pending')
        .lte('retry_count', supabase.rpc('max_retries'))
        .order('priority', { ascending: false }) // Higher priority first
        .order('created_at', { ascending: true }) // Older items first
        .limit(limit);

    if (error) {
        console.error('Error fetching queue items:', error);
        return [];
    }

    return data || [];
}

/**
 * Mark queue item as processing
 */
export async function markQueueItemProcessing(queueId: string) {
    const { error } = await supabase
        .from('enrichment_queue')
        .update({
            status: 'processing',
            started_at: new Date().toISOString(),
        })
        .eq('id', queueId);

    if (error) {
        console.error('Error marking item as processing:', error);
    }
}

/**
 * Mark queue item as completed
 */
export async function markQueueItemCompleted(queueId: string) {
    const { error } = await supabase
        .from('enrichment_queue')
        .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
        })
        .eq('id', queueId);

    if (error) {
        console.error('Error marking item as completed:', error);
    }
}

/**
 * Mark queue item as failed
 */
export async function markQueueItemFailed(queueId: string, errorMessage: string) {
    const { data: item } = await supabase
        .from('enrichment_queue')
        .select('retry_count, max_retries')
        .eq('id', queueId)
        .single();

    const retryCount = (item?.retry_count || 0) + 1;
    const status = retryCount >= (item?.max_retries || 3) ? 'failed' : 'pending';

    const { error } = await supabase
        .from('enrichment_queue')
        .update({
            status,
            error_message: errorMessage,
            retry_count: retryCount,
            started_at: null, // Clear started_at for retry
        })
        .eq('id', queueId);

    if (error) {
        console.error('Error marking item as failed:', error);
    }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queueType?: string) {
    let query = supabase
        .from('enrichment_queue')
        .select('status, queue_type');

    if (queueType) {
        query = query.eq('queue_type', queueType);
    }

    const { data } = await query;

    const stats = {
        total: data?.length || 0,
        pending: data?.filter(i => i.status === 'pending').length || 0,
        processing: data?.filter(i => i.status === 'processing').length || 0,
        completed: data?.filter(i => i.status === 'completed').length || 0,
        failed: data?.filter(i => i.status === 'failed').length || 0,
    };

    return stats;
}
