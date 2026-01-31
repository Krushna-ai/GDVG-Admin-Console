import { supabase } from './lib/supabase';
import { discoverMovies, discoverTv, delay } from './lib/tmdb';
import { enrichAndSaveContent, checkContentExists, EnrichResult } from './lib/enrich';

/**
 * Process Import Queue Script
 * Runs via GitHub Actions to process pending import jobs
 */

const RATE_LIMIT_MS = 300;

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

interface ImportJob {
    id: string;
    configuration: ImportJobConfig;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: {
        processed: number;
        total: number;
        percentage: number;
    };
    created_at: string;
}

/**
 * Check if sync is paused in dashboard
 * Exits gracefully if paused
 */
async function checkSyncPauseStatus() {
    try {
        const { data, error } = await supabase
            .from('sync_settings')
            .select('is_paused, paused_at')
            .single();

        if (error) {
            console.warn('⚠️ Could not check pause status:', error.message);
            console.warn('Proceeding with caution...');
            return;
        }

        if (data?.is_paused) {
            console.log('⏸️ Sync is paused. Exiting gracefully.');
            console.log(`📅 Paused at: ${data.paused_at}`);
            process.exit(0);
        }

        console.log('✅ Sync is active. Proceeding...');
    } catch (err) {
        console.warn('⚠️ Error checking pause status:', err);
        console.warn('Proceeding with caution...');
    }
}

/**
 * Process a single content import job
 */
async function processJob(job: ImportJob) {
    console.log(`\n📥 Processing Job ${job.id}`);
    console.log(`   Type: ${job.configuration.content_type}`);
    console.log(`   Countries: ${job.configuration.origin_countries.join(', ')}`);

    try {
        // Update status to processing
        await supabase
            .from('import_jobs')
            .update({
                status: job.status,
                started_at: new Date().toISOString()
            })
            .eq('id', job.id);

        const config = job.configuration;
        const maxItems = config.max_items || 500;

        // Initialize progress
        let totalProcessed = job.progress?.processed || 0;
        let totalImported = job.progress?.total || 0;

        // Determine content types to process
        const contentTypes = config.content_type === 'both'
            ? ['movie', 'tv']
            : [config.content_type];

        for (const type of contentTypes) {
            if (totalProcessed >= maxItems) break;

            // Simplify country logic: join them with OR (|) for TMDB discover
            const regionParam = config.origin_countries.join('|');
            let page = 1;

            // We iterate pages until we reach limits
            while (totalProcessed < maxItems) {
                // Build discovery params
                const params: Record<string, string | number> = {
                    page,
                    with_origin_country: regionParam,
                    'vote_count.gte': '10',
                    sort_by: (config.popularity_priority || 50) > 50 ? 'popularity.desc' : 'popularity.asc'
                };

                if (config.min_popularity) {
                    params['vote_average.gte'] = config.min_popularity / 10;
                }

                if (config.release_date_from) {
                    const dateKey = type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
                    params[dateKey] = config.release_date_from;
                }

                if (config.release_date_to) {
                    const dateKey = type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
                    params[dateKey] = config.release_date_to;
                }

                if (config.genres && config.genres.length > 0) {
                    params['with_genres'] = config.genres.join(',');
                }

                // Fetch discovery page
                let results: any[] = [];
                try {
                    const data = type === 'movie'
                        ? await discoverMovies(params)
                        : await discoverTv(params);
                    results = data.results || [];
                } catch (e) {
                    console.error(`   ❌ Discovery error (page ${page}):`, e);
                    break;
                }

                if (results.length === 0) {
                    console.log(`   ⚠️ No more results for ${type} on page ${page}`);
                    break;
                }

                let pageProcessed = 0;

                for (const item of results) {
                    if (totalProcessed >= maxItems) break;

                    const tmdbId = item.id;
                    const contentType = type as 'movie' | 'tv';

                    // Check duplicate logic
                    if (config.check_duplicates) {
                        const exists = await checkContentExists(tmdbId, contentType);
                        if (exists && !config.update_existing) {
                            totalProcessed++;
                            pageProcessed++;
                            process.stdout.write('.'); // progress dot
                            continue;
                        }
                    }

                    // Import content
                    const enrichResult: EnrichResult = await enrichAndSaveContent(tmdbId, contentType);

                    if (enrichResult.success) {
                        totalImported++;
                        process.stdout.write('✅');
                    } else {
                        process.stdout.write('❌');
                    }

                    totalProcessed++;
                    pageProcessed++;

                    // Rate limiting
                    await delay(RATE_LIMIT_MS);

                    // Update progress every 20 items
                    if (totalProcessed % 20 === 0) {
                        const progressPercent = Math.min(100, Math.round((totalProcessed / maxItems) * 100));
                        await supabase
                            .from('import_jobs')
                            .update({
                                progress: {
                                    processed: totalProcessed,
                                    total: totalImported,
                                    percentage: progressPercent
                                }
                            })
                            .eq('id', job.id);

                        console.log(`   progress: ${progressPercent}% (${totalProcessed}/${maxItems})`);
                    }
                }

                if (pageProcessed === 0) {
                    // Safety break
                }

                page++;
                await delay(500); // Delay between pages
            }
        }

        // Complete job
        console.log(`\n   ✅ Job ${job.id} Completed! Imported: ${totalImported}`);
        await supabase
            .from('import_jobs')
            .update({
                status: 'completed',
                progress: {
                    processed: totalProcessed,
                    total: totalImported,
                    percentage: 100
                },
                completed_at: new Date().toISOString()
            })
            .eq('id', job.id);

    } catch (error) {
        console.error(`\n   ❌ Job ${job.id} Failed:`, error);
        await supabase
            .from('import_jobs')
            .update({
                status: 'failed',
                error_log: [String(error)], // Use error_log array
                completed_at: new Date().toISOString()
            })
            .eq('id', job.id);
    }
}

/**
 * Main function - poll and process
 */
async function main() {
    console.log('🚀 Checking for pending import jobs...');

    // Check if sync is paused - exit if paused
    await checkSyncPauseStatus();


    try {
        // Fetch queued jobs
        const { data: jobs, error } = await supabase
            .from('import_jobs')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1); // Process one by one to avoid conflicts if multiple runners

        if (error) throw error;

        if (!jobs || jobs.length === 0) {
            console.log('✅ No pending jobs found.');
            return;
        }

        console.log(`📦 Found ${jobs.length} pending job(s)`);

        for (const job of jobs) {
            await processJob(job as any);
        }

    } catch (error) {
        console.error('❌ Error checking jobs:', error);
        process.exit(1);
    }
}

main();
