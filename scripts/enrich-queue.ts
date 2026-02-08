import { supabase } from './lib/supabase';
import { getNextQueueItems, markQueueItemProcessing, markQueueItemCompleted, markQueueItemFailed } from './lib/queue';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10000'); // No practical limit - auto-continuation handles large queues
const DRY_RUN = process.env.DRY_RUN === 'true';
const MAX_RUNTIME_MS = 5 * 60 * 60 * 1000; // 5 hours
const SAFETY_BUFFER_MS = 5 * 60 * 1000; // 5 minute safety buffer
const TIMEOUT_THRESHOLD = MAX_RUNTIME_MS - SAFETY_BUFFER_MS;

/**
 * Check if enrichment is paused
 */
async function checkPauseStatus(): Promise<boolean> {
    const { data, error } = await supabase
        .from('sync_settings')
        .select('setting_value')
        .eq('setting_key', 'cron_status')
        .single();

    if (error) {
        console.warn('⚠️ Could not check pause status:', error.message);
        return false;
    }

    const cronStatus = data?.setting_value as any;
    return cronStatus?.is_paused === true;
}

/**
 * Map database content_type to TMDB API endpoint
 * TMDB only has /movie/ and /tv/ endpoints
 * Drama and anime are categorized as TV shows on TMDB
 */
function getTmdbEndpoint(contentType: string): string {
    switch (contentType) {
        case 'movie':
            return 'movie';
        case 'tv':
        case 'drama':
        case 'anime':
        default:
            return 'tv';
    }
}

/**
 * Queue-based enrichment script
 * Processes items from enrichment_queue table
 */
