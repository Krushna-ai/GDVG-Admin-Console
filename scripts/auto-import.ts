/**
 * Auto-Import Script for GitHub Actions
 * 
 * PURPOSE: Discovery only — collect TMDB IDs and push to import_queue.
 * NO enrichment happens here. Enrichment is handled by process-queue.
 * 
 * Architecture:
 *   auto-import (this) → import_queue table → process-queue (separate job)
 * 
 * Strategy:
 *   - Crawl ALL TMDB discover pages for every region/content-type
 *   - For each result, check if already in `content` table or `import_queue`
 *   - If new: INSERT into import_queue with `status = 'pending'`
 *   - No API calls beyond TMDB discover. Fast crawl only.
 *   - Runs for up to 5+ hours against GitHub's 6h limit
 * 
 * Priority Order: KR > CN > TH > TR > JP > IN > Western
 */

import supabase from './lib/supabase';
import { discoverTv, discoverMovies, delay } from './lib/tmdb';

// ============================================
// CONFIGURATION
// ============================================

const DRY_RUN = process.env.DRY_RUN === 'true';

// TMDB allows up to 500 pages per discover endpoint
const MAX_PAGES_PER_QUERY = 500;

// Stop after this many consecutive pages where every ID is already known
// Keeps crawl efficient but won't exit early when most content is new
const MAX_CONSECUTIVE_ALL_KNOWN_PAGES = 3000;

// Delay between TMDB page fetches (ms) - keeps us inside rate limits
const PAGE_DELAY_MS = 250;

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

// ============================================
// MAIN FUNCTION
// ============================================

async function main() {
    console.log('🚀 Starting Auto-Import (ID Collection Mode)...');
    await checkSyncPauseStatus();

    console.log(`📅 Date: ${new Date().toISOString()}`);
    console.log(`🧪 Dry Run: ${DRY_RUN}`);
    console.log(`📄 Max pages per query: ${MAX_PAGES_PER_QUERY}`);
    console.log('');
    console.log('📋 This job ONLY collects TMDB IDs → import_queue');
    console.log('📋 Actual enrichment is done by the process-queue job');
    console.log('');

    const jobId = await createSyncJob();
    console.log(`📋 Created job: ${jobId}`);

    let totalQueued = 0;
    let totalSkipped = 0;
    let totalDiscovered = 0;
    let totalFailed = 0;

    try {
        // Pre-load known TMDB IDs from content and queue to minimize DB round-trips
        // We'll use a Set for O(1) lookups. Load in batches.
        console.log('\n📥 Pre-loading known TMDB IDs from database...');
        const knownContentIds = await loadKnownContentIds();
        const knownQueueIds = await loadKnownQueueIds();
        console.log(`  Known content IDs: ${knownContentIds.size}`);
        console.log(`  Known queue IDs: ${knownQueueIds.size}`);
        console.log('');

        for (const region of REGION_CONFIGS) {
            console.log(`\n🌍 Region: ${region.code}`);

            for (const country of region.countries) {
                for (const contentType of ['tv', 'movie'] as const) {
                    const result = await crawlAndQueue(
                        contentType,
                        country,
                        knownContentIds,
                        knownQueueIds,
                        region.code
                    );

                    totalQueued += result.queued;
                    totalSkipped += result.skipped;
                    totalDiscovered += result.discovered;
                    totalFailed += result.failed;

                    console.log(
                        `  ✅ ${contentType.toUpperCase()} (${country}): ` +
                        `${result.queued} queued, ${result.skipped} already known, ` +
                        `${result.discovered} discovered`
                    );
                }
            }
        }

        if (!DRY_RUN) {
            await updateJobStats(jobId, {
                status: 'completed',
                total_discovered: totalDiscovered,
                total_imported: totalQueued,
                total_failed: totalFailed,
                total_skipped: totalSkipped,
                completed_at: new Date().toISOString(),
            });
        }

        console.log('\n\n🎉 Auto-Import (ID Collection) completed!');
        console.log('📊 Final Stats:');
        console.log(`  📡 Discovered: ${totalDiscovered} total TMDB items`);
        console.log(`  ➕ Newly queued: ${totalQueued}`);
        console.log(`  ⏭️  Already known: ${totalSkipped}`);
        console.log(`  ❌ Failed to queue: ${totalFailed}`);
        console.log('');
        console.log('📋 The process-queue job will now handle enrichment.');

    } catch (error) {
        console.error('❌ Auto-Import failed:', error);
        await updateJobStats(jobId, { status: 'failed', error_message: String(error) });
        process.exit(1);
    }
}

// ============================================
// CORE CRAWL FUNCTION
// ============================================

interface CrawlResult {
    queued: number;
    skipped: number;
    discovered: number;
    failed: number;
}

