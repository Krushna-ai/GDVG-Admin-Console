/**
 * Sync Changes Script for GitHub Actions
 * Runs weekly to update existing content from TMDB /changes API
 */

import supabase from './lib/supabase';
import { getChangedMovieIds, getChangedTvIds, getMovieDetails, getTvDetails, delay } from './lib/tmdb';

const DAYS_BACK = parseInt(process.env.DAYS_BACK || '7', 10);

async function main() {
    console.log('🔄 Starting Sync Changes...');
    console.log(`📅 Looking back ${DAYS_BACK} days`);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - DAYS_BACK);

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    console.log(`📆 Date range: ${startStr} to ${endStr}`);

    // Get changed IDs from TMDB
    const movieIds: number[] = [];
    const tvIds: number[] = [];

    console.log('\n📡 Fetching changed movie IDs...');
    for (let page = 1; page <= 5; page++) {
        const data = await getChangedMovieIds(startStr, endStr, page);
        movieIds.push(...(data.results?.filter((r: any) => !r.adult).map((r: any) => r.id) || []));
        if (page >= data.total_pages) break;
        await delay(100);
    }
    console.log(`  Found ${movieIds.length} changed movies`);

    console.log('\n📡 Fetching changed TV IDs...');
    for (let page = 1; page <= 5; page++) {
        const data = await getChangedTvIds(startStr, endStr, page);
        tvIds.push(...(data.results?.filter((r: any) => !r.adult).map((r: any) => r.id) || []));
        if (page >= data.total_pages) break;
        await delay(100);
    }
    console.log(`  Found ${tvIds.length} changed TV shows`);

    // Find which ones exist in our database
    const { data: existingMovies } = await supabase
        .from('content')
        .select('tmdb_id')
        .eq('content_type', 'movie')
        .in('tmdb_id', movieIds.length > 0 ? movieIds : [0]);

    const { data: existingTv } = await supabase
        .from('content')
        .select('tmdb_id')
        .eq('content_type', 'tv')
        .in('tmdb_id', tvIds.length > 0 ? tvIds : [0]);

    const movieToUpdate = existingMovies?.map(e => e.tmdb_id) || [];
    const tvToUpdate = existingTv?.map(e => e.tmdb_id) || [];

    console.log(`\n🎬 Movies to update: ${movieToUpdate.length}`);
    console.log(`📺 TV shows to update: ${tvToUpdate.length}`);

    // Update movies
    let updated = 0, failed = 0;
    for (const id of movieToUpdate) {
        try {
            const details = await getMovieDetails(id);
            await supabase.from('content').update({
                title: details.title,
                overview: details.overview,
                poster_path: details.poster_path,
                backdrop_path: details.backdrop_path,
                popularity: details.popularity,
                vote_average: details.vote_average,
                vote_count: details.vote_count,
                runtime: details.runtime,
                tmdb_status: details.status,
                updated_at: new Date().toISOString(),
            }).eq('tmdb_id', id).eq('content_type', 'movie');
            updated++;
            await delay(300);
        } catch (e) {
            console.error(`  Failed movie ${id}:`, e);
            failed++;
        }
    }

    // Update TV
    for (const id of tvToUpdate) {
        try {
            const details = await getTvDetails(id);
            await supabase.from('content').update({
                title: details.name,
                overview: details.overview,
                poster_path: details.poster_path,
                backdrop_path: details.backdrop_path,
                popularity: details.popularity,
                vote_average: details.vote_average,
                vote_count: details.vote_count,
                number_of_seasons: details.number_of_seasons,
                number_of_episodes: details.number_of_episodes,
                tmdb_status: details.status,
                updated_at: new Date().toISOString(),
            }).eq('tmdb_id', id).eq('content_type', 'tv');
            updated++;
            await delay(300);
        } catch (e) {
            console.error(`  Failed TV ${id}:`, e);
            failed++;
        }
    }

    console.log(`\n✅ Updated: ${updated}, ❌ Failed: ${failed}`);
}

main();
