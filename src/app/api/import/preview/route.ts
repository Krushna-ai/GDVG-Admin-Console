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

        console.log('[Preview] Request received:', {
            content_type: body.content_type,
            countries: body.origin_countries,
            min_popularity: body.min_popularity,
        });

        // Validate required fields
        if (!body.origin_countries || body.origin_countries.length === 0) {
            console.error('[Preview] Validation error: No origin countries');
            return NextResponse.json(
                { error: 'At least one origin country is required' },
                { status: 400 }
            );
        }

        const tmdbAccessToken = process.env.TMDB_ACCESS_TOKEN;
        if (!tmdbAccessToken) {
            console.error('[Preview] TMDB_ACCESS_TOKEN not configured');
            return NextResponse.json(
                { error: 'TMDB access token not configured. Please set TMDB_ACCESS_TOKEN in environment variables.' },
                { status: 500 }
            );
        }

        // Build TMDB Discover API params
        const contentTypes = body.content_type === 'both' ? ['movie', 'tv'] : [body.content_type];
        let allResults: any[] = [];
        let totalEstimate = 0;
        let tmdbErrors: string[] = [];

        // Fetch from TMDB (limited to 2 pages for speed)
        for (const type of contentTypes) {
            for (let page = 1; page <= 2; page++) {
                try {
                    const params = new URLSearchParams({
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

                    console.log(`[Preview] Fetching TMDB ${type} page ${page}`);
                    const response = await fetch(url, {
                        headers: {
                            'Authorization': `Bearer ${tmdbAccessToken}`,
                            'Content-Type': 'application/json',
                        },
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('[Preview] TMDB API error:', response.status, errorText);
                        tmdbErrors.push(`${type} page ${page}: ${response.status}`);
                        continue;
                    }

                    const data = await response.json();
                    allResults.push(...(data.results || []));
                    totalEstimate += data.total_results || 0;
                    console.log(`[Preview] Got ${data.results?.length || 0} results from ${type} page ${page}`);
                } catch (fetchError) {
                    console.error(`[Preview] Fetch error for ${type} page ${page}:`, fetchError);
                    tmdbErrors.push(`${type} page ${page}: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
                }
            }
        }

        // If no results at all, return error with details
        if (allResults.length === 0) {
            console.error('[Preview] No results found. TMDB errors:', tmdbErrors);
            return NextResponse.json(
                {
                    error: 'No content found with the specified criteria',
                    details: tmdbErrors.length > 0 ? `TMDB errors: ${tmdbErrors.join(', ')}` : 'Try adjusting your filters',
                },
                { status: 404 }
            );
        }

        // Limit to max_items if specified
        const maxItems = body.max_items || 500;
        totalEstimate = Math.min(totalEstimate, maxItems);

        // Check for duplicates in database
        console.log('[Preview] Checking for duplicates in database');
        const tmdbIds = allResults.map(item => item.id);
        const { data: existingContent, error: dbError } = await supabase
            .from('content')
            .select('tmdb_id')
            .in('tmdb_id', tmdbIds);

        if (dbError) {
            console.error('[Preview] Database error:', dbError);
            // Continue anyway - show all as new if DB check fails
        }

        const existingIds = new Set(existingContent?.map(c => c.tmdb_id) || []);
        const duplicates = allResults.filter(item => existingIds.has(item.id));
        const newContent = allResults.filter(item => !existingIds.has(item.id));

        console.log('[Preview] Results:', {
            total: allResults.length,
            duplicates: duplicates.length,
            new: newContent.length,
        });

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
            warnings: tmdbErrors.length > 0 ? tmdbErrors : undefined,
        });

    } catch (error) {
        console.error('[Preview] Unexpected error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            {
                error: 'Failed to generate preview',
                details: errorMessage,
            },
            { status: 500 }
        );
    }
}
