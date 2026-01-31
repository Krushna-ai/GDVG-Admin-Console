/**
 * Enrichment Service for GitHub Actions Scripts
 * Handles content import with cast and crew processing
 */

import { getMovieDetails, getTvDetails, delay } from './tmdb';
import {
    upsertContent,
    upsertPerson,
    linkCast,
    linkCrew,
    deleteContentCast,
    deleteContentCrew,
    checkContentExists,
} from './database';

// ============================================
// CONSTANTS
// ============================================

const MAX_CAST = 20; // Top 20 cast members
const IMPORTANT_CREW_JOBS = [
    'Director',
    'Writer',
    'Screenplay',
    'Producer',
    'Executive Producer',
    'Creator',
    'Novel',
    'Story',
];

// ============================================
// TYPES
// ============================================

export interface EnrichResult {
    success: boolean;
    contentId?: string;
    peopleImported?: number;
    error?: string;
}

export interface UpdateResult {
    success: boolean;
    peopleUpdated?: number;
    error?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Map TMDB details to our content table format
 */
function mapTmdbToContent(details: any, contentType: 'movie' | 'tv'): any {
    const isMovie = contentType === 'movie';

    // Helper to handle empty date strings
    const parseDate = (date: any) => {
        if (!date || date === '') return null;
        return date;
    };

    // Extract external IDs
    const externalIds = details.external_ids || {};

    return {
        tmdb_id: details.id,
        imdb_id: details.imdb_id || externalIds.imdb_id || null,
        content_type: contentType,
        title: isMovie ? details.title : details.name,
        original_title: isMovie ? details.original_title : details.original_name,
        overview: details.overview || null,
        poster_path: details.poster_path || null,
        backdrop_path: details.backdrop_path || null,
        release_date: isMovie ? parseDate(details.release_date) : null,
        first_air_date: !isMovie ? parseDate(details.first_air_date) : null,
        original_language: details.original_language || null,
        origin_country: details.origin_country || [],
        genres: details.genres || [],
        popularity: details.popularity || null,
        vote_average: details.vote_average || null,
        vote_count: details.vote_count || null,
        runtime: isMovie ? details.runtime : null,
        number_of_seasons: !isMovie ? details.number_of_seasons : null,
        number_of_episodes: !isMovie ? details.number_of_episodes : null,
        tagline: details.tagline || null,
        homepage: details.homepage || null,
        budget: isMovie ? details.budget : null,
        revenue: isMovie ? details.revenue : null,
        production_companies: details.production_companies || [],
        networks: !isMovie ? details.networks : null,
        tmdb_status: details.status || null,
        status: 'draft', // All imports start as draft
        // Extended fields
        content_rating: extractContentRating(details, contentType),
        keywords: details.keywords?.keywords || details.keywords?.results || null,
        alternative_titles: details.alternative_titles?.titles || details.alternative_titles?.results || null,
        videos: details.videos?.results || null,
        watch_providers: details['watch/providers'] || null,
        wikidata_id: externalIds.wikidata_id || null,
        tvdb_id: externalIds.tvdb_id || null,
    };
}

/**
 * Extract content rating from TMDB response
 */
function extractContentRating(details: any, contentType: 'movie' | 'tv'): string | null {
    if (contentType === 'movie') {
        // For movies: use release_dates
        const releaseDates = details.release_dates?.results || [];
        const usRelease = releaseDates.find((r: any) => r.iso_3166_1 === 'US');
        if (usRelease?.release_dates?.[0]?.certification) {
            return usRelease.release_dates[0].certification;
        }
    } else {
        // For TV: use content_ratings
        const contentRatings = details.content_ratings?.results || [];
        const usRating = contentRatings.find((r: any) => r.iso_3166_1 === 'US');
        if (usRating?.rating) {
            return usRating.rating;
        }
    }
    return null;
}

/**
 * Determine role type based on cast order
 */
function getRoleType(order: number): 'main' | 'support' | 'guest' {
    if (order <= 5) return 'main';
    if (order <= 15) return 'support';
    return 'guest';
}

/**
 * Retry wrapper for TMDB API calls
 * Handles rate limiting (429) and transient errors
 */
async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;

            // Don't retry on last attempt
            if (attempt === maxRetries) {
                break;
            }

            // Check if it's a rate limit error (429)
            const isRateLimit = error?.status === 429 || error?.message?.includes('429');

            if (isRateLimit) {
                const waitTime = 5000 * attempt; // 5s, 10s, 15s
                console.log(`  ⏳ Rate limited on ${operationName}, waiting ${waitTime}ms (attempt ${attempt}/${maxRetries})`);
                await delay(waitTime);
            } else {
                // For other errors, use shorter delay
                const waitTime = 1000 * attempt; // 1s, 2s, 3s
                console.log(`  ⚠️  Error on ${operationName}, retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries})`);
                await delay(waitTime);
            }
        }
    }

    // All retries failed
    console.error(`  ❌ ${operationName} failed after ${maxRetries} attempts:`, lastError);
    throw lastError;
}


// ============================================
// MAIN ENRICHMENT FUNCTION
// ============================================

/**
 * Enrich and save content with cast and crew
 * @param tmdbId TMDB ID of the content
 * @param contentType Type of content ('movie' or 'tv')
 * @returns Result with success status, content ID, and people count
 */
