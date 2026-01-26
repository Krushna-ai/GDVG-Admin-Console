// TMDB Enrichment Service
// Fetches content from TMDB and saves to database with retry logic

import {
    getMovieDetails,
    getTvDetails,
    getPersonDetails,
    delay,
    type TMDBDiscoverResult,
} from '@/lib/tmdb/client';
import {
    upsertContent,
    upsertPerson,
    linkCast,
    linkCrew,
    getContentByTmdbId,
    getPersonByTmdbId,
    bulkInsertQueue,
    updateImportQueueStatus,
    type Content,
    type Person,
} from '@/lib/services/database.service';

// ============================================
// CONFIGURATION
// ============================================

// Crew jobs to extract
const CREW_JOBS = ['Director', 'Writer', 'Screenplay', 'Producer', 'Executive Producer', 'Creator'];

// Max cast members to import per content
const MAX_CAST = 20;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Base delay, will be multiplied by attempt number

// ============================================
// TYPES
// ============================================

export interface EnrichResult {
    success: boolean;
    contentId?: string;
    personId?: string;
    error?: string;
    retries?: number;
    alreadyExists?: boolean;
}

export interface BatchEnrichResult {
    total: number;
    success: number;
    failed: number;
    errors: Array<{ tmdbId: number; error: string }>;
}

// ============================================
// RETRY HELPER
// ============================================

async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = MAX_RETRIES
): Promise<{ result: T; retries: number }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await operation();
            return { result, retries: attempt - 1 };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if it's a rate limit error (429)
            if (lastError.message.includes('429')) {
                const waitTime = RETRY_DELAY_MS * attempt * 2; // Longer wait for rate limits
                console.warn(`Rate limited on ${operationName}, waiting ${waitTime}ms (attempt ${attempt}/${maxRetries})`);
                await delay(waitTime);
            } else if (attempt < maxRetries) {
                const waitTime = RETRY_DELAY_MS * attempt;
                console.warn(`${operationName} failed, retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries})`);
                await delay(waitTime);
            }
        }
    }

    throw lastError;
}

// ============================================
// CONTENT ENRICHMENT
// ============================================

/**
 * Fetch content from TMDB and save to database with cast/crew
 * @param tmdbId - TMDB ID of the content
 * @param contentType - 'movie' or 'tv'
 * @param options - Optional settings
 * @returns Success status and content ID
 */
