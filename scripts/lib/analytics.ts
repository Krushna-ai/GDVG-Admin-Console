/**
 * Data Quality Dashboard Analytics Library
 * Phase 8.1: Monitoring & Analytics
 * 
 * Provides TypeScript utilities for querying dashboard views
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================
// TYPES
// ============================================

export interface SourceDistribution {
    overview_source: string;
    count: number;
    percentage: number;
}

export interface EnrichmentCoverage {
    has_wikipedia: number;
    wikipedia_percentage: number;
    has_overview: number;
    overview_percentage: number;
    has_tagline: number;
    tagline_percentage: number;
    has_wikidata: number;
    wikidata_percentage: number;
    has_batch_tracking: number;
    batch_tracking_percentage: number;
    total_content: number;
}

export interface QualityScore {
    quality_tier: string;
    quality_score: number;
    count: number;
    percentage: number;
}

export interface RegionalDistribution {
    region: string;
    total_content: number;
    has_wikipedia: number;
    wikipedia_pct: number;
    wikipedia_overviews: number;
    wikipedia_overview_pct: number;
    last_import: string | null;
}

export interface BatchImport {
    import_batch_name: string;
    import_batch_id: string;
    batch_start: string;
    batch_end: string;
    items_imported: number;
    wikipedia_enriched: number;
    wikipedia_enriched_pct: number;
}

export interface QualityTimeline {
    import_date: string;
    items_imported: number;
    wikipedia_count: number;
    tmdb_count: number;
    no_source_count: number;
    avg_quality_score: number;
}

export interface DashboardSummary {
    total_content: number;
    enrichment_coverage: {
        wikipedia_url: number;
        overview: number;
        wikidata_id: number;
    };
    source_distribution: Array<{
        source: string;
        count: number;
        percentage: number;
    }>;
    quality_distribution: Array<{
        tier: string;
        score: number;
        count: number;
        percentage: number;
    }>;
    recent_batches: Array<{
        name: string;
        date: string;
        items: number;
        wikipedia_enriched_pct: number;
    }>;
}

// ============================================
// ANALYTICS FUNCTIONS
// ============================================

/**
 * Get source distribution (Wikipedia, TMDB, etc.)
 */
export async function getSourceDistribution(): Promise<SourceDistribution[]> {
    const { data, error } = await supabase
        .from('analytics_source_distribution')
        .select('*')
        .order('count', { ascending: false });

    if (error) {
        console.error('Error fetching source distribution:', error);
        throw error;
    }

    return data || [];
}

/**
 * Get enrichment coverage metrics
 */
export async function getEnrichmentCoverage(): Promise<EnrichmentCoverage | null> {
    const { data, error } = await supabase
        .from('analytics_enrichment_coverage')
        .select('*')
        .single();

    if (error) {
        console.error('Error fetching enrichment coverage:', error);
        throw error;
    }

    return data;
}

/**
 * Get quality score distribution
 */
export async function getQualityScores(): Promise<QualityScore[]> {
    const { data, error } = await supabase
        .from('analytics_quality_scores')
        .select('*')
        .order('quality_score', { ascending: false });

    if (error) {
        console.error('Error fetching quality scores:', error);
        throw error;
    }

    return data || [];
}

/**
 * Get regional distribution with enrichment stats
 */
export async function getRegionalDistribution(): Promise<RegionalDistribution[]> {
    const { data, error } = await supabase
        .from('analytics_regional_distribution')
        .select('*')
        .order('total_content', { ascending: false });

    if (error) {
        console.error('Error fetching regional distribution:', error);
        throw error;
    }

    return data || [];
}

/**
 * Get batch import analytics
 */
export async function getBatchImports(limit: number = 10): Promise<BatchImport[]> {
    const { data, error } = await supabase
        .from('analytics_batch_imports')
        .select('*')
        .order('batch_start', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching batch imports:', error);
        throw error;
    }

    return data || [];
}

/**
 * Get quality timeline (last N days)
 */
