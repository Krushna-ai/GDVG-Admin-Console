/**
 * Auto-Import Script for GitHub Actions
 * Runs daily at 3 AM IST to discover and import new content
 * 
 * Priority Order: KR > CN > TH > TR > JP > IN > Western
 * Daily Quota: 1000 items
 */

import supabase from './lib/supabase';
import { discoverTv, discoverMovies, getMovieDetails, getTvDetails, delay } from './lib/tmdb';

// ============================================
// CONFIGURATION
// ============================================

const DAILY_QUOTA = 1000;
const DRY_RUN = process.env.DRY_RUN === 'true';

// Priority: Higher = imported first
const COUNTRY_PRIORITY: Record<string, number> = {
    'KR': 10, 'CN': 9, 'TW': 9, 'HK': 9, 'TH': 8, 'TR': 7,
    'JP': 6, 'IN': 4, 'US': 2, 'GB': 2, 'CA': 2, 'AU': 2,
};

const CONTENT_TYPE_PRIORITY: Record<string, number> = {
    'drama': 10, 'tv': 8, 'movie': 6, 'anime': 5,
};

// Regions to discover (maxPages per region)
const REGION_CONFIGS = [
    { code: 'KR', countries: ['KR'], maxPages: 5 },
    { code: 'CN', countries: ['CN', 'TW', 'HK'], maxPages: 3 },
    { code: 'TH', countries: ['TH'], maxPages: 3 },
    { code: 'TR', countries: ['TR'], maxPages: 3 },
    { code: 'JP', countries: ['JP'], maxPages: 3 },
    { code: 'IN', countries: ['IN'], maxPages: 2 },
    { code: 'WESTERN', countries: ['US', 'GB'], maxPages: 2 },
];

// ============================================
// MAIN FUNCTION
// ============================================

async function main() {
    console.log('🚀 Starting Auto-Import...');
    console.log(`📅 Date: ${new Date().toISOString()}`);
    console.log(`🧪 Dry Run: ${DRY_RUN}`);
    console.log(`📊 Daily Quota: ${DAILY_QUOTA}`);

    // Create sync job
    const jobId = await createSyncJob();
    console.log(`📋 Created job: ${jobId}`);

    try {
        // Phase 1: Discovery
        console.log('\n📡 Phase 1: Discovering content from TMDB...');
        const discovered = await discoverAllRegions();
        console.log(`Found ${discovered.length} items from all regions`);

        // Phase 2: Filter duplicates
        console.log('\n🔍 Phase 2: Filtering existing content...');
        const newItems = await filterExisting(discovered);
        console.log(`${newItems.length} new items (${discovered.length - newItems.length} already exist)`);

        // Phase 3: Sort by priority and take quota
        console.log('\n📊 Phase 3: Sorting by priority...');
        sortByPriority(newItems);
        const itemsToImport = newItems.slice(0, DAILY_QUOTA);
        console.log(`Will import ${itemsToImport.length} items`);

        // Phase 4: Import to database
        if (!DRY_RUN) {
            console.log('\n💾 Phase 4: Importing to database...');
            const results = await importItems(itemsToImport, jobId);
            console.log(`✅ Imported: ${results.success}, ❌ Failed: ${results.failed}`);

            await updateJobStats(jobId, {
                status: 'completed',
                total_discovered: discovered.length,
                total_queued: itemsToImport.length,
                total_imported: results.success,
                total_failed: results.failed,
                total_skipped: discovered.length - newItems.length,
                completed_at: new Date().toISOString(),
            });
        } else {
            console.log('\n🧪 DRY RUN - Skipping actual import');
            logSampleItems(itemsToImport.slice(0, 10));
        }

        console.log('\n🎉 Auto-Import completed successfully!');

    } catch (error) {
        console.error('❌ Auto-Import failed:', error);
        await updateJobStats(jobId, { status: 'failed', error_message: String(error) });
        process.exit(1);
    }
}

// ============================================
// DISCOVERY
// ============================================

async function discoverAllRegions(): Promise<any[]> {
    const allResults: any[] = [];

    for (const region of REGION_CONFIGS) {
        console.log(`  Discovering ${region.code}...`);
        const items = await discoverByRegion(region.countries, region.maxPages);
        allResults.push(...items);
        console.log(`    Found ${items.length} items`);
    }

    return allResults;
}

