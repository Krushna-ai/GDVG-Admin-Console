import { config } from 'dotenv';
import { discoverMovies, discoverTv, delay } from './lib/tmdb';
import { enrichAndSaveContent, checkContentExists } from './lib/enrich';

config({ path: '.env.local' });

// ============================================
// CLI ARGS
// ============================================

interface CliArgs {
    pageStart: number;
    pageEnd: number;
    type: 'all' | 'movie' | 'tv';
}

function parseCliArgs(): CliArgs {
    const args = process.argv.slice(2);
    let pageStart = 1;
    let pageEnd = 5;
    let type: 'all' | 'movie' | 'tv' = 'all';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--page-start' && args[i + 1]) {
            pageStart = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--page-end' && args[i + 1]) {
            pageEnd = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--type' && args[i + 1]) {
            const t = args[i + 1].toLowerCase();
            if (t === 'movie' || t === 'tv' || t === 'all') {
                type = t;
            }
            i++;
        }
    }

    return { pageStart, pageEnd, type };
}

// ============================================
// DISCOVERY
// ============================================

interface DiscoveredItem {
    tmdbId: number;
    title: string;
    contentType: 'movie' | 'tv';
}

async function discoverKoreanContent(
    contentType: 'movie' | 'tv',
    pageStart: number,
    pageEnd: number
): Promise<DiscoveredItem[]> {
    const items: DiscoveredItem[] = [];

    for (let page = pageStart; page <= pageEnd; page++) {
        try {
            console.log(`  🔍 Discovering Korean ${contentType}s — page ${page}/${pageEnd}...`);

            const response = contentType === 'movie'
                ? await discoverMovies({
                    with_origin_country: 'KR',
                    sort_by: 'popularity.desc',
                    'vote_count.gte': '10',
                    'vote_average.gte': '5.0',
                    page,
                })
                : await discoverTv({
                    with_origin_country: 'KR',
                    sort_by: 'popularity.desc',
                    'vote_count.gte': '10',
                    'vote_average.gte': '5.0',
                    page,
                });

            const results = response?.results || [];

            for (const result of results) {
                items.push({
                    tmdbId: result.id,
                    title: contentType === 'movie' ? result.title : result.name,
                    contentType,
                });
            }

            console.log(`     Found ${results.length} items on page ${page}`);
        } catch (err: any) {
            console.error(`  ❌ Discovery failed for ${contentType} page ${page}: ${err.message}`);
        }
    }

    return items;
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
    const { pageStart, pageEnd, type } = parseCliArgs();

    console.log(`\n🇰🇷 Korean Content Importer`);
    console.log('='.repeat(50));
    console.log(`Type:     ${type}`);
    console.log(`Pages:    ${pageStart} → ${pageEnd}`);
    console.log(`Delay:    1000ms between items\n`);

    // Step 1: Discover content
    const toImport: DiscoveredItem[] = [];

    if (type === 'all' || type === 'tv') {
        const tvItems = await discoverKoreanContent('tv', pageStart, pageEnd);
        toImport.push(...tvItems);
    }

    if (type === 'all' || type === 'movie') {
        const movieItems = await discoverKoreanContent('movie', pageStart, pageEnd);
        toImport.push(...movieItems);
    }

    if (toImport.length === 0) {
        console.log('🤷‍♂️ No items discovered. Exiting.');
        return;
    }

    console.log(`\n📦 Total discovered: ${toImport.length}\n`);

    // Step 2: Import each item
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < toImport.length; i++) {
        const item = toImport[i];
        const label = `[${i + 1}/${toImport.length}]`;

        try {
            const exists = await checkContentExists(item.tmdbId, item.contentType);

            if (exists) {
                console.log(`  ${label} ⏭  Already imported: "${item.title}" (TMDB:${item.tmdbId})`);
                skipped++;
                continue;
            }

            console.log(`  ${label} ⬇️  Importing "${item.title}" (${item.contentType}, TMDB:${item.tmdbId})...`);
            const result = await enrichAndSaveContent(item.tmdbId, item.contentType);

            if (result.success) {
                console.log(`  ${label} ✅ Imported: "${item.title}" — ${result.peopleImported || 0} people`);
                imported++;
            } else {
                console.error(`  ${label} ❌ Failed: "${item.title}" — ${result.error}`);
                errors++;
            }
        } catch (err: any) {
            console.error(`  ${label} ❌ Error on "${item.title}": ${err.message}`);
            errors++;
        }

        if (i < toImport.length - 1) {
            await delay(1000);
        }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 Korean Import Summary`);
    console.log(`   ✅ Imported: ${imported}`);
    console.log(`   ⏭  Skipped:  ${skipped}`);
    console.log(`   ❌ Errors:   ${errors}`);
    console.log(`   📋 Total:    ${toImport.length}`);
    console.log(`${'='.repeat(50)}\n`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
