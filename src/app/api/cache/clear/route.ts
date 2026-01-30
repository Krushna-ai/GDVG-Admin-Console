import { NextResponse } from 'next/server';
import { CacheService } from '@/lib/services/cache.service';

/**
 * POST /api/cache/clear
 * Clears all cache (admin only)
 */
export async function POST() {
    try {
        await CacheService.invalidateAll();

        return NextResponse.json({
            success: true,
            message: 'All cache cleared successfully',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