async function discoverByRegion(countries: string[], maxPages: number): Promise<any[]> {
    const results: any[] = [];

    for (const country of countries) {
        // TV Shows
        for (let page = 1; page <= maxPages; page++) {
            try {
                const tvData = await discoverTv({
                    with_origin_country: country,
                    sort_by: 'popularity.desc',
                    page,
                });
                for (const item of tvData.results || []) {
                    const priority = calculatePriority(item, 'tv', country);
                    results.push({
                        tmdb_id: item.id,
                        content_type: priority.contentType,
                        title: item.name,
                        original_title: item.original_name,
                        poster_path: item.poster_path,
                        popularity: item.popularity,
                        vote_average: item.vote_average,
                        first_air_date: item.first_air_date,
                        origin_country: item.origin_country || [country],
                        original_language: item.original_language,
                        priority_score: priority.total,
                    });
                }
                await delay(100);
            } catch (e) {
                console.error(`    Error discovering TV ${country} page ${page}:`, e);
            }
        }

        // Movies (1 page only)
        try {
            const movieData = await discoverMovies({
                with_origin_country: country,
                sort_by: 'popularity.desc',
                page: 1,
            });
            for (const item of movieData.results || []) {
                const priority = calculatePriority(item, 'movie', country);
                results.push({
                    tmdb_id: item.id,
                    content_type: 'movie',
                    title: item.title,
                    original_title: item.original_title,
                    poster_path: item.poster_path,
                    popularity: item.popularity,
                    vote_average: item.vote_average,
                    release_date: item.release_date,
                    origin_country: [country],
                    original_language: item.original_language,
                    priority_score: priority.total,
                });
            }
            await delay(100);
        } catch (e) {
            console.error(`    Error discovering movies ${country}:`, e);
        }
    }

    return results;
}

// ============================================
// PRIORITY CALCULATION
// ============================================

function calculatePriority(item: any, tmdbType: 'movie' | 'tv', country: string) {
    const countryScore = COUNTRY_PRIORITY[country] || 1;

    // Classify content type
    const isAsian = ['KR', 'CN', 'TW', 'HK', 'TH', 'TR', 'JP'].includes(country);
    const isJapanese = country === 'JP' || item.original_language === 'ja';
    const isAnimation = item.genre_ids?.includes(16); // Animation genre ID

    let contentType: string = tmdbType;
    if (isJapanese && isAnimation) contentType = 'anime';
    else if (tmdbType === 'tv' && isAsian) contentType = 'drama';

    const typeScore = CONTENT_TYPE_PRIORITY[contentType] || 1;
    const popScore = Math.min(Math.floor((item.popularity || 0) / 10), 10);

    // Recency boost
    let recencyScore = 0;
    const releaseDate = item.first_air_date || item.release_date;
    if (releaseDate) {
        const year = new Date(releaseDate).getFullYear();
        const currentYear = new Date().getFullYear();
        if (year === currentYear) recencyScore = 10;
        else if (year === currentYear - 1) recencyScore = 5;
    }

    return {
        contentType,
        country: countryScore,
        type: typeScore,
        pop: popScore,
        recency: recencyScore,
        total: (countryScore * 2) + typeScore + popScore + recencyScore,
    };
}

function sortByPriority(items: any[]) {
    items.sort((a, b) => b.priority_score - a.priority_score);
}

// ============================================
// FILTERING
// ============================================

async function filterExisting(items: any[]): Promise<any[]> {
    const tmdbIds = items.map(i => i.tmdb_id);

    const { data } = await supabase
        .from('content')
        .select('tmdb_id, content_type')
        .in('tmdb_id', tmdbIds.length > 0 ? tmdbIds : [0]);

    const existingSet = new Set<string>();
    data?.forEach(item => existingSet.add(`${item.tmdb_id}:${item.content_type}`));

    return items.filter(i => !existingSet.has(`${i.tmdb_id}:${i.content_type}`));
}

// ============================================
// IMPORT
// ============================================

async function importItems(items: any[], jobId: string): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const item of items) {
        try {
            // Fetch full details from TMDB
            const details = item.content_type === 'movie'
                ? await getMovieDetails(item.tmdb_id)
                : await getTvDetails(item.tmdb_id);

            // Map to database schema
            const contentData = mapToContent(details, item.content_type);

            // Insert/Update
            const { error } = await supabase
                .from('content')
                .upsert(contentData, { onConflict: 'tmdb_id,content_type' });

            if (error) throw error;
            success++;

            // Log progress every 50 items
            if ((success + failed) % 50 === 0) {
                console.log(`  Progress: ${success + failed}/${items.length}`);
            }

            await delay(300); // Rate limiting
        } catch (e) {
            console.error(`  Failed ${item.tmdb_id}:`, e);
            failed++;
        }
    }

    return { success, failed };
}

function mapToContent(details: any, contentType: string): any {
    const isMovie = contentType === 'movie';
    return {
        tmdb_id: details.id,
        imdb_id: details.imdb_id || details.external_ids?.imdb_id || null,
        content_type: contentType,
        title: isMovie ? details.title : details.name,
        original_title: isMovie ? details.original_title : details.original_name,
        overview: details.overview || null,
        poster_path: details.poster_path || null,
        backdrop_path: details.backdrop_path || null,
        release_date: isMovie ? details.release_date : null,
        first_air_date: !isMovie ? details.first_air_date : null,
        original_language: details.original_language || null,
        origin_country: details.origin_country || [],
        genres: details.genres || [],
        popularity: details.popularity || null,
        vote_average: details.vote_average || null,
        vote_count: details.vote_count || null,
        runtime: isMovie ? details.runtime : null,
        number_of_seasons: !isMovie ? details.number_of_seasons : null,
        number_of_episodes: !isMovie ? details.number_of_episodes : null,
        tagline: details.tagline || null,
        homepage: details.homepage || null,
        tmdb_status: details.status || null,
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