async function main() {
    const startTime = Date.now();
    console.log('🔄 Starting Queue-Based Enrichment\\n');
    console.log(`Batch Size: ${BATCH_SIZE}`);
    console.log(`Dry Run: ${DRY_RUN}`);
    console.log(`Max Runtime: ${MAX_RUNTIME_MS / 1000 / 60} minutes`);
    console.log(`Safety Buffer: ${SAFETY_BUFFER_MS / 1000 / 60} minutes\\n`);

    // Check pause status before starting
    const isPaused = await checkPauseStatus();
    if (isPaused) {
        console.log('⏸️ Enrichment is paused. Exiting gracefully.');
        return;
    }

    // Get pending items from queue
    const queueItems = await getNextQueueItems('content', BATCH_SIZE);

    if (queueItems.length === 0) {
        console.log('✅ Queue is empty - nothing to process');
        return;
    }

    console.log(`📋 Found ${queueItems.length} items in queue\\n`);

    let processed = 0;
    let enriched = 0;
    let failed = 0;

    for (const queueItem of queueItems) {
        // Check if approaching timeout
        const elapsed = Date.now() - startTime;
        if (elapsed >= TIMEOUT_THRESHOLD) {
            console.log('\\n⏰ Approaching timeout threshold - stopping gracefully');
            console.log(`Elapsed: ${Math.round(elapsed / 1000 / 60)} minutes`);
            break;
        }

        // Check pause status periodically
        const isPausedNow = await checkPauseStatus();
        if (isPausedNow) {
            console.log('\\n⏸️ Enrichment was paused - stopping gracefully');
            break;
        }

        try {
            // Mark as processing
            await markQueueItemProcessing(queueItem.id);

            // Fetch content details
            const { data: content, error } = await supabase
                .from('content')
                .select('*')
                .eq('id', queueItem.entity_id)
                .single();

            if (error || !content) {
                throw new Error(`Content not found: ${queueItem.entity_id}`);
            }

            console.log(`\n[${processed + 1}/${queueItems.length}] Processing: ${content.title}`);
            console.log(`  TMDB ID: ${content.tmdb_id} | Type: ${content.content_type}`);
            console.log(`  TMDB Endpoint: /${getTmdbEndpoint(content.content_type)}/${content.tmdb_id}`);
            console.log(`  Missing: ${queueItem.metadata.missing_fields?.join(', ') || 'unknown'}`);

            if (DRY_RUN) {
                console.log('  ⏭️  [DRY RUN] Skipping enrichment');
                processed++;
                continue;
            }

            // Fetch from TMDB API with comprehensive media
            const tmdbEndpoint = getTmdbEndpoint(content.content_type);
            const tmdbUrl = `https://api.themoviedb.org/3/${tmdbEndpoint}/${content.tmdb_id}?append_to_response=credits,keywords,videos,images`;
            const tmdbResponse = await fetch(tmdbUrl, {
                headers: {
                    'Authorization': `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!tmdbResponse.ok) {
                const errorBody = await tmdbResponse.text();
                console.error(`  TMDB Error Response: ${errorBody}`);
                throw new Error(`TMDB API error: ${tmdbResponse.status} - ${errorBody.substring(0, 100)}`);
            }

            const tmdbData = await tmdbResponse.json();

            // Prepare enriched data
            const enrichedData: any = {
                overview: tmdbData.overview || content.overview,
                tagline: tmdbData.tagline || content.tagline,
                runtime: tmdbData.runtime || content.runtime,
                tmdb_status: tmdbData.status || content.tmdb_status, // TMDB production status (Released, Ended, etc.)
                vote_average: tmdbData.vote_average || content.vote_average,
                vote_count: tmdbData.vote_count || content.vote_count,
                popularity: tmdbData.popularity || content.popularity,
                backdrop_path: tmdbData.backdrop_path || content.backdrop_path,
                poster_path: tmdbData.poster_path || content.poster_path,
            };

            // NEW: Set main poster (prioritize highest rated poster, fallback to poster_path)
            if (tmdbData.images?.posters && tmdbData.images.posters.length > 0) {
                const bestPoster = tmdbData.images.posters.sort((a: any, b: any) => b.vote_average - a.vote_average)[0];
                enrichedData.main_poster = bestPoster.file_path;
            } else {
                enrichedData.main_poster = tmdbData.poster_path || content.main_poster;
            }

            // NEW: Store all videos (trailers, teasers, interviews, featurettes)
            if (tmdbData.videos?.results && tmdbData.videos.results.length > 0) {
                const videos = tmdbData.videos.results;
                enrichedData.videos = {
                    trailers: videos.filter((v: any) => v.type === 'Trailer').map((v: any) => ({
                        key: v.key,
                        name: v.name,
                        site: v.site,
                        type: v.type,
                        official: v.official,
                        published_at: v.published_at
                    })),
                    teasers: videos.filter((v: any) => v.type === 'Teaser').map((v: any) => ({
                        key: v.key,
                        name: v.name,
                        site: v.site,
                        type: v.type,
                        official: v.official,
                        published_at: v.published_at
                    })),
                    interviews: videos.filter((v: any) => v.type === 'Behind the Scenes' || v.type === 'Interview').map((v: any) => ({
                        key: v.key,
                        name: v.name,
                        site: v.site,
                        type: v.type,
                        official: v.official,
                        published_at: v.published_at
                    })),
                    featurettes: videos.filter((v: any) => v.type === 'Featurette').map((v: any) => ({
                        key: v.key,
                        name: v.name,
                        site: v.site,
                        type: v.type,
                        official: v.official,
                        published_at: v.published_at
                    }))
                };
            }

            // NEW: Store all images (posters, backdrops, logos)
            if (tmdbData.images) {
                enrichedData.images = {
                    posters: tmdbData.images.posters?.slice(0, 15).map((img: any) => ({
                        file_path: img.file_path,
                        width: img.width,
                        height: img.height,
                        vote_average: img.vote_average,
                        iso_639_1: img.iso_639_1
                    })) || [],
                    backdrops: tmdbData.images.backdrops?.slice(0, 15).map((img: any) => ({
                        file_path: img.file_path,
                        width: img.width,
                        height: img.height,
                        vote_average: img.vote_average,
                        iso_639_1: img.iso_639_1
                    })) || [],
                    logos: tmdbData.images.logos?.slice(0, 5).map((img: any) => ({
                        file_path: img.file_path,
                        width: img.width,
                        height: img.height,
                        vote_average: img.vote_average,
                        iso_639_1: img.iso_639_1
                    })) || []
                };
            }

            if (content.content_type === 'tv') {
                enrichedData.number_of_episodes = tmdbData.number_of_episodes || content.number_of_episodes;
                enrichedData.number_of_seasons = tmdbData.number_of_seasons || content.number_of_seasons;
                enrichedData.first_air_date = tmdbData.first_air_date || content.first_air_date;
            } else {
                enrichedData.release_date = tmdbData.release_date || content.release_date;
            }

            // Update content in database
            const { error: updateError } = await supabase
                .from('content')
                .update(enrichedData)
                .eq('id', content.id);

            if (updateError) {
                throw updateError;
            }

            // Mark as completed
            await markQueueItemCompleted(queueItem.id);

            console.log(`  ✅ Enriched successfully`);
            enriched++;

        } catch (error) {
            // Handle all possible error types
            let errorMessage: string;
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'object' && error !== null) {
                errorMessage = JSON.stringify(error);
            } else {
                errorMessage = String(error);
            }
            console.error(`  ❌ Failed: ${errorMessage}`);

            // Mark as failed (will retry if under max_retries)
            await markQueueItemFailed(queueItem.id, errorMessage);
            failed++;
        }

        processed++;

        // Rate limiting: Sleep 250ms between requests
        if (processed < queueItems.length) {
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 ENRICHMENT SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total Processed: ${processed}`);
    console.log(`✅ Enriched: ${enriched}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('═══════════════════════════════════════════════════════\n');

    // Auto-continuation: Check if there are more pending items
    const { count: pendingCount } = await supabase
        .from('enrichment_queue')
        .select('*', { count: 'exact', head: true })
        .eq('queue_type', 'content')
        .eq('status', 'pending');

    const actualPendingCount = pendingCount || 0;

    if (actualPendingCount > 0) {
        console.log(`📋 ${actualPendingCount} items still pending in queue`);
        console.log('🔄 Auto-triggering next enrichment run...\n');

        try {
            // Trigger workflow via GitHub API
            const response = await fetch(
                `https://api.github.com/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/actions/workflows/enrich-content.yml/dispatches`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        ref: 'main',
                        inputs: {
                            batch_size: BATCH_SIZE.toString(),
                            dry_run: DRY_RUN.toString(),
                        },
                    }),
                }
            );

            if (response.status === 204) {
                console.log('✅ Next enrichment workflow triggered successfully');
            } else {
                console.warn(`⚠️ Failed to trigger workflow: ${response.status}`);
            }
        } catch (error) {
            console.error('❌ Error triggering next workflow:', error);
        }
    } else {
        console.log('✨ Queue is empty - no auto-continuation needed');
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
