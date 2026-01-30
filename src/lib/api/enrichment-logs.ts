// Client-side API helpers for enrichment logs

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

export async function getEnrichmentLogs(limit: number = 20): Promise<EnrichmentLog[]> {
    try {
        const res = await fetch(`/api/sync/logs?limit=${limit}`);
        if (!res.ok) return [];

        const { data } = await res.json();
        const logs = data || [];

        // Filter for content_enrichment logs
        return logs.filter((log: any) => log.sync_type === 'content_enrichment');
    } catch {
        return [];
    }
}

export async function getLatestEnrichmentRun(): Promise<EnrichmentLog | null> {
    try {
        const logs = await getEnrichmentLogs(1);
        return logs[0] || null;
    } catch {
        return null;
    }
}

export function extractEnrichmentSummary(log: EnrichmentLog): EnrichmentSummary {
    const details = log.summary || {};

    return {
        total_processed: details.processed || 0,
        succeeded: details.succeeded || 0,
        failed: details.failed || 0,
        last_processed_id: log.metadata?.last_processed_id || null,
    };
}
