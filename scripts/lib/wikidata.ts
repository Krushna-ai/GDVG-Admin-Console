/**
 * Wikidata API Client for GitHub Actions Scripts
 * Queries Wikidata using SPARQL to fetch additional metadata
 * 
 * API Guidelines:
 * - Endpoint: https://query.wikidata.org/sparql
 * - Rate limit: ~1 request/second recommended
 * - User-Agent: REQUIRED
 * - No authentication needed (free API)
 */

const USER_AGENT = process.env.WIKI_USER_AGENT || 
  'GDVG-Admin/1.0 (github.com/Krushna-ai/GDVG-Admin-Console)';

const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const RATE_LIMIT_DELAY_MS = 1000; // 1 second between requests

// ============================================
// TYPES
// ============================================

export interface WikidataResult {
  wikidata_id?: string;
  wikipedia_title?: string;
  wikipedia_url?: string;
  original_network?: string;
  screenwriters?: string[];
  genres?: string[];
}

interface WikidataBinding {
  type: string;
  value: string;
  'xml:lang'?: string;
}

interface WikidataSparqlResult {
  head: {
    vars: string[];
  };
  results: {
    bindings: Record<string, WikidataBinding>[];
  };
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
 * Execute a SPARQL query against Wikidata
 */
async function executeSparqlQuery(query: string): Promise<WikidataSparqlResult> {
  await delay(RATE_LIMIT_DELAY_MS);

  const url = new URL(WIKIDATA_SPARQL_ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/sparql-results+json',
    },
  });

  if (!response.ok) {
    throw new Error(`Wikidata SPARQL query failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Extract value from Wikidata binding
 */
function extractValue(binding?: WikidataBinding): string | undefined {
  if (!binding) return undefined;
  return binding.value;
}

/**
 * Extract label from Wikidata entity URI
 */
function extractEntityId(uri: string): string {
  const match = uri.match(/\/(Q\d+)$/);
  return match ? match[1] : uri;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get Wikidata information by TMDB ID
 * @param tmdbId TMDB ID of the content
 * @param contentType Type of content ('movie' or 'tv')
 * @returns Wikidata metadata or null if not found
 */
export async function getWikidataByTmdbId(
  tmdbId: number,
  contentType: 'movie' | 'tv'
): Promise<WikidataResult | null> {
  try {
    // Determine which TMDB property to use
    // P4947 = TMDB movie ID
    // P4983 = TMDB TV series ID
    const tmdbProperty = contentType === 'movie' ? 'P4947' : 'P4983';

    const query = `
      SELECT DISTINCT 
        ?item 
        ?itemLabel
        ?sitelink
        ?network 
        ?networkLabel
        ?screenwriter 
        ?screenwriterLabel
        ?genre 
        ?genreLabel
      WHERE {
        # Find item by TMDB ID
        ?item wdt:${tmdbProperty} "${tmdbId}".
        
        # Get Wikipedia sitelink (English)
        OPTIONAL {
          ?sitelink schema:about ?item;
                    schema:isPartOf <https://en.wikipedia.org/>;
                    schema:name ?sitelinkTitle.
        }
        
        # Get original broadcaster/network (P449)
        OPTIONAL { ?item wdt:P449 ?network. }
        
        # Get screenwriter (P58)
        OPTIONAL { ?item wdt:P58 ?screenwriter. }
        
        # Get genre (P136)
        OPTIONAL { ?item wdt:P136 ?genre. }
        
        # Get labels
        SERVICE wikibase:label { 
          bd:serviceParam wikibase:language "en,ko,ja,zh,th,tr,hi". 
          ?item rdfs:label ?itemLabel.
          ?network rdfs:label ?networkLabel.
          ?screenwriter rdfs:label ?screenwriterLabel.
          ?genre rdfs:label ?genreLabel.
        }
      }
      LIMIT 50
    `;

    console.log(`  🔍 Querying Wikidata for TMDB ${contentType} ID: ${tmdbId}`);
    const data = await executeSparqlQuery(query);

    if (!data.results.bindings.length) {
      console.log(`  ℹ️  No Wikidata entry found for TMDB ID: ${tmdbId}`);
      return null;
    }

    // Process results
    const bindings = data.results.bindings;
    const firstResult = bindings[0];

    const wikidataId = firstResult.item ? extractEntityId(firstResult.item.value) : undefined;
    const wikipediaTitle = firstResult.sitelinkTitle?.value;
    const wikipediaUrl = firstResult.sitelink?.value;

    // Collect networks (may be multiple)
    const networks = new Set<string>();
    bindings.forEach(b => {
      if (b.networkLabel?.value) {
        networks.add(b.networkLabel.value);
      }
    });

    // Collect screenwriters (may be multiple)
    const screenwriters = new Set<string>();
    bindings.forEach(b => {
      if (b.screenwriterLabel?.value) {
        screenwriters.add(b.screenwriterLabel.value);
      }
    });

    // Collect genres (may be multiple)
    const genres = new Set<string>();
    bindings.forEach(b => {
      if (b.genreLabel?.value) {
        genres.add(b.genreLabel.value);
      }
    });

    const result: WikidataResult = {
      wikidata_id: wikidataId,
      wikipedia_title: wikipediaTitle,
      wikipedia_url: wikipediaUrl,
      original_network: networks.size > 0 ? Array.from(networks)[0] : undefined,
      screenwriters: Array.from(screenwriters),
      genres: Array.from(genres),
    };

    console.log(`  ✅ Wikidata result: ${wikidataId || 'N/A'}`);
    if (wikipediaTitle) console.log(`     Wikipedia: ${wikipediaTitle}`);
    if (networks.size) console.log(`     Networks: ${Array.from(networks).join(', ')}`);
    if (screenwriters.size) console.log(`     Screenwriters: ${Array.from(screenwriters).join(', ')}`);
    if (genres.size) console.log(`     Genres: ${Array.from(genres).join(', ')}`);

    return result;

  } catch (error) {
    console.error(`  ❌ Wikidata query error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Get Wikidata information by Wikidata ID (if already known from TMDB)
 * @param wikidataId Wikidata entity ID (e.g., "Q12345")
 * @returns Wikidata metadata or null if not found
 */
export async function getWikidataById(wikidataId: string): Promise<WikidataResult | null> {
  try {
    const query = `
      SELECT DISTINCT 
        ?item 
        ?itemLabel
        ?sitelink
        ?network 
        ?networkLabel
        ?screenwriter 
        ?screenwriterLabel
        ?genre 
        ?genreLabel
      WHERE {
        # Use the provided Wikidata ID
        BIND(wd:${wikidataId} AS ?item)
        
        # Get Wikipedia sitelink (English)
        OPTIONAL {
          ?sitelink schema:about ?item;
                    schema:isPartOf <https://en.wikipedia.org/>;
                    schema:name ?sitelinkTitle.
        }
        
        # Get original broadcaster/network (P449)
        OPTIONAL { ?item wdt:P449 ?network. }
        
        # Get screenwriter (P58)
        OPTIONAL { ?item wdt:P58 ?screenwriter. }
        
        # Get genre (P136)
        OPTIONAL { ?item wdt:P136 ?genre. }
        
        # Get labels
        SERVICE wikibase:label { 
          bd:serviceParam wikibase:language "en,ko,ja,zh,th,tr,hi". 
          ?item rdfs:label ?itemLabel.
          ?network rdfs:label ?networkLabel.
          ?screenwriter rdfs:label ?screenwriterLabel.
          ?genre rdfs:label ?genreLabel.
        }
      }
      LIMIT 50
    `;

    console.log(`  🔍 Querying Wikidata ID: ${wikidataId}`);
    const data = await executeSparqlQuery(query);

    if (!data.results.bindings.length) {
      console.log(`  ℹ️  No data found for Wikidata ID: ${wikidataId}`);
      return null;
    }

    const bindings = data.results.bindings;
    const firstResult = bindings[0];

    const wikipediaTitle = firstResult.sitelinkTitle?.value;
    const wikipediaUrl = firstResult.sitelink?.value;

    const networks = new Set<string>();
    const screenwriters = new Set<string>();
    const genres = new Set<string>();

    bindings.forEach(b => {
      if (b.networkLabel?.value) networks.add(b.networkLabel.value);
      if (b.screenwriterLabel?.value) screenwriters.add(b.screenwriterLabel.value);
      if (b.genreLabel?.value) genres.add(b.genreLabel.value);
    });

    const result: WikidataResult = {
      wikidata_id: wikidataId,
      wikipedia_title: wikipediaTitle,
      wikipedia_url: wikipediaUrl,
      original_network: networks.size > 0 ? Array.from(networks)[0] : undefined,
      screenwriters: Array.from(screenwriters),
      genres: Array.from(genres),
    };

    console.log(`  ✅ Wikidata result for ${wikidataId}`);
    if (wikipediaTitle) console.log(`     Wikipedia: ${wikipediaTitle}`);

    return result;

  } catch (error) {
    console.error(`  ❌ Wikidata query error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
