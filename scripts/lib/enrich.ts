/**
 * Enrichment Service for GitHub Actions Scripts
 * Handles content import with cast and crew processing
 */

import { getMovieDetails, getTvDetails, getSeasonDetails, delay } from './tmdb';
import {
    upsertContent,
    upsertPerson,
    linkCast,
    linkCrew,
    deleteContentCast,
    deleteContentCrew,
    checkContentExists,
    upsertSeason,
    upsertEpisode,
} from './database';
import { addToEnrichmentQueue } from './queue';
import { supabase } from './supabase';

// ============================================
// CONSTANTS
// ============================================

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
        images: details.images || null,
        release_date: isMovie ? parseDate(details.release_date) : null,
        first_air_date: !isMovie ? parseDate(details.first_air_date) : null,
        last_air_date: !isMovie ? parseDate(details.last_air_date) : null,
        in_production: !isMovie ? details.in_production ?? null : null,
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
        production_countries: details.production_countries ?? [],
        spoken_languages: details.spoken_languages ?? [],
        networks: !isMovie ? details.networks : null,
        tmdb_status: details.status || null,
        status: 'draft' as const,
        // Extended fields
        content_rating: extractContentRating(details, contentType),
        keywords: details.keywords?.keywords || details.keywords?.results || null,
        alternative_titles: details.alternative_titles?.titles || details.alternative_titles?.results || null,
        videos: details.videos?.results || null,
        watch_providers: details['watch/providers'] || null,
        // External IDs
        wikidata_id: externalIds?.wikidata_id || null,
        tvdb_id: externalIds?.tvdb_id || null,
        external_ids: externalIds ?? null,
        social_ids: {
            facebook: externalIds?.facebook_id,
            instagram: externalIds?.instagram_id,
            twitter: externalIds?.twitter_id
        },
        // Expanded data
        translations: details.translations?.translations || null,
        recommendations: details.recommendations?.results ?? [],
        similar_content: details.similar?.results ?? [],
        reviews_tmdb: details.reviews?.results ?? [],
        belongs_to_collection: details.belongs_to_collection ?? null,
        release_dates: details.release_dates?.results ?? null,
        aggregate_credits: details.aggregate_credits ?? null,
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
 * Handles rate limiting (429), transient errors, socket errors, and Cloudflare errors
 * 
 * Phase 6 enhancements:
 * - Exponential backoff for socket/network errors
 * - Cloudflare HTML error detection
 */
async function withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await operation();

            // Phase 6.2: Detect Cloudflare HTML errors
            // Sometimes APIs return HTML error pages instead of JSON
            if (typeof result === 'string' && result.trim().startsWith('<')) {
                throw new Error('Cloudflare HTML error page returned');
            }

            return result;
        } catch (error: any) {
            lastError = error;

            // Don't retry on last attempt
            if (attempt === maxRetries) {
                break;
            }

            // Detect error types
            const isRateLimit = error?.status === 429 || error?.message?.includes('429');
            const isSocketError = error?.code === 'ECONNRESET' ||
                error?.code === 'ETIMEDOUT' ||
                error?.code === 'ENOTFOUND' ||
                error?.message?.includes('socket') ||
                error?.message?.includes('network') ||
                error?.message?.includes('timeout');
            const isCloudflareError = error?.message?.includes('Cloudflare') ||
                error?.message?.includes('HTML error');

            // Calculate wait time
            let waitTime: number;

            if (isRateLimit) {
                // Rate limit: Linear backoff (5s, 10s, 15s)
                waitTime = 5000 * attempt;
                console.log(`  ⏳ Rate limited on ${operationName}, waiting ${waitTime}ms (attempt ${attempt}/${maxRetries})`);
            } else if (isSocketError || isCloudflareError) {
                // Phase 6.1: Socket/network errors: Exponential backoff (2s, 4s, 8s)
                waitTime = 1000 * Math.pow(2, attempt);
                const errorType = isCloudflareError ? 'Cloudflare' : 'socket/network';
                console.log(`  🔌 ${errorType} error on ${operationName}, exponential backoff ${waitTime}ms (attempt ${attempt}/${maxRetries})`);
            } else {
                // Other errors: Short linear backoff (1s, 2s, 3s)
                waitTime = 1000 * attempt;
                console.log(`  ⚠️  Error on ${operationName}, retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries})`);
            }

            await delay(waitTime);
        }
    }

    // All retries failed
    console.error(`  ❌ ${operationName} failed after ${maxRetries} attempts:`, lastError);
    throw lastError;
}

