import { NextResponse } from 'next/server';
import { CacheService } from '@/lib/services/cache.service';

/**
 * GET /api/cache/stats
 * Returns cache statistics
 */
export async function GET() {
    try {
        const stats = await CacheService.getCacheStats();

        return NextResponse.json({
            success: true,
            stats,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
