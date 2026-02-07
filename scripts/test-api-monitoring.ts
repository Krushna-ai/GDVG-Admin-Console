/**
 * Test script for API Usage Monitoring
 * Phase 8.2: API Usage Monitoring
 * 
 * Usage:
 *   npx tsx scripts/test-api-monitoring.ts
 */

import {
    logAPICall,
    trackAPICall,
    logWikipediaCall,
    logWikidataCall,
    logTMDBCall,
    getAPIPerformance,
    getAPIErrors,
    getSlowEndpoints,
    getAPIUsageSummary,
    printAPIUsageSummary,
    checkAPIHealth,
} from './lib/api-logger';

async function testAPIMonitoring() {
    console.log('🧪 Testing API Usage Monitoring\n');
    console.log('='.repeat(60));

    try {
        // Test 1: Simulate successful API calls
        console.log('\n📊 Test 1: Simulating API Calls');
        console.log('-'.repeat(60));

        // Wikipedia call
        await logWikipediaCall(
            '/api/rest_v1/page/summary/Squid_Game',
            async () => {
                await new Promise(resolve => setTimeout(resolve, 150)); // Simulate API delay
                return { title: 'Squid Game', extract: '...' };
            },
            { content_id: 'test-123', search_term: 'Squid Game' }
        );
        console.log('✅ Logged Wikipedia API call');

        // Wikidata call
        await logWikidataCall(
            'https://www.wikidata.org/wiki/Special:EntityData/Q108633034.json',
            async () => {
                await new Promise(resolve => setTimeout(resolve, 320)); // Simulate API delay
                return { entities: { Q108633034: {} } };
            },
            { wikidata_id: 'Q108633034' }
        );
        console.log('✅ Logged Wikidata API call');

        // TMDB call
        await logTMDBCall(
            '/3/tv/93405',
            async () => {
                await new Promise(resolve => setTimeout(resolve, 80)); // Simulate API delay
                return { id: 93405, name: 'Squid Game' };
            },
            { tmdb_id: 93405 }
        );
        console.log('✅ Logged TMDB API call');

        // Test 2: Simulate error scenario
        console.log('\n\n❌ Test 2: Simulating API Errors');
        console.log('-'.repeat(60));

        try {
            await logWikipediaCall(
                '/api/rest_v1/page/summary/NonExistentPage123456',
                async () => {
                    throw { statusCode: 404, message: 'Page not found' };
                }
            );
        } catch (err) {
            console.log('✅ Logged Wikipedia 404 error');
        }

        // Test 3: Simulate rate limiting
        console.log('\n\n⏱️  Test 3: Simulating Rate Limit');
        console.log('-'.repeat(60));

        try {
            await logWikidataCall(
                'https://query.wikidata.org/sparql',
                async () => {
                    throw { statusCode: 429, message: 'Too many requests' };
                }
            );
        } catch (err) {
            console.log('✅ Logged Wikidata rate limit (429)');
        }

        // Test 4: Simulate slow endpoint
        console.log('\n\n🐌 Test 4: Simulating Slow Endpoint');
        console.log('-'.repeat(60));

        await logWikipediaCall(
            '/w/api.php?action=parse&page=Very_Long_Page',
            async () => {
                await new Promise(resolve => setTimeout(resolve, 2500)); // Slow
                return { parse: {} };
            }
        );
        console.log('✅ Logged slow Wikipedia API call (2.5s)');

        // Wait a moment for logs to be committed
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test 5: Fetch API performance metrics
        console.log('\n\n📈 Test 5: API Performance Metrics');
        console.log('-'.repeat(60));

        const performance = await getAPIPerformance();
        console.log(`\n✅ Fetched performance data for ${performance.length} APIs`);

        if (performance.length > 0) {
            console.log('\nPerformance Summary:');
            performance.forEach(api => {
                console.log(`\n  ${api.api_name.toUpperCase()}`);
                console.log(`    Total Requests:   ${api.total_requests}`);
                console.log(`    Success Rate:     ${api.success_rate}%`);
                console.log(`    Avg Response:     ${api.avg_response_time_ms}ms`);
                console.log(`    P95 Response:     ${api.p95_response_time_ms}ms`);
                console.log(`    Rate Limit Hits:  ${api.rate_limit_hits}`);
            });
        }

        // Test 6: Fetch API errors
        console.log('\n\n🔍 Test 6: API Errors');
        console.log('-'.repeat(60));

        const errors = await getAPIErrors(5);
        console.log(`\n✅ Fetched ${errors.length} recent errors`);

        if (errors.length > 0) {
            console.log('\nRecent Errors:');
            errors.forEach(err => {
                console.log(`  ${err.api_name}: ${err.endpoint} (${err.status_code}) - ${err.error_count} times`);
            });
        }

        // Test 7: Fetch slow endpoints
        console.log('\n\n⏱️  Test 7: Slow Endpoints');
        console.log('-'.repeat(60));

        const slowEndpoints = await getSlowEndpoints();
        console.log(`\n✅ Found ${slowEndpoints.length} slow endpoints`);

        if (slowEndpoints.length > 0) {
            console.log('\nSlow Endpoints (P95 > 2s):');
            slowEndpoints.forEach(slow => {
                console.log(`  ${slow.api_name}: ${slow.endpoint}`);
                console.log(`    P95: ${slow.p95_response_time_ms}ms, Avg: ${slow.avg_response_time_ms}ms`);
            });
        }

        // Test 8: Get comprehensive usage summary
        console.log('\n\n📊 Test 8: Usage Summary (Last 24 hours)');
        console.log('-'.repeat(60));

        const summary = await getAPIUsageSummary(24);
        console.log('\n✅ Fetched comprehensive usage summary:');
        console.log(JSON.stringify(summary, null, 2).substring(0, 500) + '...');

        // Test 9: Health check
        console.log('\n\n💚 Test 9: API Health Check');
        console.log('-'.repeat(60));

        const health = await checkAPIHealth();
        if (health.healthy) {
            console.log('\n✅ All APIs are healthy');
        } else {
            console.log('\n⚠️  Issues detected:');
            health.issues.forEach(issue => console.log(`  - ${issue}`));
        }

        // Test 10: Print formatted summary
        console.log('\n\n📋 Test 10: Formatted Summary');
        console.log('-'.repeat(60));

        await printAPIUsageSummary(24);

        console.log('\n' + '='.repeat(60));
        console.log('✅ API Usage Monitoring Tests Complete\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    }
}

// Run tests
testAPIMonitoring();
