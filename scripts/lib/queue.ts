import { supabase } from './supabase';

/**
 * Add content to enrichment queue
 * @param entityId - UUID of entity to enrich
 * @param queueType - Type of enrichment (content, people, quality)
 * @param priority - Number of missing fields (used for priority)
 * @param metadata - Optional metadata in JSON format
 */
export async function addToEnrichmentQueue(
    entityId: string,
    queueType: 'content' | 'people' | 'quality',
    priority: number = 1,
    metadata: Record<string, any> = {}
): Promise<boolean> {
    try {
        // Check if already in queue (pending or processing)
        const { data: existing } = await supabase
            .from('enrichment_queue')
            .select('id')
            .eq('entity_id', entityId)
            .eq('queue_type', queueType)
            .in('status', ['pending', 'processing'])
            .single();

        if (existing) {
            console.log(`⏭️  Already in queue: ${entityId}`);
            return false;
        }

        const { error } = await supabase
            .from('enrichment_queue')
            .insert({
                entity_id: entityId,
                queue_type: queueType,
                priority,
                status: 'pending',
                metadata,
                retry_count: 0,
                max_retries: 3,
            });

        if (error) {
            console.error('Error adding to queue:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Exception adding to queue:', error);
        return false;
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
            entity_id,
            queue_type,
            priority,
            retry_count,
            max_retries,
            metadata
        `)
        .eq('queue_type', queueType)
        .eq('status', 'pending')
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
