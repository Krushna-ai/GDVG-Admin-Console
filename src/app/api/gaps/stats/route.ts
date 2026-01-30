import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/gaps/stats
 * Get gap statistics (counts by type, unresolved total, etc.)
 */
export async function GET() {
    try {
        const supabase = await createClient();

        // Get total unresolved gaps
        const { count: unresolvedCount } = await supabase
            .from('gap_registry')
            .select('*', { count: 'exact', head: true })
            .eq('is_resolved', false);

        // Get total resolved gaps
        const { count: resolvedCount } = await supabase
            .from('gap_registry')
            .select('*', { count: 'exact', head: true })
            .eq('is_resolved', true);

        // Get counts by gap type (unresolved only)
        const { data: byType } = await supabase
            .from('gap_registry')
            .select('gap_type')
            .eq('is_resolved', false);

        const gapsByType = {
            sequential: 0,
            popularity: 0,
            temporal: 0,
            metadata: 0,
        };

        byType?.forEach((gap) => {
            if (gap.gap_type in gapsByType) {
                gapsByType[gap.gap_type as keyof typeof gapsByType]++;
            }
        });

        // Get counts by content type (unresolved only)
        const { data: byContentType } = await supabase
            .from('gap_registry')
            .select('content_type')
            .eq('is_resolved', false);

        const gapsByContentType = {
            movie: 0,
            tv_series: 0,
        };

        byContentType?.forEach((gap) => {
            if (gap.content_type in gapsByContentType) {
                gapsByContentType[gap.content_type as keyof typeof gapsByContentType]++;
            }
        });

        // Get top priority gaps (unresolved, top 10)
        const { data: topPriority } = await supabase
            .from('gap_registry')
            .select('*')
            .eq('is_resolved', false)
            .order('priority_score', { ascending: false })
            .limit(10);

        return NextResponse.json({
            success: true,
            stats: {
                total: {
                    unresolved: unresolvedCount || 0,
                    resolved: resolvedCount || 0,
                    total: (unresolvedCount || 0) + (resolvedCount || 0),
                },
                byType: gapsByType,
                byContentType: gapsByContentType,
                topPriority: topPriority || [],
            },
        });
    } catch (error) {
        console.error('Error fetching gap stats:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