export async function getQualityTimeline(days: number = 30): Promise<QualityTimeline[]> {
    const { data, error } = await supabase
        .from('analytics_quality_timeline')
        .select('*')
        .gte('import_date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('import_date', { ascending: false });

    if (error) {
        console.error('Error fetching quality timeline:', error);
        throw error;
    }

    return data || [];
}

/**
 * Get comprehensive dashboard summary
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
    const { data, error } = await supabase
        .rpc('get_dashboard_summary');

    if (error) {
        console.error('Error fetching dashboard summary:', error);
        throw error;
    }

    return data;
}

/**
 * Get quality trend for last N days
 */
export async function getQualityTrend(days: number = 30): Promise<{
    date: string;
    items_imported: number;
    avg_quality_score: number;
    wikipedia_percentage: number;
}[]> {
    const { data, error } = await supabase
        .rpc('get_quality_trend', { days });

    if (error) {
        console.error('Error fetching quality trend:', error);
        throw error;
    }

    return data || [];
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format percentage for display
 */
export function formatPercentage(value: number, decimals: number = 1): string {
    return `${value.toFixed(decimals)}%`;
}

/**
 * Get quality tier color for UI
 */
export function getQualityColor(score: number): string {
    if (score >= 100) return 'green';
    if (score >= 75) return 'blue';
    if (score >= 50) return 'yellow';
    return 'red';
}

/**
 * Calculate overall quality score
 */
export async function calculateOverallQuality(): Promise<number> {
    const scores = await getQualityScores();

    if (!scores || scores.length === 0) return 0;

    const totalItems = scores.reduce((sum, s) => sum + s.count, 0);
    const weightedSum = scores.reduce((sum, s) => sum + (s.quality_score * s.count), 0);

    return Math.round(weightedSum / totalItems);
}

/**
 * Print dashboard summary to console
 */
export async function printDashboardSummary(): Promise<void> {
    console.log('\n📊 Data Quality Dashboard Summary');
    console.log('='.repeat(60));

    try {
        // Overall quality
        const overallQuality = await calculateOverallQuality();
        console.log(`\n🎯 Overall Quality Score: ${overallQuality}/100`);

        // Enrichment coverage
        const coverage = await getEnrichmentCoverage();
        if (coverage) {
            console.log('\n📈 Enrichment Coverage:');
            console.log(`  Wikipedia URLs:    ${formatPercentage(coverage.wikipedia_percentage)}`);
            console.log(`  Overviews:         ${formatPercentage(coverage.overview_percentage)}`);
            console.log(`  Wikidata IDs:      ${formatPercentage(coverage.wikidata_percentage)}`);
            console.log(`  Total Content:     ${coverage.total_content.toLocaleString()}`);
        }

        // Source distribution
        const sources = await getSourceDistribution();
        if (sources.length > 0) {
            console.log('\n📚 Source Distribution:');
            sources.forEach(source => {
                console.log(`  ${source.overview_source.padEnd(15)} ${source.count.toString().padStart(6)} (${formatPercentage(source.percentage)})`);
            });
        }

        // Quality scores
        const qualities = await getQualityScores();
        if (qualities.length > 0) {
            console.log('\n⭐ Quality Distribution:');
            qualities.forEach(q => {
                console.log(`  ${q.quality_tier.padEnd(25)} ${q.count.toString().padStart(6)} (${formatPercentage(q.percentage)})`);
            });
        }

        // Regional distribution
        const regions = await getRegionalDistribution();
        if (regions.length > 0) {
            console.log('\n🌍 Regional Distribution:');
            regions.slice(0, 5).forEach(region => {
                console.log(`  ${region.region.padEnd(15)} ${region.total_content.toString().padStart(6)} items, ${formatPercentage(region.wikipedia_pct)} Wikipedia`);
            });
        }

        // Recent batches
        const batches = await getBatchImports(5);
        if (batches.length > 0) {
            console.log('\n📦 Recent Batch Imports:');
            batches.forEach(batch => {
                const date = new Date(batch.batch_start).toLocaleDateString();
                console.log(`  ${batch.import_batch_name || 'Unnamed'} (${date}): ${batch.items_imported} items, ${formatPercentage(batch.wikipedia_enriched_pct)} enriched`);
            });
        }

        console.log('\n' + '='.repeat(60));

    } catch (error) {
        console.error('Error printing dashboard summary:', error);
    }
}

// ============================================
// ALERTS & MONITORING
// ============================================

/**
 * Check if enrichment coverage is below target
 */
export async function checkCoverageAlert(targetPercentage: number = 80): Promise<{
    alert: boolean;
    issues: string[];
}> {
    const coverage = await getEnrichmentCoverage();
    const issues: string[] = [];

    if (!coverage) {
        return { alert: true, issues: ['Unable to fetch coverage data'] };
    }

    if (coverage.wikipedia_percentage < targetPercentage) {
        issues.push(`Wikipedia coverage (${formatPercentage(coverage.wikipedia_percentage)}) below target (${targetPercentage}%)`);
    }

    if (coverage.overview_percentage < targetPercentage) {
        issues.push(`Overview coverage (${formatPercentage(coverage.overview_percentage)}) below target (${targetPercentage}%)`);
    }

    return {
        alert: issues.length > 0,
        issues,
    };
}

/**
 * Check if quality score is declining
 */
export async function checkQualityTrend(days: number = 7): Promise<{
    alert: boolean;
    message: string;
    currentScore: number;
    previousScore: number;
}> {
    const trend = await getQualityTrend(days * 2); // Get 2x days for comparison

    if (trend.length < 2) {
        return {
            alert: false,
            message: 'Not enough data for trend analysis',
            currentScore: 0,
            previousScore: 0,
        };
    }

    // Calculate average for recent days vs previous days
    const recentData = trend.slice(0, days);
    const previousData = trend.slice(days, days * 2);

    const currentScore = recentData.reduce((sum, d) => sum + d.avg_quality_score, 0) / recentData.length;
    const previousScore = previousData.reduce((sum, d) => sum + d.avg_quality_score, 0) / previousData.length;

    const decline = previousScore - currentScore;
    const alert = decline > 5; // Alert if quality dropped by more than 5 points

    return {
        alert,
        message: alert
            ? `Quality score declined by ${decline.toFixed(1)} points in the last ${days} days`
            : 'Quality trend is stable',
        currentScore,
        previousScore,
    };
}
