import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface ImportJobConfig {
    content_type: 'movie' | 'tv' | 'both';
    origin_countries: string[];
    min_popularity?: number;
    max_items?: number;
    release_date_from?: string;
    release_date_to?: string;
    genres?: number[];
    popularity_priority?: number;
    check_duplicates?: boolean;
    update_existing?: boolean;
}

/**
 * Create a new import job (Queue only)
 * The actual processing is handled by GitHub Actions (scripts/process-imports.ts)
 */
export async function createImportJob(config: ImportJobConfig, createdBy: string) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
        .from('import_jobs')
        .insert({
            configuration: config,
            status: 'pending',
            progress: { processed: 0, total: 0, percentage: 0 },
            created_by: createdBy, // This must be a UUID
            name: `Import ${config.content_type} (${config.origin_countries.join(',')})`,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating import job:', error);
        throw error;
    }

    return data;
}

/**
 * Process an import job
 * @deprecated Processing has moved to GitHub Actions. This function now logs a warning.
 */
export async function processImportJob(jobId: string) {
    console.warn('⚠️ processImportJob is deprecated. Jobs are now processed by GitHub Actions.');
    return { success: true, message: 'Job queued for background processing.' };
}
