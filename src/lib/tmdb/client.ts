// TMDB API Client
// Enhanced client with discover, person details, and configuration

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_ACCESS_TOKEN = process.env.NEXT_PUBLIC_TMDB_ACCESS_TOKEN;

// ============================================
// TYPES
// ============================================

export interface TMDBConfiguration {
  images: {
    base_url: string;
    secure_base_url: string;
    backdrop_sizes: string[];
    logo_sizes: string[];
    poster_sizes: string[];
    profile_sizes: string[];
    still_sizes: string[];
  };
}

export interface TMDBSearchResult {
  page: number;
  total_pages: number;
  total_results: number;
  results: TMDBSearchItem[];
}

export interface TMDBSearchItem {
  id: number;
  media_type: 'movie' | 'tv' | 'person';
  title?: string; // For movies
  name?: string; // For TV/person
  poster_path?: string;
  profile_path?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  popularity: number;
  vote_average?: number;
}

export interface TMDBDiscoverResult {
  page: number;
  total_pages: number;
  total_results: number;
  results: TMDBDiscoverItem[];
}

export interface TMDBDiscoverItem {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  original_language: string;
  origin_country?: string[];
}

export interface TMDBPersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  gender: number;
  imdb_id: string | null;
  homepage: string | null;
  also_known_as: string[];
  adult: boolean;
  combined_credits?: {
    cast: TMDBPersonCreditCast[];
    crew: TMDBPersonCreditCrew[];
  };
}

export interface TMDBPersonCreditCast {
  id: number;
  title?: string;
  name?: string;
  media_type: 'movie' | 'tv';
  character: string;
  poster_path?: string;
  release_date?: string;
  first_air_date?: string;
}

export interface TMDBPersonCreditCrew {
  id: number;
  title?: string;
  name?: string;
  media_type: 'movie' | 'tv';
  job: string;
  department: string;
  poster_path?: string;
}

export interface DiscoverFilters {
  page?: number;
  with_genres?: string; // Comma-separated genre IDs
  with_original_language?: string; // ISO 639-1 code (ko, ja, zh, etc.)
  with_origin_country?: string; // ISO 3166-1 code (KR, JP, CN, etc.)
  primary_release_year?: number; // For movies
  first_air_date_year?: number; // For TV
  sort_by?: string; // popularity.desc, vote_average.desc, etc.
  vote_count_gte?: number; // Minimum votes
  vote_average_gte?: number; // Minimum rating
  with_keywords?: string; // Comma-separated keyword IDs
}

// ============================================
// HELPERS
// ============================================

// Simple delay for rate limiting
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Make authenticated TMDB request
async function tmdbFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  // Rate limiting: 100ms delay before each request
  await delay(100);

  if (!TMDB_ACCESS_TOKEN) {
    throw new Error('TMDB_ACCESS_TOKEN is not configured');
  }

  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        url.searchParams.append(key, value);
      }
    });
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TMDB_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('TMDB fetch error:', error);
    throw error;
  }
}

// ============================================
// API FUNCTIONS
// ============================================

// Get TMDB configuration (image base URLs, sizes)
export async function getConfiguration(): Promise<TMDBConfiguration> {
  return tmdbFetch<TMDBConfiguration>('/configuration');
}

// Search for movies, TV shows, and people
export async function searchMulti(query: string, page: number = 1): Promise<TMDBSearchResult> {
  return tmdbFetch<TMDBSearchResult>('/search/multi', {
    query,
    page: page.toString(),
  });
}

// Get movie details with all extended data
export async function getMovieDetails(movieId: number): Promise<any> {
  return tmdbFetch(`/movie/${movieId}`, {
    append_to_response: 'credits,keywords,videos,watch/providers,alternative_titles,external_ids,release_dates',
  });
}

// Get TV show details with all extended data
export async function getTvDetails(tvId: number): Promise<any> {
  return tmdbFetch(`/tv/${tvId}`, {
    append_to_response: 'credits,keywords,content_ratings,videos,watch/providers,alternative_titles,external_ids',
  });
}

// Get person details with combined credits
export async function getPersonDetails(personId: number): Promise<TMDBPersonDetails> {
  return tmdbFetch<TMDBPersonDetails>(`/person/${personId}`, {
    append_to_response: 'combined_credits',
  });
}

