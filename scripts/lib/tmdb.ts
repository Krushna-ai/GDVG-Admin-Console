/**
 * Standalone TMDB Client for GitHub Actions
 * Uses Bearer Token authentication (recommended by TMDB)
 */

const TMDB_ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN!;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

if (!TMDB_ACCESS_TOKEN) {
    throw new Error('Missing TMDB_ACCESS_TOKEN environment variable');
}

async function tmdbFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
        headers: {
            'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });

    if (!res.ok) {
        throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

export async function discoverTv(params: Record<string, string | number> = {}) {
    const stringParams: Record<string, string> = {};
    Object.entries(params).forEach(([k, v]) => { stringParams[k] = String(v); });
    return tmdbFetch<any>('/discover/tv', stringParams);
}

export async function discoverMovies(params: Record<string, string | number> = {}) {
    const stringParams: Record<string, string> = {};
    Object.entries(params).forEach(([k, v]) => { stringParams[k] = String(v); });
    return tmdbFetch<any>('/discover/movie', stringParams);
}

export async function getMovieDetails(id: number) {
    return tmdbFetch<any>(`/movie/${id}`, {
        append_to_response: 'credits,keywords,videos,watch/providers,external_ids,content_ratings'
    });
}

export async function getTvDetails(id: number) {
    return tmdbFetch<any>(`/tv/${id}`, {
        append_to_response: 'credits,keywords,videos,watch/providers,external_ids,content_ratings'
    });
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

export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
