import { supabase } from './supabase';

export async function addToEnrichmentQueue(
    entityId: string,
    queueType: 'content' | 'people' | 'quality',
    priority = 1,
    metadata: Record<string, any> = {}
): Promise<boolean> {
    const { data: existing } = await supabase
        .from('enrichment_queue')
        .select('id')
        .eq('entity_id', entityId)
        .eq('queue_type', queueType)
        .in('status', ['pending', 'processing'])
        .single();

    if (existing) return false;

    const { error } = await supabase.from('enrichment_queue').insert({
        entity_id: entityId,
        queue_type: queueType,
        priority,
        status: 'pending',
        metadata,
        retry_count: 0,
        max_retries: 3,
    });

    return !error;
}

export async function getNextQueueItems(
    queueType: 'content' | 'people' | 'quality',
    limit = 10000
) {
    const { data, error } = await supabase
        .from('enrichment_queue')
        .select('id, entity_id, queue_type, priority, retry_count, max_retries, metadata')
        .eq('queue_type', queueType)
        .eq('status', 'pending')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) {
        console.error('Error fetching queue items:', error);
        return [];
    }
    return data || [];
}

export async function markQueueItemProcessing(queueId: string) {
    await supabase
        .from('enrichment_queue')
        .update({ status: 'processing', started_at: new Date().toISOString() })
        .eq('id', queueId);
}

export async function markQueueItemCompleted(queueId: string) {
    await supabase
        .from('enrichment_queue')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', queueId);
}

export async function markQueueItemFailed(queueId: string, errorMessage: string) {
    const { data: item } = await supabase
        .from('enrichment_queue')
        .select('retry_count, max_retries')
        .eq('id', queueId)
        .single();

    const retryCount = (item?.retry_count || 0) + 1;
    const status = retryCount >= (item?.max_retries || 3) ? 'failed' : 'pending';

    await supabase
        .from('enrichment_queue')
        .update({ status, error_message: errorMessage, retry_count: retryCount, started_at: null })
        .eq('id', queueId);
}

export async function getQueueStats(queueType?: string) {
    let query = supabase.from('enrichment_queue').select('status, queue_type');
    if (queueType) query = query.eq('queue_type', queueType);

    const { data } = await query;
    return {
        total: data?.length || 0,
        pending: data?.filter(i => i.status === 'pending').length || 0,
        processing: data?.filter(i => i.status === 'processing').length || 0,
        completed: data?.filter(i => i.status === 'completed').length || 0,
        failed: data?.filter(i => i.status === 'failed').length || 0,
    };
}
