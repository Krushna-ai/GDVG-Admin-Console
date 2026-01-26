/**
 * Bulk Import Script for GitHub Actions
 * Manually triggered to import content by region/type
 */

import supabase from './lib/supabase';
import { discoverTv, discoverMovies, getMovieDetails, getTvDetails, delay } from './lib/tmdb';

// Get inputs from environment
const REGION = process.env.IMPORT_REGION || 'ALL';
const CONTENT_TYPE = process.env.IMPORT_TYPE || 'all';
const LIMIT = parseInt(process.env.IMPORT_LIMIT || '500', 10);

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
    const discovered: any[] = [];

    // Discovery phase
    for (const country of countries) {
        if (CONTENT_TYPE === 'all' || CONTENT_TYPE === 'tv') {
            console.log(`  Discovering TV from ${country}...`);
            for (let page = 1; page <= 5; page++) {
                try {
                    const data = await discoverTv({ with_origin_country: country, page });
                    for (const item of data.results || []) {
                        discovered.push({ ...item, _type: 'tv', _country: country });
                    }
                    await delay(100);
                } catch (e) {
                    console.error(`    Error page ${page}:`, e);
                }
            }
        }
        if (CONTENT_TYPE === 'all' || CONTENT_TYPE === 'movie') {
            console.log(`  Discovering Movies from ${country}...`);
            for (let page = 1; page <= 3; page++) {
                try {
                    const data = await discoverMovies({ with_origin_country: country, page });
                    for (const item of data.results || []) {
                        discovered.push({ ...item, _type: 'movie', _country: country });
                    }
                    await delay(100);
                } catch (e) {
                    console.error(`    Error page ${page}:`, e);
                }
            }
        }
    }

    console.log(`\n📡 Discovered ${discovered.length} items`);

    // Filter existing
    const tmdbIds = discovered.map(d => d.id);
    const { data: existing } = await supabase
        .from('content')
        .select('tmdb_id')
        .in('tmdb_id', tmdbIds.length > 0 ? tmdbIds : [0]);
    const existingSet = new Set(existing?.map(e => e.tmdb_id) || []);

    const newItems = discovered.filter(d => !existingSet.has(d.id)).slice(0, LIMIT);
    console.log(`🔍 ${newItems.length} new items to import`);

    // Import
    let success = 0, failed = 0;
    for (const item of newItems) {
        try {
            const details = item._type === 'movie'
                ? await getMovieDetails(item.id)
                : await getTvDetails(item.id);

            const contentData = {
                tmdb_id: details.id,
                content_type: item._type,
                title: item._type === 'movie' ? details.title : details.name,
                original_title: item._type === 'movie' ? details.original_title : details.original_name,
                overview: details.overview,
                poster_path: details.poster_path,
                backdrop_path: details.backdrop_path,
                release_date: item._type === 'movie' ? details.release_date : null,
                first_air_date: item._type === 'tv' ? details.first_air_date : null,
                original_language: details.original_language,
                origin_country: details.origin_country || [item._country],
                genres: details.genres || [],
                popularity: details.popularity,
                vote_average: details.vote_average,
                vote_count: details.vote_count,
                tmdb_status: details.status,
            };

            await supabase.from('content').upsert(contentData, { onConflict: 'tmdb_id,content_type' });
            success++;

            if ((success + failed) % 25 === 0) {
                console.log(`  Progress: ${success + failed}/${newItems.length}`);
            }
            await delay(300);
        } catch (e) {
            console.error(`  Failed ${item.id}:`, e);
            failed++;
        }
    }

    console.log(`\n✅ Imported: ${success}, ❌ Failed: ${failed}`);
}

main();
