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
import { getWikidataByTmdbId, getWikidataById } from './wikidata';
import { getContentSummary, getPersonBioMultiVariant } from './wikipedia';

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
function mergeGenres(
    wikidataGenres: string[] = [],
    tmdbGenres: Array<{ id: number; name: string }> = []
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



// ============================================
// WIKIPEDIA-FIRST ENRICHMENT
// ============================================

/**
 * Enrich content overview with Wikipedia-first strategy
 * Tries Wikipedia first, falls back to TMDB if not available
 * 
 * @param tmdbDetails TMDB details object
 * @param contentType Type of content
 * @returns Enriched overview and metadata
 */
async function enrichOverviewFromWikipedia(
    tmdbDetails: any,
    contentType: 'movie' | 'tv'
): Promise<{ overview: string | null; overview_source: string; wikipedia_url?: string }> {
    const tmdbOverview = tmdbDetails.overview || null;

    try {
        // Step 1: Get Wikipedia title from Wikidata or TMDB
        const wikidataId = tmdbDetails.external_ids?.wikidata_id;
        let wikipediaTitle: string | undefined;
        let wikipediaUrl: string | undefined;

        if (wikidataId) {
            // Use existing Wikidata ID from TMDB
            console.log(`  🔍 Using Wikidata ID from TMDB: ${wikidataId}`);
            const wikidataResult = await getWikidataById(wikidataId);
            wikipediaTitle = wikidataResult?.wikipedia_title;
            wikipediaUrl = wikidataResult?.wikipedia_url;
        } else {
            // Query Wikidata by TMDB ID
            const wikidataResult = await getWikidataByTmdbId(tmdbDetails.id, contentType);
            wikipediaTitle = wikidataResult?.wikipedia_title;
            wikipediaUrl = wikidataResult?.wikipedia_url;
        }

        // Step 2: Try to fetch Wikipedia summary if we have a title
        if (wikipediaTitle) {
            const wikiSummary = await getContentSummary(wikipediaTitle, 'en');

            if (wikiSummary && wikiSummary.extract) {
                console.log(`  ✅ Using Wikipedia overview (${wikiSummary.extract.length} chars)`);
                return {
                    overview: wikiSummary.extract,
                    overview_source: 'wikipedia',
                    wikipedia_url: wikiSummary.page_url || wikipediaUrl,
                };
            }
        }

        // Step 3: Fallback to TMDB
        if (tmdbOverview) {
            console.log(`  ℹ️  Wikipedia not available, using TMDB overview`);
            return {
                overview: tmdbOverview,
                overview_source: 'tmdb',
            };
        }

        console.log(`  ⚠️  No overview available from Wikipedia or TMDB`);
        return {
            overview: null,
            overview_source: 'none',
        };

    } catch (error) {
        console.error(`  ❌ Error enriching overview: ${error instanceof Error ? error.message : String(error)}`);
        console.log(`  ↩️  Falling back to TMDB overview`);
        return {
            overview: tmdbOverview,
            overview_source: 'tmdb',
        };
    }
}

/**
 * Enrich network and screenwriter data from Wikidata
 * Queries Wikidata for P449 (network) and P58 (screenwriter)
 * 
 * @param tmdbDetails TMDB details object
 * @param contentType Type of content
 * @returns Enriched network and screenwriter data
 */
async function enrichFromWikidata(
    tmdbDetails: any,
    contentType: 'movie' | 'tv'
): Promise<{
    original_network?: string;
    screenwriters?: string[];
    genres?: string[];
}> {
    try {
        // Query Wikidata for both TV and movies (genres apply to both)
        const wikidataId = tmdbDetails.external_ids?.wikidata_id;
        let wikidataResult;

        if (wikidataId) {
            console.log(`  🔍 Querying Wikidata ID ${wikidataId} for network/screenwriter/genres`);
            wikidataResult = await getWikidataById(wikidataId);
        } else {
            console.log(`  🔍 Querying Wikidata by TMDB ID for network/screenwriter/genres`);
            wikidataResult = await getWikidataByTmdbId(tmdbDetails.id, contentType);
        }

        if (!wikidataResult) {
            console.log(`  ℹ️  No Wikidata result found`);
            return {};
        }

        const enriched: {
            original_network?: string;
            screenwriters?: string[];
            genres?: string[];
        } = {};

        // Network from Wikidata (P449) - TV only
        if (contentType === 'tv' && wikidataResult.original_network) {
            enriched.original_network = wikidataResult.original_network;
            console.log(`  ✅ Wikidata network: ${wikidataResult.original_network}`);
        }

        // Screenwriters from Wikidata (P58)
        if (wikidataResult.screenwriters && wikidataResult.screenwriters.length > 0) {
            enriched.screenwriters = wikidataResult.screenwriters;
            console.log(`  ✅ Wikidata screenwriters: ${wikidataResult.screenwriters.join(', ')}`);
        }

        // Genres from Wikidata (P136)
        if (wikidataResult.genres && wikidataResult.genres.length > 0) {
            enriched.genres = wikidataResult.genres;
            console.log(`  ✅ Wikidata genres: ${wikidataResult.genres.join(', ')}`);
        }

        return enriched;

    } catch (error) {
        console.error(`  ❌ Error enriching from Wikidata: ${error instanceof Error ? error.message : String(error)}`);
        return {};
    }
}

/**
 * Enrich person biography with Wikipedia-first strategy
 * Tries Wikipedia first, falls back to TMDB biography
 * 
 * @param personName Person's name
 * @param tmdbBio Biography from TMDB (fallback)
 * @returns Enriched biography and metadata
 */
async function enrichPersonBio(
    personName: string,
    tmdbBio: string | null = null
): Promise<{
    biography: string | null;
    bio_source: string;
    wikipedia_url?: string;
}> {
    try {
        // Try Wikipedia first with name variants
        const wikiSummary = await getPersonBioMultiVariant(personName, 'en');

        if (wikiSummary && wikiSummary.extract) {
            console.log(`    ✅ Wikipedia bio for ${personName} (${wikiSummary.extract.length} chars)`);
            return {
                biography: wikiSummary.extract,
                bio_source: 'wikipedia',
                wikipedia_url: wikiSummary.page_url,
            };
        }

        // Fallback to TMDB
        if (tmdbBio) {
            console.log(`    ↩️  Using TMDB bio for ${personName}`);
            return {
                biography: tmdbBio,
                bio_source: 'tmdb',
            };
        }

        return {
            biography: null,
            bio_source: 'none',
        };

    } catch (error) {
        console.error(`    ❌ Error enriching bio for ${personName}:`, error);
        return {
            biography: tmdbBio,
            bio_source: tmdbBio ? 'tmdb' : 'none',
        };
    }
}



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

        // 2. Enrich overview with Wikipedia (Wikipedia-first strategy)
        console.log(`\n🌐 Enriching overview with Wikipedia...`);
        const overviewEnrichment = await enrichOverviewFromWikipedia(details, contentType);

        // 2b. Enrich network, screenwriter, and genres from Wikidata
        console.log(`\n📊 Enriching from Wikidata...`);
        const wikidataEnrichment = await enrichFromWikidata(details, contentType);

        // 3. Map TMDB data to our content format (with Wikipedia-enriched overview)
        const contentData = mapTmdbToContent(details, contentType);

        // Override overview with Wikipedia-enriched data
        contentData.overview = overviewEnrichment.overview;
        if (overviewEnrichment.wikipedia_url) {
            contentData.wikipedia_url = overviewEnrichment.wikipedia_url;
        }

        // Merge Wikidata network (Wikidata first, TMDB fallback)
        if (wikidataEnrichment.original_network) {
            contentData.original_network = wikidataEnrichment.original_network;
        } else if (contentData.networks && contentData.networks.length > 0) {
            contentData.original_network = contentData.networks[0].name;
            console.log(`  ↩️  Using TMDB network: ${contentData.original_network}`);
        }

        // Merge genres from Wikidata + TMDB (with deduplication)
        console.log(`\n🏷️  Merging genres and keywords...`);
        const tmdbGenres = contentData.genres || [];
        const wikidataGenres = wikidataEnrichment.genres || [];
        const mergedGenres = mergeGenres(wikidataGenres, tmdbGenres);
        contentData.genres = mergedGenres;

        if (wikidataGenres.length > 0) {
            console.log(`  ✅ Merged ${mergedGenres.length} genres (${wikidataGenres.length} from Wikidata, ${tmdbGenres.length} from TMDB)`);
        } else {
            console.log(`  ℹ️  Using ${tmdbGenres.length} TMDB genres`);
        }

        // Merge keywords from TMDB (Wikipedia categories future)
        const tmdbKeywords = contentData.keywords || [];
        const mergedKeywords = mergeKeywords(tmdbKeywords, []);
        contentData.keywords = mergedKeywords;
        console.log(`  ✅ ${mergedKeywords.length} keywords processed`);

        // Log screenwriters for crew processing
        if (wikidataEnrichment.screenwriters && wikidataEnrichment.screenwriters.length > 0) {
            console.log(`  📝 Screenwriters from Wikidata: ${wikidataEnrichment.screenwriters.join(', ')}`);
        }

        // Note: overview_source will be added to database schema in Phase 6

        // 4. Insert/update content
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
