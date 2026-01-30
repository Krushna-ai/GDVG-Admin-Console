// Sync Service
// Handles syncing content changes from TMDB + Priority-based auto-import

import { createClient } from '@/lib/supabase/server';
import {
    getChangedMovieIds,
    getChangedTvIds,
    getMovieDetails,
    getTvDetails,
    delay,
} from '@/lib/tmdb/client';
import { upsertContent, type Content } from './database.service';

// ============================================
// PRIORITY CONSTANTS (Phase 7.2)
// ============================================

// Country priority: KR(10) > CN(9) > TH(8) > TR(7) > JP(6) > IN(4) > Western(2) > Other(1)
export const COUNTRY_PRIORITY: Record<string, number> = {
    'KR': 10, 'CN': 9, 'TW': 9, 'HK': 9, 'TH': 8, 'TR': 7,
    'JP': 6, 'IN': 4, 'US': 2, 'GB': 2, 'CA': 2, 'AU': 2,
};

// Content type priority: drama(10) > tv(8) > movie(6) > anime(5) > other(1)
export const CONTENT_TYPE_PRIORITY: Record<string, number> = {
    'drama': 10, 'tv': 8, 'movie': 6, 'anime': 5,
};

// Daily quota per region (total 1000/day)
export const DAILY_QUOTA: Record<string, number> = {
    'KR': 300, 'CN': 200, 'TH': 150, 'TR': 100, 'JP': 100,
    'ANIME': 50, 'IN': 50, 'WESTERN': 50, 'OTHER': 50,
};

export const TOTAL_DAILY_QUOTA = 1000;

// ============================================
// TYPES
// ============================================

export interface SyncPreviewResult {
    totalChanges: number;
    matchingMovies: number;
    matchingTv: number;
    movieIds: number[];
    tvIds: number[];
}

export interface SyncRunResult {
    processed: number;
    updated: number;
    failed: number;
    errors: Array<{ tmdbId: number; type: string; error: string }>;
}

// ============================================
// PREVIEW CHANGES
// ============================================

/**
 * Get changed content IDs from TMDB that exist in our database
 */
export async function previewChanges(
    startDate?: string,
    endDate?: string
): Promise<SyncPreviewResult> {
    const supabase = await createClient();

    // Fetch changed IDs from TMDB (paginate through all results)
    const movieIds: number[] = [];
    const tvIds: number[] = [];

    // Get movie changes (up to 5 pages for safety)
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 5) {
        const result = await getChangedMovieIds(startDate, endDate, page);
        movieIds.push(...result.results.filter(r => !r.adult).map(r => r.id));
        hasMore = page < result.total_pages;
        page++;
        await delay(100);
    }

    // Get TV changes (up to 5 pages for safety)
    page = 1;
    hasMore = true;
    while (hasMore && page <= 5) {
        const result = await getChangedTvIds(startDate, endDate, page);
        tvIds.push(...result.results.filter(r => !r.adult).map(r => r.id));
        hasMore = page < result.total_pages;
        page++;
        await delay(100);
    }

    // Check which IDs exist in our database
    const { data: existingMovies } = await supabase
        .from('content')
        .select('tmdb_id')
        .eq('content_type', 'movie')
        .in('tmdb_id', movieIds.length > 0 ? movieIds : [0]);

    const { data: existingTv } = await supabase
        .from('content')
        .select('tmdb_id')
        .eq('content_type', 'tv')
        .in('tmdb_id', tvIds.length > 0 ? tvIds : [0]);

    const matchingMovieIds = existingMovies?.map(e => e.tmdb_id) || [];
    const matchingTvIds = existingTv?.map(e => e.tmdb_id) || [];

    return {
        totalChanges: movieIds.length + tvIds.length,
        matchingMovies: matchingMovieIds.length,
        matchingTv: matchingTvIds.length,
        movieIds: matchingMovieIds,
        tvIds: matchingTvIds,
    };
}

