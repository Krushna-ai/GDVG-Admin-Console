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
  awards?: Array<{ awardId: string; award: string; year?: number; category?: string; won: boolean }>;
  based_on?: string;
  filming_location?: string;
  narrative_location?: string;
  box_office?: number;
  rt_id?: string;
  mc_id?: string;
  mdl_id?: string;
}

export interface WikidataPersonResult {
  native_name?: string;
  instagram?: string;
  twitter?: string;
  tiktok?: string;
  height_cm?: number;
  website?: string;
  wikidata_id?: string;
  awards?: Array<{ awardId: string; award: string; year?: number; category?: string; won: boolean }>;
  image?: string;
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
        ?award
        ?awardLabel
        ?awardYear
        ?awardWorkLabel
        ?awardRank
        ?basedOnLabel
        ?filmingLocationLabel
        ?narrativeLocationLabel
        ?boxOffice
        ?rtId
        ?mcId
        ?mdlId
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
        
        # Awards (P166 with qualifiers)
        OPTIONAL {
          ?item p:P166 ?awardStatement.
          ?awardStatement ps:P166 ?award.
          OPTIONAL { ?awardStatement pq:P585 ?awardYear. }
          OPTIONAL { ?awardStatement pq:P1686 ?awardWork. }
          OPTIONAL { ?awardStatement pq:P1352 ?awardRank. }
        }

        # Extended metadata (OPTIONAL)
        OPTIONAL { ?item wdt:P144 ?basedOn. }
        OPTIONAL { ?item wdt:P915 ?filmingLocation. }
        OPTIONAL { ?item wdt:P840 ?narrativeLocation. }
        OPTIONAL { ?item wdt:P2142 ?boxOffice. }
        OPTIONAL { ?item wdt:P1258 ?rtId. }
        OPTIONAL { ?item wdt:P1712 ?mcId. }
        OPTIONAL { ?item wdt:P3138 ?mdlId. }
        
