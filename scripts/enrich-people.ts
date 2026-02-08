import { supabase } from './lib/supabase';
import { delay } from './lib/tmdb';
import { getPersonBioMultiVariant } from './lib/wikipedia';

/**
 * Batch Enrichment Script for People
 * Fetches complete TMDB data for ALL people
 * 
 * Features:
 * - Processes in batches with resume capability
 * - Rate limited (300ms between TMDB calls)
 * - Updates biography, birthday, profile_path, etc.
 * - Progress tracking via sync_logs
 */

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '200', 10);
const START_FROM_ID = process.env.START_FROM_ID || null;
const DRY_RUN = process.env.DRY_RUN === 'true';
const RATE_LIMIT_MS = 300;
const TMDB_ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN!;

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
 * Fetch person details from TMDB
 */
async function fetchPersonDetails(tmdbId: number): Promise<any | null> {
    try {
        const response = await fetch(
            `https://api.themoviedb.org/3/person/${tmdbId}?append_to_response=combined_credits,external_ids,images,tagged_images`,
            {
                headers: {
                    Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!response.ok) {
            console.log(`  ⚠️  TMDB API error: ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.log(`  ❌ Fetch error: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/**
 * Get the last processed person ID for resume capability
 */
async function getLastProcessedId(): Promise<string | null> {
    if (START_FROM_ID) {
        console.log(`📌 Starting from specified ID: ${START_FROM_ID}\n`);
        return START_FROM_ID;
    }

    const { data } = await supabase
        .from('sync_logs')
        .select('metadata')
        .eq('type', 'people_enrichment')
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
        type: 'people_enrichment',
        status,
        message: `Processed ${progress.processed}/${progress.total} people (${progress.succeeded} succeeded, ${progress.failed} failed)`,
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
 * Enrich a single person
 */
async function enrichPerson(personId: string, tmdbId: number, name: string): Promise<boolean> {
    try {
        // Fetch complete details from TMDB
        const details = await fetchPersonDetails(tmdbId);
        if (!details) {
            console.log(`  ❌ Failed to fetch TMDB details for ${tmdbId}`);
            return false;
        }

        if (DRY_RUN) {
            console.log(`  [DRY RUN] Would update ${personId} with TMDB data`);
            return true;
        }

        // Enrich biography with Wikipedia-first strategy
        console.log(`  🌐 Enriching biography for ${name}...`);
        let biography = details.biography;
        let bio_source = 'tmdb';
        let wikipedia_url: string | undefined;

        try {
            const wikiSummary = await getPersonBioMultiVariant(name, 'en');
            if (wikiSummary && wikiSummary.extract) {
                biography = wikiSummary.extract;
                bio_source = 'wikipedia';
                wikipedia_url = wikiSummary.page_url;
                console.log(`    ✅ Wikipedia bio (${wikiSummary.extract.length} chars)`);
            } else if (details.biography) {
                console.log(`    ↩️  Using TMDB bio`);
            } else {
                bio_source = 'none';
                console.log(`    ℹ️  No biography available`);
            }
        } catch (error) {
            console.log(`    ⚠️  Wikipedia fetch failed, using TMDB`);
        }

        // NEW: Process images from TMDB
        let main_profile_photo = details.profile_path;
        let images = null;

        if (details.images) {
            // Set main profile photo (prioritize highest rated profile, fallback to profile_path)
            if (details.images.profiles && details.images.profiles.length > 0) {
                const bestProfile = details.images.profiles.sort((a: any, b: any) => b.vote_average - a.vote_average)[0];
                main_profile_photo = bestProfile.file_path;
            }

            // Store all profile photos and tagged images
            images = {
                profiles: details.images.profiles?.slice(0, 10).map((img: any) => ({
                    file_path: img.file_path,
                    width: img.width,
                    height: img.height,
                    vote_average: img.vote_average,
                    aspect_ratio: img.aspect_ratio
                })) || [],
                tagged: details.tagged_images?.results?.slice(0, 20).map((img: any) => ({
                    id: img.id,
                    file_path: img.file_path,
                    width: img.width,
                    height: img.height,
                    vote_average: img.vote_average,
                    media_type: img.media_type,
                    media: img.media ? {
                        id: img.media.id,
                        title: img.media.title || img.media.name,
                        media_type: img.media_type
                    } : null
                })) || []
            };
        }

        // Update people table with ALL fields
        const { error } = await supabase
            .from('people')
            .update({
                name: details.name,
                biography: biography,
                birthday: details.birthday,
                deathday: details.deathday,
                place_of_birth: details.place_of_birth,
                profile_path: details.profile_path,
                main_profile_photo: main_profile_photo, // NEW: Main photo for app UI
                images: images, // NEW: All photos and tagged images
                gender: details.gender,
                known_for_department: details.known_for_department,
                popularity: details.popularity,
                homepage: details.homepage,
                imdb_id: details.external_ids?.imdb_id,
                also_known_as: details.also_known_as,
                adult: details.adult,
                wikipedia_url: wikipedia_url,
                bio_source: bio_source,
                updated_at: new Date().toISOString(),
            })
            .eq('id', personId);

        if (error) {
            console.log(`  ❌ Error updating person: ${error.message}`);
            return false;
        }

        return true;

    } catch (error) {
        console.log(`  ❌ Error enriching person: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

/**
 * Main enrichment process
 */
async function main() {
    console.log('🚀 Starting People Enrichment\n');

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
        // Get starting point
        const lastProcessedId = await getLastProcessedId();

        // Fetch people to enrich
        let query = supabase
            .from('people')
            .select('id, tmdb_id, name')
            .order('id', { ascending: true })
            .limit(BATCH_SIZE);

        if (lastProcessedId) {
            query = query.gt('id', lastProcessedId);
        }

        const { data: peopleBatch, error } = await query;

        if (error || !peopleBatch) {
            throw new Error(`Failed to fetch people: ${error?.message}`);
        }

        progress.total = peopleBatch.length;
        console.log(`📦 Processing ${peopleBatch.length} people\n`);

        if (peopleBatch.length === 0) {
            console.log('✅ No more people to process!\n');
            return;
        }

        // Process each person
        for (const person of peopleBatch) {
            progress.processed++;
            console.log(`\n[${progress.processed}/${progress.total}] ${person.name} (TMDB: ${person.tmdb_id})`);

            const success = await enrichPerson(person.id, person.tmdb_id, person.name);

            if (success) {
                progress.succeeded++;
                console.log(`  ✅ Successfully enriched`);
            } else {
                progress.failed++;
            }

            progress.lastProcessedId = person.id;

            // Rate limiting
            await delay(RATE_LIMIT_MS);

            // Save progress every 20 people
            if (progress.processed % 20 === 0) {
                await saveProgress(progress, 'running');
            }
        }

        // Final progress save
        await saveProgress(progress, 'completed');

        console.log('\n═══════════════════════════════════════');
        console.log('✅ ENRICHMENT COMPLETE');
        console.log('═══════════════════════════════════════');
        console.log(`Total Processed: ${progress.processed}`);
        console.log(`Succeeded: ${progress.succeeded}`);
        console.log(`Failed: ${progress.failed}`);
        console.log(`Last ID: ${progress.lastProcessedId}`);
        console.log('\nTo continue, run this script again (it will resume automatically)\n');

    } catch (error) {
        console.error('\n❌ Enrichment failed:', error);
        await saveProgress(progress, 'failed');
        process.exit(1);
    }
}

main();
