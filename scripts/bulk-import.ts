/**
 * Bulk Import Script for GitHub Actions
 * Manually triggered to import content by region/type
 */

import { discoverTv, discoverMovies, delay } from './lib/tmdb';
import { enrichAndSaveContent, checkContentExists } from './lib/enrich';

// Get inputs from environment
const REGION = process.env.IMPORT_REGION || 'ALL';
const CONTENT_TYPE = process.env.IMPORT_TYPE || 'all';
const LIMIT = parseInt(process.env.IMPORT_LIMIT || '500', 10);
const MAX_PAGES_PER_COUNTRY = 50; // Safety limit

const REGION_MAP: Record<string, string[]> = {
    'KR': ['KR'],
    'CN': ['CN', 'TW', 'HK'],
    'TH': ['TH'],
    'TR': ['TR'],
    'JP': ['JP'],
    'IN': ['IN'],
    'US': ['US', 'GB'],
    'ALL': ['KR', 'CN', 'TW', 'HK', 'TH', 'TR', 'JP', 'IN', 'US', 'GB'],
};

async function main() {
    console.log('🚀 Starting Bulk Import...');
    console.log(`📍 Region: ${REGION}`);
    console.log(`🎬 Type: ${CONTENT_TYPE}`);
    console.log(`📊 Limit: ${LIMIT}`);

    const countries = REGION_MAP[REGION] || REGION_MAP['ALL'];

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let totalPeople = 0;
    let discovered = 0;

    console.log('\n📡 Starting adaptive discovery and import...\n');

    // Adaptive discovery: keep fetching until limit reached
    for (const country of countries) {
        if (imported >= LIMIT) break;

        console.log(`\n🌍 Country: ${country}`);

        // Process TV shows if requested
        if (CONTENT_TYPE === 'all' || CONTENT_TYPE === 'tv') {
            const tvResult = await processContentType(
                'tv',
                country,
                LIMIT - imported
            );

            imported += tvResult.imported;
            skipped += tvResult.skipped;
            failed += tvResult.failed;
            totalPeople += tvResult.people;
            discovered += tvResult.discovered;
        }

        if (imported >= LIMIT) break;

        // Process movies if requested
        if (CONTENT_TYPE === 'all' || CONTENT_TYPE === 'movie') {
            const movieResult = await processContentType(
                'movie',
                country,
                LIMIT - imported,
                5 // Max 5 pages for movies
            );

            imported += movieResult.imported;
            skipped += movieResult.skipped;
            failed += movieResult.failed;
            totalPeople += movieResult.people;
            discovered += movieResult.discovered;
        }
    }

    console.log('\n\n🎉 Bulk Import completed successfully!');
    console.log(`📊 Final Stats:`);
    console.log(`  ✅ Imported: ${imported} content`);
    console.log(`  👥 People: ${totalPeople}`);
    console.log(`  ⏭️  Skipped: ${skipped} (duplicates)`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  📡 Discovered: ${discovered} total items`);
}

// ============================================
// ADAPTIVE DISCOVERY
// ============================================

interface ProcessResult {
    imported: number;
    skipped: number;
    failed: number;
    people: number;
    discovered: number;
}

/**
 * Process content type for a country with adaptive page fetching
 */
async function processContentType(
    contentType: 'movie' | 'tv',
    country: string,
    remainingQuota: number,
    maxPages: number = MAX_PAGES_PER_COUNTRY
): Promise<ProcessResult> {
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let totalPeople = 0;
    let discovered = 0;
    let page = 1;
    let consecutiveEmptyPages = 0;

    console.log(`  ${contentType.toUpperCase()} (${country}):`);

    while (imported < remainingQuota && page <= maxPages) {
        try {
            // Fetch page from TMDB
            const data = contentType === 'tv'
                ? await discoverTv({ with_origin_country: country, sort_by: 'popularity.desc', page })
                : await discoverMovies({ with_origin_country: country, sort_by: 'popularity.desc', page });

            const items = data.results || [];
            discovered += items.length;

            if (items.length === 0) {
                consecutiveEmptyPages++;
                if (consecutiveEmptyPages >= 2) {
                    console.log(`    No more content available`);
                    break;
                }
                page++;
                continue;
            }

            consecutiveEmptyPages = 0;
            let pageNewItems = 0;

            // Process each item
            for (const item of items) {
                if (imported >= remainingQuota) break;

                const tmdbId = item.id;

                // Check if already exists
                const exists = await checkContentExists(tmdbId, contentType);

                if (exists) {
                    skipped++;
                    continue;
                }

                // Import with enrichment (content + cast/crew)
                try {
                    const result = await enrichAndSaveContent(tmdbId, contentType);

                    if (result.success) {
                        imported++;
                        pageNewItems++;
                        totalPeople += result.peopleImported || 0;

                        // Progress log every 25 items
                        if (imported % 25 === 0) {
                            console.log(`    ✓ ${imported}/${remainingQuota} (${skipped} skipped, ${totalPeople} people)`);
                        }
                    } else {
                        failed++;
                        console.error(`    Failed ${tmdbId}: ${result.error}`);
                    }

                    // Rate limiting delay
                    await delay(300);
                } catch (error) {
                    failed++;
                    console.error(`    Error importing ${tmdbId}:`, error);
                }
            }

            // If no new items in this page, might be hitting duplicates
            if (pageNewItems === 0 && page > 3) {
                console.log(`    Page ${page}: all duplicates, continuing...`);
            }

            page++;
            await delay(100); // Delay between pages

        } catch (error) {
            console.error(`    Error on page ${page}:`, error);
            page++;
        }
    }

    if (imported > 0) {
        console.log(`    ✅ ${contentType}: ${imported} imported, ${skipped} skipped, ${totalPeople} people`);
    }

    return {
        imported,
        skipped,
        failed,
        people: totalPeople,
        discovered,
    };
}

main();
