import supabase from './lib/supabase';
import { getChangedMovieIds, getChangedTvIds, delay } from './lib/tmdb';

const DAYS_BACK = parseInt(process.env.DAYS_BACK || '7', 10);

async function fetchWithCredits(contentId: string, tmdbId: number, contentType: 'movie' | 'tv') {
    const endpoint = contentType === 'movie' ? 'movie' : 'tv';
    const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?append_to_response=credits,keywords,videos,images`;
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });

    if (!res.ok) throw new Error(`TMDB ${res.status} for ${tmdbId}`);

    const data = await res.json();

    const updateData: any = {
        overview: data.overview,
        tagline: data.tagline,
        vote_average: data.vote_average,
        vote_count: data.vote_count,
        popularity: data.popularity,
        backdrop_path: data.backdrop_path,
        poster_path: data.poster_path,
        tmdb_status: data.status,
        updated_at: new Date().toISOString(),
    };

    if (contentType !== 'movie') {
        updateData.number_of_episodes = data.number_of_episodes;
        updateData.number_of_seasons = data.number_of_seasons;
    } else {
        updateData.runtime = data.runtime;
    }

    const { error } = await supabase.from('content').update(updateData).eq('id', contentId);
    if (error) throw error;

    return { success: true };
}

async function main() {
    console.log('🔄 Starting Sync Changes...');
    console.log(`📅 Looking back ${DAYS_BACK} days`);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - DAYS_BACK);

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    console.log(`📆 Date range: ${startStr} to ${endStr}`);

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

    let updated = 0, failed = 0;

    for (const content of [...(existingMovies || []), ...(existingTv || [])]) {
        const type = existingMovies?.some(m => m.id === content.id) ? 'movie' : 'tv';
        try {
            await fetchWithCredits(content.id, content.tmdb_id, type);
            updated++;
            if (updated % 10 === 0) console.log(`  ✓ ${updated} updated`);
            await delay(300);
        } catch (e) {
            console.error(`  Failed ${type} ${content.tmdb_id}:`, e);
            failed++;
        }
    }

    console.log(`\n✅ Updated: ${updated} content`);
    console.log(`❌ Failed: ${failed}`);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
