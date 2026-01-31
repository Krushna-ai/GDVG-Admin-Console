/**
 * Database Helper Functions for GitHub Actions Scripts
 * Provides reusable database operations for content and people management
 */

import supabase from './supabase';

// ============================================
// TYPES
// ============================================

export interface Person {
    id?: string;
    tmdb_id: number;
    name: string;
    profile_path?: string | null;
    known_for_department?: string | null;
    popularity?: number | null;
    gender?: number | null;
    biography?: string | null;
    birthday?: string | null;
    deathday?: string | null;
    place_of_birth?: string | null;
    imdb_id?: string | null;
    also_known_as?: string[];
    homepage?: string | null;
    adult?: boolean;
}

export interface Content {
    id?: string;
    tmdb_id: number;
    content_type: 'movie' | 'tv';
    title: string;
    original_title?: string;
    overview?: string;
    poster_path?: string;
    backdrop_path?: string;
    release_date?: string;
    first_air_date?: string;
    original_language?: string;
    origin_country?: string[];
    genres?: any;
    popularity?: number;
    vote_average?: number;
    vote_count?: number;
    runtime?: number;
    number_of_seasons?: number;
    number_of_episodes?: number;
    tagline?: string;
    homepage?: string;
    budget?: number;
    revenue?: number;
    production_companies?: any;
    networks?: any;
    tmdb_status?: string;
    status?: 'draft' | 'published' | 'archived';
    content_rating?: string;
    keywords?: any;
    alternative_titles?: any;
    videos?: any;
    watch_providers?: any;
    wikidata_id?: string;
    tvdb_id?: number;
    imdb_id?: string;
}

// ============================================
// PERSON FUNCTIONS
// ============================================

/**
 * Upsert a person into the people table
 * @param data Person data from TMDB
 * @returns The upserted person with database ID
 */
export async function upsertPerson(data: Partial<Person>): Promise<Person> {
    const personData: Partial<Person> = {
        tmdb_id: data.tmdb_id,
        name: data.name || 'Unknown',
        profile_path: data.profile_path || null,
        known_for_department: data.known_for_department || null,
        popularity: data.popularity || null,
        gender: data.gender || null,
        biography: data.biography || null,
        birthday: data.birthday || null,
        deathday: data.deathday || null,
        place_of_birth: data.place_of_birth || null,
        imdb_id: data.imdb_id || null,
        also_known_as: data.also_known_as || [],
        homepage: data.homepage || null,
        adult: data.adult || false,
    };

    const { data: result, error } = await supabase
        .from('people')
        .upsert(personData, {
            onConflict: 'tmdb_id',
            ignoreDuplicates: false,
        })
        .select()
        .single();

    if (error) {
        console.error('Error upserting person:', error);
        throw error;
    }

    return result;
}

// ============================================
// CAST/CREW LINKING FUNCTIONS
// ============================================

/**
 * Link a cast member to content
 * @param contentId Database ID of the content
 * @param personId Database ID of the person
 * @param characterName Character name played by the actor
 * @param orderIndex Order/position in the cast list (0-based)
 * @param roleType Type of role: 'main', 'support', or 'guest'
 */
export async function linkCast(
    contentId: string,
    personId: string,
    characterName: string,
    orderIndex: number,
    roleType: 'main' | 'support' | 'guest' = 'support'
): Promise<void> {
    const { error } = await supabase
        .from('content_cast')
        .upsert(
            {
                content_id: contentId,
                person_id: personId,
                character_name: characterName,
                order_index: orderIndex,
                role_type: roleType,
            },
            {
                onConflict: 'content_id,person_id,character_name',
                ignoreDuplicates: true,
            }
        );

    if (error) {
        console.error('Error linking cast:', error);
        throw error;
    }
}

/**
 * Link a crew member to content
 * @param contentId Database ID of the content
 * @param personId Database ID of the person
 * @param job Job title (e.g., 'Director', 'Writer')
 * @param department Department (e.g., 'Directing', 'Writing')
 */
