import { supabase } from './lib/supabase';
import { getNextQueueItems, markQueueItemProcessing, markQueueItemCompleted, markQueueItemFailed } from './lib/queue';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10000');
const DRY_RUN = process.env.DRY_RUN === 'true';
const MAX_RUNTIME_MS = 5 * 60 * 60 * 1000;
const TIMEOUT_THRESHOLD = MAX_RUNTIME_MS - 5 * 60 * 1000;

function getTmdbEndpoint(contentType: string): string {
    return contentType === 'movie' ? 'movie' : 'tv';
}

async function checkPauseStatus(): Promise<boolean> {
    const { data, error } = await supabase
        .from('sync_settings')
        .select('setting_value')
        .eq('setting_key', 'cron_status')
        .single();

    if (error) return false;
    return (data?.setting_value as any)?.is_paused === true;
}

async function main() {
    const startTime = Date.now();
    console.log('🔄 Starting Queue-Based Enrichment\n');
    console.log(`Batch Size: ${BATCH_SIZE}`);
    console.log(`Dry Run: ${DRY_RUN}`);
    console.log(`Max Runtime: ${MAX_RUNTIME_MS / 1000 / 60} minutes\n`);

    if (await checkPauseStatus()) {
        console.log('⏸️ Enrichment is paused. Exiting gracefully.');
        return;
    }

    const queueItems = await getNextQueueItems('content', BATCH_SIZE);

    if (queueItems.length === 0) {
        console.log('✅ Queue is empty - nothing to process');
        return;
    }

    console.log(`📋 Found ${queueItems.length} items in queue\n`);

    let processed = 0, enriched = 0, failed = 0;

    for (const queueItem of queueItems) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= TIMEOUT_THRESHOLD) {
            console.log('\n⏰ Approaching timeout threshold - stopping gracefully');
            break;
        }

        if (await checkPauseStatus()) {
            console.log('\n⏸️ Enrichment was paused - stopping gracefully');
            break;
        }

        try {
            await markQueueItemProcessing(queueItem.id);

            const { data: content, error } = await supabase
                .from('content')
                .select('*')
                .eq('id', queueItem.entity_id)
                .single();

            if (error || !content) throw new Error(`Content not found: ${queueItem.entity_id}`);

            console.log(`\n[${processed + 1}/${queueItems.length}] Processing: ${content.title}`);
            console.log(`  TMDB ID: ${content.tmdb_id} | Type: ${content.content_type}`);
            console.log(`  Missing: ${queueItem.metadata.missing_fields?.join(', ') || 'unknown'}`);

            if (DRY_RUN) {
                console.log('  ⏭️  [DRY RUN] Skipping enrichment');
                processed++;
                continue;
            }

            const tmdbEndpoint = getTmdbEndpoint(content.content_type);
            const tmdbUrl = `https://api.themoviedb.org/3/${tmdbEndpoint}/${content.tmdb_id}?append_to_response=credits,keywords,videos,images,watch/providers`;
            const tmdbResponse = await fetch(tmdbUrl, {
                headers: {
                    Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!tmdbResponse.ok) {
                const body = await tmdbResponse.text();
                throw new Error(`TMDB API error: ${tmdbResponse.status} - ${body.substring(0, 100)}`);
            }

            const tmdbData = await tmdbResponse.json();

            const enrichedData: any = {
                overview: tmdbData.overview || content.overview,
                tagline: tmdbData.tagline || content.tagline,
                runtime: tmdbData.runtime || content.runtime,
                tmdb_status: tmdbData.status || content.tmdb_status,
                vote_average: tmdbData.vote_average || content.vote_average,
                vote_count: tmdbData.vote_count || content.vote_count,
                popularity: tmdbData.popularity || content.popularity,
                backdrop_path: tmdbData.backdrop_path || content.backdrop_path,
                poster_path: tmdbData.poster_path || content.poster_path,
            };

            // Best poster from images
            if (tmdbData.images?.posters?.length > 0) {
                const best = tmdbData.images.posters.sort((a: any, b: any) => b.vote_average - a.vote_average)[0];
                enrichedData.main_poster = best.file_path;
            } else {
                enrichedData.main_poster = tmdbData.poster_path || content.main_poster;
            }

            // Videos
            if (tmdbData.videos?.results?.length > 0) {
                const vids = tmdbData.videos.results;
                enrichedData.videos = {
                    trailers: vids.filter((v: any) => v.type === 'Trailer').map((v: any) => ({ key: v.key, name: v.name, site: v.site, type: v.type, official: v.official, published_at: v.published_at })),
                    teasers: vids.filter((v: any) => v.type === 'Teaser').map((v: any) => ({ key: v.key, name: v.name, site: v.site, type: v.type, official: v.official, published_at: v.published_at })),
                    featurettes: vids.filter((v: any) => v.type === 'Featurette').map((v: any) => ({ key: v.key, name: v.name, site: v.site, type: v.type, official: v.official, published_at: v.published_at })),
                };
            }

            // Images
            if (tmdbData.images) {
                enrichedData.images = {
                    posters: tmdbData.images.posters?.slice(0, 15).map((img: any) => ({ file_path: img.file_path, width: img.width, height: img.height, vote_average: img.vote_average, iso_639_1: img.iso_639_1 })) || [],
                    backdrops: tmdbData.images.backdrops?.slice(0, 15).map((img: any) => ({ file_path: img.file_path, width: img.width, height: img.height, vote_average: img.vote_average, iso_639_1: img.iso_639_1 })) || [],
                    logos: tmdbData.images.logos?.slice(0, 5).map((img: any) => ({ file_path: img.file_path, width: img.width, height: img.height, vote_average: img.vote_average, iso_639_1: img.iso_639_1 })) || [],
                };
            }

            if (content.content_type !== 'movie') {
                enrichedData.number_of_episodes = tmdbData.number_of_episodes || content.number_of_episodes;
                enrichedData.number_of_seasons = tmdbData.number_of_seasons || content.number_of_seasons;
                enrichedData.first_air_date = tmdbData.first_air_date || content.first_air_date;
            } else {
                enrichedData.release_date = tmdbData.release_date || content.release_date;
            }

            const { error: updateError } = await supabase.from('content').update(enrichedData).eq('id', content.id);
            if (updateError) throw updateError;

            await markQueueItemCompleted(queueItem.id);
            console.log(`  ✅ Enriched successfully`);
            enriched++;

        } catch (error) {
            const msg = error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : String(error);
            console.error(`  ❌ Failed: ${msg}`);
            await markQueueItemFailed(queueItem.id, msg);
            failed++;
        }

        processed++;
        if (processed < queueItems.length) await new Promise(r => setTimeout(r, 250));
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 ENRICHMENT SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total Processed: ${processed}`);
    console.log(`✅ Enriched: ${enriched}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('═══════════════════════════════════════════════════════\n');

    // Auto-continuation check
    const { count: pendingCount } = await supabase
        .from('enrichment_queue')
        .select('*', { count: 'exact', head: true })
        .eq('queue_type', 'content')
        .eq('status', 'pending');

    if ((pendingCount || 0) > 0) {
        console.log(`📋 ${pendingCount} items still pending - auto-triggering next run...`);
        try {
            const res = await fetch(
                `https://api.github.com/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/actions/workflows/enrich-content.yml/dispatches`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                        Accept: 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ ref: 'main', inputs: { batch_size: BATCH_SIZE.toString(), dry_run: DRY_RUN.toString() } }),
                }
            );
            console.log(res.status === 204 ? '✅ Next run triggered' : `⚠️ Failed to trigger: ${res.status}`);
        } catch (e) {
            console.error('❌ Error triggering next workflow:', e);
        }
    } else {
        console.log('✨ Queue is empty - no auto-continuation needed');
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
