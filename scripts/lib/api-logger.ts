/**
 * API Usage Logger
 * Phase 8.2: API Usage Monitoring
 * 
 * Logs all external API calls (Wikipedia, Wikidata, TMDB) for:
 * - Performance monitoring
 * - Error tracking
 * - Rate limit monitoring
 * - Usage analytics
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

export type APIName = 'wikipedia' | 'wikidata' | 'tmdb';

export interface APICallOptions {
    apiName: APIName;
    endpoint: string;
    method?: string;
    metadata?: Record<string, any>;
}

export interface APICallResult {
    statusCode?: number;
    responseTimeMs: number;
    error?: string;
    rateLimited?: boolean;
    retryCount?: number;
}

export interface APIPerformance {
    api_name: string;
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    success_rate: number;
    avg_response_time_ms: number;
    median_response_time_ms: number;
    p95_response_time_ms: number;
    min_response_time_ms: number;
    max_response_time_ms: number;
    rate_limit_hits: number;
    retry_attempts: number;
    first_request: string;
    last_request: string;
}

export interface APIError {
    api_name: string;
    endpoint: string;
    status_code: number;
    error_count: number;
    error_messages: string[];
    last_occurrence: string;
}

export interface SlowEndpoint {
    api_name: string;
    endpoint: string;
    request_count: number;
    avg_response_time_ms: number;
    p95_response_time_ms: number;
    max_response_time_ms: number;
}

// ============================================
// LOGGING FUNCTIONS
// ============================================

/**
 * Log an API call to the database
 */
export async function logAPICall(
    options: APICallOptions,
    result: APICallResult
): Promise<void> {
    try {
        const { error } = await supabase
            .from('api_usage_log')
            .insert({
                api_name: options.apiName,
                endpoint: options.endpoint,
                method: options.method || 'GET',
                status_code: result.statusCode,
                response_time_ms: result.responseTimeMs,
                error_message: result.error,
                retry_count: result.retryCount || 0,
                rate_limited: result.rateLimited || false,
                request_metadata: options.metadata || null,
            });

        if (error) {
            console.error('Failed to log API call:', error);
        }
    } catch (err) {
        // Don't throw - logging failures shouldn't break the app
        console.error('Error logging API call:', err);
    }
}

/**
 * Wrapper to track an API call with automatic timing and error handling
 */
export async function trackAPICall<T>(
    options: APICallOptions,
    apiFunction: () => Promise<T>
): Promise<T> {
    const startTime = Date.now();
    let result: T;
    let statusCode: number | undefined;
    let error: string | undefined;
    let rateLimited = false;

    try {
        result = await apiFunction();
        statusCode = 200; // Success
        return result;
    } catch (err: any) {
        // Capture error details
        error = err.message || String(err);
        statusCode = err.statusCode || err.status || 500;
        rateLimited = statusCode === 429;
        throw err; // Re-throw the error
    } finally {
        const responseTimeMs = Date.now() - startTime;

        // Log asynchronously (don't await)
        logAPICall(options, {
            statusCode,
            responseTimeMs,
            error,
            rateLimited,
        }).catch(() => {
            // Silently fail if logging fails
        });
    }
}

// ============================================
// ANALYTICS FUNCTIONS
// ============================================

/**
 * Get API performance metrics
 */
export async function getAPIPerformance(): Promise<APIPerformance[]> {
    const { data, error } = await supabase
        .from('analytics_api_performance')
        .select('*')
        .order('total_requests', { ascending: false });

    if (error) {
        console.error('Error fetching API performance:', error);
        throw error;
    }

    return data || [];
}

/**
 * Get API errors
 */
export async function getAPIErrors(limit: number = 20): Promise<APIError[]> {
    const { data, error } = await supabase
        .from('analytics_api_errors')
        .select('*')
        .order('error_count', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching API errors:', error);
        throw error;
    }

    return data || [];
}

/**
 * Get slow endpoints
 */
export async function getSlowEndpoints(): Promise<SlowEndpoint[]> {
    const { data, error } = await supabase
        .from('analytics_slow_endpoints')
        .select('*')
        .order('p95_response_time_ms', { ascending: false });

    if (error) {
        console.error('Error fetching slow endpoints:', error);
        throw error;
    }

    return data || [];
}

/**
 * Get comprehensive API usage summary
 */
export async function getAPIUsageSummary(hoursBack: number = 24): Promise<any> {
    const { data, error } = await supabase
        .rpc('get_api_usage_summary', { hours_back: hoursBack });

    if (error) {
        console.error('Error fetching API usage summary:', error);
        throw error;
    }

    return data;
}

