// Client-side API helpers for import jobs

export interface ImportJobConfig {
    content_type: 'movie' | 'tv' | 'both';
    origin_countries: string[];
    max_items?: number;
    min_popularity?: number;
    release_date_from?: string;
    release_date_to?: string;
    genres?: number[];
    check_duplicates?: boolean;
    update_existing?: boolean;
    popularity_priority?: number;
}

export interface ImportJobProgress {
    processed: number;
    total: number;
    percentage: number;
}

export interface ImportJob {
    id: string;
    name: string;
    configuration: ImportJobConfig;
    status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
    progress: ImportJobProgress;
    priority: number;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    created_by: string;
    error_log: string[] | null;
}

export async function getImportJobs(status?: string): Promise<ImportJob[]> {
    try {
        const url = status ? `/api/import/jobs?status=${status}` : '/api/import/jobs';
        const res = await fetch(url);
        if (!res.ok) return [];

        const { data } = await res.json();
        return data || [];
    } catch {
        return [];
    }
}
