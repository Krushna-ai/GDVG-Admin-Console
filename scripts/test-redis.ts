/**
 * Quick test script to verify Redis connection
 * Run with: npx tsx scripts/test-redis.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(__dirname, '../.env.local') });

import { testRedisConnection } from '../src/lib/config/redis';

async function main() {
    console.log('🔍 Testing Redis connection...\n');

    try {
        const isHealthy = await testRedisConnection();

        if (isHealthy) {
            console.log('✅ SUCCESS: Redis connection is working!');
            console.log('📊 Your cache is ready to use.');
            process.exit(0);
        } else {
            console.log('❌ FAILED: Redis connection test failed');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ ERROR:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

main();