/**
 * Clean up old API logs
 */
export async function cleanupAPILogs(daysToKeep: number = 30): Promise<number> {
    const { data, error } = await supabase
        .rpc('cleanup_api_logs', { days_to_keep: daysToKeep });

    if (error) {
        console.error('Error cleaning up API logs:', error);
        throw error;
    }

    return data || 0;
}

// ============================================
// MONITORING HELPERS
// ============================================

/**
 * Check if any API has high error rate (>10%)
 */
export async function checkAPIHealth(): Promise<{
    healthy: boolean;
    issues: string[];
}> {
    const performance = await getAPIPerformance();
    const issues: string[] = [];

    for (const api of performance) {
        if (api.success_rate < 90) {
            issues.push(
                `${api.api_name} has low success rate: ${api.success_rate}%`
            );
        }

        if (api.rate_limit_hits > 10) {
            issues.push(
                `${api.api_name} hit rate limits ${api.rate_limit_hits} times`
            );
        }

        if (api.p95_response_time_ms > 5000) {
            issues.push(
                `${api.api_name} has slow response times: P95 ${api.p95_response_time_ms}ms`
            );
        }
    }

    return {
        healthy: issues.length === 0,
        issues,
    };
}

/**
 * Print API usage summary to console
 */
export async function printAPIUsageSummary(hoursBack: number = 24): Promise<void> {
    console.log(`\n📊 API Usage Summary (Last ${hoursBack} hours)`);
    console.log('='.repeat(60));

    try {
        const summary = await getAPIUsageSummary(hoursBack);

        console.log(`\n📈 Total Requests: ${summary.total_requests?.toLocaleString() || 0}`);

        // Performance by API
        if (summary.by_api && summary.by_api.length > 0) {
            console.log('\n🔌 Performance by API:');
            summary.by_api.forEach((api: any) => {
                console.log(`\n  ${api.api_name.toUpperCase()}`);
                console.log(`    Requests:        ${api.total_requests?.toLocaleString()}`);
                console.log(`    Success Rate:    ${api.success_rate?.toFixed(2)}%`);
                console.log(`    Avg Response:    ${api.avg_response_time_ms?.toFixed(0)}ms`);
                console.log(`    Rate Limits:     ${api.rate_limit_hits || 0}`);
            });
        }

        // Recent errors
        if (summary.recent_errors && summary.recent_errors.length > 0) {
            console.log('\n\n❌ Recent Errors:');
            summary.recent_errors.slice(0, 5).forEach((err: any) => {
                console.log(`  ${err.api_name}: ${err.endpoint} (${err.status_code}) - ${err.error_count} times`);
            });
        }

        // Slow endpoints
        if (summary.slow_endpoints && summary.slow_endpoints.length > 0) {
            console.log('\n\n🐌 Slow Endpoints (P95 > 2s):');
            summary.slow_endpoints.forEach((slow: any) => {
                console.log(`  ${slow.api_name}: ${slow.endpoint} - ${slow.p95_response_time_ms}ms`);
            });
        }

        // Health check
        const health = await checkAPIHealth();
        console.log('\n\n💚 API Health:');
        if (health.healthy) {
            console.log('  ✅ All APIs are healthy');
        } else {
            console.log('  ⚠️  Issues detected:');
            health.issues.forEach(issue => console.log(`     - ${issue}`));
        }

        console.log('\n' + '='.repeat(60));
    } catch (error) {
        console.error('Error printing API usage summary:', error);
    }
}

// ============================================
// EXPORT CONVENIENCE LOGGERS
// ============================================

/**
 * Log a Wikipedia API call
 */
export async function logWikipediaCall<T>(
    endpoint: string,
    apiFunction: () => Promise<T>,
    metadata?: Record<string, any>
): Promise<T> {
    return trackAPICall(
        { apiName: 'wikipedia', endpoint, metadata },
        apiFunction
    );
}

/**
 * Log a Wikidata API call
 */
export async function logWikidataCall<T>(
    endpoint: string,
    apiFunction: () => Promise<T>,
    metadata?: Record<string, any>
): Promise<T> {
    return trackAPICall(
        { apiName: 'wikidata', endpoint, metadata },
        apiFunction
    );
}

/**
 * Log a TMDB API call
 */
export async function logTMDBCall<T>(
    endpoint: string,
    apiFunction: () => Promise<T>,
    metadata?: Record<string, any>
): Promise<T> {
    return trackAPICall(
        { apiName: 'tmdb', endpoint, metadata },
        apiFunction
    );
}