// ============================================
// GENRE & TAG MERGING UTILITIES
// ============================================

/**
 * Normalize genre/tag names for deduplication
 * - Lowercase
 * - Trim whitespace
 * - Handle common variations (e.g., "Sci-Fi" -> "Science Fiction")
 */
function normalizeGenre(genre: string): string {
    const normalized = genre.trim().toLowerCase();

    // Handle common variations
    const variations: Record<string, string> = {
        'sci-fi': 'science fiction',
        'scifi': 'science fiction',
        'k-drama': 'korean drama',
        'kdrama': 'korean drama',
        'romcom': 'romantic comedy',
        'rom-com': 'romantic comedy',
    };

    return variations[normalized] || normalized;
}

/**
 * Merge and deduplicate genres from multiple sources
 * Priority: Wikidata + TMDB (both used, merged, deduplicated)
 * 
 * @param wikidataGenres Genres from Wikidata P136
 * @param tmdbGenres Genres from TMDB
 * @returns Merged and deduplicated genre list
 */
export function mergeGenres(
    wikidataGenres: string[] = [],
    tmdbGenres: Array<{ id?: number; name: string }> = []
): Array<{ id?: number; name: string }> {
    const seenNormalized = new Set<string>();
    const merged: Array<{ id?: number; name: string }> = [];

    // Add Wikidata genres first (no IDs)
    for (const genre of wikidataGenres) {
        const normalized = normalizeGenre(genre);
        if (!seenNormalized.has(normalized)) {
            seenNormalized.add(normalized);
            merged.push({ name: genre });
        }
    }

    // Add TMDB genres (with IDs), skip duplicates
    for (const genre of tmdbGenres) {
        const normalized = normalizeGenre(genre.name);
        if (!seenNormalized.has(normalized)) {
            seenNormalized.add(normalized);
            merged.push({ id: genre.id, name: genre.name });
        }
    }

    return merged;
}

/**
 * Merge and deduplicate keywords/tags from multiple sources
 * Currently: TMDB keywords only (Wikipedia categories placeholder for future)
 * 
 * @param tmdbKeywords Keywords from TMDB
 * @param wikipediaCategories Categories from Wikipedia (future)
 * @returns Merged and deduplicated keyword list
 */
function mergeKeywords(
    tmdbKeywords: Array<{ id: number; name: string }> = [],
    wikipediaCategories: string[] = []
): Array<{ id?: number; name: string }> {
    const seenNormalized = new Set<string>();
    const merged: Array<{ id?: number; name: string }> = [];

    // Add TMDB keywords first (with IDs)
    for (const keyword of tmdbKeywords) {
        const normalized = normalizeGenre(keyword.name); // Reuse normalization
        if (!seenNormalized.has(normalized)) {
            seenNormalized.add(normalized);
            merged.push({ id: keyword.id, name: keyword.name });
        }
    }

    // Add Wikipedia categories (future feature)
    for (const category of wikipediaCategories) {
        const normalized = normalizeGenre(category);
        if (!seenNormalized.has(normalized)) {
            seenNormalized.add(normalized);
            merged.push({ name: category });
        }
    }

    return merged;
}



/**
 * Clean bio sources that we remove
 */