export async function enrichAndSaveContent(
    tmdbId: number,
    contentType: 'movie' | 'tv'
): Promise<EnrichResult> {
    try {
        // 1. Fetch full details from TMDB with retry logic
        const details = await withRetry(
            () => contentType === 'movie'
                ? getMovieDetails(tmdbId)
                : getTvDetails(tmdbId),
            `fetch ${contentType} ${tmdbId}`
        );

        if (!details) {
            return { success: false, error: 'Failed to fetch from TMDB' };
        }

        // 2. Map TMDB data to our content format
        const contentData = mapTmdbToContent(details, contentType);

        // 3. Insert/update content
        const content = await upsertContent(contentData);

        if (!content.id) {
            return { success: false, error: 'Failed to get content ID after upsert' };
        }

        const contentId = content.id;

        // 4. Process cast (top 20 members)
        let peopleCount = 0;
        const castMembers = details.credits?.cast?.slice(0, MAX_CAST) || [];

        for (const cast of castMembers) {
            try {
                // Upsert person
                const person = await upsertPerson({
                    tmdb_id: cast.id,
                    name: cast.name,
                    profile_path: cast.profile_path,
                    known_for_department: cast.known_for_department,
                    popularity: cast.popularity,
                    gender: cast.gender,
                });

                // Link to content
                if (person.id) {
                    await linkCast(
                        contentId,
                        person.id,
                        cast.character || 'Unknown',
                        cast.order || 999,
                        getRoleType(cast.order || 999)
                    );
                    peopleCount++;
                }

            } catch (error) {
                console.error(`  Failed to process cast member ${cast.id}:`, error);
            }
        }

        // 5. Process crew (important jobs only)
        const crewMembers = details.credits?.crew?.filter(
            (crew: any) => IMPORTANT_CREW_JOBS.includes(crew.job)
        ) || [];

        for (const crew of crewMembers) {
            try {
                // Upsert person
                const person = await upsertPerson({
                    tmdb_id: crew.id,
                    name: crew.name,
                    profile_path: crew.profile_path,
                    known_for_department: crew.known_for_department,
                    popularity: crew.popularity,
                    gender: crew.gender,
                });

                // Link to content
                if (person.id) {
                    await linkCrew(
                        contentId,
                        person.id,
                        crew.job,
                        crew.department
                    );
                    peopleCount++;
                }

            } catch (error) {
                console.error(`  Failed to process crew member ${crew.id}:`, error);
            }
        }

        return {
            success: true,
            contentId,
            peopleImported: peopleCount,
        };
    } catch (error) {
        console.error(`Error enriching content ${tmdbId}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// ============================================
// UPDATE FUNCTION (for sync-changes)
// ============================================

/**
 * Update existing content with fresh TMDB data including cast/crew
 * @param contentId Database ID of the content
 * @param tmdbId TMDB ID of the content
 * @param contentType Type of content ('movie' or 'tv')
 * @returns Result with success status and people updated count
 */
export async function updateContentWithCredits(
    contentId: string,
    tmdbId: number,
    contentType: 'movie' | 'tv'
): Promise<UpdateResult> {
    try {
        // 1. Fetch fresh details from TMDB with retry logic
        const details = await withRetry(
            () => contentType === 'movie'
                ? getMovieDetails(tmdbId)
                : getTvDetails(tmdbId),
            `fetch ${contentType} ${tmdbId} for update`
        );

        if (!details) {
            return { success: false, error: 'Failed to fetch from TMDB' };
        }

        // 2. Map TMDB data to content format
        const contentData = mapTmdbToContent(details, contentType);
        contentData.id = contentId; // Preserve the existing ID

        // 3. Update content
        await upsertContent(contentData);

        // 4. Delete old cast/crew links
        await deleteContentCast(contentId);
        await deleteContentCrew(contentId);

        // 5. Re-import cast
        let peopleCount = 0;
        const castMembers = details.credits?.cast?.slice(0, MAX_CAST) || [];

        for (const cast of castMembers) {
            try {
                const person = await upsertPerson({
                    tmdb_id: cast.id,
                    name: cast.name,
                    profile_path: cast.profile_path,
                    known_for_department: cast.known_for_department,
                    popularity: cast.popularity,
                    gender: cast.gender,
                });

                if (person.id) {
                    await linkCast(
                        contentId,
                        person.id,
                        cast.character || 'Unknown',
                        cast.order || 999,
                        getRoleType(cast.order || 999)
                    );
                    peopleCount++;
                }

            } catch (error) {
                console.error(`  Failed to process cast member ${cast.id}:`, error);
            }
        }

        // 6. Re-import crew
        const crewMembers = details.credits?.crew?.filter(
            (crew: any) => IMPORTANT_CREW_JOBS.includes(crew.job)
        ) || [];

        for (const crew of crewMembers) {
            try {
                const person = await upsertPerson({
                    tmdb_id: crew.id,
                    name: crew.name,
                    profile_path: crew.profile_path,
                    known_for_department: crew.known_for_department,
                    popularity: crew.popularity,
                    gender: crew.gender,
                });

                if (person.id) {
                    await linkCrew(
                        contentId,
                        person.id,
                        crew.job,
                        crew.department
                    );
                    peopleCount++;
                }

            } catch (error) {
                console.error(`  Failed to process crew member ${crew.id}:`, error);
            }
        }

        return {
            success: true,
            peopleUpdated: peopleCount,
        };
    } catch (error) {
        console.error(`Error updating content ${contentId}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// Re-export for convenience
export { checkContentExists };