async function crawlAndQueue(
    contentType: 'movie' | 'tv',
    country: string,
    knownContentIds: Set<string>,
    knownQueueIds: Set<string>,
    regionCode: string,
): Promise<CrawlResult> {
    let queued = 0;
    let skipped = 0;
    let discovered = 0;
    let failed = 0;
    let consecutiveAllKnownPages = 0;

    console.log(`  ${contentType.toUpperCase()} (${country}) - crawling up to ${MAX_PAGES_PER_QUERY} pages...`);

    for (let page = 1; page <= MAX_PAGES_PER_QUERY; page++) {
        try {
            const data = contentType === 'tv'
                ? await discoverTv({
                    with_origin_country: country,
                    sort_by: 'popularity.desc',
                    page,
                })
                : await discoverMovies({
                    with_origin_country: country,
                    sort_by: 'popularity.desc',
                    page,
                });

            const items = data.results || [];
            const totalPages = data.total_pages || 1;

            if (items.length === 0) {
                break; // TMDB returned nothing, end of results
            }

            discovered += items.length;

            // Collect new IDs from this page
            const batch: Array<{ tmdb_id: number; content_type: string; priority: number; source: string; batch_name: string; metadata: any }> = [];

            let pageNewCount = 0;
            for (const item of items) {
                const key = `${contentType}:${item.id}`;
                if (knownContentIds.has(key) || knownQueueIds.has(key)) {
                    skipped++;
                    continue;
                }

                pageNewCount++;
                knownQueueIds.add(key); // Prevent duplicates within this run

                if (!DRY_RUN) {
                    batch.push({
                        tmdb_id: item.id,
                        content_type: contentType,
                        priority: getPriority(country),
                        source: 'auto-import',
                        batch_name: `auto-${new Date().toISOString().slice(0, 10)}-${regionCode}`,
                        metadata: {
                            title: item.title || item.name,
                            origin_country: country,
                            region: regionCode,
                            popularity: item.popularity,
                            vote_average: item.vote_average,
                        },
                    });
                } else {
                    console.log(`    [DRY RUN] Would queue: ${item.title || item.name} (${item.id})`);
                    pageNewCount++;
                }
            }

            // Bulk insert the batch
            if (batch.length > 0) {
                const { error } = await supabase
                    .from('import_queue')
                    .insert(batch);

                if (error) {
                    console.error(`    ⚠️ Queue insert error (page ${page}):`, error.message);
                    failed += batch.length;
                } else {
                    queued += batch.length;
                }
            } else if (!DRY_RUN) {
                queued += 0; // nothing new
            }

            if (DRY_RUN) {
                queued += pageNewCount;
            }

            // Track consecutive all-known pages to detect completion gracefully
            if (pageNewCount === 0) {
                consecutiveAllKnownPages++;
                if (consecutiveAllKnownPages >= MAX_CONSECUTIVE_ALL_KNOWN_PAGES) {
                    console.log(`    → ${MAX_CONSECUTIVE_ALL_KNOWN_PAGES} consecutive pages all known, skipping rest`);
                    break;
                }
                if (page % 10 === 0) {
                    console.log(`    Page ${page}/${totalPages}: all known (${consecutiveAllKnownPages}/${MAX_CONSECUTIVE_ALL_KNOWN_PAGES} threshold)`);
                }
            } else {
                consecutiveAllKnownPages = 0;
                if (page % 50 === 0) {
                    console.log(`    Page ${page}/${totalPages}: +${queued} queued so far`);
                }
            }

            // Stop if TMDB has no more pages
            if (page >= totalPages) {
                console.log(`    → Reached last TMDB page (${totalPages})`);
                break;
            }

            await delay(PAGE_DELAY_MS);

        } catch (error) {
            console.error(`    Error on page ${page}:`, error);
            failed++;
            await delay(PAGE_DELAY_MS * 2); // Back off on error
        }
    }

    return { queued, skipped, discovered, failed };
}

// ============================================
// KNOWN ID LOADERS
// ============================================

async function loadKnownContentIds(): Promise<Set<string>> {
    const knownIds = new Set<string>();
    let page = 0;
    const pageSize = 10000;

    while (true) {
        const { data, error } = await supabase
            .from('content')
            .select('tmdb_id, content_type')
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.warn('  ⚠️ Could not load known content IDs:', error.message);
            break;
        }

        if (!data || data.length === 0) break;

        for (const row of data) {
            knownIds.add(`${row.content_type}:${row.tmdb_id}`);
        }

        if (data.length < pageSize) break; // Last page
        page++;
    }

    return knownIds;
}

async function loadKnownQueueIds(): Promise<Set<string>> {
    const knownIds = new Set<string>();
    let page = 0;
    const pageSize = 10000;

    while (true) {
        const { data, error } = await supabase
            .from('import_queue')
            .select('tmdb_id, content_type')
            .in('status', ['pending', 'processing'])
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.warn('  ⚠️ Could not load known queue IDs:', error.message);
            break;
        }

        if (!data || data.length === 0) break;

        for (const row of data) {
            knownIds.add(`${row.content_type}:${row.tmdb_id}`);
        }

        if (data.length < pageSize) break;
        page++;
    }

    return knownIds;
}

// ============================================
// HELPERS
// ============================================

function getPriority(country: string): number {
    const priorities: Record<string, number> = {
        'KR': 10, 'CN': 9, 'TW': 9, 'HK': 9,
        'TH': 8, 'TR': 7, 'JP': 6,
        'IN': 4, 'US': 2, 'GB': 2,
    };
    return priorities[country] ?? 1;
}

// ============================================
// JOB MANAGEMENT
// ============================================

async function createSyncJob(): Promise<string> {
    if (DRY_RUN) return 'dry-run-job';

    const { data, error } = await supabase
        .from('sync_jobs')
        .insert({
            sync_type: 'auto',
            status: 'running',
            daily_quota: 0, // No quota for ID collection
            started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

    if (error) throw new Error(`Failed to create job: ${error.message}`);
    return data.id;
}

async function updateJobStats(jobId: string, stats: Record<string, any>) {
    if (DRY_RUN) return;
    await supabase.from('sync_jobs').update(stats).eq('id', jobId);
}

// Run
main();
