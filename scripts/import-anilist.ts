import { config } from 'dotenv';
import { fetchAnimeListPage, mapAnilistToContent } from './lib/anilist';
import { upsertContent } from './lib/database';
import { addToEnrichmentQueue } from './lib/queue';
import { supabase } from './lib/supabase';

config({ path: '.env.local' });

// ============================================
// CLI ARGS
// ============================================

function parseCliArgs(): { pageStart: number; pageEnd: number } {
    const args = process.argv.slice(2);
    let pageStart = 1;
    let pageEnd = 20;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--page-start' && args[i + 1]) {
            pageStart = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--page-end' && args[i + 1]) {
            pageEnd = parseInt(args[i + 1], 10);
            i++;
        }
    }

    return { pageStart, pageEnd };
}

// ============================================
// EXISTENCE CHECK
// ============================================

async function animeExistsInDb(anilistId: number): Promise<boolean> {
    const { data, error } = await supabase
        .from('content')
        .select('id')
        .eq('tmdb_id', anilistId)
        .eq('content_type', 'anime')
        .maybeSingle();

    if (error) {
        console.error(`  DB check error for anilist_id ${anilistId}:`, error.message);
        return false;
    }

    return !!data;
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
    const { pageStart, pageEnd } = parseCliArgs();
    const batchId = `anilist-${Date.now()}`;

    console.log(`\n🎌 AniList Anime Import`);
    console.log(`=`.repeat(50));
    console.log(`Pages: ${pageStart} → ${pageEnd} (${(pageEnd - pageStart + 1) * 50} anime max)`);
    console.log(`Batch: ${batchId}\n`);

    let totalImported = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let totalEnqueued = 0;

    for (let page = pageStart; page <= pageEnd; page++) {
        console.log(`\n📄 Page ${page}/${pageEnd}`);

        let pageData;
        try {
            pageData = await fetchAnimeListPage(page);
        } catch (err: any) {
            console.error(`  ❌ Failed to fetch page ${page}: ${err.message}`);
            totalErrors++;
            continue;
        }

        const { media, pageInfo } = pageData.Page;
        console.log(`  Found ${media.length} anime on page ${page}`);

        for (let i = 0; i < media.length; i++) {
            const item = media[i];
            const globalIndex = (page - pageStart) * 50 + i + 1;

            try {
                // Skip if already in DB
                const exists = await animeExistsInDb(item.id);
                if (exists) {
                    totalSkipped++;
                    if ((totalImported + totalSkipped + totalErrors) % 10 === 0) {
                        console.log(`  [${globalIndex}] ⏭ Skipped (exists): ${item.title.english || item.title.romaji}`);
                    }
                    continue;
                }

                // Map and save
                const contentData = {
                    ...mapAnilistToContent(item),
                    import_batch_id: batchId,
                    import_batch_name: `anilist-p${pageStart}-p${pageEnd}`,
                    imported_at: new Date().toISOString(),
                };

                const saved = await upsertContent(contentData as any);

                totalImported++;

                // Add to enrichment queue
                if (saved.id) {
                    try {
                        const enqueued = await addToEnrichmentQueue(saved.id, 'content', 10);
                        if (enqueued) totalEnqueued++;
                    } catch (qErr: any) {
                        console.warn(`  ⚠️ Failed to enqueue ${item.id}: ${qErr.message}`);
                    }
                }

                // Log every 10 items
                if (totalImported % 10 === 0) {
                    console.log(`  [${globalIndex}] ✅ Imported #${totalImported}: ${item.title.english || item.title.romaji}`);
                }
            } catch (err: any) {
                totalErrors++;
                console.error(`  [${globalIndex}] ❌ Error on anilist_id ${item.id} (${item.title.romaji}): ${err.message}`);
            }
        }

        // Stop early if no more pages
        if (!pageInfo.hasNextPage) {
            console.log(`\n  ℹ️  No more pages after page ${page}`);
            break;
        }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Import complete`);
    console.log(`   Imported:  ${totalImported}`);
    console.log(`   Skipped:   ${totalSkipped}`);
    console.log(`   Errors:    ${totalErrors}`);
    console.log(`   Enqueued:  ${totalEnqueued}`);
    console.log(`${'='.repeat(50)}\n`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
