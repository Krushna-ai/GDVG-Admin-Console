import { createClient } from '@supabase/supabase-js';

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
 * Process an import job by fetching content from TMDB and importing it
 */
export async function processImportJob(jobId: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const tmdbAccessToken = process.env.TMDB_ACCESS_TOKEN!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Get job details
        const { data: job, error: jobError } = await supabase
            .from('import_jobs')
            .select('*')
            .eq('id', jobId)
            .single();

        if (jobError || !job) {
            throw new Error('Job not found');
        }

        const config: ImportJobConfig = job.config;

        // Update job status to 'processing'
        await supabase
            .from('import_jobs')
            .update({ status: 'processing', started_at: new Date().toISOString() })
            .eq('id', jobId);

        // Determine content types to process
        const contentTypes = config.content_type === 'both'
            ? ['movie', 'tv']
            : [config.content_type];

        let totalProcessed = 0;
        let totalImported = 0;
        const maxItems = config.max_items || 500;

        // Process each content type
        for (const type of contentTypes) {
            let page = 1;
            let keepFetching = true;

            while (keepFetching && totalProcessed < maxItems) {
                // Build TMDB Discover API params
                const params = new URLSearchParams({
                    page: page.toString(),
                    with_origin_country: config.origin_countries.join('|'),
                    'vote_count.gte': '10',
                });

                if (config.min_popularity) {
                    params.append('vote_average.gte', (config.min_popularity / 10).toString());
                }

                if (config.release_date_from) {
                    const dateKey = type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
                    params.append(dateKey, config.release_date_from);
                }

                if (config.release_date_to) {
                    const dateKey = type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
                    params.append(dateKey, config.release_date_to);
                }

                if (config.genres && config.genres.length > 0) {
                    params.append('with_genres', config.genres.join(','));
                }

                // Sort by popularity
                const sortOrder = (config.popularity_priority || 50) > 50 ? 'desc' : 'asc';
                params.append('sort_by', `popularity.${sortOrder}`);

                // Fetch from TMDB
                const endpoint = type === 'movie' ? 'discover/movie' : 'discover/tv';
                const url = `https://api.themoviedb.org/3/${endpoint}?${params}`;

                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Bearer ${tmdbAccessToken}`,
                        'Content-Type': 'application/json',
                    },
                });
                if (!response.ok) {
                    console.error('TMDB API error:', response.statusText);
                    break;
                }

                const data = await response.json();
                const results = data.results || [];

                if (results.length === 0) {
                    keepFetching = false;
                    break;
                }

                // Process batch of 20 items
                for (const item of results.slice(0, 20)) {
                    if (totalProcessed >= maxItems) {
                        keepFetching = false;
                        break;
                    }

                    // Check for duplicates if enabled
                    if (config.check_duplicates) {
                        const { data: existing } = await supabase
                            .from('content')
                            .select('id')
                            .eq('tmdb_id', item.id)
                            .single();

                        if (existing && !config.update_existing) {
                            totalProcessed++;
                            continue; // Skip duplicate
                        }
                    }

                    // Fetch full details from TMDB
                    const detailsUrl = `https://api.themoviedb.org/3/${type}/${item.id}`;
                    const detailsResponse = await fetch(detailsUrl, {
                        headers: {
                            'Authorization': `Bearer ${tmdbAccessToken}`,
                            'Content-Type': 'application/json',
                        },
                    });

                    if (!detailsResponse.ok) {
                        totalProcessed++;
                        continue;
                    }

                    const details = await detailsResponse.json();

                    // Prepare content data
                    const contentData = {
                        tmdb_id: details.id,
                        content_type: type,
                        title: type === 'movie' ? details.title : details.name,
                        original_title: type === 'movie' ? details.original_title : details.original_name,
                        overview: details.overview,
                        release_date: type === 'movie' ? details.release_date : details.first_air_date,
                        poster_path: details.poster_path,
                        backdrop_path: details.backdrop_path,
                        vote_average: details.vote_average,
                        vote_count: details.vote_count,
                        popularity: details.popularity,
                        genre_ids: details.genres?.map((g: any) => g.id) || [],
                        origin_countries: type === 'movie'
                            ? details.production_countries?.map((c: any) => c.iso_3166_1) || []
                            : details.origin_country || [],
                        original_language: details.original_language,
                        adult: details.adult,
                        status: details.status,
                        runtime: type === 'movie' ? details.runtime : null,
                        number_of_seasons: type === 'tv' ? details.number_of_seasons : null,
                        number_of_episodes: type === 'tv' ? details.number_of_episodes : null,
                    };

                    // Upsert to content table
                    const { error: upsertError } = await supabase
                        .from('content')
                        .upsert(contentData, { onConflict: 'tmdb_id' });

                    if (!upsertError) {
                        totalImported++;
                    }

                    totalProcessed++;

                    // Update progress every 20 items
                    if (totalProcessed % 20 === 0) {
                        await supabase
                            .from('import_jobs')
                            .update({
                                processed_items: totalProcessed,
                                total_items: totalImported,
                                progress: Math.round((totalProcessed / maxItems) * 100),
                            })
                            .eq('id', jobId);
                    }

                    // Rate limiting: 250ms delay between requests
                    await new Promise(resolve => setTimeout(resolve, 250));
                }

                page++;
            }
        }

        // Mark job as completed
        await supabase
            .from('import_jobs')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                processed_items: totalProcessed,
                total_items: totalImported,
                progress: 100,
            })
            .eq('id', jobId);

        // Log completion
        await supabase.from('sync_logs').insert({
            type: 'bulk_import',
            status: 'success',
            message: `Bulk import completed: ${totalImported} items imported`,
            details: { job_id: jobId, imported: totalImported, processed: totalProcessed },
            created_at: new Date().toISOString(),
        });

        return { success: true, imported: totalImported, processed: totalProcessed };

    } catch (error) {
        console.error('Import job processing error:', error);

        // Mark job as failed
        await supabase
            .from('import_jobs')
            .update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Unknown error',
            })
            .eq('id', jobId);

        // Log failure
        await supabase.from('sync_logs').insert({
            type: 'bulk_import',
            status: 'error',
            message: `Bulk import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: { job_id: jobId, error: String(error) },
            created_at: new Date().toISOString(),
        });

        throw error;
    }
}
