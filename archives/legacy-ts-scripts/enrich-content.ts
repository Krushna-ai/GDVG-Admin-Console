import { supabase } from './lib/supabase';
import { fetchContentDetails } from './lib/tmdb';
import { delay } from './lib/tmdb';
import { getCurrentCycle, checkAndIncrementCycle, updateCycleStats } from './lib/cycle';

/**
 * Batch Enrichment Script for Content
 * Fetches complete TMDB data for ALL content items
 * 
 * Features:
 * - Processes in batches with resume capability
 * - Rate limited (300ms between TMDB calls)
 * - Updates ALL fields including cast, crew, genres, etc.
 * - Progress tracking via sync_logs
 */

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100', 10);
const START_FROM_ID = process.env.START_FROM_ID || null;
const DRY_RUN = process.env.DRY_RUN === 'true';
const RATE_LIMIT_MS = 300;

interface EnrichmentProgress {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
    lastProcessedId: string | null;
}

/**
 * Check if sync is paused in dashboard
 * Exits gracefully if paused
 */
async function checkSyncPauseStatus() {
    try {
        const { data, error } = await supabase
            .from('sync_settings')
            .select('setting_value')
            .eq('setting_key', 'cron_status')
            .single();

        if (error) {
            console.warn('⚠️ Could not check pause status:', error.message);
            console.warn('Proceeding with caution...');
            return;
        }

        const cronStatus = data?.setting_value as any;
        if (cronStatus?.is_paused) {
            console.log('⏸️ Sync is paused. Exiting gracefully.');
            console.log(`📅 Paused at: ${cronStatus.paused_at}`);
            process.exit(0);
        }

        console.log('✅ Sync is active. Proceeding...');
    } catch (err) {
        console.warn('⚠️ Error checking pause status:', err);
        console.warn('Proceeding with caution...');
    }
}

/**
 * Get the last processed content ID for resume capability
 */
async function getLastProcessedId(): Promise<string | null> {
    if (START_FROM_ID) {
        console.log(`📌 Starting from specified ID: ${START_FROM_ID}\n`);
        return START_FROM_ID;
    }

    const { data } = await supabase
        .from('sync_logs')
        .select('metadata')
        .eq('type', 'content_enrichment')
        .not('metadata->last_processed_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (data?.metadata?.last_processed_id) {
        console.log(`📌 Resuming from ID: ${data.metadata.last_processed_id}\n`);
        return data.metadata.last_processed_id;
    }

    console.log('📌 Starting fresh enrichment\n');
    return null;
}

/**
 * Save enrichment progress
 */
async function saveProgress(progress: EnrichmentProgress, status: 'running' | 'completed' | 'failed') {
    await supabase.from('sync_logs').insert({
        type: 'content_enrichment',
        status,
        message: `Processed ${progress.processed}/${progress.total} items (${progress.succeeded} succeeded, ${progress.failed} failed)`,
        details: {
            batch_size: BATCH_SIZE,
            ...progress,
        },
        metadata: {
            last_processed_id: progress.lastProcessedId,
        },
    });
}

/**
 * Calculate quality score for content (0-100)
 */
function calculateContentQuality(details: any): number {
    let score = 0;
    const maxScore = 10;

    // Basic info (4 points)
    if (details.title || details.name) score += 1;
    if (details.original_title || details.original_name) score += 0.5;
    if (details.overview && details.overview.length > 50) score += 1;
    if (details.tagline) score += 0.5;
    if (details.genres && details.genres.length > 0) score += 1;

    // Media (2 points)
    if (details.poster_path) score += 1;
    if (details.backdrop_path) score += 1;

    // Metadata (2 points)
    if (details.vote_average && details.vote_average > 0) score += 0.5;
    if (details.content_rating) score += 0.5;
    if (details.keywords && details.keywords.length > 0) score += 0.5;
    if (details.origin_country && details.origin_country.length > 0) score += 0.5;

    // Rich data (2 points)
    if (details.videos && details.videos.length > 0) score += 1;
    if (details.watch_providers) score += 1;

    return Math.round((score / maxScore) * 100);
}

