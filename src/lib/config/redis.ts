/**
 * Redis Client Configuration
 * Singleton instance for Upstash Redis connection
 */

import { Redis } from '@upstash/redis';

// Validate environment variables
if (!process.env.UPSTASH_REDIS_REST_URL) {
    throw new Error('UPSTASH_REDIS_REST_URL is not defined in environment variables');
}

if (!process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('UPSTASH_REDIS_REST_TOKEN is not defined in environment variables');
}

// Create singleton Redis instance
export const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Health check function
export async function testRedisConnection(): Promise<boolean> {
    try {
        await redis.set('health_check', 'ok', { ex: 10 }); // 10 second expiry
        const result = await redis.get('health_check');
        return result === 'ok';
    } catch (error) {
        console.error('Redis connection test failed:', error);
        return false;
    }
}

// Export for convenience
export default redis;
