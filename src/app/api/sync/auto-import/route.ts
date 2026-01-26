import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    TOTAL_DAILY_QUOTA,
    createSyncJob,
    updateJobStats,
    calculatePriorityScore,
    getPrimaryCountry,
    classifyContentType,
    filterExistingContent,
} from '@/lib/services/sync.service';
import { discoverTv, discoverMovies } from '@/lib/tmdb/client';

// Cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET;

// Region configurations - discover MORE than quota, then take top 1000 by priority
// This ensures if KR has few results, we still hit 1000 from lower priority regions
const REGION_CONFIGS = [
    { code: 'KR', countries: ['KR'], maxPages: 3 },           // Up to 60 items
    { code: 'CN', countries: ['CN', 'TW', 'HK'], maxPages: 2 }, // Up to 40 items each = 120
    { code: 'TH', countries: ['TH'], maxPages: 2 },
    { code: 'TR', countries: ['TR'], maxPages: 2 },
    { code: 'JP', countries: ['JP'], maxPages: 2 },
    { code: 'IN', countries: ['IN'], maxPages: 1 },
    { code: 'WESTERN', countries: ['US', 'GB'], maxPages: 1 },
];

/**
 * POST /api/sync/auto-import
 * Main auto-import endpoint called by Supabase Edge cron
 * 
 * FLEXIBLE QUOTA SYSTEM:
 * 1. Discover content from ALL regions (over-fetch)
 * 2. Filter out existing content
 * 3. Sort ALL remaining by priority score
 * 4. Take top 1000 (fills gaps automatically from lower priority regions)
 */