// Discover movies with filters
export async function discoverMovies(filters: DiscoverFilters = {}): Promise<TMDBDiscoverResult> {
  const params: Record<string, string> = {
    page: (filters.page || 1).toString(),
    sort_by: filters.sort_by || 'popularity.desc',
  };

  if (filters.with_genres) params.with_genres = filters.with_genres;
  if (filters.with_original_language) params.with_original_language = filters.with_original_language;
  if (filters.with_origin_country) params.with_origin_country = filters.with_origin_country;
  if (filters.primary_release_year) params.primary_release_year = filters.primary_release_year.toString();
  if (filters.vote_count_gte) params['vote_count.gte'] = filters.vote_count_gte.toString();
  if (filters.vote_average_gte) params['vote_average.gte'] = filters.vote_average_gte.toString();
  if (filters.with_keywords) params.with_keywords = filters.with_keywords;

  return tmdbFetch<TMDBDiscoverResult>('/discover/movie', params);
}

// Discover TV shows with filters
export async function discoverTv(filters: DiscoverFilters = {}): Promise<TMDBDiscoverResult> {
  const params: Record<string, string> = {
    page: (filters.page || 1).toString(),
    sort_by: filters.sort_by || 'popularity.desc',
  };

  if (filters.with_genres) params.with_genres = filters.with_genres;
  if (filters.with_original_language) params.with_original_language = filters.with_original_language;
  if (filters.with_origin_country) params.with_origin_country = filters.with_origin_country;
  if (filters.first_air_date_year) params.first_air_date_year = filters.first_air_date_year.toString();
  if (filters.vote_count_gte) params['vote_count.gte'] = filters.vote_count_gte.toString();
  if (filters.vote_average_gte) params['vote_average.gte'] = filters.vote_average_gte.toString();
  if (filters.with_keywords) params.with_keywords = filters.with_keywords;

  return tmdbFetch<TMDBDiscoverResult>('/discover/tv', params);
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

// Discover Korean dramas
export async function discoverKoreanDramas(page: number = 1): Promise<TMDBDiscoverResult> {
  return discoverTv({
    page,
    with_origin_country: 'KR',
    with_genres: '18', // Drama genre
    sort_by: 'popularity.desc',
  });
}

// Discover anime (Japanese animation)
export async function discoverAnime(page: number = 1): Promise<TMDBDiscoverResult> {
  return discoverTv({
    page,
    with_origin_country: 'JP',
    with_genres: '16', // Animation genre
    sort_by: 'popularity.desc',
  });
}

// Discover Chinese dramas
export async function discoverChineseDramas(page: number = 1): Promise<TMDBDiscoverResult> {
  return discoverTv({
    page,
    with_origin_country: 'CN',
    with_genres: '18', // Drama genre
    sort_by: 'popularity.desc',
  });
}

// Discover Thai dramas
export async function discoverThaiDramas(page: number = 1): Promise<TMDBDiscoverResult> {
  return discoverTv({
    page,
    with_origin_country: 'TH',
    with_genres: '18', // Drama genre
    sort_by: 'popularity.desc',
  });
}

// Discover Turkish dramas
export async function discoverTurkishDramas(page: number = 1): Promise<TMDBDiscoverResult> {
  return discoverTv({
    page,
    with_origin_country: 'TR',
    with_genres: '18', // Drama genre
    sort_by: 'popularity.desc',
  });
}

// Discover Indian dramas/series (Family Man, Special Ops, Sacred Games, etc.)
export async function discoverIndianDramas(page: number = 1): Promise<TMDBDiscoverResult> {
  return discoverTv({
    page,
    with_origin_country: 'IN',
    with_genres: '18', // Drama genre
    sort_by: 'popularity.desc',
  });
}

// Discover Indian movies (Bollywood)
export async function discoverBollywood(page: number = 1): Promise<TMDBDiscoverResult> {
  return discoverMovies({
    page,
    with_origin_country: 'IN',
    sort_by: 'popularity.desc',
  });
}

// ============================================
// CHANGE TRACKING
// ============================================

export interface TMDBChangesResult {
  results: Array<{ id: number; adult?: boolean }>;
  page: number;
  total_pages: number;
  total_results: number;
}

// Get list of movie IDs that have been changed
export async function getChangedMovieIds(
  startDate?: string,
  endDate?: string,
  page: number = 1
): Promise<TMDBChangesResult> {
  const params: Record<string, string> = { page: page.toString() };
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  return tmdbFetch<TMDBChangesResult>('/movie/changes', params);
}

// Get list of TV show IDs that have been changed
export async function getChangedTvIds(
  startDate?: string,
  endDate?: string,
  page: number = 1
): Promise<TMDBChangesResult> {
  const params: Record<string, string> = { page: page.toString() };
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  return tmdbFetch<TMDBChangesResult>('/tv/changes', params);
}

export { delay };

