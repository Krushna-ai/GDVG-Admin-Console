import { NextResponse } from 'next/server';
import { testRedisConnection } from '@/lib/config/redis';

/**
 * GET /api/health/redis
 * Health check endpoint for Redis connection
 */
export async function GET() {
    try {
        const isHealthy = await testRedisConnection();

        if (isHealthy) {
            return NextResponse.json({
                status: 'healthy',
                message: 'Redis connection successful',
                timestamp: new Date().toISOString(),
            });
        } else {
            return NextResponse.json({
                status: 'unhealthy',
                message: 'Redis connection failed',
                timestamp: new Date().toISOString(),
            }, { status: 503 });
        }
    } catch (error) {
        return NextResponse.json({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
        }, { status: 500 });
    }
}