export async function POST(request: Request) {
    // Authenticate cron request
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = await createClient();

        // Create sync job
        const jobId = await createSyncJob('auto');
        await updateJobStats(jobId, {
            status: 'running',
            started_at: new Date().toISOString()
        });

        const stats = {
            total_discovered: 0,
            total_queued: 0,
            total_skipped: 0,
            kr_count: 0,
            cn_count: 0,
            th_count: 0,
            tr_count: 0,
            jp_count: 0,
            anime_count: 0,
            in_count: 0,
            western_count: 0,
            other_count: 0,
        };

        // STEP 1: Discover content from ALL regions (over-fetch)
        let allDiscovered: any[] = [];

        for (const region of REGION_CONFIGS) {
            const regionItems = await discoverByRegion(region.countries, region.maxPages);
            allDiscovered = allDiscovered.concat(regionItems);
        }

        stats.total_discovered = allDiscovered.length;
        console.log(`Discovered ${allDiscovered.length} items from all regions`);

        // STEP 2: Filter out existing content (bulk check)
        const existingSet = await filterExistingContent(
            allDiscovered.map(d => ({ tmdb_id: d.tmdb_id, content_type: d.content_type }))
        );

        const newItems = allDiscovered.filter(d =>
            !existingSet.has(`${d.tmdb_id}:${d.content_type}`)
        );

        stats.total_skipped = allDiscovered.length - newItems.length;
        console.log(`After filtering: ${newItems.length} new items, ${stats.total_skipped} already exist`);

        // STEP 3: Sort by priority score (highest first)
        newItems.sort((a, b) => {
            const priorityA = (a.country_priority * 2) + a.type_priority + a.popularity_score;
            const priorityB = (b.country_priority * 2) + b.type_priority + b.popularity_score;
            return priorityB - priorityA; // Descending
        });

        // STEP 4: Take top 1000 (flexible fill)
        const itemsToQueue = newItems.slice(0, TOTAL_DAILY_QUOTA);

        // Count by region for stats
        for (const item of itemsToQueue) {
            const regionKey = getRegionKey(item.country_code);
            if (regionKey in stats) {
                (stats as any)[regionKey]++;
            }
        }

        // STEP 5: Add to queue
        if (itemsToQueue.length > 0) {
            const queueEntries = itemsToQueue.map(item => ({
                job_id: jobId,
                tmdb_id: item.tmdb_id,
                content_type: item.content_type,
                title: item.title,
                original_title: item.original_title,
                poster_path: item.poster_path,
                popularity: item.popularity,
                vote_average: item.vote_average,
                release_date: item.release_date,
                first_air_date: item.first_air_date,
                origin_country: item.origin_country,
                original_language: item.original_language,
                country_code: item.country_code,
                country_priority: item.country_priority,
                type_priority: item.type_priority,
                popularity_score: item.popularity_score,
                status: 'pending',
            }));

            await supabase
                .from('sync_queue')
                .upsert(queueEntries, { onConflict: 'job_id,tmdb_id,content_type' });

            stats.total_queued = itemsToQueue.length;
        }

        // Update job with final stats
        await updateJobStats(jobId, {
            ...stats,
            status: 'completed',
            completed_at: new Date().toISOString(),
        });

        return NextResponse.json({
            success: true,
            job_id: jobId,
            message: `Queued ${stats.total_queued} items (${stats.total_skipped} skipped as duplicates)`,
            ...stats,
        });

    } catch (error) {
        console.error('Auto-import failed:', error);
        return NextResponse.json(
            { error: 'Auto-import failed', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

/**
 * Map country code to stats key
 */
function getRegionKey(countryCode: string): string {
    const mapping: Record<string, string> = {
        'KR': 'kr_count',
        'CN': 'cn_count', 'TW': 'cn_count', 'HK': 'cn_count',
        'TH': 'th_count',
        'TR': 'tr_count',
        'JP': 'jp_count',
        'IN': 'in_count',
        'US': 'western_count', 'GB': 'western_count', 'CA': 'western_count', 'AU': 'western_count',
    };
    return mapping[countryCode] || 'other_count';
}

/**
 * Discover content by region using TMDB Discover API
 * Paginates through multiple pages to get more results
 */
async function discoverByRegion(countries: string[], maxPages: number) {
    const results: any[] = [];

    for (const country of countries) {
        // Discover TV shows (dramas) - multiple pages
        for (let page = 1; page <= maxPages; page++) {
            try {
                const tvResults = await discoverTv({
                    with_origin_country: country,
                    sort_by: 'popularity.desc',
                    page: page,
                });

                for (const item of (tvResults.results || [])) {
                    const countryCode = getPrimaryCountry(item.origin_country || [country]);
                    const contentType = classifyContentType(
                        'tv',
                        item.origin_country || [country],
                        [],
                        item.original_language
                    );
                    const priority = calculatePriorityScore(countryCode, contentType, item.popularity || 0);

                    results.push({
                        tmdb_id: item.id,
                        content_type: contentType,
                        title: item.name,
                        original_title: item.original_name,
                        poster_path: item.poster_path,
                        popularity: item.popularity,
                        vote_average: item.vote_average,
                        first_air_date: item.first_air_date,
                        origin_country: item.origin_country || [country],
                        original_language: item.original_language,
                        country_code: countryCode,
                        country_priority: priority.country,
                        type_priority: priority.type,
                        popularity_score: priority.pop,
                    });
                }
            } catch (e) {
                console.error(`Failed to discover TV for ${country} page ${page}:`, e);
            }
        }

        // Discover Movies - single page per country
        try {
            const movieResults = await discoverMovies({
                with_origin_country: country,
                sort_by: 'popularity.desc',
                page: 1,
            });

            for (const item of (movieResults.results || [])) {
                const countryCode = country;
                const contentType = 'movie' as const;
                const priority = calculatePriorityScore(countryCode, contentType, item.popularity || 0);

                results.push({
                    tmdb_id: item.id,
                    content_type: contentType,
                    title: item.title,
                    original_title: item.original_title,
                    poster_path: item.poster_path,
                    popularity: item.popularity,
                    vote_average: item.vote_average,
                    release_date: item.release_date,
                    origin_country: [country],
                    original_language: item.original_language,
                    country_code: countryCode,
                    country_priority: priority.country,
                    type_priority: priority.type,
                    popularity_score: priority.pop,
                });
            }
        } catch (e) {
            console.error(`Failed to discover movies for ${country}:`, e);
        }
    }

    return results;
}