// ============================================
// RUN SYNC
// ============================================

/**
 * Sync changed content from TMDB
 */
export async function runSync(
    movieIds: number[],
    tvIds: number[]
): Promise<SyncRunResult> {
    const result: SyncRunResult = {
        processed: 0,
        updated: 0,
        failed: 0,
        errors: [],
    };

    // Process movies
    for (const tmdbId of movieIds) {
        result.processed++;
        try {
            const details = await getMovieDetails(tmdbId);
            if (details) {
                const contentData = mapTmdbToContent(details, 'movie');
                await upsertContent(contentData);
                result.updated++;
            }
        } catch (error: any) {
            result.failed++;
            result.errors.push({
                tmdbId,
                type: 'movie',
                error: error.message || 'Unknown error',
            });
        }
        await delay(300); // Rate limiting
    }

    // Process TV shows
    for (const tmdbId of tvIds) {
        result.processed++;
        try {
            const details = await getTvDetails(tmdbId);
            if (details) {
                const contentData = mapTmdbToContent(details, 'tv');
                await upsertContent(contentData);
                result.updated++;
            }
        } catch (error: any) {
            result.failed++;
            result.errors.push({
                tmdbId,
                type: 'tv',
                error: error.message || 'Unknown error',
            });
        }
        await delay(300); // Rate limiting
    }

    return result;
}

// ============================================
// HELPERS
// ============================================

/**
 * Map TMDB API response to our content table structure
 */
/**
 * Map TMDB API response to our content table structure
 */
export function mapTmdbToContent(details: any, contentType: 'movie' | 'tv'): Partial<Content> {
    return {
        tmdb_id: details.id,
        imdb_id: details.imdb_id || details.external_ids?.imdb_id || null,
        content_type: contentType,
        title: contentType === 'movie' ? details.title : details.name,
        original_title: contentType === 'movie' ? details.original_title : details.original_name,
        overview: details.overview || null,
        poster_path: details.poster_path || null,
        backdrop_path: details.backdrop_path || null,
        release_date: contentType === 'movie' ? details.release_date : null,
        first_air_date: contentType === 'tv' ? details.first_air_date : null,
        original_language: details.original_language || null,
        origin_country: details.origin_country || details.production_countries?.map((c: any) => c.iso_3166_1) || [],
        genres: details.genres || [],
        popularity: details.popularity || null,
        vote_average: details.vote_average || null,
        vote_count: details.vote_count || null,
        runtime: contentType === 'movie' ? details.runtime : null,
        number_of_seasons: contentType === 'tv' ? details.number_of_seasons : null,
        number_of_episodes: contentType === 'tv' ? details.number_of_episodes : null,
        tagline: details.tagline || null,
        homepage: details.homepage || null,
        budget: contentType === 'movie' ? details.budget : null,
        revenue: contentType === 'movie' ? details.revenue : null,
        production_companies: details.production_companies || null,
        networks: contentType === 'tv' ? details.networks : null,
        tmdb_status: details.status || null,
    };
}

// ============================================
// PRIORITY & QUEUE FUNCTIONS (Phase 7.2)
// ============================================

/**
 * Calculate priority score for content
 * Formula: (country × 2) + content_type + (popularity / 10) + RECENCY
 */
export function calculatePriorityScore(
    countryCode: string,
    contentType: string,
    popularity: number,
    releaseDate?: string // YYYY-MM-DD
): { country: number; type: number; pop: number; recency: number; total: number } {
    const countryScore = COUNTRY_PRIORITY[countryCode] || 1;
    const typeScore = CONTENT_TYPE_PRIORITY[contentType] || 1;
    const popScore = Math.min(Math.floor(popularity / 10), 10);

    // Recency boost (Phase 7.2 Updated)
    let recencyScore = 0;
    if (releaseDate) {
        const year = new Date(releaseDate).getFullYear();
        const currentYear = new Date().getFullYear();
        if (year === currentYear) recencyScore = 10;      // Current year release: +10
        else if (year === currentYear - 1) recencyScore = 5; // Last year: +5
    }

    return {
        country: countryScore,
        type: typeScore,
        pop: popScore,
        recency: recencyScore,
        total: (countryScore * 2) + typeScore + popScore + recencyScore,
    };
}

