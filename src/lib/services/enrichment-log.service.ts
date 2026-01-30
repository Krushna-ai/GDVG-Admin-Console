import { createClient } from '@/lib/supabase/server';

// Interfaces matching sync_logs table schema
export interface EnrichmentLog {
    id: string;
    sync_type: string;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    summary: Record<string, any>;
    metadata: Record<string, any>;
    error_details: string[] | null;
    triggered_by: string | null;
    started_at: string;
    completed_at: string | null;
}

export interface EnrichmentSummary {
    total_processed: number;
    succeeded: number;
    failed: number;
    last_processed_id: string | null;
}

/**
 * Fetch enrichment logs from sync_logs table
 */
export async function getEnrichmentLogs(limit: number = 20): Promise<EnrichmentLog[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('sync_type', 'content_enrichment')
        .order('started_at', { ascending: false })
        .limit(limit);

    if (error || !data) return [];

    return data as EnrichmentLog[];
}

/**
 * Fetch the most recent enrichment run
 */
export async function getLatestEnrichmentRun(): Promise<EnrichmentLog | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('sync_type', 'content_enrichment')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) return null;

    return data as EnrichmentLog;
}

/**
 * Extract summary stats from enrichment log
 */
export function extractEnrichmentSummary(log: EnrichmentLog): EnrichmentSummary {
    const details = log.summary || {};

    return {
        total_processed: details.processed || 0,
        succeeded: details.succeeded || 0,
        failed: details.failed || 0,
        last_processed_id: log.metadata?.last_processed_id || null,
    };
}
