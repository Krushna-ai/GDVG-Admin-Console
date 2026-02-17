/**
 * Test script for Data Quality Dashboard Analytics
 * Phase 8.1: Monitoring & Analytics
 * 
 * Usage:
 *   npx tsx scripts/test-analytics.ts
 */

import {
    getSourceDistribution,
    getEnrichmentCoverage,
    getQualityScores,
    getRegionalDistribution,
    getBatchImports,
    getQualityTimeline,
    getDashboardSummary,
    getQualityTrend,
    printDashboardSummary,
    calculateOverallQuality,
    checkCoverageAlert,
    checkQualityTrend,
    formatPercentage,
} from './lib/analytics';

async function testAnalytics() {
    console.log('🧪 Testing Data Quality Dashboard Analytics\n');
    console.log('='.repeat(60));

    try {
        // Test 1: Print comprehensive summary
        console.log('\n📊 Test 1: Dashboard Summary');
        console.log('-'.repeat(60));
        await printDashboardSummary();

        // Test 2: Get individual metrics
        console.log('\n\n📈 Test 2: Individual Analytics Views');
        console.log('-'.repeat(60));

        const coverage = await getEnrichmentCoverage();
        if (coverage) {
            console.log('\n✅ Enrichment Coverage fetched:');
            console.log(`   Total Content: ${coverage.total_content.toLocaleString()}`);
            console.log(`   Wikipedia: ${formatPercentage(coverage.wikipedia_percentage)}`);
            console.log(`   Wikidata: ${formatPercentage(coverage.wikidata_percentage)}`);
        }

        const sources = await getSourceDistribution();
        console.log(`\n✅ Source Distribution fetched: ${sources.length} sources`);

        const qualities = await getQualityScores();
        console.log(`✅ Quality Scores fetched: ${qualities.length} tiers`);

        const regions = await getRegionalDistribution();
        console.log(`✅ Regional Distribution fetched: ${regions.length} regions`);

        const batches = await getBatchImports(5);
        console.log(`✅ Batch Imports fetched: ${batches.length} recent batches`);

        // Test 3: Dashboard Summary Function
        console.log('\n\n📦 Test 3: Dashboard Summary Function');
        console.log('-'.repeat(60));

        const summary = await getDashboardSummary();
        console.log('\n✅ Dashboard Summary (JSON):');
        console.log(JSON.stringify(summary, null, 2).substring(0, 500) + '...');

        // Test 4: Quality Trends
        console.log('\n\n📉 Test 4: Quality Trends (Last 30 Days)');
        console.log('-'.repeat(60));

        const trend = await getQualityTrend(30);
        console.log(`\n✅ Quality Trend fetched: ${trend.length} days of data`);

        if (trend.length > 0) {
            console.log('\nRecent trends:');
            trend.slice(0, 5).forEach(day => {
                console.log(`  ${day.date}: ${day.items_imported} items, avg score: ${day.avg_quality_score.toFixed(1)}, Wikipedia: ${formatPercentage(day.wikipedia_percentage || 0)}`);
            });
        }

        // Test 5: Overall Quality Calculation
        console.log('\n\n⭐ Test 5: Overall Quality Score');
        console.log('-'.repeat(60));

        const overallQuality = await calculateOverallQuality();
        console.log(`\n✅ Overall Quality Score: ${overallQuality}/100`);

        // Test 6: Alerts & Monitoring
        console.log('\n\n🚨 Test 6: Alerts & Monitoring');
        console.log('-'.repeat(60));

        // Coverage alert
        const coverageAlert = await checkCoverageAlert(80);
        if (coverageAlert.alert) {
            console.log('\n⚠️  Coverage Alert:');
            coverageAlert.issues.forEach(issue => console.log(`   - ${issue}`));
        } else {
            console.log('\n✅ Coverage is above target');
        }

        // Quality trend alert
        const qualityAlert = await checkQualityTrend(7);
        if (qualityAlert.alert) {
            console.log('\n⚠️  Quality Trend Alert:');
            console.log(`   ${qualityAlert.message}`);
            console.log(`   Current: ${qualityAlert.currentScore.toFixed(1)}`);
            console.log(`   Previous: ${qualityAlert.previousScore.toFixed(1)}`);
        } else {
            console.log(`\n✅ ${qualityAlert.message}`);
        }

        // Test 7: Timeline Data
        console.log('\n\n📅 Test 7: Quality Timeline');
        console.log('-'.repeat(60));

        const timeline = await getQualityTimeline(14);
        console.log(`\n✅ Quality Timeline fetched: ${timeline.length} days`);

        if (timeline.length > 0) {
            console.log('\nLast 5 days:');
            timeline.slice(0, 5).forEach(day => {
                console.log(`  ${day.import_date}: ${day.items_imported} items`);
                console.log(`    Wikipedia: ${day.wikipedia_count}, TMDB: ${day.tmdb_count}, None: ${day.no_source_count}`);
                console.log(`    Avg Quality: ${day.avg_quality_score.toFixed(1)}`);
            });
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ Data Quality Dashboard Analytics Tests Complete\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    }
}

// Run tests
testAnalytics();
