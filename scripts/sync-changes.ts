/**
 * Sync Changes Script for GitHub Actions
 * Runs weekly to update existing content from TMDB /changes API
 */

import supabase from './lib/supabase';
import { getChangedMovieIds, getChangedTvIds, delay } from './lib/tmdb';
import { updateContentWithCredits } from './lib/enrich';

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

    // Find which ones exist in our database (with IDs)
    const { data: existingMovies } = await supabase
        .from('content')
        .select('id, tmdb_id')
        .eq('content_type', 'movie')
        .in('tmdb_id', movieIds.length > 0 ? movieIds : [0]);

    const { data: existingTv } = await supabase
        .from('content')
        .select('id, tmdb_id')
        .eq('content_type', 'tv')
        .in('tmdb_id', tvIds.length > 0 ? tvIds : [0]);

    console.log(`\n🎬 Movies to update: ${existingMovies?.length || 0}`);
    console.log(`📺 TV shows to update: ${existingTv?.length || 0}`);

    // Update movies with cast/crew refresh
    let updated = 0, failed = 0, totalPeople = 0;

    for (const content of existingMovies || []) {
        try {
            const result = await updateContentWithCredits(
                content.id,
                content.tmdb_id,
                'movie'
            );

            if (result.success) {
                updated++;
                totalPeople += result.peopleUpdated || 0;

                if (updated % 10 === 0) {
                    console.log(`  ✓ ${updated} updated (${totalPeople} people)`);
                }
            } else {
                failed++;
                console.error(`  Failed movie ${content.tmdb_id}: ${result.error}`);
            }

            await delay(300);
        } catch (e) {
            console.error(`  Failed movie ${content.tmdb_id}:`, e);
            failed++;
        }
    }

    // Update TV shows with cast/crew refresh
    for (const content of existingTv || []) {
        try {
            const result = await updateContentWithCredits(
                content.id,
                content.tmdb_id,
                'tv'
            );

            if (result.success) {
                updated++;
                totalPeople += result.peopleUpdated || 0;

                if (updated % 10 === 0) {
                    console.log(`  ✓ ${updated} updated (${totalPeople} people)`);
                }
            } else {
                failed++;
                console.error(`  Failed TV ${content.tmdb_id}: ${result.error}`);
            }

            await delay(300);
        } catch (e) {
            console.error(`  Failed TV ${content.tmdb_id}:`, e);
            failed++;
        }
    }

    console.log(`\n✅ Updated: ${updated} content`);
    console.log(`👥 People refreshed: ${totalPeople}`);
    console.log(`❌ Failed: ${failed}`);
}

main();
