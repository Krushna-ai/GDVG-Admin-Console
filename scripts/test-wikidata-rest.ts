/**
 * Test script for Wikidata REST API functions
 * Compares performance of SPARQL vs REST API approaches
 * 
 * Usage:
 *   npx tsx scripts/test-wikidata-rest.ts
 */

import {
    getEntityByIdRest,
    getEntityMetadataRest,
    extractWikipediaTitleFromEntity,
    extractLabel,
    extractDescription,
    extractStatementValues,
    comparePerformance,
} from './lib/wikidata';

async function testWikidataRestAPI() {
    console.log('🧪 Testing Wikidata REST API Integration\n');
    console.log('='.repeat(60));

    // Test entities
    const testEntities = [
        { id: 'Q21664088', name: 'Squid Game' },
        { id: 'Q55439289', name: 'Parasite (film)' },
        { id: 'Q106871', name: 'My Neighbor Totoro' },
    ];

    // Test 1: Basic Entity Fetching
    console.log('\n📦 Test 1: Entity Fetching via REST API');
    console.log('-'.repeat(60));

    for (const { id, name } of testEntities) {
        console.log(`\nTesting: ${name} (${id})`);
        const entity = await getEntityByIdRest(id, ['en', 'ko', 'ja']);

        if (entity) {
            // Extract basic info
            const label = extractLabel(entity, ['en', 'ko']);
            const description = extractDescription(entity, ['en']);
            const wikipediaTitle = extractWikipediaTitleFromEntity(entity, 'en');

            console.log(`Label: ${label}`);
            console.log(`Description: ${description || 'N/A'}`);
            console.log(`Wikipedia: ${wikipediaTitle || 'N/A'}`);

            // Extract statements
            const instanceOf = extractStatementValues(entity, 'P31'); // instance of
            const genres = extractStatementValues(entity, 'P136'); // genre

            if (instanceOf.length > 0) {
                console.log(`Instance of: ${instanceOf.join(', ')}`);
            }
            if (genres.length > 0) {
                console.log(`Genres: ${genres.slice(0, 5).join(', ')}`);
            }
        }
    }

    // Test 2: Entity Metadata (Simplified)
    console.log('\n\n📊 Test 2: Entity Metadata Extraction');
    console.log('-'.repeat(60));

    for (const { id, name } of testEntities.slice(0, 2)) {
        console.log(`\nTesting: ${name} (${id})`);
        const metadata = await getEntityMetadataRest(id);

        if (metadata) {
            console.log(`Wikidata ID: ${metadata.wikidata_id}`);
            console.log(`Wikipedia Title: ${metadata.wikipedia_title || 'N/A'}`);
            console.log(`Wikipedia URL: ${metadata.wikipedia_url || 'N/A'}`);
            if (metadata.genres && metadata.genres.length > 0) {
                console.log(`Genres: ${metadata.genres.slice(0, 5).join(', ')}`);
            }
        }
    }

    // Test 3: Performance Comparison (SPARQL vs REST)
    console.log('\n\n⚡ Test 3: Performance Comparison');
    console.log('='.repeat(60));

    for (const { id, name } of testEntities.slice(0, 1)) { // Just one to save time
        console.log(`\nComparing: ${name} (${id})`);
        await comparePerformance(id);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Wikidata REST API Tests Complete\n');
}

// Run tests
testWikidataRestAPI().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
