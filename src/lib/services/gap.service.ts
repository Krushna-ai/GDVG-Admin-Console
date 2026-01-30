import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const tmdbAccessToken = process.env.TMDB_ACCESS_TOKEN!;

interface Gap {
    gap_type: 'metadata' | 'popularity' | 'temporal';
    tmdb_id: number;
    content_type: 'movie' | 'tv';
    priority_score: number;
    details?: any;
}

/**
 * Detect content with missing or incomplete metadata
 */
export async function detectMetadataGaps(): Promise<Gap[]> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const gaps: Gap[] = [];

    // Find content with missing critical metadata
    const { data: incompleteContent, error } = await supabase
        .from('content')
        .select('id, tmdb_id, content_type, popularity, title, poster_path, overview')
        .or('poster_path.is.null,overview.is.null,overview.eq.')
        .order('popularity', { ascending: false })
        .limit(100);

    if (error || !incompleteContent) {
        console.error('Metadata gap detection error:', error);
        return gaps;
    }

    for (const content of incompleteContent) {
        const missingFields = [];
        if (!content.poster_path) missingFields.push('poster');
        if (!content.overview || content.overview.trim() === '') missingFields.push('overview');

        gaps.push({
            gap_type: 'metadata',
            tmdb_id: content.tmdb_id,
            content_type: content.content_type,
            priority_score: calculatePriorityScore(content.popularity || 0, new Date()),
            details: {
                title: content.title,
                missing_fields: missingFields,
            },
        });
    }

    return gaps;
}

/**
 * Detect popular content from TMDB that's missing in our database
 * REMOVED - Redundant with Bulk Import feature
 */
export async function detectPopularityGaps(): Promise<Gap[]> {
    console.log('⚠️  Popularity gap detection is disabled - use Bulk Import instead');
    return [];
}

/**
 * Detect temporal gaps - date ranges with sparse content
 * REMOVED - Redundant with Bulk Import feature
 */
export async function detectTemporalGaps(): Promise<Gap[]> {
    console.log('⚠️  Temporal gap detection is disabled - use Bulk Import instead');
    return [];
}

/**
 * Calculate priority score based on popularity and recency
 * Higher score = higher priority
 */
function calculatePriorityScore(popularity: number, releaseDate: Date): number {
    const now = new Date();
    const ageInDays = Math.floor((now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24));

    // Recency factor: newer content gets higher score
    // 100 for current year, decreasing by ~10 per year
    const recencyScore = Math.max(0, 100 - (ageInDays / 365) * 10);

    // Popularity factor: 0-100
    const popularityScore = Math.min(100, popularity);

    // Combined score: weighted average (60% popularity, 40% recency)
    return Math.round(popularityScore * 0.6 + recencyScore * 0.4);
}

/**
 * Store detected gaps in the database
 */
export async function storeGaps(gaps: Gap[]): Promise<number> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    let storedCount = 0;

    for (const gap of gaps) {
        try {
            const { error } = await supabase
                .from('gap_registry')
                .upsert({
                    gap_type: gap.gap_type,
                    tmdb_id: gap.tmdb_id,
                    content_type: gap.content_type,
                    priority_score: gap.priority_score,
                    status: 'unresolved',
                    details: gap.details,
                    detected_at: new Date().toISOString(),
                }, {
                    onConflict: 'tmdb_id,gap_type',
                });

            if (!error) {
                storedCount++;
            }
        } catch (error) {
            console.error('Error storing gap:', error);
        }
    }

    return storedCount;
}