export async function linkCrew(
    contentId: string,
    personId: string,
    job: string,
    department: string
): Promise<void> {
    const { error } = await supabase
        .from('content_crew')
        .upsert(
            {
                content_id: contentId,
                person_id: personId,
                job,
                department,
            },
            {
                onConflict: 'content_id,person_id,job',
                ignoreDuplicates: true,
            }
        );

    if (error) {
        console.error('Error linking crew:', error);
        throw error;
    }
}

// ============================================
// CONTENT FUNCTIONS
// ============================================

/**
 * Check if content already exists in the database
 * @param tmdbId TMDB ID of the content
 * @param contentType Type of content ('movie' or 'tv')
 * @returns True if content exists, false otherwise
 */
export async function checkContentExists(
    tmdbId: number,
    contentType: 'movie' | 'tv'
): Promise<boolean> {
    const { data, error } = await supabase
        .from('content')
        .select('id')
        .eq('tmdb_id', tmdbId)
        .eq('content_type', contentType)
        .single();

    // PGRST116 = not found, which means it doesn't exist
    if (error && error.code === 'PGRST116') {
        return false;
    }

    if (error) {
        console.error('Error checking content existence:', error);
        throw error;
    }

    return !!data;
}

/**
 * Upsert content into the content table
 * @param data Content data to insert/update
 * @returns The upserted content with database ID
 */
export async function upsertContent(data: Partial<Content>): Promise<Content> {
    const contentData: Partial<Content> = {
        tmdb_id: data.tmdb_id,
        content_type: data.content_type,
        title: data.title || 'Untitled',
        original_title: data.original_title,
        overview: data.overview,
        poster_path: data.poster_path,
        backdrop_path: data.backdrop_path,
        release_date: data.release_date,
        first_air_date: data.first_air_date,
        original_language: data.original_language,
        origin_country: data.origin_country,
        genres: data.genres,
        popularity: data.popularity,
        vote_average: data.vote_average,
        vote_count: data.vote_count,
        runtime: data.runtime,
        number_of_seasons: data.number_of_seasons,
        number_of_episodes: data.number_of_episodes,
        tagline: data.tagline,
        homepage: data.homepage,
        budget: data.budget,
        revenue: data.revenue,
        production_companies: data.production_companies,
        networks: data.networks,
        tmdb_status: data.tmdb_status,
        status: data.status || 'draft', // Fallback to draft if not specified
        content_rating: data.content_rating,
        keywords: data.keywords,
        alternative_titles: data.alternative_titles,
        videos: data.videos,
        watch_providers: data.watch_providers,
        wikidata_id: data.wikidata_id,
        tvdb_id: data.tvdb_id,
        imdb_id: data.imdb_id,
    };

    const { data: result, error } = await supabase
        .from('content')
        .upsert(contentData, {
            onConflict: 'tmdb_id,content_type',
            ignoreDuplicates: false,
        })
        .select()
        .single();

    if (error) {
        console.error('Error upserting content:', error);
        throw error;
    }

    return result;
}

// ============================================
// DELETE FUNCTIONS (for sync-changes)
// ============================================

/**
 * Delete all cast links for a content item
 * Used before re-importing fresh cast data
 * @param contentId Database ID of the content
 */
export async function deleteContentCast(contentId: string): Promise<void> {
    const { error } = await supabase
        .from('content_cast')
        .delete()
        .eq('content_id', contentId);

    if (error) {
        console.error('Error deleting content cast:', error);
        throw error;
    }
}

/**
 * Delete all crew links for a content item
 * Used before re-importing fresh crew data
 * @param contentId Database ID of the content
 */
export async function deleteContentCrew(contentId: string): Promise<void> {
    const { error } = await supabase
        .from('content_crew')
        .delete()
        .eq('content_id', contentId);

    if (error) {
        console.error('Error deleting content crew:', error);
        throw error;
    }
}

