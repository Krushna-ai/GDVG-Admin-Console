const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

async function tmdbFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const token = process.env.TMDB_ACCESS_TOKEN;
    if (!token) throw new Error('Missing TMDB_ACCESS_TOKEN environment variable');

    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await delay(250);

            const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
            Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

            const res = await fetch(url.toString(), {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!res.ok) {
                if (res.status === 429) {
                    if (attempt === maxAttempts) {
                        throw new Error(`TMDB API error: ${res.status} ${res.statusText} — retries exhausted`);
                    }
                    const waitTime = 1000 * Math.pow(2, attempt);
                    console.log(`  ⏳ Rate limited (429), waiting ${waitTime}ms (attempt ${attempt}/${maxAttempts})`);
                    await delay(waitTime);
                    continue;
                }

                if (res.status === 500 || res.status === 503) {
                    if (attempt === maxAttempts) {
                        throw new Error(`TMDB API error: ${res.status} ${res.statusText} — retries exhausted`);
                    }
                    const waitTime = 1000 * attempt;
                    console.log(`  ⚠️ Server error (${res.status}), waiting ${waitTime}ms (attempt ${attempt}/${maxAttempts})`);
                    await delay(waitTime);
                    continue;
                }

                // Any other non-ok status: throw immediately
                throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
            }

            return res.json();
        } catch (error: any) {
            // If it's an HTTP error we already decided not to retry, rethrow immediately
            if (error?.message?.includes('TMDB API error') && !error?.message?.includes('retries exhausted')) {
                throw error;
            }

            // Network / socket errors
            if (attempt === maxAttempts) {
                throw new Error(`TMDB API network error after ${maxAttempts} attempts: ${error?.message || error}`);
            }

            const waitTime = 1000 * Math.pow(2, attempt);
            console.log(`  🔌 Network error, waiting ${waitTime}ms (attempt ${attempt}/${maxAttempts})`);
            await delay(waitTime);
        }
    }

    // Should never reach here, but TypeScript needs a fallback
    throw new Error('TMDB API error: unexpected end of retry loop');
}

export function getMovieDetails(id: number) {
    return tmdbFetch<any>(`/movie/${id}`, {
        append_to_response: 'credits,keywords,videos,images,watch/providers,external_ids,release_dates,content_ratings,alternative_titles,translations,recommendations,similar,reviews',
    });
}

export function getTvDetails(id: number) {
    return tmdbFetch<any>(`/tv/${id}`, {
        append_to_response: 'credits,aggregate_credits,keywords,videos,images,watch/providers,external_ids,release_dates,content_ratings,alternative_titles,translations,recommendations,similar,reviews',
    });
}

export async function fetchContentDetails(tmdbId: number, contentType: 'movie' | 'tv'): Promise<any | null> {
    try {
        return contentType === 'movie' ? await getMovieDetails(tmdbId) : await getTvDetails(tmdbId);
    } catch (error) {
        console.error(`Error fetching ${contentType} ${tmdbId}:`, error);
        return null;
    }
}

export async function getChangedMovieIds(startDate?: string, endDate?: string, page = 1) {
    const params: Record<string, string> = { page: String(page) };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return tmdbFetch<any>('/movie/changes', params);
}

export async function getChangedTvIds(startDate?: string, endDate?: string, page = 1) {
    const params: Record<string, string> = { page: String(page) };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return tmdbFetch<any>('/tv/changes', params);
}

export function discoverMovies(params: Record<string, string | number> = {}) {
    const stringParams: Record<string, string> = {};
    Object.entries(params).forEach(([k, v]) => { stringParams[k] = String(v); });
    return tmdbFetch<any>('/discover/movie', stringParams);
}

export function discoverTv(params: Record<string, string | number> = {}) {
    const stringParams: Record<string, string> = {};
    Object.entries(params).forEach(([k, v]) => { stringParams[k] = String(v); });
    return tmdbFetch<any>('/discover/tv', stringParams);
}

export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export interface TmdbEpisode {
    id: number;
    name: string;
    overview: string;
    air_date: string;
    episode_number: number;
    runtime: number;
    still_path: string;
    vote_average: number;
    vote_count: number;
    production_code: string;
    guest_stars: any[];
    crew: any[];
}

export interface TmdbSeason {
    id: number;
    season_number: number;
    name: string;
    overview: string;
    air_date: string;
    episode_count: number;
    poster_path: string;
    episodes: TmdbEpisode[];
}

export async function getSeasonDetails(tvTmdbId: number, seasonNumber: number): Promise<TmdbSeason> {
    await delay(400);
    return tmdbFetch<TmdbSeason>(`/tv/${tvTmdbId}/season/${seasonNumber}`);
}

export interface TmdbCollectionPart {
    id: number;
    title: string;
    release_date: string;
    overview: string;
    poster_path: string;
    backdrop_path: string;
    media_type: string;
    adult: boolean;
    original_language: string;
    original_title: string;
    popularity: number;
    video: boolean;
    vote_average: number;
    vote_count: number;
}

export interface TmdbCollection {
    id: number;
    name: string;
    overview: string;
    poster_path: string;
    backdrop_path: string;
    parts: TmdbCollectionPart[];
}

export async function getCollectionDetails(collectionId: number): Promise<TmdbCollection> {
    await delay(400);
    return tmdbFetch<TmdbCollection>(`/collection/${collectionId}`);
}