/**
 * Get primary country from origin_country array
 */
export function getPrimaryCountry(originCountry: string[]): string {
    if (!originCountry || originCountry.length === 0) return 'OTHER';
    const priorityOrder = ['KR', 'CN', 'TW', 'HK', 'TH', 'TR', 'JP', 'IN', 'US', 'GB'];
    for (const country of priorityOrder) {
        if (originCountry.includes(country)) return country;
    }
    return originCountry[0] || 'OTHER';
}

/**
 * Classify content type based on metadata
 */
export function classifyContentType(
    tmdbType: 'movie' | 'tv',
    originCountry: string[],
    genres: Array<{ id: number; name: string }>,
    originalLanguage: string
): 'movie' | 'tv' | 'drama' | 'anime' {
    const isAsianCountry = originCountry.some(c =>
        ['KR', 'CN', 'TW', 'HK', 'TH', 'TR', 'JP'].includes(c)
    );
    const isAnimation = genres?.some(g => g.name.toLowerCase() === 'animation');
    const isJapanese = originCountry.includes('JP') || originalLanguage === 'ja';

    if (isJapanese && isAnimation) return 'anime';
    if (tmdbType === 'tv' && isAsianCountry) return 'drama';
    return tmdbType;
}

/**
 * Check existing content (bulk check for efficiency)
 */
export async function filterExistingContent(
    items: Array<{ tmdb_id: number; content_type: string }>
): Promise<Set<string>> {
    const supabase = await createClient();
    const tmdbIds = items.map(i => i.tmdb_id);

    const { data } = await supabase
        .from('content')
        .select('tmdb_id, content_type')
        .in('tmdb_id', tmdbIds.length > 0 ? tmdbIds : [0]);

    const existingSet = new Set<string>();
    data?.forEach(item => existingSet.add(`${item.tmdb_id}:${item.content_type}`));
    return existingSet;
}

/**
 * Create a new sync job
 */
export async function createSyncJob(syncType: 'auto' | 'manual' | 'full'): Promise<string> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('sync_jobs')
        .insert({ sync_type: syncType, status: 'pending', daily_quota: TOTAL_DAILY_QUOTA })
        .select('id')
        .single();

    if (error) throw new Error(`Failed to create sync job: ${error.message}`);
    return data.id;
}

/**
 * Update sync job stats
 */
export async function updateJobStats(jobId: string, stats: Record<string, any>): Promise<void> {
    const supabase = await createClient();
    await supabase.from('sync_jobs').update(stats).eq('id', jobId);
}

/**
 * Get next batch from queue (highest priority first)
 */
export async function getNextBatch(jobId: string, batchSize: number = 10): Promise<any[]> {
    const supabase = await createClient();
    const { data } = await supabase
        .from('sync_queue')
        .select('*')
        .eq('job_id', jobId)
        .eq('status', 'pending')
        .order('total_priority', { ascending: false })
        .limit(batchSize);
    return data || [];
}

/**
 * Mark queue item as processed
 */
export async function markQueueItemProcessed(
    itemId: string,
    status: 'completed' | 'failed' | 'skipped',
    errorMessage?: string
): Promise<void> {
    const supabase = await createClient();
    await supabase
        .from('sync_queue')
        .update({ status, error_message: errorMessage, processed_at: new Date().toISOString() })
        .eq('id', itemId);
}

// ============================================
// SYNC SETTINGS & STATUS HELPERS (Phase 9.3)
// ============================================

/**
 * Get all sync settings from the database
 */
