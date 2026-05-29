const USER_AGENT = 'GDVG/1.0 (https://gdvg.vercel.app)';
const DELAY_MS = 800;

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function encodeTitle(title: string): string {
    return encodeURIComponent(title.replace(/ /g, '_'));
}

async function apiFetch(url: string, accept = 'application/json'): Promise<Response | null> {
    const maxAttempts = 3; // initial + 2 retries

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await delay(DELAY_MS);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept': accept,
                },
            });

            if (response.status === 404) return null;

            if (response.status === 429) {
                const waitTime = 1000 * Math.pow(2, attempt);
                if (attempt < maxAttempts) {
                    console.log(`  ⏳ Rate limited (429), waiting ${waitTime}ms (attempt ${attempt}/${maxAttempts})`);
                    await delay(waitTime);
                    continue;
                }
                console.warn(`  ⚠️  Rate limited — retries exhausted`);
                return null;
            }

            if (response.status === 503) {
                const waitTime = 1000 * attempt;
                if (attempt < maxAttempts) {
                    console.log(`  ⏳ Service unavailable (503), waiting ${waitTime}ms (attempt ${attempt}/${maxAttempts})`);
                    await delay(waitTime);
                    continue;
                }
                console.warn(`  ⚠️  Service unavailable — retries exhausted`);
                return null;
            }

            if (!response.ok) {
                console.warn(`  ⚠️  HTTP ${response.status} for: ${url}`);
                return null;
            }

            return response;

        } catch (error) {
            if (attempt < maxAttempts) {
                await delay(500 * attempt);
                continue;
            }
            console.error(`  ❌ Network error: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    return null;
}

/**
 * Finds the Wikipedia article title for a show/film using two strategies:
 * 1. OpenSearch API, 2. Search API with year/genre hint.
 */
export async function findWikipediaTitle(
    title: string,
    year?: number,
    lang: string = 'en',
    contentHint?: string
): Promise<string | null> {
    const base = `https://${lang}.wikipedia.org/w/api.php`;

    // Strategy 1: OpenSearch
    try {
        const url = `${base}?action=opensearch&search=${encodeURIComponent(title)}&limit=5&namespace=0&format=json`;
        const response = await apiFetch(url);
        if (response) {
            const data: any = await response.json();
            const titles: string[] = data[1] || [];
            if (titles.length > 0) {
                const firstWord = title.toLowerCase().split(' ')[0];
                const matched = titles.find(t => t.toLowerCase().includes(firstWord));
                const result = matched || titles[0];

                // Check if result is a disambiguation page
                // by looking if any title ends with "(disambiguation)"
                // or if the result itself seems too generic
                const isDisambig = titles.some(t =>
                    t.toLowerCase().includes('(disambiguation)')
                );
                if (isDisambig || result.toLowerCase() === title.toLowerCase()) {
                    // Skip to Strategy 2 with more specific search
                    throw new Error('disambiguation');
                }

                console.log(`  ✅ OpenSearch found: "${result}" for "${title}"`);
                return result;
            }
        }
    } catch (e) {
        if (e instanceof Error && e.message === 'disambiguation') {
            console.log(`  🔄 OpenSearch too generic for "${title}", trying specific search...`);
        } else {
            console.warn(`  ⚠️  OpenSearch failed for "${title}":`, e);
        }
    }

    // Strategy 2: Search API with year or genre hint
    try {
        const hint = contentHint
            ? contentHint
            : year
                ? String(year)
                : (lang === 'ja' ? 'anime' : 'drama');
        const searchQuery = `${title} ${hint}`;
        const url = `${base}?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&srlimit=3&format=json&formatversion=2`;
        const response = await apiFetch(url);
        if (response) {
            const data: any = await response.json();
            const results: any[] = data?.query?.search || [];
            if (results.length > 0) {
                const found = results[0].title;
                console.log(`  ✅ Search API found: "${found}" for "${title}"`);
                return found;
            }
        }
    } catch (e) {
        console.warn(`  ⚠️  Search API failed for "${title}":`, e);
    }

    console.log(`  ℹ️  No Wikipedia title found for: "${title}"`);
    return null;
}

/**
 * Fetches the plain-text summary of a Wikipedia article using the REST API.
 * Returns the extract field — already clean text, no HTML stripping needed.
 */
export async function fetchArticleSummary(
    wikipediaTitle: string,
    lang: string = 'en'
): Promise<string | null> {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeTitle(wikipediaTitle)}`;
    console.log(`  🔍 Fetching summary (${lang}): "${wikipediaTitle}"`);

    const response = await apiFetch(url);
    if (!response) return null;

    try {
        const data: any = await response.json();

        if (data.type === 'disambiguation') {
            console.log(`  ℹ️  "${wikipediaTitle}" is a disambiguation page`);
            return null;
        }

        const extract: string | undefined = data?.extract;
        if (!extract) {
            console.log(`  ℹ️  No extract for: "${wikipediaTitle}"`);
            return null;
        }

        console.log(`  ✅ Summary fetched (${extract.length} chars)`);
        return extract;

    } catch (error) {
        console.error(`  ❌ fetchArticleSummary error: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}