/**
 * Enrich a single content item
 */
async function enrichContent(contentId: string, tmdbId: number, contentType: 'movie' | 'tv' | 'drama' | 'anime'): Promise<boolean> {
    try {
        // Map content_type to TMDB type
        const tmdbType = contentType === 'movie' ? 'movie' : 'tv';

        // Fetch complete details from TMDB
        const details = await fetchContentDetails(tmdbId, tmdbType);
        if (!details) {
            console.log(`  ❌ Failed to fetch TMDB details for ${tmdbId}`);
            return false;
        }

        if (DRY_RUN) {
            console.log(`  [DRY RUN] Would update ${contentId} with TMDB data`);
            return true;
        }

        // Calculate quality score
        const qualityScore = calculateContentQuality(details);

        // Determine status: auto-publish if quality > 85
        const newStatus = qualityScore > 85 ? 'published' : 'draft';

        // Update content table with ALL fields
        const { error: contentError } = await supabase
            .from('content')
            .update({
                title: details.title || details.name,
                original_title: details.original_title || details.original_name,
                overview: details.overview,
                tagline: details.tagline,
                poster_path: details.poster_path,
                backdrop_path: details.backdrop_path,
                release_date: details.release_date,
                first_air_date: details.first_air_date,
                last_air_date: details.last_air_date,
                status: newStatus, // Auto-publish if quality > 85
                runtime: details.runtime,
                number_of_episodes: details.number_of_episodes,
                number_of_seasons: details.number_of_seasons,
                vote_average: details.vote_average,
                vote_count: details.vote_count,
                popularity: details.popularity,
                genres: details.genres,
                production_companies: details.production_companies,
                production_countries: details.production_countries,
                spoken_languages: details.spoken_languages,
                networks: details.networks,
                homepage: details.homepage,
                in_production: details.in_production,
                updated_at: new Date().toISOString(),
                enriched_at: new Date().toISOString(),
                enrichment_cycle: await getCurrentCycle('content'),
            })
            .eq('id', contentId);

        if (contentError) {
            console.log(`  ❌ Error updating content: ${contentError.message}`);
            return false;
        }

        console.log(`  ✅ Content updated (Quality: ${qualityScore}%, Status: ${newStatus})`);

        // Delete existing cast/crew links (we'll re-import)
        await supabase.from('content_cast').delete().eq('content_id', contentId);
        await supabase.from('content_crew').delete().eq('content_id', contentId);

        // Import cast (top 30)
        if (details.credits?.cast && details.credits.cast.length > 0) {
            const castToImport = details.credits.cast.slice(0, 30);

            for (const castMember of castToImport) {
                // Upsert person
                const { data: person } = await supabase
                    .from('people')
                    .upsert({
                        tmdb_id: castMember.id,
                        name: castMember.name,
                        profile_path: castMember.profile_path,
                        gender: castMember.gender,
                        known_for_department: castMember.known_for_department,
                        popularity: castMember.popularity,
                    }, {
                        onConflict: 'tmdb_id',
                        ignoreDuplicates: false,
                    })
                    .select('id')
                    .single();

                if (person?.id) {
                    // Link to content
                    await supabase.from('content_cast').insert({
                        content_id: contentId,
                        person_id: person.id,
                        character: castMember.character,
                        order_index: castMember.order,
                    });
                }
            }
        }

        // Import crew (directors, writers, producers)
        if (details.credits?.crew && details.credits.crew.length > 0) {
            const importantRoles = ['Director', 'Writer', 'Screenplay', 'Producer', 'Executive Producer', 'Creator'];
            const crewToImport = details.credits.crew.filter((c: any) =>
                importantRoles.some(role => c.job?.includes(role))
            );

            for (const crewMember of crewToImport) {
                // Upsert person
                const { data: person } = await supabase
                    .from('people')
                    .upsert({
                        tmdb_id: crewMember.id,
                        name: crewMember.name,
                        profile_path: crewMember.profile_path,
                        gender: crewMember.gender,
                        known_for_department: crewMember.known_for_department,
                        popularity: crewMember.popularity,
                    }, {
                        onConflict: 'tmdb_id',
                        ignoreDuplicates: false,
                    })
                    .select('id')
                    .single();

                if (person?.id) {
                    // Link to content
                    await supabase.from('content_crew').insert({
                        content_id: contentId,
                        person_id: person.id,
                        job: crewMember.job,
                        department: crewMember.department,
                    });
                }
            }
        }

        return true;

    } catch (error) {
        console.log(`  ❌ Error enriching content: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

/**
 * Main enrichment process
 */
async function main() {
    console.log('🚀 Starting Content Enrichment\n');

    // Check if sync is paused - exit if paused
    await checkSyncPauseStatus();

    console.log(`Batch Size: ${BATCH_SIZE}`);
    console.log(`Dry Run: ${DRY_RUN}\n`);

    const progress: EnrichmentProgress = {
        total: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
        lastProcessedId: null,
    };

    try {
        // Get current enrichment cycle
        const currentCycle = await getCurrentCycle('content');
        console.log(`📊 Current Enrichment Cycle: ${currentCycle}`);

        // Get starting point
        const lastProcessedId = await getLastProcessedId();

        // Fetch content to enrich (prioritize items behind current cycle)
        let query = supabase
            .from('content')
            .select('id, tmdb_id, title, content_type, enrichment_cycle')
            .lt('enrichment_cycle', currentCycle)
            .order('enriched_at', { ascending: true, nullsFirst: true })
            .order('popularity', { ascending: false })
            .limit(BATCH_SIZE);

        if (lastProcessedId) {
            query = query.gt('id', lastProcessedId);
        }

        const { data: contentBatch, error } = await query;

        if (error || !contentBatch) {
            throw new Error(`Failed to fetch content: ${error?.message}`);
        }

        progress.total = contentBatch.length;
        console.log(`📦 Processing ${contentBatch.length} content items\n`);

        if (contentBatch.length === 0) {
            console.log('✅ All content in current cycle complete!\n');
            await checkAndIncrementCycle('content');
            console.log('Check back later for next cycle.\n');
            return;
        }

        // Process each content item
        for (const content of contentBatch) {
            progress.processed++;
            console.log(`\n[${progress.processed}/${progress.total}] ${content.title} (TMDB: ${content.tmdb_id})`);

            const success = await enrichContent(content.id, content.tmdb_id, content.content_type);

            if (success) {
                progress.succeeded++;
                console.log(`  ✅ Successfully enriched`);
            } else {
                progress.failed++;
            }

            progress.lastProcessedId = content.id;

            // Rate limiting
            await delay(RATE_LIMIT_MS);

            // Save progress every 10 items
            if (progress.processed % 10 === 0) {
                await saveProgress(progress, 'running');
            }
        }

        // Final progress save
        await saveProgress(progress, 'completed');

        // Update cycle stats and check for completion
        await updateCycleStats('content');
        await checkAndIncrementCycle('content');

        console.log('\n' + '='.repeat(60));
        console.log('📊 FINAL SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Processed: ${progress.processed}`);
        console.log(`✅ Succeeded: ${progress.succeeded}`);
        console.log(`❌ Failed: ${progress.failed}`);
        console.log(`Success Rate: ${Math.round((progress.succeeded / progress.processed) * 100)}%`);
        console.log('='.repeat(60) + '\n');

    } catch (error) {
        console.error('\n❌ Enrichment failed:', error);
        await saveProgress(progress, 'failed');
        process.exit(1);
    }
}

main();
