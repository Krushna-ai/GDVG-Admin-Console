import { config } from 'dotenv';
import { generateEmbedding } from './lib/cloudflare-ai';
import { supabase } from './lib/supabase';

config({ path: '.env.local' });

// ============================================
// CLI ARGS
// ============================================

function parseCliArgs(): { limit: number } {
    const args = process.argv.slice(2);
    let limit = 100;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--limit' && args[i + 1]) {
            limit = parseInt(args[i + 1], 10);
            i++;
        }
    }

    return { limit };
}

// ============================================
// SOURCE TEXT BUILDER
// ============================================

function buildSourceText(item: any): string {
    const parts = [
        item.title || '',
        item.overview || '',
        (item.genres as any[])?.map((g: any) => g?.name).filter(Boolean).join(' ') || '',
        item.vibe_description || '',
        ((item.mood_tags as string[]) || []).join(' '),
        ((item.trope_tags as string[]) || []).join(' '),
    ];
    return parts.filter(Boolean).join(' ').trim();
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
    const { limit } = parseCliArgs();

    console.log(`\n🔢 Embedding Generation`);
    console.log('='.repeat(50));
    console.log(`Fetching up to ${limit} items without embeddings...\n`);

    // Step 1: get already-embedded content IDs
    const { data: embedded, error: embeddedError } = await supabase
        .from('content_embeddings')
        .select('content_id');

    if (embeddedError) {
        console.error('Failed to fetch existing embeddings:', embeddedError.message);
        process.exit(1);
    }

    const embeddedIds = embedded?.map((e: any) => e.content_id) || [];

    // Step 2: fetch published content not yet embedded
    let contentQuery = supabase
        .from('content')
        .select('id, title, overview, genres, vibe_description, mood_tags, trope_tags')
        .eq('status', 'published')
        .limit(limit);

    if (embeddedIds.length > 0) {
        contentQuery = contentQuery.not('id', 'in', `(${embeddedIds.join(',')})`);
    }

    const { data: items, error: fetchError } = await contentQuery;

    if (fetchError) {
        console.error('Failed to fetch content:', fetchError.message);
        process.exit(1);
    }

    if (!items || items.length === 0) {
        console.log('No items found that need embeddings.');
        return;
    }

    console.log(`Found ${items.length} items to embed.\n`);

    let generated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        try {
            const sourceText = buildSourceText(item);

            if (!sourceText) {
                skipped++;
                continue;
            }

            const embedding = await generateEmbedding(sourceText);

            if (!embedding) {
                skipped++;
                console.warn(`  [${i + 1}/${items.length}] ⚠️ No embedding returned for: ${item.title}`);
                continue;
            }

            const { error: insertError } = await supabase
                .from('content_embeddings')
                .upsert({
                    content_id: item.id,
                    embedding,
                    source_text: sourceText,
                    embedding_model: 'bge-large-en-v1.5',
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'content_id' });

            if (insertError) {
                throw new Error(`DB insert failed: ${insertError.message}`);
            }

            generated++;

            if (generated % 10 === 0) {
                console.log(`  [${i + 1}/${items.length}] ✅ Embedded #${generated}: ${item.title}`);
            }
        } catch (err: any) {
            errors++;
            console.error(`  [${i + 1}/${items.length}] ❌ Error on "${item.title}": ${err.message}`);
        }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Embedding generation complete`);
    console.log(`   Generated: ${generated}`);
    console.log(`   Skipped:   ${skipped}`);
    console.log(`   Errors:    ${errors}`);
    console.log(`${'='.repeat(50)}\n`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