        # Get labels
        SERVICE wikibase:label { 
          bd:serviceParam wikibase:language "en,ko,ja,zh,th,tr,hi". 
          ?item rdfs:label ?itemLabel.
          ?network rdfs:label ?networkLabel.
          ?screenwriter rdfs:label ?screenwriterLabel.
          ?genre rdfs:label ?genreLabel.
          ?award rdfs:label ?awardLabel.
          ?awardWork rdfs:label ?awardWorkLabel.
          ?basedOn rdfs:label ?basedOnLabel.
          ?filmingLocation rdfs:label ?filmingLocationLabel.
          ?narrativeLocation rdfs:label ?narrativeLocationLabel.
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

    // Collect awards (deduplicated by ID+Year to avoid over-duplication from multi-bindings)
    const awardsMap = new Map<string, { awardId: string; award: string; year?: number; category?: string; won: boolean }>();
    bindings.forEach(b => {
      if (b.award?.value && b.awardLabel?.value) {
        const awardId = extractEntityId(b.award.value);
        const year = b.awardYear?.value ? new Date(b.awardYear.value).getFullYear() : undefined;
        // The default is usually 'winner' unless ranked as nominee (e.g., Q15007328 usually used for nominee rank)
        // Check if awardRank contains preferred rank URL (http://wikiba.se/ontology#PreferredRank)
        // or check if it specifies 'winner' vs 'nominee'
        const rankUri = b.awardRank?.value || '';
        const won = rankUri.includes('PreferredRank') || rankUri.includes('NormalRank') || !rankUri.includes('DeprecatedRank');

        const key = `${awardId}-${year || 'no-year'}`;
        if (!awardsMap.has(key)) {
          awardsMap.set(key, {
            awardId,
            award: b.awardLabel.value,
            year,
            category: b.awardWorkLabel?.value,
            won, // Simplification for now
          });
        }
      }
    });

    // Find the first valid string for single-value metadata fields
    const getValue = (key: string) => bindings.find(b => b[key]?.value)?.[key]?.value;
    const boxOfficeStr = getValue('boxOffice');

    const result: WikidataResult = {
      wikidata_id: wikidataId,
      wikipedia_title: wikipediaTitle,
      wikipedia_url: wikipediaUrl,
      original_network: networks.size > 0 ? Array.from(networks)[0] : undefined,
      screenwriters: Array.from(screenwriters),
      genres: Array.from(genres),
      awards: awardsMap.size > 0 ? Array.from(awardsMap.values()) : undefined,
      based_on: getValue('basedOnLabel'),
      filming_location: getValue('filmingLocationLabel'),
      narrative_location: getValue('narrativeLocationLabel'),
      box_office: boxOfficeStr ? parseFloat(boxOfficeStr) : undefined,
      rt_id: getValue('rtId'),
      mc_id: getValue('mcId'),
      mdl_id: getValue('mdlId'),
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
        ?award
        ?awardLabel
        ?awardYear
        ?awardWorkLabel
        ?awardRank
        ?basedOnLabel
        ?filmingLocationLabel
        ?narrativeLocationLabel
        ?boxOffice
        ?rtId
        ?mcId
        ?mdlId
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
        
        # Awards (P166 with qualifiers)
        OPTIONAL {
          ?item p:P166 ?awardStatement.
          ?awardStatement ps:P166 ?award.
          OPTIONAL { ?awardStatement pq:P585 ?awardYear. }
          OPTIONAL { ?awardStatement pq:P1686 ?awardWork. }
          OPTIONAL { ?awardStatement pq:P1352 ?awardRank. }
        }

        # Extended metadata (OPTIONAL)
        OPTIONAL { ?item wdt:P144 ?basedOn. }
        OPTIONAL { ?item wdt:P915 ?filmingLocation. }
        OPTIONAL { ?item wdt:P840 ?narrativeLocation. }
        OPTIONAL { ?item wdt:P2142 ?boxOffice. }
        OPTIONAL { ?item wdt:P1258 ?rtId. }
        OPTIONAL { ?item wdt:P1712 ?mcId. }
        OPTIONAL { ?item wdt:P3138 ?mdlId. }
        
        # Get labels
        SERVICE wikibase:label { 
          bd:serviceParam wikibase:language "en,ko,ja,zh,th,tr,hi". 
          ?item rdfs:label ?itemLabel.
          ?network rdfs:label ?networkLabel.
          ?screenwriter rdfs:label ?screenwriterLabel.
          ?genre rdfs:label ?genreLabel.
          ?award rdfs:label ?awardLabel.
          ?awardWork rdfs:label ?awardWorkLabel.
          ?basedOn rdfs:label ?basedOnLabel.
          ?filmingLocation rdfs:label ?filmingLocationLabel.
          ?narrativeLocation rdfs:label ?narrativeLocationLabel.
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
    const awardsMap = new Map<string, { awardId: string; award: string; year?: number; category?: string; won: boolean }>();

    bindings.forEach(b => {
      if (b.networkLabel?.value) networks.add(b.networkLabel.value);
      if (b.screenwriterLabel?.value) screenwriters.add(b.screenwriterLabel.value);
      if (b.genreLabel?.value) genres.add(b.genreLabel.value);

      if (b.award?.value && b.awardLabel?.value) {
        const awardId = extractEntityId(b.award.value);
        const year = b.awardYear?.value ? new Date(b.awardYear.value).getFullYear() : undefined;
        const rankUri = b.awardRank?.value || '';
        const won = rankUri.includes('PreferredRank') || rankUri.includes('NormalRank') || !rankUri.includes('DeprecatedRank');

        const key = `${awardId}-${year || 'no-year'}`;
        if (!awardsMap.has(key)) {
          awardsMap.set(key, {
            awardId,
            award: b.awardLabel.value,
            year,
            category: b.awardWorkLabel?.value,
            won,
          });
        }
      }
    });

    const getValue = (key: string) => bindings.find(b => b[key]?.value)?.[key]?.value;
    const boxOfficeStr = getValue('boxOffice');

    const result: WikidataResult = {
      wikidata_id: wikidataId,
      wikipedia_title: wikipediaTitle,
      wikipedia_url: wikipediaUrl,
      original_network: networks.size > 0 ? Array.from(networks)[0] : undefined,
      screenwriters: Array.from(screenwriters),
      genres: Array.from(genres),
      awards: awardsMap.size > 0 ? Array.from(awardsMap.values()) : undefined,
      based_on: getValue('basedOnLabel'),
      filming_location: getValue('filmingLocationLabel'),
      narrative_location: getValue('narrativeLocationLabel'),
      box_office: boxOfficeStr ? parseFloat(boxOfficeStr) : undefined,
      rt_id: getValue('rtId'),
      mc_id: getValue('mcId'),
      mdl_id: getValue('mdlId'),
    };

    console.log(`  ✅ Wikidata result for ${wikidataId}`);
    if (wikipediaTitle) console.log(`     Wikipedia: ${wikipediaTitle}`);

    return result;

  } catch (error) {
    console.error(`  ❌ Wikidata query error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// ============================================
// WIKIDATA REST API
// ============================================

/**
 * Wikidata REST API response types
 * Based on https://www.wikidata.org/w/rest.php/wikibase/v1/openapi
 */
interface WikidataRestEntity {
  id: string;
  type: string;
  labels?: {
    [lang: string]: {
      language: string;
      value: string;
    };
  };
  descriptions?: {
    [lang: string]: {
      language: string;
      value: string;
    };
  };
  aliases?: {
    [lang: string]: Array<{
      language: string;
      value: string;
    }>;
  };
  statements?: {
    [propertyId: string]: Array<{
      id: string;
      rank: string;
      property: {
        id: string;
      };
      value?: {
        type: string;
        content?: any;
      };
      qualifiers?: any;
      references?: any;
    }>;
  };
  sitelinks?: {
    [siteId: string]: {
      title: string;
      url: string;
      badges: string[];
    };
  };
}

const WIKIDATA_REST_BASE_URL = 'https://www.wikidata.org/w/rest.php/wikibase/v0';

/**
 * Fetch entity directly from Wikidata REST API (faster than SPARQL for single entity)
 * @param wikidataId Wikidata entity ID (e.g., "Q12345")
 * @param languages Preferred languages for labels (default: ['en'])
 * @returns Entity data or null if not found
 */
export async function getEntityByIdRest(
  wikidataId: string,
  languages: string[] = ['en']
): Promise<WikidataRestEntity | null> {
  try {
    await delay(RATE_LIMIT_DELAY_MS);

    console.log(`  🔍 Fetching Wikidata entity via REST: ${wikidataId}`);

    const url = `${WIKIDATA_REST_BASE_URL}/entities/items/${wikidataId}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });

    if (response.status === 404) {
      console.log(`  ℹ️  Entity not found: ${wikidataId}`);
      return null;
    }

    if (!response.ok) {
      console.warn(`  ⚠️  Wikidata REST API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: WikidataRestEntity = await response.json();

    console.log(`  ✅ Entity fetched: ${wikidataId}`);
    if (data.labels && data.labels.en) {
      console.log(`     Label: ${data.labels.en.value}`);
    }

    return data;

  } catch (error) {
    console.error(`  ❌ Wikidata REST API error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Extract Wikipedia title from Wikidata entity (REST API version)
 * @param entity Wikidata entity from REST API
 * @param language Wikipedia language code (default: 'en')
 * @returns Wikipedia page title or null
 */
export function extractWikipediaTitleFromEntity(
  entity: WikidataRestEntity,
  language: string = 'en'
): string | null {
  if (!entity.sitelinks) return null;

  const siteKey = `${language}wiki`;
  const sitelink = entity.sitelinks[siteKey];

  return sitelink ? sitelink.title : null;
}

/**
 * Extract label from entity in preferred language
 * @param entity Wikidata entity from REST API
 * @param languages Preferred languages (default: ['en'])
 * @returns Label or null
 */
export function extractLabel(
  entity: WikidataRestEntity,
  languages: string[] = ['en']
): string | null {
  if (!entity.labels) return null;

  for (const lang of languages) {
    if (entity.labels[lang]) {
      return entity.labels[lang].value;
    }
  }

  // Fallback to any available label
  const firstLabel = Object.values(entity.labels)[0];
  return firstLabel ? firstLabel.value : null;
}

/**
 * Extract description from entity in preferred language
 * @param entity Wikidata entity from REST API
 * @param languages Preferred languages (default: ['en'])
 * @returns Description or null
 */
export function extractDescription(
  entity: WikidataRestEntity,
  languages: string[] = ['en']
): string | null {
  if (!entity.descriptions) return null;

  for (const lang of languages) {
    if (entity.descriptions[lang]) {
      return entity.descriptions[lang].value;
    }
  }

  return null;
}

/**
 * Extract statement values for a given property
 * @param entity Wikidata entity from REST API
 * @param propertyId Property ID (e.g., "P31" for "instance of")
 * @returns Array of values
 */
export function extractStatementValues(
  entity: WikidataRestEntity,
  propertyId: string
): string[] {
  if (!entity.statements || !entity.statements[propertyId]) {
    return [];
  }

  const statements = entity.statements[propertyId];
  const values: string[] = [];

  for (const statement of statements) {
    if (statement.value && statement.value.content) {
      // Handle different value types
      const content = statement.value.content;
      if (typeof content === 'string') {
        values.push(content);
      } else if (content.id) {
        // Entity reference
        values.push(content.id);
      } else if (content.text) {
        // Monolingual text
        values.push(content.text);
      }
    }
  }

  return values;
}

/**
 * Get entity metadata by Wikidata ID using REST API (optimized)
 * Alternative to getWikidataById() when you already have the Wikidata ID
 * @param wikidataId Wikidata entity ID (e.g., "Q12345")
 * @returns Simplified metadata result
 */
export async function getEntityMetadataRest(
  wikidataId: string
): Promise<WikidataResult | null> {
  try {
    const entity = await getEntityByIdRest(wikidataId, ['en', 'ko', 'ja', 'zh']);

    if (!entity) {
      return null;
    }

    const result: WikidataResult = {
      wikidata_id: wikidataId,
      wikipedia_title: extractWikipediaTitleFromEntity(entity, 'en') || undefined,
      wikipedia_url: entity.sitelinks?.enwiki?.url || undefined,
    };

    // Extract genres (P136)
    const genreIds = extractStatementValues(entity, 'P136');
    if (genreIds.length > 0) {
      // Note: Would need additional API calls to resolve genre IDs to labels
      // For now, just store the IDs
      result.genres = genreIds;
    }

    console.log(`  ✅ Entity metadata extracted via REST`);

    return result;

  } catch (error) {
    console.error(`  ❌ Error getting entity metadata: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Performance comparison helper
 * Tests SPARQL vs REST API for the same entity
 */
export async function comparePerformance(wikidataId: string): Promise<void> {
  console.log(`\n🏁 Performance Comparison: ${wikidataId}`);
  console.log('-'.repeat(60));

  // Test SPARQL
  console.log('\n📊 SPARQL Method:');
  const sparqlStart = Date.now();
  const sparqlResult = await getWikidataById(wikidataId);
  const sparqlTime = Date.now() - sparqlStart;
  console.log(`   Time: ${sparqlTime}ms`);

  // Test REST API
  console.log('\n🚀 REST API Method:');
  const restStart = Date.now();
  const restResult = await getEntityMetadataRest(wikidataId);
  const restTime = Date.now() - restStart;
  console.log(`   Time: ${restTime}ms`);

  // Comparison
  console.log('\n📈 Results:');
  console.log(`   SPARQL: ${sparqlTime}ms`);
  console.log(`   REST:   ${restTime}ms`);
  console.log(`   Speedup: ${(sparqlTime / restTime).toFixed(2)}x`);
  console.log(`   Winner: ${restTime < sparqlTime ? '🚀 REST API' : '📊 SPARQL'}`);
}

// ============================================
// LINKED DATA & SEMANTIC WEB
// ============================================

/**
 * Content negotiation formats for Wikidata Linked Data Interface
 */
export type RdfFormat =
  | 'application/rdf+xml'       // RDF/XML
  | 'application/n-triples'     // N-Triples
  | 'text/turtle'                // Turtle
  | 'application/ld+json'        // JSON-LD
  | 'application/json';          // Standard JSON

/**
 * Linked Data response (simplified structure)
 */
interface LinkedDataResponse {
  format: RdfFormat;
  data: any;
  contentType: string;
}

/**
 * Fetch entity data using Wikidata Linked Data Interface with content negotiation
 * Supports multiple RDF formats for semantic web applications
 * 
 * @param wikidataId Wikidata entity ID (e.g., "Q12345")
 * @param format Desired RDF format (default: JSON-LD)
 * @returns Entity data in requested format
 */
export async function getEntityAsLinkedData(
  wikidataId: string,
  format: RdfFormat = 'application/ld+json'
): Promise<LinkedDataResponse | null> {
  try {
    await delay(RATE_LIMIT_DELAY_MS);

    console.log(`  🔗 Fetching Linked Data for ${wikidataId} (format: ${format})`);

    const url = `http://www.wikidata.org/entity/${wikidataId}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': format,
      },
    });

    if (response.status === 404) {
      console.log(`  ℹ️  Entity not found: ${wikidataId}`);
      return null;
    }

    if (!response.ok) {
      console.warn(`  ⚠️  Linked Data fetch error: ${response.status} ${response.statusText}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';

    // Parse based on content type
    let data: any;
    if (contentType.includes('json')) {
      data = await response.json();
    } else {
      data = await response.text(); // RDF/XML, Turtle, N-Triples as text
    }

    console.log(`  ✅ Linked Data fetched (${contentType})`);

    return {
      format,
      data,
      contentType,
    };

  } catch (error) {
    console.error(`  ❌ Linked Data fetch error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Knowledge Graph Relationship Types
 */
export interface KnowledgeGraphNode {
  id: string;
  type: 'content' | 'person' | 'studio' | 'network' | 'genre';
  label: string;
  properties?: Record<string, any>;
}

export interface KnowledgeGraphRelationship {
  from: string; // Entity ID
  to: string;   // Entity ID
  type: string; // Relationship type (e.g., "directed_by", "acted_in", "produced_by")
  properties?: Record<string, any>;
}

/**
 * Extract relationships from Wikidata entity for knowledge graph construction
 * Useful for building graph databases (Neo4j, Neptune)
 * 
 * @param entity Wikidata entity from REST API
 * @returns Array of relationships
 */
export function extractRelationships(
  entity: WikidataRestEntity
): KnowledgeGraphRelationship[] {
  const relationships: KnowledgeGraphRelationship[] = [];

  if (!entity.statements) return relationships;

  // Common Wikidata properties for relationships
  const relationshipProperties: Record<string, string> = {
    'P57': 'directed_by',          // director
    'P58': 'written_by',           // screenwriter
    'P161': 'cast_member',         // actor
    'P449': 'broadcast_on',        // network
    'P136': 'has_genre',           // genre
    'P272': 'produced_by',         // production company
    'P170': 'created_by',          // creator
    'P162': 'produced_by_person',  // producer
  };

  for (const [propertyId, relationType] of Object.entries(relationshipProperties)) {
    const values = extractStatementValues(entity, propertyId);

    for (const value of values) {
      relationships.push({
        from: entity.id,
        to: value,
        type: relationType,
      });
    }
  }

  return relationships;
}

/**
 * Build a semantic query for finding related content
 * Constructs SPARQL query based on relationship criteria
 * 
 * @param criteria Query criteria
 * @returns SPARQL query string
 */
export function buildSemanticQuery(criteria: {
  contentType?: 'movie' | 'tv';
  country?: string;           // Wikidata country ID (e.g., "Q884" for South Korea)
  network?: string;           // Wikidata network ID (e.g., "Q907311" for Netflix)
  minRating?: number;
  genre?: string;             // Wikidata genre ID
  director?: string;          // Wikidata person ID
  language?: string;
}): string {
  const conditions: string[] = [];

  // Instance of (movie or TV series)
  if (criteria.contentType === 'movie') {
    conditions.push('?item wdt:P31 wd:Q11424;'); // instance of film
  } else if (criteria.contentType === 'tv') {
    conditions.push('?item wdt:P31 wd:Q5398426;'); // instance of TV series
  }

  // Origin country
  if (criteria.country) {
    conditions.push(`?item wdt:P495 wd:${criteria.country};`);
  }

  // Network/broadcaster
  if (criteria.network) {
    conditions.push(`?item wdt:P449 wd:${criteria.network};`);
  }

  // Genre
  if (criteria.genre) {
    conditions.push(`?item wdt:P136 wd:${criteria.genre};`);
  }

  // Director
  if (criteria.director) {
    conditions.push(`?item wdt:P57 wd:${criteria.director};`);
  }

  // Rating filter
  let ratingFilter = '';
  if (criteria.minRating) {
    conditions.push('?item wdt:P444 ?rating.');
    ratingFilter = `\n  FILTER(?rating > ${criteria.minRating})`;
  }

  const query = `
SELECT ?item ?itemLabel ?rating WHERE {
  ${conditions.join('\n  ')}${ratingFilter}
  
  SERVICE wikibase:label { 
    bd:serviceParam wikibase:language "${criteria.language || 'en'}". 
  }
}
LIMIT 100
`;

  return query.trim();
}

/**
 * Execute a semantic query and return results
 * 
 * @param criteria Query criteria
 * @returns Query results
 */
export async function executeSemanticQuery(
  criteria: Parameters<typeof buildSemanticQuery>[0]
): Promise<WikidataSparqlResult | null> {
  try {
    const query = buildSemanticQuery(criteria);
    console.log(`  🔍 Executing semantic query with ${Object.keys(criteria).length} criteria`);

    const result = await executeSparqlQuery(query);

    console.log(`  ✅ Found ${result.results.bindings.length} results`);
    return result;

  } catch (error) {
    console.error(`  ❌ Semantic query error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Convert Wikidata entity to knowledge graph node format
 * Useful for importing into graph databases
 * 
 * @param entity Wikidata entity from REST API
 * @param nodeType Type of node in knowledge graph
 * @returns Knowledge graph node
 */
export function entityToGraphNode(
  entity: WikidataRestEntity,
  nodeType: KnowledgeGraphNode['type']
): KnowledgeGraphNode {
  const label = extractLabel(entity, ['en', 'ko', 'ja']) || entity.id;
  const description = extractDescription(entity, ['en', 'ko', 'ja']);

  return {
    id: entity.id,
    type: nodeType,
    label,
    properties: {
      description,
      wikipediaTitle: extractWikipediaTitleFromEntity(entity, 'en'),
      // Add other relevant properties
    },
  };
}

/**
 * Generate Cypher query for Neo4j import
 * Converts relationships to Neo4j Cypher CREATE statements
 * 
 * @param nodes Knowledge graph nodes
 * @param relationships Knowledge graph relationships
 * @returns Cypher query string
 */
export function generateCypherQuery(
  nodes: KnowledgeGraphNode[],
  relationships: KnowledgeGraphRelationship[]
): string {
  const cypherStatements: string[] = [];

  // Create nodes
  for (const node of nodes) {
    const props = JSON.stringify({
      id: node.id,
      label: node.label,
      ...node.properties,
    });

    cypherStatements.push(
      `CREATE (n:${node.type.toUpperCase()} ${props})`
    );
  }

  // Create relationships
  for (const rel of relationships) {
    const relType = rel.type.toUpperCase();
    const props = rel.properties ? JSON.stringify(rel.properties) : '';

    cypherStatements.push(
      `MATCH (a {id: "${rel.from}"}), (b {id: "${rel.to}"})\n` +
      `CREATE (a)-[:${relType} ${props}]->(b)`
    );
  }

  return cypherStatements.join(';\n\n') + ';';
}

/**
 * Example: Find Korean dramas on Netflix with high ratings
 * Demonstrates semantic query capabilities
 */
export async function findKoreanNetflixDramas(minRating: number = 8.0): Promise<any[]> {
  const result = await executeSemanticQuery({
    contentType: 'tv',
    country: 'Q884',      // South Korea
    network: 'Q907311',   // Netflix
    minRating,
    language: 'en',
  });

  if (!result) return [];

  return result.results.bindings.map(binding => ({
    wikidataId: binding.item?.value.split('/').pop(),
    title: binding.itemLabel?.value,
    rating: binding.rating ? parseFloat(binding.rating.value) : null,
  }));
}

/**
 * Query Wikidata for a person by TMDB person ID (P4985).
 * Fetches extended metadata (socials, website, native name, height, awards, image).
 * 
 * @param tmdbPersonId TMDB Person ID
 * @param name Optional original name of the person
 * @returns Object containing WikidataPersonResult metadata or null
 */
export async function getWikidataForPerson(
  tmdbPersonId: number | string,
  name?: string
): Promise<WikidataPersonResult | null> {
  try {
    const query = `
      SELECT DISTINCT 
        ?item 
        ?itemLabel 
        ?nativeName 
        ?instagram 
        ?twitter 
        ?tiktok 
        ?height 
        ?website 
        ?image 
        ?award 
        ?awardLabel 
        ?awardYear 
        ?awardCategoryLabel 
        ?awardRank
      WHERE {
        # Match item that has TMDB person ID
        ?item wdt:P4985 "${tmdbPersonId}".
        
        # Basic properties (all optional)
        OPTIONAL { ?item wdt:P1559 ?nativeName. }
        OPTIONAL { ?item wdt:P2003 ?instagram. }
        OPTIONAL { ?item wdt:P2002 ?twitter. }
        OPTIONAL { ?item wdt:P4517 ?tiktok. }
        OPTIONAL { 
          ?item p:P2048 ?heightStmt.
          ?heightStmt ps:P2048 ?height.
          ?heightStmt pq:P1144 ?unit.
          FILTER(?unit = wd:Q174728)
        }
        OPTIONAL { ?item wdt:P856 ?website. }
        OPTIONAL { ?item wdt:P18 ?image. }

        # Awards logic (similar to content awards)
        OPTIONAL {
          ?item p:P166 ?awardStatement.
          ?awardStatement ps:P166 ?award.
          OPTIONAL { ?awardStatement pq:P585 ?awardYear. }
          OPTIONAL { ?awardStatement pq:P1686 ?awardCategory. }
          OPTIONAL { ?awardStatement pq:P1352 ?awardRank. }
        }

        SERVICE wikibase:label { 
          bd:serviceParam wikibase:language "en,ko,ja,zh,hi,th". 
          ?item rdfs:label ?itemLabel.
          ?award rdfs:label ?awardLabel.
          ?awardCategory rdfs:label ?awardCategoryLabel.
        }
      }
    `;

    console.log(`  🔍 Querying Wikidata for TMDB Person ID: ${tmdbPersonId} ${name ? '(' + name + ')' : ''}`);
    const data = await executeSparqlQuery(query);

    if (!data.results.bindings.length) {
      console.log(`  ℹ️  No Wikidata entry found for Person ID: ${tmdbPersonId}`);
      return null;
    }

    const bindings = data.results.bindings;
    const firstResult = bindings[0];

    const result: WikidataPersonResult = {
      wikidata_id: firstResult.item ? extractEntityId(firstResult.item.value) : undefined,
    };

    // Extract single-value properties
    const getStringValue = (key: string): string | undefined => {
      const binding = bindings.find(b => b[key]);
      return binding ? binding[key].value : undefined;
    };

    result.native_name = getStringValue('nativeName');
    result.instagram = getStringValue('instagram');
    result.twitter = getStringValue('twitter');
    result.tiktok = getStringValue('tiktok');
    result.website = getStringValue('website');
    result.image = getStringValue('image');

    const heightStr = getStringValue('height');
    if (heightStr) {
      result.height_cm = parseFloat(heightStr);
    }

    // Collect and deduplicate awards
    const awardsMap = new Map<string, { awardId: string; award: string; year?: number; category?: string; won: boolean }>();
    bindings.forEach(b => {
      if (b.award?.value && b.awardLabel?.value) {
        const awardId = extractEntityId(b.award.value);
        const year = b.awardYear?.value ? new Date(b.awardYear.value).getFullYear() : undefined;

        const rankUri = b.awardRank?.value || '';
        const won = rankUri.includes('PreferredRank') || rankUri.includes('NormalRank') || !rankUri.includes('DeprecatedRank');

        const category = b.awardCategoryLabel?.value;
        const mapKey = `${awardId}-${year || 'ANY'}`;

        if (!awardsMap.has(mapKey)) {
          awardsMap.set(mapKey, {
            awardId,
            award: b.awardLabel.value,
            year,
            category,
            won
          });
        }
      }
    });

    if (awardsMap.size > 0) {
      result.awards = Array.from(awardsMap.values());
    }

    return result;

  } catch (error) {
    console.error(`  ❌ Error fetching Wikidata for TMDB Person ID ${tmdbPersonId}:`, error);
    return null;
  }
}
