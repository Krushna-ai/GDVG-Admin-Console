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

            console.log(`\\n[${processed + 1}/${queueItems.length}] Processing: ${content.title}`);
            console.log(`  TMDB ID: ${content.tmdb_id} | Type: ${content.content_type}`);
            console.log(`  Missing: ${queueItem.metadata.missing_fields?.join(', ') || 'unknown'}`);

            if (DRY_RUN) {
                console.log('  ⏭️  [DRY RUN] Skipping enrichment');
                processed++;
                continue;
            }

            // Fetch from TMDB API
            const tmdbUrl = `https://api.themoviedb.org/3/${content.content_type}/${content.tmdb_id}?append_to_response=credits,keywords`;
            const tmdbResponse = await fetch(tmdbUrl, {
                headers: {
                    'Authorization': `Bearer ${process.env.TMDB_API_READ_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!tmdbResponse.ok) {
                throw new Error(`TMDB API error: ${tmdbResponse.status}`);
            }

            const tmdbData = await tmdbResponse.json();

            // Prepare enriched data
            const enrichedData: any = {
                overview: tmdbData.overview || content.overview,
                tagline: tmdbData.tagline || content.tagline,
                runtime: tmdbData.runtime || content.runtime,
                status: tmdbData.status || content.status,
                vote_average: tmdbData.vote_average || content.vote_average,
                vote_count: tmdbData.vote_count || content.vote_count,
                popularity: tmdbData.popularity || content.popularity,
                backdrop_path: tmdbData.backdrop_path || content.backdrop_path,
                poster_path: tmdbData.poster_path || content.poster_path,
            };

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
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
