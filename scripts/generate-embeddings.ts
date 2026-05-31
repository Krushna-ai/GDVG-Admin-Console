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

/**
 * SOURCE TEXT FOR EMBEDDINGS
 * ==========================
 * 
 * CURRENT: Optimized for bge-large-en-v1.5 (512 token limit)
 * Fields are carefully selected to fit within 512 tokens while
 * maximizing semantic signal. Wikipedia full text is excluded
 * as it exceeds the token limit and gets silently truncated.
 * 
 * FUTURE IMPROVEMENTS (when upgrading embedding model):
 * 
 * 1. Switch to a model with larger context window
 *    e.g. text-embedding-3-large (8191 tokens) or
 *    voyage-large-2 (16000 tokens) for richer embeddings
 * 
 * 2. Implement chunked embeddings for Wikipedia articles
 *    Split wikipedia_raw_article into 512-token chunks,
 *    embed each chunk separately, store in ai_embeddings
 *    table (already exists with HNSW index, ready to use)
 * 
 * 3. Add AniList community tags for anime once
 *    properly imported (slow burn, found family,
 *    enemies to lovers etc.) — high quality
 *    semantic signals from real community data
 * 
 * 4. Include wiki_plot, wiki_cast_notes, wiki_production
 *    once section extraction is implemented via Cloudflare
 *    Workers AI or local Ollama
 * 
 * Current token estimate per item: ~200-250 tokens
 * Safe headroom before 512 token limit: ~250-300 tokens
 */

function buildSourceText(item: any): string {
    const parts: string[] = [];

    // Title
    parts.push(item.title);

    // Original title if different
    if (item.original_title &&
        item.original_title !== item.title) {
        parts.push(item.original_title);
    }

    // Tagline
    if (item.tagline) parts.push(item.tagline);

    // Overview — truncate to 300 chars
    if (item.overview) {
        parts.push(item.overview.slice(0, 300));
    }

    // Genres
    const genres = (item.genres as any[])
        ?.map((g: any) => g?.name)
        .filter(Boolean) || [];
    if (genres.length > 0) {
        parts.push(genres.join(', '));
    }

    // Keywords — top 10 only
    const keywords = (item.keywords as any[])
        ?.map((k: any) => k?.name)
        .filter(Boolean)
        .slice(0, 10) || [];
    if (keywords.length > 0) {
        parts.push(keywords.join(', '));
    }

    // Mood tags
    const moodTags = (item.mood_tags as string[])
        ?.filter(Boolean) || [];
    if (moodTags.length > 0) {
        parts.push(moodTags.join(', '));
    }

    // Trope tags
    const tropeTags = (item.trope_tags as string[])
        ?.filter(Boolean) || [];
    if (tropeTags.length > 0) {
        parts.push(tropeTags.join(', '));
    }

    // Wiki plot — first 500 chars
    if (item.wiki_plot) {
        parts.push(item.wiki_plot.slice(0, 500));
    }

    return parts.filter(Boolean).join(' | ');
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
    const { limit } = parseCliArgs();

    console.log(`\n🔢 Embedding Generation`);
    console.log('='.repeat(50));
    console.log(`Fetching up to ${limit} items without embeddings...`);
    const { data: items, error: fetchError } = await supabase
      .rpc('get_content_for_embedding', { p_limit: limit });

    if (fetchError) {
      console.error('Failed to fetch content:', fetchError);
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
