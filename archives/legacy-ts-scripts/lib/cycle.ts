import { supabase } from './supabase';

interface CycleInfo {
    current_cycle: number;
    total_items: number;
    items_completed: number;
}

/**
 * Get current enrichment cycle for entity type
 */
export async function getCurrentCycle(entityType: 'content' | 'people'): Promise<number> {
    const { data, error } = await supabase
        .from('enrichment_cycles')
        .select('current_cycle')
        .eq('entity_type', entityType)
        .single();

    if (error || !data) {
        console.error(`Error fetching current cycle for ${entityType}:`, error);
        return 0;
    }

    return data.current_cycle;
}

/**
 * Get complete cycle information
 */
export async function getCycleInfo(entityType: 'content' | 'people'): Promise<CycleInfo> {
    const { data, error } = await supabase
        .from('enrichment_cycles')
        .select('current_cycle, total_items, items_completed')
        .eq('entity_type', entityType)
        .single();

    if (error || !data) {
        console.error(`Error fetching cycle info for ${entityType}:`, error);
        return { current_cycle: 0, total_items: 0, items_completed: 0 };
    }

    return data;
}

/**
 * Check if all items have completed current cycle and increment if ready
 * Auto-resets to cycle 0 when cycle 8 completes
 */
export async function checkAndIncrementCycle(entityType: 'content' | 'people'): Promise<void> {
    try {
        // Get current cycle info
        const { data: cycleData, error: cycleError } = await supabase
            .from('enrichment_cycles')
            .select('current_cycle, total_items, items_completed')
            .eq('entity_type', entityType)
            .single();

        if (cycleError || !cycleData) {
            console.error('Error fetching cycle data:', cycleError);
            return;
        }

        const currentCycle = cycleData.current_cycle;

        // Count items at or above current cycle
        const tableName = entityType === 'content' ? 'content' : 'people';
        const { count, error: countError } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true })
            .gte('enrichment_cycle', currentCycle);

        if (countError) {
            console.error('Error counting items:', countError);
            return;
        }

        // Get total items count
        const { count: totalCount, error: totalError } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true });

        if (totalError || !totalCount) {
            console.error('Error counting total items:', totalError);
            return;
        }

        // If all items have completed current cycle, increment
        if (count === totalCount) {
            let nextCycle = currentCycle + 1;

            // Auto-reset to 0 when cycle 8 completes
            if (nextCycle > 8) {
                nextCycle = 0;
                console.log(`\n🔄 Cycle 8 complete! Resetting to Cycle 0 for ${entityType}`);
            } else {
                console.log(`\n✅ Cycle ${currentCycle} complete! Moving to Cycle ${nextCycle} for ${entityType}`);
            }

            // Update cycle
            const { error: updateError } = await supabase
                .from('enrichment_cycles')
                .update({
                    current_cycle: nextCycle,
                    cycle_completed_at: new Date().toISOString(),
                    cycle_started_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('entity_type', entityType);

            if (updateError) {
                console.error('Error updating cycle:', updateError);
            }
        } else {
            console.log(`\n📊 Cycle ${currentCycle} progress: ${count}/${totalCount} items completed (${Math.round(((count || 0) / (totalCount || 1)) * 100)}%)`);
        }
    } catch (error) {
        console.error('Error in checkAndIncrementCycle:', error);
    }
}

/**
 * Update cycle stats after batch processing
 */
export async function updateCycleStats(entityType: 'content' | 'people'): Promise<void> {
    const tableName = entityType === 'content' ? 'content' : 'people';

    // Get current cycle
    const currentCycle = await getCurrentCycle(entityType);

    // Count total items
    const { count: totalCount } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

    // Count completed items (at current cycle or higher)
    const { count: completedCount } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .gte('enrichment_cycle', currentCycle);

    // Update stats
    await supabase
        .from('enrichment_cycles')
        .update({
            total_items: totalCount || 0,
            items_completed: completedCount || 0,
            updated_at: new Date().toISOString()
        })
        .eq('entity_type', entityType);
}
