'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface CycleStatsProps {
    entityType: 'content' | 'people';
}

interface CycleInfo {
    current_cycle: number;
    total_items: number;
    items_completed: number;
}

export default function CycleStats({ entityType }: CycleStatsProps) {
    const [cycleInfo, setCycleInfo] = useState<CycleInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCycleStats();
        // Refresh every 30 seconds
        const interval = setInterval(fetchCycleStats, 30000);
        return () => clearInterval(interval);
    }, [entityType]);

    const fetchCycleStats = async () => {
        const supabase = createClient();

        const { data, error } = await supabase
            .from('enrichment_cycles')
            .select('current_cycle, total_items, items_completed')
            .eq('entity_type', entityType)
            .single();

        if (!error && data) {
            setCycleInfo(data);
        }
        setLoading(false);
    };

    if (loading || !cycleInfo) return null;

    const progress = cycleInfo.total_items > 0
        ? Math.round((cycleInfo.items_completed / cycleInfo.total_items) * 100)
        : 0;

    return (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-1">
                        Enrichment Cycle {cycleInfo.current_cycle}
                    </h3>
                    <p className="text-xs text-gray-600">
                        {cycleInfo.items_completed} of {cycleInfo.total_items} items enriched
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">{progress}%</div>
                    <div className="text-xs text-gray-500">Complete</div>
                </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {progress === 100 && (
                <div className="mt-2 text-xs text-green-600 font-medium">
                    ✓ Cycle complete! Ready to move to next cycle.
                </div>
            )}
        </div>
    );
}
