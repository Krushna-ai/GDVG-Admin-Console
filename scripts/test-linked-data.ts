/**
 * Test script for Linked Data and Semantic Web features
 * Tests content negotiation, knowledge graph extraction, and semantic queries
 * 
 * Usage:
 *   npx tsx scripts/test-linked-data.ts
 */

import {
    getEntityAsLinkedData,
    extractRelationships,
    buildSemanticQuery,
    executeSemanticQuery,
    entityToGraphNode,
    generateCypherQuery,
    findKoreanNetflixDramas,
    getEntityByIdRest,
} from './lib/wikidata';

async function testLinkedData() {
    console.log('🧪 Testing Linked Data & Semantic Web Features\n');
    console.log('='.repeat(60));

    // Test 1: Content Negotiation
    console.log('\n🔗 Test 1: Linked Data Content Negotiation');
    console.log('-'.repeat(60));

    const testEntity = 'Q21664088'; // Squid Game

    // Try different RDF formats
    const formats: Array<any> = [
        'application/ld+json',
        'application/json',
        'text/turtle',
    ];

    for (const format of formats) {
        console.log(`\nFetching ${testEntity} as: ${format}`);
        const linkedData = await getEntityAsLinkedData(testEntity, format);
        if (linkedData) {
            console.log(`  Content-Type: ${linkedData.contentType}`);
            if (format.includes('json')) {
                const dataStr = JSON.stringify(linkedData.data).substring(0, 100);
                console.log(`  Data preview: ${dataStr}...`);
            } else {
                const dataStr = String(linkedData.data).substring(0, 100);
                console.log(`  Data preview: ${dataStr}...`);
            }
        }
    }

    // Test 2: Knowledge Graph Extraction
    console.log('\n\n📊 Test 2: Knowledge Graph Relationship Extraction');
    console.log('-'.repeat(60));

    const entity = await getEntityByIdRest(testEntity, ['en', 'ko']);
    if (entity) {
        const relationships = extractRelationships(entity);
        console.log(`\nFound ${relationships.length} relationships for ${testEntity}`);

        // Group by relationship type
        const byType: Record<string, number> = {};
        relationships.forEach(rel => {
            byType[rel.type] = (byType[rel.type] || 0) + 1;
        });

        console.log('\nRelationship types:');
        Object.entries(byType).forEach(([type, count]) => {
            console.log(`  - ${type}: ${count}`);
        });

        // Show first 5 relationships
        console.log('\nFirst 5 relationships:');
        relationships.slice(0, 5).forEach(rel => {
            console.log(`  ${rel.from} --[${rel.type}]--> ${rel.to}`);
        });

        // Convert to graph node
        const node = entityToGraphNode(entity, 'content');
        console.log('\nKnowledge Graph Node:');
        console.log(`  ID: ${node.id}`);
        console.log(`  Type: ${node.type}`);
        console.log(`  Label: ${node.label}`);
        console.log(`  Properties: ${JSON.stringify(node.properties, null, 2)}`);
    }

    // Test 3: Semantic Query Building
    console.log('\n\n🔍 Test 3: Semantic Query Construction');
    console.log('-'.repeat(60));

    const query1 = buildSemanticQuery({
        contentType: 'tv',
        country: 'Q884',      // South Korea
        network: 'Q907311',   // Netflix
        minRating: 8.0,
    });

    console.log('\nQuery: Korean Netflix dramas with rating > 8.0');
    console.log(query1);

    // Test 4: Execute Semantic Query
    console.log('\n\n⚡ Test 4: Execute Semantic Query');
    console.log('-'.repeat(60));

    console.log('\nSearching for Korean Netflix dramas with rating >= 8.0...');
    const dramas = await findKoreanNetflixDramas(8.0);

    console.log(`\nFound ${dramas.length} dramas:`);
    dramas.slice(0, 10).forEach(drama => {
        console.log(`  - ${drama.title} (${drama.wikidataId}) - Rating: ${drama.rating || 'N/A'}`);
    });

    // Test 5: Cypher Query Generation
    console.log('\n\n🗄️  Test 5: Neo4j Cypher Query Generation');
    console.log('-'.repeat(60));

    if (entity) {
        const node = entityToGraphNode(entity, 'content');
        const relationships = extractRelationships(entity).slice(0, 3); // First 3 relationships

        // Create dummy nodes for relationships (in real scenario, fetch these too)
        const relatedNodes = relationships.map(rel => ({
            id: rel.to,
            type: 'person' as const,
            label: rel.to,
            properties: {},
        }));

        const cypherQuery = generateCypherQuery(
            [node, ...relatedNodes],
            relationships
        );

        console.log('\nGenerated Cypher query for Neo4j:');
        console.log(cypherQuery.substring(0, 500) + '...');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Linked Data & Semantic Web Tests Complete\n');
}

// Run tests
testLinkedData().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