export async function getSyncSettings() {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('sync_settings')
        .select('*');

    if (error) throw error;

    // Transform array to object for easier access
    const settings: Record<string, any> = {};
    data?.forEach((setting) => {
        settings[setting.setting_key] = setting.setting_value;
    });

    return settings;
}

/**
 * Update a specific sync setting
 */
export async function updateSyncSetting(key: string, value: any, userId?: string) {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('sync_settings')
        .update({
            setting_value: value,
            updated_at: new Date().toISOString(),
            updated_by: userId || null,
        })
        .eq('setting_key', key)
        .select()
        .single();

    if (error) throw error;

    return data;
}

/**
 * Calculate next run time based on cron expression
 * Supports daily and weekly schedules
 */
export function calculateNextRun(cronExpression: string): Date | null {
    try {
        // Parse cron expression: "30 21 * * *" = 21:30 UTC daily
        const parts = cronExpression.split(' ');
        if (parts.length !== 5) return null;

        const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

        const now = new Date();
        const next = new Date(now);

        // Set the time
        next.setUTCHours(parseInt(hour), parseInt(minute), 0, 0);

        // If the time has passed today, move to tomorrow
        if (next <= now) {
            next.setUTCDate(next.getUTCDate() + 1);
        }

        // Handle weekly schedules (e.g., "30 20 * * 0" = Sundays)
        if (dayOfWeek !== '*') {
            const targetDay = parseInt(dayOfWeek);
            const currentDay = next.getUTCDay();
            let daysToAdd = targetDay - currentDay;

            if (daysToAdd <= 0) {
                daysToAdd += 7;
            }

            next.setUTCDate(next.getUTCDate() + daysToAdd);
        }

        return next;
    } catch (error) {
        console.error('Error calculating next run:', error);
        return null;
    }
}

/**
 * Get comprehensive sync statistics
 */
export async function getSyncStats() {
    const supabase = await createClient();

    // Get content stats
    const { count: totalContent } = await supabase
        .from('content')
        .select('*', { count: 'exact', head: true });

    const { count: movieCount } = await supabase
        .from('content')
        .select('*', { count: 'exact', head: true })
        .eq('content_type', 'movie');

    const { count: tvCount } = await supabase
        .from('content')
        .select('*', { count: 'exact', head: true })
        .eq('content_type', 'tv_series');

    // Get active jobs count
    const { count: activeJobs } = await supabase
        .from('import_jobs')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'running']);

    // Get pending gaps count
    const { count: pendingGaps } = await supabase
        .from('gap_registry')
        .select('*', { count: 'exact', head: true })
        .eq('is_resolved', false);

    // Get latest sync log
    const { data: lastRun } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('sync_type', 'cron')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

    return {
        content_stats: {
            total: totalContent || 0,
            movies: movieCount || 0,
            tv_series: tvCount || 0,
        },
        active_jobs: activeJobs || 0,
        pending_gaps: pendingGaps || 0,
        last_run: lastRun ? {
            started_at: lastRun.started_at,
            completed_at: lastRun.completed_at,
            status: lastRun.status,
            summary: lastRun.summary,
        } : null,
    };
}

/**
 * Get pause state from sync settings
 */
export async function isPaused(): Promise<boolean> {
    const settings = await getSyncSettings();
    return settings.cron_status?.is_paused || false;
}

/**
 * Pause sync operations
 */
export async function pauseSync(userId?: string) {
    return await updateSyncSetting('cron_status', {
        is_paused: true,
        paused_at: new Date().toISOString(),
        paused_by: userId || null,
        resumed_at: null,
        resumed_by: null,
    }, userId);
}

/**
 * Resume sync operations
 */
export async function resumeSync(userId?: string) {
    return await updateSyncSetting('cron_status', {
        is_paused: false,
        paused_at: null,
        paused_by: null,
        resumed_at: new Date().toISOString(),
        resumed_by: userId || null,
    }, userId);
}

