import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { supabase } from './lib/supabase';
import { execSync } from 'child_process';

const TEST_IDS = [
    { tmdb_id: 27205, content_type: 'movie' },
    { tmdb_id: 93405, content_type: 'tv' },
    { tmdb_id: 1429, content_type: 'tv' }
];

async function main() {
    console.log(`\n🚀 [FAST WIKI TEST] Setting up enrichment_queue...`);

    // Clear enrichment queue
    await supabase.from('enrichment_queue').delete().neq('entity_id', '0');

    // Fetch the 3 content IDs from DB
    for (const item of TEST_IDS) {
        const { data: content } = await supabase.from('content').select('id').eq('tmdb_id', item.tmdb_id).eq('content_type', item.content_type).single();
        if (content) {
            await supabase.from('enrichment_queue').insert({
                entity_id: content.id,
                queue_type: 'content',
                priority: 10,
                status: 'pending'
            });
            console.log(`  +] Enqueued Content ID: ${content.id}`);
        }
    }

    // Run enrich-queue
    console.log(`\n⚡ Running enrich-queue (Wikidata Phase)...`);
    execSync('npx tsx scripts/enrich-queue.ts', { stdio: 'inherit' });

    console.log(`\n✅ Validating Output in DB...`);
    for (const item of TEST_IDS) {
        console.log(`\n--- TMDB ${item.tmdb_id} ---`);
        const { data: c } = await supabase.from('content').select('title, wikidata_metadata').eq('tmdb_id', item.tmdb_id).eq('content_type', item.content_type).single();
        if (c) {
            console.log(`  📝 Title: ${c.title}`);
            console.log(JSON.stringify(c.wikidata_metadata, null, 2));
        }
    }
}

main().catch(console.error);
