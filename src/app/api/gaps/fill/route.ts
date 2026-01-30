import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface FillRequest {
    gap_ids?: string[];
    mode?: 'top' | 'all';
    limit?: number;
}

/**
 * Fill gaps by importing missing content from TMDB
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body: FillRequest = await request.json();

        let gapsToFill: any[] = [];

        if (body.gap_ids && body.gap_ids.length > 0) {
            // Fill specific gaps
            const { data } = await supabase
                .from('gap_registry')
                .select('*')
                .in('id', body.gap_ids)
                .eq('status', 'unresolved');

            gapsToFill = data || [];

        } else if (body.mode === 'top') {
            // Fill top N priority gaps
            const limit = body.limit || 50;
            const { data } = await supabase
                .from('gap_registry')
                .select('*')
                .eq('status', 'unresolved')
                .order('priority_score', { ascending: false })
                .limit(limit);

            gapsToFill = data || [];

        } else if (body.mode === 'all') {
            // Fill all unresolved gaps
            const { data } = await supabase
                .from('gap_registry')
                .select('*')
                .eq('status', 'unresolved')
                .order('priority_score', { ascending: false });

            gapsToFill = data || [];
        }

        if (gapsToFill.length === 0) {
            return NextResponse.json({
                success: false,
                message: 'No gaps to fill',
            });
        }

        // Import content from TMDB for each gap
        const tmdbAccessToken = process.env.TMDB_ACCESS_TOKEN!;
        let successCount = 0;
        let failCount = 0;

        for (const gap of gapsToFill) {
            try {
                // Fetch details from TMDB
                const type = gap.content_type;
                const detailsUrl = `https://api.themoviedb.org/3/${type}/${gap.tmdb_id}`;
                const detailsResponse = await fetch(detailsUrl, {
                    headers: {
                        'Authorization': `Bearer ${tmdbAccessToken}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (!detailsResponse.ok) {
                    throw new Error('TMDB API error');
                }

                const details = await detailsResponse.json();

                // Prepare content data
                const contentData = {
                    tmdb_id: details.id,
                    content_type: type,
                    title: type === 'movie' ? details.title : details.name,
                    original_title: type === 'movie' ? details.original_title : details.original_name,
                    overview: details.overview,
                    release_date: type === 'movie' ? details.release_date : details.first_air_date,
                    poster_path: details.poster_path,
                    backdrop_path: details.backdrop_path,
                    vote_average: details.vote_average,
                    vote_count: details.vote_count,
                    popularity: details.popularity,
                    genre_ids: details.genres?.map((g: any) => g.id) || [],
                    origin_countries: type === 'movie'
                        ? details.production_countries?.map((c: any) => c.iso_3166_1) || []
                        : details.origin_country || [],
                    original_language: details.original_language,
                    adult: details.adult,
                    status: details.status,
                    runtime: type === 'movie' ? details.runtime : null,
                    number_of_seasons: type === 'tv' ? details.number_of_seasons : null,
                    number_of_episodes: type === 'tv' ? details.number_of_episodes : null,
                };

                // Upsert to content table
                const { error: upsertError } = await supabase
                    .from('content')
                    .upsert(contentData, { onConflict: 'tmdb_id' });

                if (upsertError) {
                    throw upsertError;
                }

                // Mark gap as resolved
                await supabase
                    .from('gap_registry')
                    .update({
                        status: 'resolved',
                        resolved_at: new Date().toISOString(),
                    })
                    .eq('id', gap.id);

                successCount++;

            } catch (error) {
                console.error(`Failed to fill gap ${gap.id}:`, error);

                // Increment attempts
                await supabase
                    .from('gap_registry')
                    .update({
                        attempts: (gap.attempts || 0) + 1,
                        last_error: error instanceof Error ? error.message : 'Unknown error',
                    })
                    .eq('id', gap.id);

                failCount++;
            }

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        // Log to sync_logs
        await supabase.from('sync_logs').insert({
            type: 'gap_fill',
            status: failCount === 0 ? 'success' : 'partial',
            message: `Gap fill completed: ${successCount} succeeded, ${failCount} failed`,
            details: {
                total: gapsToFill.length,
                succeeded: successCount,
                failed: failCount,
                mode: body.mode || 'specific',
            },
            created_at: new Date().toISOString(),
        });

        return NextResponse.json({
            success: true,
            total: gapsToFill.length,
            succeeded: successCount,
            failed: failCount,
            message: `Filled ${successCount} of ${gapsToFill.length} gaps`,
        });

    } catch (error) {
        console.error('Gap fill error:', error);
        return NextResponse.json(
            { error: 'Failed to fill gaps', details: String(error) },
            { status: 500 }
        );
    }
}
