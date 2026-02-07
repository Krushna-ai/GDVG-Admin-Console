/**
 * Comprehensive Verification Script for Phase 8.1 & 8.2
 * Verifies all database objects and TypeScript libraries are working
 * 
 * Usage:
 *   npx tsx scripts/verify-phase8-implementation.ts
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyPhase8Implementation() {
    console.log('\n🔍 Verifying Phase 8.1 & 8.2 Implementation');
    console.log('='.repeat(70));

    let allPassed = true;

    // ============================================
    // PHASE 8.1: Data Quality Dashboards
    // ============================================

    console.log('\n📊 PHASE 8.1: Data Quality Dashboards');
    console.log('-'.repeat(70));

    // Test 1: Check if region column exists
    console.log('\n1. Checking region column...');
    try {
        const { data, error } = await supabase
            .from('content')
            .select('region')
            .limit(1);

        if (error) throw error;
        console.log('   ✅ Region column exists');
    } catch (err: any) {
        console.log('   ❌ Region column missing:', err.message);
        allPassed = false;
    }

    // Test 2: Check analytics views exist
    const views81 = [
        'analytics_source_distribution',
        'analytics_enrichment_coverage',
        'analytics_quality_scores',
        'analytics_regional_distribution',
        'analytics_batch_imports',
        'analytics_quality_timeline',
    ];

    console.log('\n2. Checking analytics views...');
    for (const view of views81) {
        try {
            const { data, error } = await supabase
                .from(view)
                .select('*')
                .limit(1);

            if (error) throw error;
            console.log(`   ✅ ${view}`);
        } catch (err: any) {
            console.log(`   ❌ ${view}: ${err.message}`);
            allPassed = false;
        }
    }

    // Test 3: Check SQL functions
    console.log('\n3. Checking SQL functions...');

    try {
        const { data, error } = await supabase.rpc('get_dashboard_summary');
        if (error) throw error;
        console.log('   ✅ get_dashboard_summary()');
    } catch (err: any) {
        console.log('   ❌ get_dashboard_summary():', err.message);
        allPassed = false;
    }

    try {
        const { data, error } = await supabase.rpc('get_quality_trend', { days: 7 });
        if (error) throw error;
        console.log('   ✅ get_quality_trend()');
    } catch (err: any) {
        console.log('   ❌ get_quality_trend():', err.message);
        allPassed = false;
    }

    // Test 4: Check TypeScript library
    console.log('\n4. Checking TypeScript analytics library...');
    try {
        const { getEnrichmentCoverage } = await import('./lib/analytics');
        const coverage = await getEnrichmentCoverage();
        console.log('   ✅ TypeScript analytics library works');
        console.log(`   📊 Total content: ${coverage?.total_content || 0}`);
    } catch (err: any) {
        console.log('   ❌ TypeScript analytics library:', err.message);
        allPassed = false;
    }

    // ============================================
    // PHASE 8.2: API Usage Monitoring
    // ============================================

    console.log('\n\n🔌 PHASE 8.2: API Usage Monitoring');
    console.log('-'.repeat(70));

    // Test 5: Check api_usage_log table exists
    console.log('\n5. Checking api_usage_log table...');
    try {
        const { data, error } = await supabase
            .from('api_usage_log')
            .select('*')
            .limit(1);

        if (error) throw error;
        console.log('   ✅ api_usage_log table exists');
    } catch (err: any) {
        console.log('   ❌ api_usage_log table missing:', err.message);
        allPassed = false;
    }

    // Test 6: Check API monitoring views
    const views82 = [
        'analytics_api_performance',
        'analytics_api_errors',
        'analytics_api_hourly_usage',
        'analytics_slow_endpoints',
    ];

    console.log('\n6. Checking API monitoring views...');
    for (const view of views82) {
        try {
            const { data, error } = await supabase
                .from(view)
                .select('*')
                .limit(1);

            if (error) throw error;
            console.log(`   ✅ ${view}`);
        } catch (err: any) {
            console.log(`   ❌ ${view}: ${err.message}`);
            allPassed = false;
        }
    }

    // Test 7: Check API monitoring functions
    console.log('\n7. Checking API monitoring functions...');

    try {
        const { data, error } = await supabase.rpc('get_api_usage_summary', { hours_back: 24 });
        if (error) throw error;
        console.log('   ✅ get_api_usage_summary()');
    } catch (err: any) {
        console.log('   ❌ get_api_usage_summary():', err.message);
        allPassed = false;
    }

    // Test 8: Check TypeScript API logger
    console.log('\n8. Checking TypeScript API logger library...');
    try {
        const { logAPICall } = await import('./lib/api-logger');
        console.log('   ✅ TypeScript API logger library loaded');

        // Test logging a sample API call
        await logAPICall(
            { apiName: 'wikipedia', endpoint: '/test/verification' },
            { statusCode: 200, responseTimeMs: 100 }
        );
        console.log('   ✅ Successfully logged test API call');
    } catch (err: any) {
        console.log('   ❌ TypeScript API logger library:', err.message);
        allPassed = false;
    }

    // ============================================
    // Summary
    // ============================================

    console.log('\n' + '='.repeat(70));
    if (allPassed) {
        console.log('✅ ALL VERIFICATIONS PASSED!');
        console.log('\n🎉 Phase 8.1 & 8.2 are fully implemented and working!\n');
        console.log('Next steps:');
        console.log('  1. Run full test suite: npx tsx scripts/test-analytics.ts');
        console.log('  2. Run API monitoring test: npx tsx scripts/test-api-monitoring.ts');
        console.log('  3. Integrate into your enrichment scripts\n');
    } else {
        console.log('❌ SOME VERIFICATIONS FAILED');
        console.log('\nPlease review the errors above.\n');
        process.exit(1);
    }
}

// Run verification
verifyPhase8Implementation().catch(err => {
    console.error('\n💥 Verification script error:', err);
    process.exit(1);
});