export async function enrichContent(
    tmdbId: number,
    contentType: 'movie' | 'tv',
    options: {
        skipIfExists?: boolean;
        maxCast?: number;
    } = {}
): Promise<EnrichResult> {
    const { skipIfExists = false, maxCast = MAX_CAST } = options;

    try {
        // Check if already exists
        if (skipIfExists) {
            const existing = await getContentByTmdbId(tmdbId);
            if (existing) {
                return { success: false, alreadyExists: true, contentId: existing.id };
            }
        }

        // Fetch details from TMDB with retry
        const { result: details, retries } = await withRetry(
            () => contentType === 'movie' ? getMovieDetails(tmdbId) : getTvDetails(tmdbId),
            `fetch ${contentType} ${tmdbId}`
        );

        if (!details) {
            return { success: false, error: 'Failed to fetch from TMDB' };
        }

        // Map TMDB data to our content table structure
        const contentData = mapTmdbToContent(details, contentType);

        // Save content to database
        const content = await upsertContent(contentData);
        const contentId = content.id;

        // Process cast (limited members)
        const castMembers = details.credits?.cast?.slice(0, maxCast) || [];
        await processCastMembers(contentId, castMembers);

        // Process crew (Directors, Writers, Producers, Creators)
        const crewMembers = details.credits?.crew?.filter(
            (crew: any) => CREW_JOBS.includes(crew.job)
        ) || [];
        await processCrewMembers(contentId, crewMembers);

        return { success: true, contentId, retries };

    } catch (error) {
        console.error(`enrichContent failed for ${contentType} ${tmdbId}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Map TMDB API response to our content table structure
 */
function mapTmdbToContent(details: any, contentType: 'movie' | 'tv'): Partial<Content> {
    // Extract content rating
    let contentRating: string | null = null;
    if (contentType === 'tv' && details.content_ratings?.results) {
        // Prefer US rating, fallback to first available
        const usRating = details.content_ratings.results.find((r: any) => r.iso_3166_1 === 'US');
        const krRating = details.content_ratings.results.find((r: any) => r.iso_3166_1 === 'KR');
        contentRating = usRating?.rating || krRating?.rating || details.content_ratings.results[0]?.rating || null;
    } else if (contentType === 'movie' && details.release_dates?.results) {
        // For movies, use release_dates to get certification
        const usRelease = details.release_dates.results.find((r: any) => r.iso_3166_1 === 'US');
        if (usRelease?.release_dates?.length) {
            contentRating = usRelease.release_dates.find((rd: any) => rd.certification)?.certification || null;
        }
    }

    // Extract keywords
    const keywords = details.keywords?.keywords || details.keywords?.results || null;

    // Extract videos (trailers, teasers)
    const videos = details.videos?.results?.map((v: any) => ({
        key: v.key,
        name: v.name,
        type: v.type,
        site: v.site,
        official: v.official,
    })) || null;

    // Extract watch providers (prefer IN region, fallback to US)
    const watchProviders = details['watch/providers']?.results || null;

    // Extract alternative titles
    const alternativeTitles = details.alternative_titles?.titles || details.alternative_titles?.results || null;

    // Extract external IDs
    const externalIds = details.external_ids || {};

    return {
        tmdb_id: details.id,
        imdb_id: details.imdb_id || externalIds.imdb_id || null,
        content_type: contentType,
        title: contentType === 'movie' ? details.title : details.name,
        original_title: contentType === 'movie' ? details.original_title : details.original_name,
        overview: details.overview || null,
        poster_path: details.poster_path || null,
        backdrop_path: details.backdrop_path || null,
        release_date: contentType === 'movie' ? details.release_date : null,
        first_air_date: contentType === 'tv' ? details.first_air_date : null,
        status: 'draft',
        original_language: details.original_language || null,
        origin_country: details.origin_country || details.production_countries?.map((c: any) => c.iso_3166_1) || [],
        genres: details.genres || [],
        popularity: details.popularity || null,
        vote_average: details.vote_average || null,
        vote_count: details.vote_count || null,
        runtime: contentType === 'movie' ? details.runtime : null,
        number_of_seasons: contentType === 'tv' ? details.number_of_seasons : null,
        number_of_episodes: contentType === 'tv' ? details.number_of_episodes : null,
        tagline: details.tagline || null,
        homepage: details.homepage || null,
        budget: contentType === 'movie' ? details.budget : null,
        revenue: contentType === 'movie' ? details.revenue : null,
        production_companies: details.production_companies || null,
        networks: contentType === 'tv' ? details.networks : null,
        tmdb_status: details.status || null,
        // New Phase 6 fields
        content_rating: contentRating,
        keywords: keywords,
        alternative_titles: alternativeTitles,
        videos: videos,
        watch_providers: watchProviders,
        wikidata_id: externalIds.wikidata_id || null,
        tvdb_id: externalIds.tvdb_id || null,
    };
}

/**
 * Process cast members and link to content
 * Role classification: order 0-5 = main, 6-15 = support, 16+ = guest
 */
async function processCastMembers(contentId: string, castMembers: any[]): Promise<void> {
    for (const cast of castMembers) {
        try {
            // Determine role type based on billing order
            const order = cast.order ?? 999;
            let roleType: 'main' | 'support' | 'guest' = 'support';
            if (order <= 5) {
                roleType = 'main';
            } else if (order <= 15) {
                roleType = 'support';
            } else {
                roleType = 'guest';
            }

            const personData = {
                tmdb_id: cast.id,
                name: cast.name,
                profile_path: cast.profile_path || null,
                known_for_department: cast.known_for_department || 'Acting',
                popularity: cast.popularity || null,
                gender: cast.gender || null,
            };
            const person = await upsertPerson(personData);
            await linkCast(contentId, person.id, cast.character || '', cast.order || 0, roleType);
        } catch (error) {
            console.error(`Failed to process cast member ${cast.id}:`, error);
        }
    }
}

/**
 * Process crew members and link to content
 */
async function processCrewMembers(contentId: string, crewMembers: any[]): Promise<void> {
    for (const crew of crewMembers) {
        try {
            const personData = {
                tmdb_id: crew.id,
                name: crew.name,
                profile_path: crew.profile_path || null,
                known_for_department: crew.known_for_department || crew.department,
                popularity: crew.popularity || null,
                gender: crew.gender || null,
            };
            const person = await upsertPerson(personData);
            await linkCrew(contentId, person.id, crew.job, crew.department || '');
        } catch (error) {
            console.error(`Failed to process crew member ${crew.id}:`, error);
        }
    }
}

// ============================================
// PERSON ENRICHMENT
// ============================================

/**
 * Fetch full person details from TMDB and save to database
 * @param tmdbId - TMDB person ID
 * @returns Success status and person ID
 */
export async function enrichPerson(tmdbId: number): Promise<EnrichResult> {
    try {
        // Fetch details from TMDB with retry
        const { result: details, retries } = await withRetry(
            () => getPersonDetails(tmdbId),
            `fetch person ${tmdbId}`
        );

        if (!details) {
            return { success: false, error: 'Failed to fetch person from TMDB' };
        }

        // Map to our person table structure
        const personData: Partial<Person> = {
            tmdb_id: details.id,
            imdb_id: details.imdb_id || undefined,
            name: details.name,
            biography: details.biography || undefined,
            birthday: details.birthday || undefined,
            deathday: details.deathday || undefined,
            place_of_birth: details.place_of_birth || undefined,
            profile_path: details.profile_path || undefined,
            known_for_department: details.known_for_department || undefined,
            popularity: details.popularity || undefined,
            gender: details.gender || undefined,
            also_known_as: details.also_known_as || [],
            homepage: details.homepage || undefined,
            adult: details.adult || false,
        };

        // Save to database
        const person = await upsertPerson(personData);

        return { success: true, personId: person.id, retries };

    } catch (error) {
        console.error(`enrichPerson failed for ${tmdbId}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ============================================
// BATCH PROCESSING
// ============================================

/**
 * Process a single queue item
 * @param tmdbId - TMDB ID
 * @param contentType - Content type
 * @returns Success status
 */
export async function processQueueItem(
    tmdbId: number,
    contentType: string
): Promise<EnrichResult> {
    try {
        // Update status to processing
        await updateImportQueueStatus(tmdbId, contentType, 'processing');

        // Determine the type and enrich
        const result = contentType === 'movie' || contentType === 'tv'
            ? await enrichContent(tmdbId, contentType as 'movie' | 'tv')
            : { success: false, error: `Unknown content type: ${contentType}` };

        // Update status based on result
        if (result.success) {
            await updateImportQueueStatus(tmdbId, contentType, 'completed');
        } else {
            await updateImportQueueStatus(tmdbId, contentType, 'failed', result.error);
        }

        return result;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await updateImportQueueStatus(tmdbId, contentType, 'failed', errorMessage);
        return { success: false, error: errorMessage };
    }
}

/**
 * Queue items from a TMDB discover result for batch processing
 * @param discoverResult - Result from discoverMovies/discoverTv
 * @param contentType - Content type to assign
 * @param batchName - Optional batch name for tracking
 * @returns Number of items queued
 */
export async function queueFromDiscover(
    discoverResult: TMDBDiscoverResult,
    contentType: 'movie' | 'tv',
    batchName?: string
): Promise<{ inserted: number; skipped: number }> {
    const items = discoverResult.results.map(item => ({
        tmdb_id: item.id,
        content_type: contentType,
        priority: Math.round(item.popularity || 0),
        batch_name: batchName,
        source: 'discover',
        metadata: {
            title: item.title || item.name,
            popularity: item.popularity,
            vote_average: item.vote_average,
            release_date: item.release_date || item.first_air_date,
        },
    }));

    return bulkInsertQueue(items);
}

/**
 * Enrich multiple items from a discover result directly (without queue)
 * @param discoverResult - Result from discoverMovies/discoverTv
 * @param contentType - Content type
 * @param options - Processing options
 * @returns Batch result with success/failure counts
 */
export async function enrichFromDiscover(
    discoverResult: TMDBDiscoverResult,
    contentType: 'movie' | 'tv',
    options: {
        maxItems?: number;
        delayBetween?: number;
    } = {}
): Promise<BatchEnrichResult> {
    const { maxItems = discoverResult.results.length, delayBetween = 200 } = options;

    const items = discoverResult.results.slice(0, maxItems);
    const result: BatchEnrichResult = {
        total: items.length,
        success: 0,
        failed: 0,
        errors: [],
    };

    for (const item of items) {
        const enrichResult = await enrichContent(item.id, contentType, { skipIfExists: true });

        if (enrichResult.success) {
            result.success++;
        } else {
            result.failed++;
            result.errors.push({
                tmdbId: item.id,
                error: enrichResult.error || 'Unknown error',
            });
        }

        // Delay between items to respect rate limits
        if (delayBetween > 0) {
            await delay(delayBetween);
        }
    }

    return result;
}

