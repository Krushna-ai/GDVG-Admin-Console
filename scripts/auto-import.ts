/**
 * Auto-Import Script for GitHub Actions
 * Runs daily to process pending items from the import_queue.
 * 
 * Uses BATCH_SIZE environment variable (default 4000).
 */

import supabase from './lib/supabase';
import { delay } from './lib/tmdb';
import { enrichAndSaveContent } from './lib/enrich';
import * as fs from 'fs';

// ============================================
// CONFIGURATION
// ============================================

const BATCH_SIZE = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE, 10) : 4000;
const DRY_RUN = process.env.DRY_RUN === 'true';
const MAX_ATTEMPTS = 3;

// ============================================
// PAUSE STATUS CHECK
// ============================================

/**
 * Check if sync is paused in dashboard
 * Exits gracefully if paused
 */
async function checkSyncPauseStatus() {
    try {
        const { data, error } = await supabase
            .from('sync_settings')
            .select('setting_value')
            .eq('setting_key', 'cron_status')
            .single();

        if (error) {
            console.warn('⚠️ Could not check pause status:', error.message);
            console.warn('Proceeding with caution...');
            return;
        }

        const cronStatus = data?.setting_value as any;
        if (cronStatus?.is_paused) {
            console.log('⏸️ Sync is paused. Exiting gracefully.');
            console.log(`📅 Paused at: ${cronStatus.paused_at}`);
            process.exit(0);
        }

        console.log('✅ Sync is active. Proceeding...');
    } catch (err) {
        console.warn('⚠️ Error checking pause status:', err);
        console.warn('Proceeding with caution...');
    }
}

// ============================================
// MAIN FUNCTION
// ============================================

async function main() {
    console.log('🚀 Starting Auto-Import (Queue Drainer)...');

    // Check if sync is paused - exit if paused
    await checkSyncPauseStatus();

    console.log(`📅 Date: ${new Date().toISOString()}`);
    console.log(`🧪 Dry Run: ${DRY_RUN}`);
    console.log(`📊 Batch Size: ${BATCH_SIZE}`);

    try {
        // Step 1: Fetch pending items from queue
        console.log(`\n📡 Fetching up to ${BATCH_SIZE} pending items from import_queue...`);
        const { data: queueItems, error: fetchError } = await supabase
            .from('import_queue')
            .select('*')
            .eq('status', 'pending')
            .order('priority', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(BATCH_SIZE);

        if (fetchError) {
            throw new Error(`Failed to fetch from import_queue: ${fetchError.message}`);
        }

        if (!queueItems || queueItems.length === 0) {
            console.log('🤷‍♂️ No pending items in queue. Job completed.');
            return;
        }

        console.log(`📦 Found ${queueItems.length} items to process.`);

        let successCount = 0;
        let failCount = 0;
        let peopleImported = 0;

        // Step 2: Process each item
        for (const item of queueItems) {
            console.log(`\n⏳ Processing ID: ${item.tmdb_id} (${item.content_type})`);

            if (DRY_RUN) {
                console.log(`    [DRY RUN] Would import ${item.content_type} ${item.tmdb_id}`);
                successCount++;
                continue;
            }

            try {
                // Import and Enrich
                const result = await enrichAndSaveContent(item.tmdb_id, item.content_type as 'movie' | 'tv');

                if (result.success) {
                    // Update queue status to completed
                    const { error: updateError } = await supabase
                        .from('import_queue')
                        .update({
                            status: 'completed',
                            processed_at: new Date().toISOString()
                        })
                        .eq('id', item.id);

                    if (updateError) {
                        console.error(`    ❌ Failed to mark as completed in DB: ${updateError.message}`);
                    } else {
                        console.log(`    ✅ Successfully imported and enriched.`);
                        successCount++;
                        peopleImported += result.peopleImported || 0;
                    }
                } else {
                    // Import failed
                    const newAttempts = (item.attempts || 0) + 1;
                    const newStatus = newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';

                    console.error(`    ❌ Import failed: ${result.error}`);
                    if (newStatus === 'failed') {
                        console.error(`    ⚠️ Max attempts reached. Marking queue item as failed.`);
                    }

                    const { error: updateError } = await supabase
                        .from('import_queue')
                        .update({
                            status: newStatus,
                            attempts: newAttempts,
                            error_message: result.error,
                            processed_at: new Date().toISOString()
                        })
                        .eq('id', item.id);

                    if (updateError) {
                        console.error(`    ❌ Failed to update error status in DB: ${updateError.message}`);
                    }

                    failCount++;
                }

            } catch (error: any) {
                console.error(`    ❌ Unexpected error processing ${item.tmdb_id}:`, error);

                const newAttempts = (item.attempts || 0) + 1;
                const newStatus = newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';

                await supabase
                    .from('import_queue')
                    .update({
                        status: newStatus,
                        attempts: newAttempts,
                        error_message: String(error),
                        processed_at: new Date().toISOString()
                    })
                    .eq('id', item.id);

                failCount++;
            }

            // Rate limit: 300ms between items
            await delay(300);
        }

        console.log('\n\n🎉 Auto-Import completed successfully!');
        console.log(`📊 Final Stats:`);
        console.log(`  ✅ Processed Successfully: ${successCount}`);
        console.log(`  ❌ Failed: ${failCount}`);
        console.log(`  👥 People Imported: ${peopleImported}`);

        // Write to GitHub Step Summary if running in Actions
        if (process.env.GITHUB_STEP_SUMMARY) {
            const summary = `
### 📥 Auto-Import Run Summary
- **Items Processed:** \`${successCount}\` successfully, \`${failCount}\` failed.
- **People Imported:** \`${peopleImported}\`
- **Batch Size Limit:** \`${BATCH_SIZE}\`
            `;
            try {
                fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.trim() + '\n');
            } catch (err) {
                console.warn('Failed to write GITHUB_STEP_SUMMARY', err);
            }
        }

    } catch (error) {
        console.error('❌ Auto-Import failed with fatal error:', error);
        process.exit(1);
    }
}

// Run
main();
