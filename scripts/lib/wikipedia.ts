/**
 * Wikipedia REST API Client for GitHub Actions Scripts
 * Fetches page summaries and extracts for content overview and people biographies
 * 
 * API Guidelines:
 * - Endpoint: https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}
 * - Rate limit: Max 200 req/sec (we use 100ms delay to be safe)
 * - User-Agent: REQUIRED
 * - No authentication needed (free API)
 */

const USER_AGENT = process.env.WIKI_USER_AGENT ||
    'GDVG-Admin/1.0 (github.com/Krushna-ai/GDVG-Admin-Console)';

const RATE_LIMIT_DELAY_MS = 100; // 100ms = 10 req/sec (well under 200 limit)

// ============================================
// TYPES
// ============================================

export interface WikipediaSummary {
    title: string;
    extract: string; // Plain text summary
    extract_html?: string; // HTML version
    description?: string; // Short description
    thumbnail?: {
        source: string;
        width: number;
        height: number;
    };
    page_url: string; // Full Wikipedia URL
    lang: string;
    type?: string; // e.g., "standard", "disambiguation"
}

interface WikipediaApiResponse {
    type: string;
    title: string;
    displaytitle?: string;
    namespace?: { id: number; text: string };
    wikibase_item?: string;
    titles?: {
        canonical?: string;
        normalized?: string;
        display?: string;
    };
    pageid?: number;
    thumbnail?: {
        source: string;
        width: number;
        height: number;
    };
    originalimage?: {
        source: string;
        width: number;
        height: number;
    };
    lang: string;
    dir?: string;
    revision?: string;
    tid?: string;
    timestamp?: string;
    description?: string;
    description_source?: string;
    content_urls?: {
        desktop: { page: string; revisions: string; edit: string; talk: string };
        mobile: { page: string; revisions: string; edit: string; talk: string };
    };
    extract: string;
    extract_html?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Rate limiting delay
 */
export async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * URL-encode a title for Wikipedia API
 */
function encodeTitle(title: string): string {
    // Replace spaces with underscores (Wikipedia convention)
    return encodeURIComponent(title.replace(/ /g, '_'));
}

/**
 * Fetch Wikipedia page summary
 */
async function fetchWikipediaSummary(
    title: string,
    language: string = 'en'
): Promise<WikipediaApiResponse | null> {
    await delay(RATE_LIMIT_DELAY_MS);

    const encodedTitle = encodeTitle(title);
    const url = `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json',
            },
        });

        if (response.status === 404) {
            // Page not found - not an error, just no data
            return null;
        }

        if (!response.ok) {
            console.warn(`  ⚠️  Wikipedia API error for "${title}": ${response.status} ${response.statusText}`);
            return null;
        }

        const data: WikipediaApiResponse = await response.json();

        // Check if it's a disambiguation page
        if (data.type === 'disambiguation') {
            console.log(`  ℹ️  "${title}" is a disambiguation page, skipping`);
            return null;
        }

        return data;

    } catch (error) {
        console.error(`  ❌ Wikipedia fetch error for "${title}": ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

// ============================================
// PUBLIC API - CONTENT
// ============================================

/**
 * Get Wikipedia summary for content (movie/TV show)
 * Returns overview/synopsis from Wikipedia page
 * 
 * @param title Wikipedia page title (can be from Wikidata or content title)
 * @param language Wikipedia language code (default: 'en')
 * @returns Summary with extract for overview, or null if not found
 */
export async function getContentSummary(
    title: string,
    language: string = 'en'
): Promise<WikipediaSummary | null> {
    try {
        console.log(`  🔍 Fetching Wikipedia (${language}) summary for: "${title}"`);

        const data = await fetchWikipediaSummary(title, language);

        if (!data || !data.extract) {
            console.log(`  ℹ️  No Wikipedia summary found for: "${title}"`);
            return null;
        }

        const summary: WikipediaSummary = {
            title: data.title,
            extract: data.extract,
            extract_html: data.extract_html,
            description: data.description,
            thumbnail: data.thumbnail,
            page_url: data.content_urls?.desktop?.page || `https://${language}.wikipedia.org/wiki/${encodeTitle(title)}`,
            lang: language,
            type: data.type,
        };

        console.log(`  ✅ Wikipedia summary found (${data.extract.length} chars)`);
        if (data.description) console.log(`     Description: ${data.description}`);

        return summary;

    } catch (error) {
        console.error(`  ❌ Error getting Wikipedia summary: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/**
 * Try multiple language variants to find Wikipedia page
 * Useful for content with alternate titles
 */
export async function getContentSummaryMultiLang(
    titles: string[],
    languages: string[] = ['en', 'ko', 'ja', 'zh']
): Promise<WikipediaSummary | null> {
    for (const lang of languages) {
        for (const title of titles) {
            const summary = await getContentSummary(title, lang);
            if (summary) {
                return summary;
            }
        }
    }

    console.log(`  ℹ️  No Wikipedia page found in any language for: ${titles.join(', ')}`);
    return null;
}

// ============================================
// PUBLIC API - PEOPLE
// ============================================

/**
 * Get Wikipedia biography for a person (actor/director/writer)
 * Returns biography extract from Wikipedia page
 * 
 * @param name Person's name
 * @param language Wikipedia language code (default: 'en')
 * @returns Summary with biography extract, or null if not found
 */
export async function getPersonBio(
    name: string,
    language: string = 'en'
): Promise<WikipediaSummary | null> {
    try {
        console.log(`  🔍 Fetching Wikipedia (${language}) bio for: "${name}"`);

        const data = await fetchWikipediaSummary(name, language);

        if (!data || !data.extract) {
            console.log(`  ℹ️  No Wikipedia bio found for: "${name}"`);
            return null;
        }

        const bio: WikipediaSummary = {
            title: data.title,
            extract: data.extract,
            extract_html: data.extract_html,
            description: data.description,
            thumbnail: data.thumbnail,
            page_url: data.content_urls?.desktop?.page || `https://${language}.wikipedia.org/wiki/${encodeTitle(name)}`,
            lang: language,
            type: data.type,
        };

        console.log(`  ✅ Wikipedia bio found (${data.extract.length} chars)`);

        return bio;

    } catch (error) {
        console.error(`  ❌ Error getting Wikipedia bio: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/**
 * Try to find person bio with name variations
 * Handles cases like "John Doe" vs "Doe, John"
 */
export async function getPersonBioMultiVariant(
    name: string,
    language: string = 'en'
): Promise<WikipediaSummary | null> {
    const variants = [
        name,
        // Try with parenthetical disambiguation (common on Wikipedia)
        `${name} (actor)`,
        `${name} (actress)`,
        `${name} (director)`,
        `${name} (writer)`,
    ];

    for (const variant of variants) {
        const bio = await getPersonBio(variant, language);
        if (bio) {
            return bio;
        }
    }

    console.log(`  ℹ️  No Wikipedia bio found for any variant of: "${name}"`);
    return null;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Extract categories from Wikipedia page (for tags)
 * Note: This requires the full page API, not the summary API
 * Categories can be used as tags
 */
export async function getPageCategories(
    title: string,
    language: string = 'en'
): Promise<string[]> {
    // TODO: Implement using MediaWiki API if needed for tag extraction
    // For now, return empty array
    // Endpoint would be: https://{lang}.wikipedia.org/w/api.php?action=query&titles={title}&prop=categories
    return [];
}
