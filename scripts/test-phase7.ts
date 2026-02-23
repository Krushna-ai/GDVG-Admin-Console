import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { supabase } from './lib/supabase';
import { execSync } from 'child_process';

const TEST_IDS = [
    { tmdb_id: 27205, content_type: 'movie' }, // Inception (Movie)
    { tmdb_id: 93405, content_type: 'tv' },    // Squid Game (1 Season)
    { tmdb_id: 1429, content_type: 'tv' }      // Attack on Titan (Multi-Seasons)
];

async function main() {
    console.log(`\n🚀 [PHASE 7 TEST] Starting End-to-End Test...`);

    // 1. Purge import_queue and enrichment_queue
    console.log(`🧹 Clearing queues...`);
    await supabase.from('import_queue').delete().neq('tmdb_id', 0);
    await supabase.from('enrichment_queue').delete().neq('entity_id', '00000000-0000-0000-0000-000000000000');

    // 2. Insert test IDs into import_queue
    console.log(`📥 Inserting test IDs into import_queue...`);
    for (const item of TEST_IDS) {
        await supabase.from('import_queue').insert({
            tmdb_id: item.tmdb_id,
            content_type: item.content_type,
            status: 'pending',
            priority: 10,
            source: 'manual_test'
        });
        console.log(`  ➕ Inserted ${item.content_type} ${item.tmdb_id}`);
    }

    // 3. Run auto-import (TMDB Phase)
    console.log(`\n⚡ Running auto-import (TMDB Phase)...`);
    try {
        execSync('npx tsx scripts/auto-import.ts', { stdio: 'inherit', env: { ...process.env, BATCH_SIZE: '10' } });
    } catch (err) {
        console.error('❌ auto-import failed:', err);
    }

    // 4. Run enrich-queue (Wikidata Phase)
    console.log(`\n⚡ Running enrich-queue (Wikidata Phase)...`);
    try {
        execSync('npx tsx scripts/enrich-queue.ts', { stdio: 'inherit', env: { ...process.env, BATCH_SIZE: '10' } });
    } catch (err) {
        console.error('❌ enrich-queue failed:', err);
    }

    // 5. Verify Output from Database
    console.log(`\n✅ Validating Output in DB...`);

    for (const item of TEST_IDS) {
        console.log(`\n--- Verification for TMDB ${item.tmdb_id} ---`);

        // Check Content row
        const { data: content } = await supabase
            .from('content')
            .select('id, title, number_of_seasons, runtime, production_companies, origin_country, spoken_languages, wikidata_metadata')
            .eq('tmdb_id', item.tmdb_id)
            .eq('content_type', item.content_type)
            .single();

        if (!content) {
            console.log(`  ❌ FAIL: Content not found in DB!`);
            continue;
        }

        console.log(`  📝 Title: ${content.title}`);
        console.log(`  ⏱️ Runtime: ${content.runtime} mins`);
        console.log(`  🏢 Production Companies:`, content.production_companies ? `${content.production_companies.length} entries` : 'None');
        console.log(`  🌍 Origin Country:`, content.origin_country || 'None');
        console.log(`  🗣️ Spoken Languages:`, content.spoken_languages ? `${content.spoken_languages.length} entries` : 'None');

        console.log(`\n  📦 Extended Wikidata Metadata JSONB:`);
        console.log(JSON.stringify(content.wikidata_metadata, null, 2));

        // Let's specifically check Wikidata unique fields
        const wm: any = content.wikidata_metadata || {};
        const successFactors = [
            wm.filming_start ? '✅ Filming Dates' : '❌ Filming Dates',
            wm.aspect_ratio ? '✅ Aspect Ratio' : '❌ Aspect Ratio',
            wm.distributors ? '✅ Distributors' : '❌ Distributors',
        ];
        console.log(`  -> Wikidata Success: ${successFactors.join(' | ')}`);

        // Check seasons / episodes depth
        if (item.content_type === 'tv' && content.id) {
            const { count: seasonCount } = await supabase.from('seasons').select('id', { count: 'exact' }).eq('content_id', content.id);
            const { count: episodeCount } = await supabase.from('episodes').select('id', { count: 'exact' }).eq('content_id', content.id);

            console.log(`\n  📺 Deep Depth Validation:`);
            console.log(`    Seasons: ${seasonCount} / ${content.number_of_seasons} expected (from content row)`);
            console.log(`    Episodes: ${episodeCount} total episodes extracted from TMDB!`);

            if (seasonCount === content.number_of_seasons && episodeCount && episodeCount > 0) {
                console.log(`    ✅ Deep TV Show extraction passed!`);
            } else {
                console.log(`    ❌ Deep TV Show extraction failed! Seasons/Episodes missing.`);
            }
        }
    }

    console.log(`\n🎉 End-to-End test finished!`);
}

main().catch(console.error);
