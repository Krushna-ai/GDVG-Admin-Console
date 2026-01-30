import { createClient } from '@/lib/supabase/server';

// Interfaces matching import_jobs table schema
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

/**
 * Fetch import jobs with optional status filter
 */
export async function getImportJobs(status?: string): Promise<ImportJob[]> {
    const supabase = await createClient();

    let query = supabase
        .from('import_jobs')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

    if (status) {
        query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error || !data) return [];

    return data as ImportJob[];
}

/**
 * Fetch a single import job by ID
 */
export async function getImportJobById(id: string): Promise<ImportJob | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) return null;

    return data as ImportJob;
}

/**
 * Get active (pending or running) import jobs
 */
export async function getActiveImportJobs(): Promise<ImportJob[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .in('status', ['pending', 'running'])
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data as ImportJob[];
}
