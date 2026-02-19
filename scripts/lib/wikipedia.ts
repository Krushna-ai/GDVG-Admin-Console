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
// MEDIAWIKI ACTION API
// ============================================

/**
 * MediaWiki Action API response types
 */
interface MediaWikiActionResponse {
    query?: {
        pages?: {
            [pageId: string]: {
                pageid?: number;
                title?: string;
                categories?: Array<{ title: string; ns: number }>;
                revisions?: Array<{ slots?: { main?: { content?: string } } }>;
                images?: Array<{ title: string }>;
            };
        };
    };
    error?: {
        code: string;
        info: string;
    };
}

/**
 * Fetch data from MediaWiki Action API
 */
async function fetchMediaWikiAction(
    language: string,
    params: Record<string, string>
): Promise<MediaWikiActionResponse | null> {
    await delay(RATE_LIMIT_DELAY_MS);

    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*'); // CORS support

    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    try {
        const response = await fetch(url.toString(), {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            console.warn(`  ⚠️  MediaWiki API error: ${response.status} ${response.statusText}`);
            return null;
        }

        const data: MediaWikiActionResponse = await response.json();

        if (data.error) {
            console.warn(`  ⚠️  MediaWiki API error: ${data.error.code} - ${data.error.info}`);
            return null;
        }

        return data;

    } catch (error) {
        console.error(`  ❌ MediaWiki API fetch error: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/**
 * Extract categories from Wikipedia page (for auto-tagging)
 * Categories are Wikipedia's taxonomy system and can be used as content tags
 * 
 * @param title Wikipedia page title
 * @param language Wikipedia language code (default: 'en')
 * @returns Array of category names (without "Category:" prefix)
 */
export async function getPageCategories(
    title: string,
    language: string = 'en'
): Promise<string[]> {
    try {
        console.log(`  🔍 Fetching categories for: "${title}" (${language})`);

        const data = await fetchMediaWikiAction(language, {
            action: 'query',
            titles: title,
            prop: 'categories',
            cllimit: '500', // Max categories per page
            clshow: '!hidden', // Exclude hidden/maintenance categories
        });

        if (!data || !data.query || !data.query.pages) {
            console.log(`  ℹ️  No categories found for: "${title}"`);
            return [];
        }

        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        const page = pages[pageId];

        if (!page || !page.categories || page.categories.length === 0) {
            console.log(`  ℹ️  Page has no categories: "${title}"`);
            return [];
        }

        // Extract category names, remove "Category:" prefix
        const categories = page.categories
            .map(cat => cat.title.replace(/^Category:/i, ''))
            .filter(cat => {
                // Filter out obvious maintenance categories
                const lower = cat.toLowerCase();
                return !lower.includes('articles') &&
                    !lower.includes('pages') &&
                    !lower.includes('wikipedia') &&
                    !lower.includes('redirects') &&
                    !lower.includes('disambiguation');
            });

        console.log(`  ✅ Found ${categories.length} categories`);
        if (categories.length > 0 && categories.length <= 10) {
            console.log(`     Categories: ${categories.join(', ')}`);
        }

        return categories;

    } catch (error) {
        console.error(`  ❌ Error getting categories: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}

/**
 * Get full page content from Wikipedia (for detailed plot summaries)
 * Returns parsed HTML content of the article
 * 
 * @param title Wikipedia page title
 * @param language Wikipedia language code (default: 'en')
 * @param section Section number to fetch (0 = intro, undefined = full page)
 * @returns HTML content or null if not found
 */
export async function getPageContent(
    title: string,
    language: string = 'en',
    section?: number
): Promise<string | null> {
    try {
        console.log(`  🔍 Fetching full content for: "${title}" (${language})`);

        const params: Record<string, string> = {
            action: 'parse',
            page: title,
            prop: 'text',
            disableeditsection: '1',
            disabletoc: '1',
        };

        if (section !== undefined) {
            params.section = String(section);
        }

        const data = await fetchMediaWikiAction(language, params);

        if (!data || !data.query) {
            // Parse API uses different response structure
            const parseData = data as any;
            if (parseData && parseData.parse && parseData.parse.text) {
                const html = parseData.parse.text['*'] || parseData.parse.text;
                console.log(`  ✅ Content fetched (${html.length} chars)`);
                return html;
            }

            console.log(`  ℹ️  No content found for: "${title}"`);
            return null;
        }

        return null;

    } catch (error) {
        console.error(`  ❌ Error getting page content: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

/**
 * Get all images from a Wikipedia page
 * Useful for gathering promotional images, posters, character photos
 * 
 * @param title Wikipedia page title
 * @param language Wikipedia language code (default: 'en')
 * @returns Array of image filenames (without "File:" prefix)
 */
export async function getPageImages(
    title: string,
    language: string = 'en'
): Promise<string[]> {
    try {
        console.log(`  🔍 Fetching images for: "${title}" (${language})`);

        const data = await fetchMediaWikiAction(language, {
            action: 'query',
            titles: title,
            prop: 'images',
            imlimit: '500', // Max images per page
        });

        if (!data || !data.query || !data.query.pages) {
            console.log(`  ℹ️  No images found for: "${title}"`);
            return [];
        }

        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        const page = pages[pageId];

        if (!page || !page.images || page.images.length === 0) {
            console.log(`  ℹ️  Page has no images: "${title}"`);
            return [];
        }

        // Extract image filenames, remove "File:" prefix
        const images = page.images
            .map(img => img.title.replace(/^File:/i, ''))
            .filter(img => {
                // Filter out common icons, logos, and maintenance images
                const lower = img.toLowerCase();
                return !lower.includes('icon') &&
                    !lower.includes('logo') &&
                    !lower.includes('.svg') &&
                    !lower.includes('commons-logo') &&
                    !lower.includes('wikidata') &&
                    !lower.includes('edit-');
            });

        console.log(`  ✅ Found ${images.length} images`);
        if (images.length > 0 && images.length <= 5) {
            console.log(`     Images: ${images.join(', ')}`);
        }

        return images;

    } catch (error) {
        console.error(`  ❌ Error getting images: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}

/**
 * Get image URL from Wikimedia Commons
 * Converts image filename to actual URL
 * 
 * @param filename Image filename (e.g., "Example.jpg")
 * @param width Desired width in pixels (optional, for thumbnails)
 * @returns Full image URL or null if not found
 */
export async function getImageUrl(
    filename: string,
    width?: number
): Promise<string | null> {
    try {
        await delay(RATE_LIMIT_DELAY_MS);

        const url = new URL('https://commons.wikimedia.org/w/api.php');
        url.searchParams.set('action', 'query');
        url.searchParams.set('titles', `File:${filename}`);
        url.searchParams.set('prop', 'imageinfo');
        url.searchParams.set('iiprop', 'url');
        url.searchParams.set('format', 'json');
        url.searchParams.set('origin', '*');

        if (width) {
            url.searchParams.set('iiurlwidth', String(width));
        }

        const response = await fetch(url.toString(), {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            return null;
        }

        const data: any = await response.json();
        const pages = data.query?.pages;

        if (!pages) return null;

        const pageId = Object.keys(pages)[0];
        const imageInfo = pages[pageId]?.imageinfo?.[0];

        if (!imageInfo) return null;

        // Return thumbnail URL if width specified, otherwise full URL
        return width ? imageInfo.thumburl || imageInfo.url : imageInfo.url;

    } catch (error) {
        console.error(`  ❌ Error getting image URL: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}
