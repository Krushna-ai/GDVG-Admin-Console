/**
 * Cache Service
 * Provides caching utilities using Upstash Redis
 */

import { redis } from '@/lib/config/redis';

// Cache TTL constants (in seconds)
const TTL = {
    CONTENT_LIST: 300,      // 5 minutes
    CONTENT_DETAIL: 900,    // 15 minutes
    PERSON_LIST: 300,       // 5 minutes
    PERSON_DETAIL: 900,     // 15 minutes
    STATS: 180,             // 3 minutes
} as const;

// Cache key prefixes
const KEYS = {
    CONTENT_LIST: 'content:list',
    CONTENT: 'content',
    PERSON_LIST: 'people:list',
    PERSON: 'person',
    STATS: 'stats',
} as const;

/**
 * Content List Caching
 */
export const CacheService = {
    // ==================== CONTENT LIST ====================

    async getContentList(key: string): Promise<any | null> {
        try {
            const cached = await redis.get(`${KEYS.CONTENT_LIST}:${key}`);
            return cached ? JSON.parse(cached as string) : null;
        } catch (error) {
            console.error('Cache get error (content list):', error);
            return null;
        }
    },

    async setContentList(key: string, data: any): Promise<void> {
        try {
            await redis.setex(
                `${KEYS.CONTENT_LIST}:${key}`,
                TTL.CONTENT_LIST,
                JSON.stringify(data)
            );
        } catch (error) {
            console.error('Cache set error (content list):', error);
        }
    },

    // ==================== CONTENT DETAIL ====================

    async getContent(id: string): Promise<any | null> {
        try {
            const cached = await redis.get(`${KEYS.CONTENT}:${id}`);
            return cached ? JSON.parse(cached as string) : null;
        } catch (error) {
            console.error('Cache get error (content):', error);
            return null;
        }
    },

    async setContent(id: string, data: any): Promise<void> {
        try {
            await redis.setex(
                `${KEYS.CONTENT}:${id}`,
                TTL.CONTENT_DETAIL,
                JSON.stringify(data)
            );
        } catch (error) {
            console.error('Cache set error (content):', error);
        }
    },

    // ==================== PEOPLE LIST ====================

    async getPeopleList(key: string): Promise<any | null> {
        try {
            const cached = await redis.get(`${KEYS.PERSON_LIST}:${key}`);
            return cached ? JSON.parse(cached as string) : null;
        } catch (error) {
            console.error('Cache get error (people list):', error);
            return null;
        }
    },

    async setPeopleList(key: string, data: any): Promise<void> {
        try {
            await redis.setex(
                `${KEYS.PERSON_LIST}:${key}`,
                TTL.PERSON_LIST,
                JSON.stringify(data)
            );
        } catch (error) {
            console.error('Cache set error (people list):', error);
        }
    },

    // ==================== PERSON DETAIL ====================

    async getPerson(id: string): Promise<any | null> {
        try {
            const cached = await redis.get(`${KEYS.PERSON}:${id}`);
            return cached ? JSON.parse(cached as string) : null;
        } catch (error) {
            console.error('Cache get error (person):', error);
            return null;
        }
    },

    async setPerson(id: string, data: any): Promise<void> {
        try {
            await redis.setex(
                `${KEYS.PERSON}:${id}`,
                TTL.PERSON_DETAIL,
                JSON.stringify(data)
            );
        } catch (error) {
            console.error('Cache set error (person):', error);
        }
    },

    // ==================== STATS CACHING ====================

    async getStats(key: string): Promise<any | null> {
        try {
            const cached = await redis.get(`${KEYS.STATS}:${key}`);
            return cached ? JSON.parse(cached as string) : null;
        } catch (error) {
            console.error('Cache get error (stats):', error);
            return null;
        }
    },

    async setStats(key: string, data: any): Promise<void> {
        try {
            await redis.setex(
                `${KEYS.STATS}:${key}`,
                TTL.STATS,
                JSON.stringify(data)
            );
        } catch (error) {
            console.error('Cache set error (stats):', error);
        }
    },

    // ==================== INVALIDATION ====================

    async invalidateContent(id: string): Promise<void> {
        try {
            await redis.del(`${KEYS.CONTENT}:${id}`);
        } catch (error) {
            console.error('Cache invalidate error (content):', error);
        }
    },

    async invalidateContentLists(): Promise<void> {
        try {
            // Get all content list keys
            const keys = await redis.keys(`${KEYS.CONTENT_LIST}:*`);
            if (keys && keys.length > 0) {
                await redis.del(...keys);
            }
        } catch (error) {
            console.error('Cache invalidate error (content lists):', error);
        }
    },

    async invalidatePerson(id: string): Promise<void> {
        try {
            await redis.del(`${KEYS.PERSON}:${id}`);
        } catch (error) {
            console.error('Cache invalidate error (person):', error);
        }
    },

    async invalidatePeopleLists(): Promise<void> {
        try {
            // Get all people list keys
            const keys = await redis.keys(`${KEYS.PERSON_LIST}:*`);
            if (keys && keys.length > 0) {
                await redis.del(...keys);
            }
        } catch (error) {
            console.error('Cache invalidate error (people lists):', error);
        }
    },

    async invalidateStats(): Promise<void> {
        try {
            const keys = await redis.keys(`${KEYS.STATS}:*`);
            if (keys && keys.length > 0) {
                await redis.del(...keys);
            }
        } catch (error) {
            console.error('Cache invalidate error (stats):', error);
        }
    },

    async invalidateAll(): Promise<void> {
        try {
            await redis.flushdb();
            console.log('✅ All cache cleared');
        } catch (error) {
            console.error('Cache flush error:', error);
        }
    },

    // ==================== CACHE STATS ====================

    async getCacheStats(): Promise<{
        totalKeys: number;
        memoryUsage: string;
        hitRate?: number;
    }> {
        try {
            const dbSize = await redis.dbsize();

            return {
                totalKeys: dbSize || 0,
                memoryUsage: 'N/A', // Upstash doesn't expose memory stats via REST API
            };
        } catch (error) {
            console.error('Cache stats error:', error);
            return {
                totalKeys: 0,
                memoryUsage: 'Error',
            };
        }
    },
};

// Export for convenience
export default CacheService;
