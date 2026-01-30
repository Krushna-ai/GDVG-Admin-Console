import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface PreviewRequest {
    content_type: 'movie' | 'tv' | 'both';
    origin_countries: string[];
    min_popularity?: number;
    max_items?: number;
    release_date_from?: string;
    release_date_to?: string;
    genres?: number[];
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body: PreviewRequest = await request.json();

        // Validate required fields
        if (!body.origin_countries || body.origin_countries.length === 0) {
            return NextResponse.json(
                { error: 'At least one origin country is required' },
                { status: 400 }
            );
        }

        const tmdbApiKey = process.env.TMDB_API_KEY;
        if (!tmdbApiKey) {
            return NextResponse.json(
                { error: 'TMDB API key not configured' },
                { status: 500 }
            );
        }

        // Build TMDB Discover API params
        const contentTypes = body.content_type === 'both' ? ['movie', 'tv'] : [body.content_type];
        let allResults: any[] = [];
        let totalEstimate = 0;

        // Fetch from TMDB (limited to 2 pages for speed)
        for (const type of contentTypes) {
            for (let page = 1; page <= 2; page++) {
                const params = new URLSearchParams({
                    api_key: tmdbApiKey,
                    page: page.toString(),
                    with_origin_country: body.origin_countries.join('|'),
                    'vote_count.gte': '10', // Minimum votes for quality
                });

                if (body.min_popularity) {
                    params.append('vote_average.gte', (body.min_popularity / 10).toString());
                }

                if (body.release_date_from) {
                    const dateKey = type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
                    params.append(dateKey, body.release_date_from);
                }

                if (body.release_date_to) {
                    const dateKey = type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
                    params.append(dateKey, body.release_date_to);
                }

                if (body.genres && body.genres.length > 0) {
                    params.append('with_genres', body.genres.join(','));
                }

                params.append('sort_by', 'popularity.desc');

                const endpoint = type === 'movie' ? 'discover/movie' : 'discover/tv';
                const url = `https://api.themoviedb.org/3/${endpoint}?${params}`;

                const response = await fetch(url);
                if (!response.ok) {
                    console.error('TMDB API error:', response.statusText);
                    continue;
                }

                const data = await response.json();
                allResults.push(...data.results);
                totalEstimate += data.total_results || 0;
            }
        }

        // Limit to max_items if specified
        const maxItems = body.max_items || 500;
        totalEstimate = Math.min(totalEstimate, maxItems);

        // Check for duplicates in database
        const tmdbIds = allResults.map(item => item.id);
        const { data: existingContent } = await supabase
            .from('content')
            .select('tmdb_id')
            .in('tmdb_id', tmdbIds);

        const existingIds = new Set(existingContent?.map(c => c.tmdb_id) || []);
        const duplicates = allResults.filter(item => existingIds.has(item.id));
        const newContent = allResults.filter(item => !existingIds.has(item.id));

        // Prepare sample items (first 10)
        const sampleItems = allResults.slice(0, 10).map(item => ({
            tmdb_id: item.id,
            title: item.title || item.name,
            year: (item.release_date || item.first_air_date)?.split('-')[0] || 'N/A',
            poster_path: item.poster_path,
            popularity: item.popularity,
            vote_average: item.vote_average,
            is_duplicate: existingIds.has(item.id),
        }));

        return NextResponse.json({
            estimated_total: totalEstimate,
            duplicates: duplicates.length,
            new_content: newContent.length,
            sample_items: sampleItems,
        });

    } catch (error) {
        console.error('Preview error:', error);
        return NextResponse.json(
            { error: 'Failed to generate preview' },
            { status: 500 }
        );
    }
}
