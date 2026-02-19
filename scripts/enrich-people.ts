import { supabase } from './lib/supabase';
import { delay } from './lib/tmdb';
import { getPersonBioMultiVariant } from './lib/wikipedia';
import { getCurrentCycle, checkAndIncrementCycle, updateCycleStats } from './lib/cycle';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '200', 10);
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

async function checkSyncPauseStatus() {
    const { data, error } = await supabase
        .from('sync_settings')
        .select('setting_value')
        .eq('setting_key', 'cron_status')
        .single();

    if (error) { console.warn('⚠️ Could not check pause status'); return; }

    const cronStatus = data?.setting_value as any;
    if (cronStatus?.is_paused) {
        console.log('⏸️ Sync is paused. Exiting gracefully.');
        process.exit(0);
    }
    console.log('✅ Sync is active. Proceeding...');
}

async function fetchPersonDetails(tmdbId: number): Promise<any | null> {
    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/person/${tmdbId}?append_to_response=combined_credits,external_ids,images,tagged_images`,
            { headers: { Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
        );
        if (!res.ok) { console.log(`  ⚠️  TMDB API error: ${res.status}`); return null; }
        return res.json();
    } catch (error) {
        console.log(`  ❌ Fetch error: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

async function getLastProcessedId(): Promise<string | null> {
    if (START_FROM_ID) { console.log(`📌 Starting from specified ID: ${START_FROM_ID}\n`); return START_FROM_ID; }

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

async function saveProgress(progress: EnrichmentProgress, status: 'running' | 'completed' | 'failed') {
    await supabase.from('sync_logs').insert({
        type: 'people_enrichment',
        status,
        message: `Processed ${progress.processed}/${progress.total} people (${progress.succeeded} succeeded, ${progress.failed} failed)`,
        details: { batch_size: BATCH_SIZE, ...progress },
        metadata: { last_processed_id: progress.lastProcessedId },
    });
}

async function enrichPerson(personId: string, tmdbId: number, name: string): Promise<boolean> {
    const details = await fetchPersonDetails(tmdbId);
    if (!details) { console.log(`  ❌ Failed to fetch TMDB details for ${tmdbId}`); return false; }

    if (DRY_RUN) { console.log(`  [DRY RUN] Would update ${personId}`); return true; }

    console.log(`  🌐 Enriching biography for ${name}...`);
    let biography = details.biography;
    let bio_source = 'tmdb';
    let wikipedia_url: string | undefined;

    try {
        const wiki = await getPersonBioMultiVariant(name, 'en');
        if (wiki?.extract) {
            biography = wiki.extract;
            bio_source = 'wikipedia';
            wikipedia_url = wiki.page_url;
            console.log(`    ✅ Wikipedia bio (${wiki.extract.length} chars)`);
        } else if (details.biography) {
            console.log(`    ↩️  Using TMDB bio`);
        } else {
            bio_source = 'none';
            console.log(`    ℹ️  No biography available`);
        }
    } catch {
        console.log(`    ⚠️  Wikipedia fetch failed, using TMDB`);
    }

    let main_profile_photo = details.profile_path;
    let images: any = null;

    if (details.images) {
        if (details.images.profiles?.length > 0) {
            main_profile_photo = details.images.profiles.sort((a: any, b: any) => b.vote_average - a.vote_average)[0].file_path;
        }
        images = {
            profiles: details.images.profiles?.slice(0, 10).map((img: any) => ({ file_path: img.file_path, width: img.width, height: img.height, vote_average: img.vote_average, aspect_ratio: img.aspect_ratio })) || [],
            tagged: details.tagged_images?.results?.slice(0, 20).map((img: any) => ({ id: img.id, file_path: img.file_path, width: img.width, height: img.height, vote_average: img.vote_average, media_type: img.media_type })) || [],
        };
    }

    const { error } = await supabase.from('people').update({
        name: details.name,
        biography,
        birthday: details.birthday,
        deathday: details.deathday,
        place_of_birth: details.place_of_birth,
        profile_path: details.profile_path,
        main_profile_photo,
        images,
        gender: details.gender,
        known_for_department: details.known_for_department,
        popularity: details.popularity,
        homepage: details.homepage,
        imdb_id: details.external_ids?.imdb_id,
        also_known_as: details.also_known_as,
        adult: details.adult,
        wikipedia_url,
        bio_source,
        updated_at: new Date().toISOString(),
        enriched_at: new Date().toISOString(),
        enrichment_cycle: await getCurrentCycle('people'),
    }).eq('id', personId);

    if (error) { console.log(`  ❌ Error updating person: ${error.message}`); return false; }
    console.log(`  ✅ Person updated successfully`);
    return true;
}

async function main() {
    console.log('🚀 Starting People Enrichment\n');
    await checkSyncPauseStatus();
    console.log(`Batch Size: ${BATCH_SIZE}`);
    console.log(`Dry Run: ${DRY_RUN}\n`);

    const progress: EnrichmentProgress = { total: 0, processed: 0, succeeded: 0, failed: 0, lastProcessedId: null };

    try {
        const currentCycle = await getCurrentCycle('people');
        console.log(`📊 Current Enrichment Cycle: ${currentCycle}`);

        const lastProcessedId = await getLastProcessedId();

        let query = supabase
            .from('people')
            .select('id, tmdb_id, name, enrichment_cycle')
            .lt('enrichment_cycle', currentCycle)
            .order('enriched_at', { ascending: true, nullsFirst: true })
            .order('popularity', { ascending: false })
            .limit(BATCH_SIZE);

        if (lastProcessedId) query = query.gt('id', lastProcessedId);

        const { data: peopleBatch, error } = await query;
        if (error || !peopleBatch) throw new Error(`Failed to fetch people: ${error?.message}`);

        progress.total = peopleBatch.length;
        console.log(`📦 Processing ${peopleBatch.length} people\n`);

        if (peopleBatch.length === 0) {
            console.log('✅ All people in current cycle complete!\n');
            await checkAndIncrementCycle('people');
            return;
        }

        for (const person of peopleBatch) {
            progress.processed++;
            console.log(`\n[${progress.processed}/${progress.total}] ${person.name} (TMDB: ${person.tmdb_id})`);

            const success = await enrichPerson(person.id, person.tmdb_id, person.name);
            success ? progress.succeeded++ : progress.failed++;
            progress.lastProcessedId = person.id;

            await delay(RATE_LIMIT_MS);
            if (progress.processed % 20 === 0) await saveProgress(progress, 'running');
        }

        await saveProgress(progress, 'completed');
        await updateCycleStats('people');
        await checkAndIncrementCycle('people');

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
