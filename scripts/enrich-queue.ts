import { supabase } from './lib/supabase';
import { enrichAndSaveContent } from './lib/enrich';
import { getCurrentCycle } from './lib/cycle';
import {
    getNextQueueItems,
    markQueueItemProcessing,
    markQueueItemCompleted,
    markQueueItemFailed,
} from './lib/queue';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10000');
const DRY_RUN = process.env.DRY_RUN === 'true';
const MAX_RUNTIME_MS = 5 * 60 * 60 * 1000; // 5 hours
const TIMEOUT_THRESHOLD_MS = MAX_RUNTIME_MS - 5 * 60 * 1000; // Stop 5 min before limit

function toTmdbType(contentType: string): 'movie' | 'tv' {
    return contentType === 'movie' ? 'movie' : 'tv';
}

async function isPaused(): Promise<boolean> {
    const { data, error } = await supabase
        .from('sync_settings')
        .select('setting_value')
        .eq('setting_key', 'cron_status')
        .single();

    if (error) return false;
    return (data?.setting_value as any)?.is_paused === true;
}

async function stampEnriched(contentId: string): Promise<void> {
    const cycle = await getCurrentCycle('content');
    await supabase
        .from('content')
        .update({
            enriched_at: new Date().toISOString(),
            enrichment_cycle: cycle,
        })
        .eq('id', contentId);
}

async function triggerNextRun(): Promise<void> {
    const { count: pending } = await supabase
        .from('enrichment_queue')
        .select('*', { count: 'exact', head: true })
        .eq('queue_type', 'content')
        .eq('status', 'pending');

    if ((pending || 0) === 0) {
        console.log('✨ Queue empty — no auto-continuation needed');
        return;
    }

    console.log(`📋 ${pending} items still pending — auto-triggering next run...`);
    try {
        const res = await fetch(
            `https://api.github.com/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/actions/workflows/enrich-content.yml/dispatches`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ref: 'main',
                    inputs: {
                        batch_size: BATCH_SIZE.toString(),
                        dry_run: DRY_RUN.toString(),
                    },
                }),
            }
        );
        console.log(res.status === 204 ? '✅ Next run triggered' : `⚠️ Trigger failed: ${res.status}`);
    } catch (e) {
        console.error('❌ Error triggering next workflow:', e);
    }
}

async function main() {
    const startTime = Date.now();

    console.log('🔄 Starting Queue-Based Enrichment (Smart Mode)\n');
    console.log(`Batch Size: ${BATCH_SIZE}`);
    console.log(`Dry Run:    ${DRY_RUN}`);
    console.log(`Max Runtime: ${MAX_RUNTIME_MS / 60000} minutes\n`);

    if (await isPaused()) {
        console.log('⏸️  Enrichment is paused. Exiting gracefully.');
        return;
    }

    const queueItems = await getNextQueueItems('content', BATCH_SIZE);

    if (queueItems.length === 0) {
        console.log('✅ Queue is empty — nothing to process');
        return;
    }

    console.log(`📋 Found ${queueItems.length} items in queue\n`);

    let processed = 0;
    let enriched = 0;
    let failed = 0;

    for (const queueItem of queueItems) {
        if (Date.now() - startTime >= TIMEOUT_THRESHOLD_MS) {
            console.log('\n⏰ Approaching timeout — stopping gracefully');
            break;
        }

        if (await isPaused()) {
            console.log('\n⏸️  Paused mid-run — stopping gracefully');
            break;
        }

        processed++;

        try {
            await markQueueItemProcessing(queueItem.id);

            const { data: content, error } = await supabase
                .from('content')
                .select('id, tmdb_id, title, content_type')
                .eq('id', queueItem.entity_id)
                .single();

            if (error || !content) {
                throw new Error(`Content not found: ${queueItem.entity_id}`);
            }

            console.log(`\n[${processed}/${queueItems.length}] ${content.title}`);
            console.log(`  TMDB: ${content.tmdb_id} | Type: ${content.content_type}`);
            console.log(`  Missing: ${queueItem.metadata?.missing_fields?.join(', ') || 'general enrichment'}`);

            if (DRY_RUN) {
                console.log('  ⏭️  [DRY RUN] Skipping enrichment');
                await markQueueItemCompleted(queueItem.id);
                enriched++;
                continue;
            }

            const result = await enrichAndSaveContent(
                content.tmdb_id,
                toTmdbType(content.content_type)
            );

            if (!result.success) {
                throw new Error(result.error || 'enrichAndSaveContent returned failure');
            }

            await markQueueItemCompleted(queueItem.id);

            // Stamp enrichment timestamp and cycle on the content row
            const targetId = result.contentId || content.id;
            await stampEnriched(targetId);

            console.log(`  ✅ Enriched (${result.peopleImported ?? 0} people linked)`);
            enriched++;

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`  ❌ Failed: ${msg}`);
            await markQueueItemFailed(queueItem.id, msg);
            failed++;
        }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 ENRICHMENT SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total Processed: ${processed}`);
    console.log(`✅ Enriched:     ${enriched}`);
    console.log(`❌ Failed:       ${failed}`);
    const successRate = processed > 0 ? Math.round((enriched / processed) * 100) : 0;
    console.log(`Success Rate:    ${successRate}%`);
    console.log('═══════════════════════════════════════════════════════\n');

    await triggerNextRun();
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
