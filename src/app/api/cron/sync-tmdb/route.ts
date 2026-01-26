import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// CRON endpoint to sync content updates from TMDB
// Recommended: Trigger daily via Railway cron or external scheduler
// Security: Add CRON_SECRET env var for production

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Basic auth check for cron jobs
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = await createClient();
        const results = {
            updated: 0,
            failed: 0,
            errors: [] as string[],
        };

        // Get content updated in last 24 hours from TMDB changes API
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 1);
        const endDate = new Date();

        // Fetch TV changes
        const tvChangesRes = await fetch(
            `${TMDB_BASE_URL}/tv/changes?api_key=${TMDB_API_KEY}&start_date=${startDate.toISOString().split('T')[0]}&end_date=${endDate.toISOString().split('T')[0]}&page=1`
        );
        const tvChanges = await tvChangesRes.json();

        // Fetch Movie changes
        const movieChangesRes = await fetch(
            `${TMDB_BASE_URL}/movie/changes?api_key=${TMDB_API_KEY}&start_date=${startDate.toISOString().split('T')[0]}&end_date=${endDate.toISOString().split('T')[0]}&page=1`
        );
        const movieChanges = await movieChangesRes.json();

        // Get our content that might need updates
        const changedTmdbIds = [
            ...(tvChanges.results || []).map((r: any) => r.id),
            ...(movieChanges.results || []).map((r: any) => r.id),
        ];

        if (changedTmdbIds.length === 0) {
            return NextResponse.json({
                message: 'No TMDB changes found in last 24 hours',
                ...results,
            });
        }

        // Find our content that matches changed TMDB IDs
        const { data: ourContent } = await supabase
            .from('content')
            .select('id, tmdb_id, content_type, title')
            .in('tmdb_id', changedTmdbIds.slice(0, 100)); // Limit to prevent overload

        if (!ourContent || ourContent.length === 0) {
            return NextResponse.json({
                message: 'No matching content in our database needs updating',
                checkedIds: changedTmdbIds.length,
                ...results,
            });
        }

        // Update each matching content
        for (const content of ourContent) {
            try {
                const endpoint = content.content_type === 'movie' ? 'movie' : 'tv';
                const detailRes = await fetch(
                    `${TMDB_BASE_URL}/${endpoint}/${content.tmdb_id}?api_key=${TMDB_API_KEY}&append_to_response=credits,keywords,videos,watch/providers,external_ids,content_ratings,release_dates`
                );

                if (!detailRes.ok) {
                    results.failed++;
                    results.errors.push(`Failed to fetch ${content.title}`);
                    continue;
                }

                const tmdbData = await detailRes.json();

                // Update basic fields
                const updateData: any = {
                    vote_average: tmdbData.vote_average,
                    vote_count: tmdbData.vote_count,
                    popularity: tmdbData.popularity,
                    updated_at: new Date().toISOString(),
                };

                // Update episode count for TV
                if (content.content_type !== 'movie') {
                    updateData.number_of_seasons = tmdbData.number_of_seasons;
                    updateData.number_of_episodes = tmdbData.number_of_episodes;
                    updateData.status = tmdbData.status;
                }

                // Update videos if present
                if (tmdbData.videos?.results) {
                    updateData.videos = tmdbData.videos.results.slice(0, 10);
                }

                // Update watch providers if present
                if (tmdbData['watch/providers']?.results) {
                    updateData.watch_providers = tmdbData['watch/providers'].results;
                }

                const { error } = await supabase
                    .from('content')
                    .update(updateData)
                    .eq('id', content.id);

                if (error) {
                    results.failed++;
                    results.errors.push(`DB error for ${content.title}: ${error.message}`);
                } else {
                    results.updated++;
                }

                // Rate limit - wait 100ms between API calls
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (err) {
                results.failed++;
                results.errors.push(`Error processing ${content.title}`);
            }
        }

        return NextResponse.json({
            message: 'TMDB sync completed',
            timestamp: new Date().toISOString(),
            ...results,
        });

    } catch (error) {
        console.error('TMDB sync error:', error);
        return NextResponse.json(
            { error: 'Sync failed', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
