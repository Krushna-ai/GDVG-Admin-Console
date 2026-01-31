/**
 * Auto-Import Script for GitHub Actions
 * Runs daily at 3 AM IST to discover and import new content
 * 
 * Priority Order: KR > CN > TH > TR > JP > IN > Western
 * Daily Quota: 1000 items
 */

import supabase from './lib/supabase';
import { discoverTv, discoverMovies, delay } from './lib/tmdb';
import { enrichAndSaveContent, checkContentExists } from './lib/enrich';

// ============================================
// CONFIGURATION
// ============================================

const DAILY_QUOTA = 1000;
const MAX_PAGES_PER_REGION = 50; // Safety limit
const DRY_RUN = process.env.DRY_RUN === 'true';

// Priority: Higher = imported first
const COUNTRY_PRIORITY: Record<string, number> = {
    'KR': 10, 'CN': 9, 'TW': 9, 'HK': 9, 'TH': 8, 'TR': 7,
    'JP': 6, 'IN': 4, 'US': 2, 'GB': 2, 'CA': 2, 'AU': 2,
};

const CONTENT_TYPE_PRIORITY: Record<string, number> = {
    'drama': 10, 'tv': 8, 'movie': 6, 'anime': 5,
};

// Regions to discover (in priority order)
const REGION_CONFIGS = [
    { code: 'KR', countries: ['KR'] },
    { code: 'CN', countries: ['CN', 'TW', 'HK'] },
    { code: 'TH', countries: ['TH'] },
    { code: 'TR', countries: ['TR'] },
    { code: 'JP', countries: ['JP'] },
    { code: 'IN', countries: ['IN'] },
    { code: 'WESTERN', countries: ['US', 'GB'] },
];

// ============================================
// PAUSE STATUS CHECK
// ============================================

/**
 * Check if sync is paused in dashboard
 * Exits gracefully if paused
 */
async function checkSyncPauseStatus() {
    try {
        const { data, error } = await supabase
            .from('sync_settings')
            .select('is_paused, paused_at')
            .single();

        if (error) {
            console.warn('⚠️ Could not check pause status:', error.message);
            console.warn('Proceeding with caution...');
            return;
        }

        if (data?.is_paused) {
            console.log('⏸️ Sync is paused. Exiting gracefully.');
            console.log(`📅 Paused at: ${data.paused_at}`);
            process.exit(0);
        }

        console.log('✅ Sync is active. Proceeding...');
    } catch (err) {
        console.warn('⚠️ Error checking pause status:', err);
        console.warn('Proceeding with caution...');
    }
}

// ============================================
// MAIN FUNCTION
// ============================================

async function main() {
    console.log('🚀 Starting Auto-Import...');

    // Check if sync is paused - exit if paused
    await checkSyncPauseStatus();

    console.log(`📅 Date: ${new Date().toISOString()}`);
    console.log(`🧪 Dry Run: ${DRY_RUN}`);
    console.log(`📊 Daily Quota: ${DAILY_QUOTA}`);

    // Create sync job
    const jobId = await createSyncJob();
    console.log(`📋 Created job: ${jobId}`);

    try {
        let imported = 0;
        let skipped = 0;
        let failed = 0;
        let totalPeople = 0;
        let discovered = 0;

        console.log('\n📡 Starting adaptive discovery and import...\n');

        // Adaptive discovery: keep fetching until quota met
        for (const region of REGION_CONFIGS) {
            if (imported >= DAILY_QUOTA) break;

            console.log(`\n🌍 Region: ${region.code}`);

            for (const country of region.countries) {
                if (imported >= DAILY_QUOTA) break;

                // Process TV shows
                const tvResult = await processContentType(
                    'tv',
                    country,
                    DAILY_QUOTA - imported,
                    jobId
                );

                imported += tvResult.imported;
                skipped += tvResult.skipped;
                failed += tvResult.failed;
                totalPeople += tvResult.people;
                discovered += tvResult.discovered;

                if (imported >= DAILY_QUOTA) break;

                // Process movies (1-2 pages max)
                const movieResult = await processContentType(
                    'movie',
                    country,
                    DAILY_QUOTA - imported,
                    jobId,
                    2 // Max 2 pages for movies
                );

                imported += movieResult.imported;
                skipped += movieResult.skipped;
                failed += movieResult.failed;
                totalPeople += movieResult.people;
                discovered += movieResult.discovered;
            }
        }

        // Update final job stats
        if (!DRY_RUN) {
            await updateJobStats(jobId, {
                status: 'completed',
                total_discovered: discovered,
                total_imported: imported,
                total_failed: failed,
                total_skipped: skipped,
                total_people_imported: totalPeople,
                completed_at: new Date().toISOString(),
            });
        }

        console.log('\n\n🎉 Auto-Import completed successfully!');
        console.log(`📊 Final Stats:`);
        console.log(`  ✅ Imported: ${imported} content`);
        console.log(`  👥 People: ${totalPeople}`);
        console.log(`  ⏭️  Skipped: ${skipped} (duplicates)`);
        console.log(`  ❌ Failed: ${failed}`);
        console.log(`  📡 Discovered: ${discovered} total items`);

    } catch (error) {
        console.error('❌ Auto-Import failed:', error);
        await updateJobStats(jobId, { status: 'failed', error_message: String(error) });
        process.exit(1);
    }
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
 * Keeps fetching pages until quota met or max pages reached
 */
async function processContentType(
    contentType: 'movie' | 'tv',
    country: string,
    remainingQuota: number,
    jobId: string,
    maxPages: number = MAX_PAGES_PER_REGION
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
                if (!DRY_RUN) {
                    try {
                        const result = await enrichAndSaveContent(tmdbId, contentType);

                        if (result.success) {
                            imported++;
                            pageNewItems++;
                            totalPeople += result.peopleImported || 0;

                            // Progress log every 10 items
                            if (imported % 10 === 0) {
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
                } else {
                    // DRY RUN mode
                    imported++;
                    pageNewItems++;
                    console.log(`    [DRY RUN] Would import: ${item.title || item.name} (${tmdbId})`);
                }
            }

            // If no new items in this page, we might be hitting mostly duplicates
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

// ============================================
// JOB MANAGEMENT
// ============================================

async function createSyncJob(): Promise<string> {
    const { data, error } = await supabase
        .from('sync_jobs')
        .insert({
            sync_type: 'auto',
            status: 'running',
            daily_quota: DAILY_QUOTA,
            started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

    if (error) throw new Error(`Failed to create job: ${error.message}`);
    return data.id;
}

async function updateJobStats(jobId: string, stats: Record<string, any>) {
    await supabase.from('sync_jobs').update(stats).eq('id', jobId);
}

// ============================================
// HELPERS
// ============================================

function logSampleItems(items: any[]) {
    console.log('\n📋 Sample items that would be imported:');
    items.forEach((item, i) => {
        console.log(`  ${i + 1}. [${item.content_type}] ${item.title} (${item.origin_country.join(', ')}) - Priority: ${item.priority_score}`);
    });
}

// Run
main();
