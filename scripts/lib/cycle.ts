import { supabase } from './supabase';

export async function getCurrentCycle(entityType: 'content' | 'people'): Promise<number> {
    const { data, error } = await supabase
        .from('enrichment_cycles')
        .select('current_cycle')
        .eq('entity_type', entityType)
        .single();

    if (error || !data) return 0;
    return data.current_cycle;
}

export async function checkAndIncrementCycle(entityType: 'content' | 'people'): Promise<void> {
    const { data: cycleData, error } = await supabase
        .from('enrichment_cycles')
        .select('current_cycle, total_items, items_completed')
        .eq('entity_type', entityType)
        .single();

    if (error || !cycleData) return;

    const tableName = entityType === 'content' ? 'content' : 'people';
    const currentCycle = cycleData.current_cycle;

    const { count } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .gte('enrichment_cycle', currentCycle);

    const { count: totalCount } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

    if (!totalCount) return;

    if (count === totalCount) {
        let nextCycle = currentCycle + 1;
        if (nextCycle > 8) {
            nextCycle = 0;
            console.log(`\n🔄 Cycle 8 complete! Resetting to Cycle 0 for ${entityType}`);
        } else {
            console.log(`\n✅ Cycle ${currentCycle} complete! Moving to Cycle ${nextCycle} for ${entityType}`);
        }

        await supabase
            .from('enrichment_cycles')
            .update({
                current_cycle: nextCycle,
                cycle_completed_at: new Date().toISOString(),
                cycle_started_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('entity_type', entityType);
    } else {
        console.log(`\n📊 Cycle ${currentCycle} progress: ${count}/${totalCount} (${Math.round(((count || 0) / totalCount) * 100)}%)`);
    }
}

export async function updateCycleStats(entityType: 'content' | 'people'): Promise<void> {
    const tableName = entityType === 'content' ? 'content' : 'people';
    const currentCycle = await getCurrentCycle(entityType);

    const { count: totalCount } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

    const { count: completedCount } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .gte('enrichment_cycle', currentCycle);

    await supabase
        .from('enrichment_cycles')
        .update({
            total_items: totalCount || 0,
            items_completed: completedCount || 0,
            updated_at: new Date().toISOString(),
        })
        .eq('entity_type', entityType);
}
