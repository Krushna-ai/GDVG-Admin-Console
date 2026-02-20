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
    wikipedia_url?: string | null;
    bio_source?: 'wikipedia' | 'tmdb' | 'none';
    import_batch_id?: string | null;
    import_batch_name?: string | null;
    imported_at?: string | null;
}

export interface Content {
    // Identity
    id?: string;
    tmdb_id: number;
    content_type: 'movie' | 'tv';
    // Core metadata
    title: string;
    original_title?: string;
    overview?: string;
    overview_source?: 'wikipedia' | 'tmdb' | 'none';
    tagline?: string;
    poster_path?: string;
    backdrop_path?: string;
    main_poster?: string;
    images?: any;
    // Dates
    release_date?: string;
    first_air_date?: string;
    last_air_date?: string;
    // Locale
    original_language?: string;
    origin_country?: string[];
    // Ratings & popularity
    genres?: any;
    popularity?: number;
    vote_average?: number;
    vote_count?: number;
    content_rating?: string;
    // Financials
    budget?: number;
    revenue?: number;
    // Runtime / episodes
    runtime?: number;
    number_of_seasons?: number;
    number_of_episodes?: number;
    in_production?: boolean;
    // Companies / networks
    production_companies?: any;
    production_countries?: any;
    spoken_languages?: any;
    networks?: any;
    belongs_to_collection?: any;
    // Status
    tmdb_status?: string;
    status?: 'draft' | 'published' | 'archived';
    homepage?: string;
    // Extended TMDB fields
    keywords?: any;
    alternative_titles?: any;
    videos?: any;
    watch_providers?: any;
    translations?: any;
    recommendations?: any;
    similar_content?: any;
    reviews_tmdb?: any;
    release_dates?: any;
    aggregate_credits?: any;
    // Extended metadata (from Wikidata)
    based_on?: string;
    filming_location?: string;
    narrative_location?: string;
    box_office?: number;
    // External IDs
    external_ids?: any;
    social_ids?: any;
    wikidata_id?: string;
    tvdb_id?: number;
    imdb_id?: string;
    wikipedia_url?: string | null;
    // Wikipedia article sections
    wiki_plot?: string | null;
    wiki_synopsis?: string | null;
    wiki_episode_guide?: string | null;
    wiki_production?: string | null;
    wiki_cast_notes?: string | null;
    wiki_reception?: string | null;
    wiki_soundtrack?: string | null;
    wiki_release?: string | null;
    wiki_accolades?: string | null;
    // Enrichment tracking
    enriched_at?: string | null;
    enrichment_cycle?: number | null;
    // Import tracking
    import_batch_id?: string | null;
    import_batch_name?: string | null;
    imported_at?: string | null;
    updated_at?: string;
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
 * Upsert content into the content table.
 * Saves all fields that exist in the DB schema.
 * Only passes defined (non-undefined) values to avoid overwriting existing data with nulls.
 */
export async function upsertContent(data: Partial<Content>): Promise<Content> {
    const defined = <T>(v: T): v is NonNullable<T> => v !== undefined;
    const definedAndNotEmpty = (v: string | null | undefined): v is string => v !== undefined && v !== null && v.trim() !== '';

    const contentData: Partial<Content> = {
        tmdb_id: data.tmdb_id,
        content_type: data.content_type,
        title: data.title || 'Untitled',
        // Core metadata
        ...(defined(data.original_title) && { original_title: data.original_title }),
        ...(defined(data.overview) && { overview: data.overview }),
        ...(definedAndNotEmpty(data.overview_source) && { overview_source: data.overview_source }),
        ...(defined(data.tagline) && { tagline: data.tagline }),
        ...(defined(data.poster_path) && { poster_path: data.poster_path }),
        ...(defined(data.backdrop_path) && { backdrop_path: data.backdrop_path }),
        ...(defined(data.main_poster) && { main_poster: data.main_poster }),
        ...(defined(data.images) && { images: data.images }),
        ...(definedAndNotEmpty(data.wikipedia_url) && { wikipedia_url: data.wikipedia_url }),
        // Wikidata extended metadata
        ...(defined(data.based_on) && { based_on: data.based_on }),
        ...(defined(data.filming_location) && { filming_location: data.filming_location }),
        ...(defined(data.narrative_location) && { narrative_location: data.narrative_location }),
        ...(defined(data.box_office) && { box_office: data.box_office }),
        // Dates
        ...(defined(data.release_date) && { release_date: data.release_date }),
        ...(defined(data.first_air_date) && { first_air_date: data.first_air_date }),
        ...(defined(data.last_air_date) && { last_air_date: data.last_air_date }),
        // Locale
        ...(defined(data.original_language) && { original_language: data.original_language }),
        ...(defined(data.origin_country) && { origin_country: data.origin_country }),
        // Ratings & popularity
        ...(defined(data.genres) && { genres: data.genres }),
        ...(defined(data.popularity) && { popularity: data.popularity }),
        ...(defined(data.vote_average) && { vote_average: data.vote_average }),
        ...(defined(data.vote_count) && { vote_count: data.vote_count }),
        ...(defined(data.content_rating) && { content_rating: data.content_rating }),
        // Financials
        ...(defined(data.budget) && { budget: data.budget }),
        ...(defined(data.revenue) && { revenue: data.revenue }),
        // Runtime / episodes
        ...(defined(data.runtime) && { runtime: data.runtime }),
        ...(defined(data.number_of_seasons) && { number_of_seasons: data.number_of_seasons }),
        ...(defined(data.number_of_episodes) && { number_of_episodes: data.number_of_episodes }),
        ...(defined(data.in_production) && { in_production: data.in_production }),
        // Companies / networks
        ...(defined(data.production_companies) && { production_companies: data.production_companies }),
        ...(defined(data.production_countries) && { production_countries: data.production_countries }),
        ...(defined(data.spoken_languages) && { spoken_languages: data.spoken_languages }),
        ...(defined(data.networks) && { networks: data.networks }),
        // Status
        ...(defined(data.tmdb_status) && { tmdb_status: data.tmdb_status }),
        status: data.status || 'draft',
        ...(defined(data.homepage) && { homepage: data.homepage }),
        // Extended TMDB fields
        ...(defined(data.keywords) && { keywords: data.keywords }),
        ...(defined(data.alternative_titles) && { alternative_titles: data.alternative_titles }),
        ...(defined(data.videos) && { videos: data.videos }),
        ...(defined(data.watch_providers) && { watch_providers: data.watch_providers }),
        ...(defined(data.translations) && { translations: data.translations }),
        ...(defined(data.recommendations) && { recommendations: data.recommendations }),
        ...(defined(data.similar_content) && { similar_content: data.similar_content }),
        ...(defined(data.reviews_tmdb) && { reviews_tmdb: data.reviews_tmdb }),
        ...(defined(data.release_dates) && { release_dates: data.release_dates }),
        ...(defined(data.aggregate_credits) && { aggregate_credits: data.aggregate_credits }),
        ...(defined(data.belongs_to_collection) && { belongs_to_collection: data.belongs_to_collection }),
        // External IDs
        ...(defined(data.external_ids) && { external_ids: data.external_ids }),
        ...(defined(data.social_ids) && { social_ids: data.social_ids }),
        ...(defined(data.wikidata_id) && { wikidata_id: data.wikidata_id }),
        ...(defined(data.tvdb_id) && { tvdb_id: data.tvdb_id }),
        ...(defined(data.imdb_id) && { imdb_id: data.imdb_id }),
        // Wikipedia article sections
        ...(definedAndNotEmpty(data.wiki_plot) && { wiki_plot: data.wiki_plot }),
        ...(definedAndNotEmpty(data.wiki_synopsis) && { wiki_synopsis: data.wiki_synopsis }),
        ...(definedAndNotEmpty(data.wiki_episode_guide) && { wiki_episode_guide: data.wiki_episode_guide }),
        ...(definedAndNotEmpty(data.wiki_production) && { wiki_production: data.wiki_production }),
        ...(definedAndNotEmpty(data.wiki_cast_notes) && { wiki_cast_notes: data.wiki_cast_notes }),
        ...(definedAndNotEmpty(data.wiki_reception) && { wiki_reception: data.wiki_reception }),
        ...(definedAndNotEmpty(data.wiki_soundtrack) && { wiki_soundtrack: data.wiki_soundtrack }),
        ...(definedAndNotEmpty(data.wiki_release) && { wiki_release: data.wiki_release }),
        ...(definedAndNotEmpty(data.wiki_accolades) && { wiki_accolades: data.wiki_accolades }),
        // Enrichment tracking
        ...(defined(data.enriched_at) && { enriched_at: data.enriched_at }),
        ...(defined(data.enrichment_cycle) && { enrichment_cycle: data.enrichment_cycle }),
        updated_at: new Date().toISOString(),
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

// ============================================
// AWARDS
// ============================================

export interface Award {
    awardId: string;
    award: string;
    year?: number;
    category?: string;
    won: boolean;
}

/**
 * Upsert awards for content or person
 */
export async function upsertAwards(
    contentId: string | null,
    personId: string | null,
    awards: Award[]
): Promise<void> {
    if ((!contentId && !personId) || (contentId && personId)) {
        throw new Error('upsertAwards Requires either contentId OR personId, not both/neither');
    }

    if (!awards || awards.length === 0) return;

    const awardsData = awards.map(a => ({
        content_id: contentId,
        person_id: personId,
        award_name: a.award,
        year: a.year ?? null,
        category: a.category ?? null,
        won: a.won,
        source: 'wikidata',
        wikidata_award_id: a.awardId
    }));

    // PostgREST upsert requires matching unique index. We will ignore duplicates to prevent errors if already exists.
    const { error } = await supabase
        .from('awards')
        .upsert(awardsData, {
            ignoreDuplicates: true
        });

    if (error) {
        console.error('Error upserting awards:', error);
        throw error;
    }
}

// ============================================
// SEASONS AND EPISODES
// ============================================

export interface SeasonRow {
    id?: string;
    content_id: string;
    tmdb_id: number;
    season_number: number;
    name?: string | null;
    overview?: string | null;
    air_date?: string | null;
    episode_count?: number | null;
    poster_path?: string | null;
    vote_average?: number | null;
    wiki_overview?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface EpisodeRow {
    id?: string;
    content_id: string;
    season_id: string;
    tmdb_id: number;
    season_number: number;
    episode_number: number;
    episode_type?: string | null;
    name?: string | null;
    overview?: string | null;
    air_date?: string | null;
    runtime?: number | null;
    still_path?: string | null;
    vote_average?: number | null;
    vote_count?: number | null;
    production_code?: string | null;
    guest_stars?: any | null;
    crew?: any | null;
    created_at?: string | null;
    updated_at?: string | null;
}

/**
 * Upsert a season into the database
 * Uses defined-guard pattern to avoid overwriting existing data with null/undefined accidentally,
 * though we also accept explict nulls for some fields if intentionally clearing them.
 * 
 * @param season The season data to insert or update
 * @returns The Database ID of the upserted season
 */
export async function upsertSeason(season: SeasonRow): Promise<string> {
    const definedArgs = { ...season };

    // defined-guard pattern: remove purely undefined keys
    Object.keys(definedArgs).forEach(key => {
        if (definedArgs[key as keyof SeasonRow] === undefined) {
            delete definedArgs[key as keyof SeasonRow];
        }
    });

    definedArgs.updated_at = new Date().toISOString();

    const { data: result, error } = await supabase
        .from('seasons')
        .upsert(definedArgs, {
            onConflict: 'content_id,season_number',
            ignoreDuplicates: false,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error upserting season:', error);
        throw error;
    }

    return result.id;
}

/**
 * Upsert an episode into the database
 * 
 * @param episode The episode data to insert or update
 */
export async function upsertEpisode(episode: EpisodeRow): Promise<void> {
    const definedArgs = { ...episode };

    // defined-guard pattern
    Object.keys(definedArgs).forEach(key => {
        if (definedArgs[key as keyof EpisodeRow] === undefined) {
            delete definedArgs[key as keyof EpisodeRow];
        }
    });

    definedArgs.updated_at = new Date().toISOString();

    const { error } = await supabase
        .from('episodes')
        .upsert(definedArgs, {
            onConflict: 'content_id,season_number,episode_number',
            ignoreDuplicates: false,
        });

    if (error) {
        console.error('Error upserting episode:', error);
        throw error;
    }
}

// ============================================
// COLLECTIONS
// ============================================

export interface CollectionRow {
    id?: string;
    tmdb_id: number;
    name: string;
    overview?: string | null;
    poster_path?: string | null;
    backdrop_path?: string | null;
    parts?: any | null;
    created_at?: string | null;
    updated_at?: string | null;
}

/**
 * Upsert a collection into the database.
 * Returns the auto-generated or existing internal UUID.
 * 
 * @param collection The collection data to insert or update
 * @returns The Database ID (UUID) of the upserted collection
 */
export async function upsertCollection(collection: CollectionRow): Promise<string> {
    const definedArgs = { ...collection };

    // defined-guard pattern
    Object.keys(definedArgs).forEach(key => {
        if (definedArgs[key as keyof CollectionRow] === undefined) {
            delete definedArgs[key as keyof CollectionRow];
        }
    });

    definedArgs.updated_at = new Date().toISOString();

    const { data: result, error } = await supabase
        .from('collections')
        .upsert(definedArgs, {
            onConflict: 'tmdb_id',
            ignoreDuplicates: false,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error upserting collection:', error);
        throw error;
    }

    return result.id;
}