// ============================================
// MAIN ENRICHMENT FUNCTION
// ============================================


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
        contentData.overview_source = contentData.overview ? 'tmdb' : 'none';

        // Use TMDB network as default
        if (contentData.networks && contentData.networks.length > 0) {
            contentData.original_network = contentData.networks[0].name;
            console.log(`  🎬 Using TMDB network: ${contentData.original_network}`);
        }

        // Merge genres from TMDB only, leaving Wikidata for later
        console.log(`  🏷️  Processing TMDB genres and keywords...`);
        const tmdbGenres = contentData.genres || [];
        const mergedGenres = mergeGenres([], tmdbGenres);
        contentData.genres = mergedGenres;

        // Merge keywords from TMDB
        const tmdbKeywords = contentData.keywords || [];
        const mergedKeywords = mergeKeywords(tmdbKeywords, []);
        contentData.keywords = mergedKeywords;

        // 3. Insert/update content
        const content = await upsertContent(contentData);

        if (!content.id) {
            return { success: false, error: 'Failed to get content ID after upsert' };
        }

        const contentId = content.id;

        // Push to enrichment queue for async Wikidata/Wikipedia parsing
        try {
            const added = await addToEnrichmentQueue(contentId, 'content', 10);
            if (added) {
                console.log(`  📥 Enqueued for Wikidata/Wikipedia enrichment`);
            } else {
                console.log(`  ℹ️  Already in enrichment queue`);
            }
        } catch (e) {
            console.error(`  ⚠️ Failed to enqueue for enrichment`, e);
        }

        // 4. Process cast (ALL members - no limit)
        let peopleCount = 0;
        const castMembers = details.credits?.cast || [];

        console.log(`  👥 Processing ${castMembers.length} cast members unconditionally...`);

        // Batch upsert optimizations can be applied later, using serial for now to match interface
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

        // 5. Process crew (ALL members - no limit)
        const crewMembers = details.credits?.crew || [];
        console.log(`  👥 Processing ${crewMembers.length} crew members unconditionally...`);

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

        // 6. Inline Seasons/Episodes Processing for TV Shows
        if (contentType === 'tv' && contentData.number_of_seasons && contentData.number_of_seasons > 0) {
            await enrichAndSaveSeasons(contentId, tmdbId, contentData.number_of_seasons);
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

        // 5. Re-import cast (ALL members - no limit)
        let peopleCount = 0;
        const castMembers = details.credits?.cast || [];

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

        // 6. Re-import crew (ALL members - no limit)
        const crewMembers = details.credits?.crew || [];

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

        // 7. Inline Seasons/Episodes Processing for TV Shows (Update mode)
        if (contentType === 'tv' && contentData.number_of_seasons && contentData.number_of_seasons > 0) {
            await enrichAndSaveSeasons(contentId, tmdbId, contentData.number_of_seasons);
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

// ============================================
// SEASONS ENRICHMENT
// ============================================

/**
 * Fetch and upsert all seasons and episodes for a TV Show
 */
export async function enrichAndSaveSeasons(contentId: string, tmdbId: number, numSeasons: number): Promise<void> {
    if (!numSeasons || numSeasons <= 0) return;

    console.log(`  📺 Processing ${numSeasons} seasons for TV show TMDB:${tmdbId}...`);
    let savedSeasons = 0;
    let savedEpisodes = 0;

    for (let s = 1; s <= numSeasons; s++) {
        try {
            console.log(`    ⬇️ Fetching Season ${s}...`);
            const seasonData = await getSeasonDetails(tmdbId, s);
            if (!seasonData) continue;

            // Insert Season
            const seasonId = await upsertSeason({
                content_id: contentId,
                tmdb_id: seasonData.id || 0,
                season_number: seasonData.season_number,
                name: seasonData.name,
                overview: seasonData.overview,
                air_date: seasonData.air_date,
                episode_count: seasonData.episodes ? seasonData.episodes.length : 0,
                poster_path: seasonData.poster_path
            });

            savedSeasons++;

            // Insert Episodes
            if (seasonData.episodes && seasonData.episodes.length > 0) {
                for (const ep of seasonData.episodes) {
                    await upsertEpisode({
                        content_id: contentId,
                        season_id: seasonId,
                        tmdb_id: ep.id,
                        season_number: seasonData.season_number,
                        episode_number: ep.episode_number,
                        name: ep.name,
                        overview: ep.overview,
                        air_date: ep.air_date,
                        runtime: ep.runtime,
                        still_path: ep.still_path,
                        vote_average: ep.vote_average,
                        vote_count: ep.vote_count,
                        production_code: ep.production_code,
                        guest_stars: ep.guest_stars, // Stores native array as JSONB
                        crew: ep.crew                // Stores native array as JSONB
                    });
                    savedEpisodes++;
                }
            }
        } catch (error: any) {
            console.error(`    ❌ Error processing Season ${s}:`, error.message);
        }
    }
    console.log(`  ✅ Successfully saved ${savedSeasons} seasons and ${savedEpisodes} episodes.`);
}

// Re-export for convenience
export { checkContentExists };
