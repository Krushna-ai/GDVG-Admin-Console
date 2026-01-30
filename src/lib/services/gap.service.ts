import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Get the latest quality report from the database
 * This replaces the heavy real-time detection
 */
export async function getLatestQualityReport(type: 'content' | 'people' = 'content') {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the latest report of the specified type
    const { data, error } = await supabase
        .from('quality_reports')
        .select('*')
        .eq('report_type', type)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        console.error(`Error fetching ${type} quality report:`, error);
        return null;
    }

    return data;
}

// Deprecated functions - kept as stubs to prevent import errors during transition
// These will be removed completely in the next cleanup pass

export async function detectMetadataGaps() {
    console.log('⚠️ detectMetadataGaps is deprecated. Reading from quality_reports instead.');
    const report = await getLatestQualityReport('content');
    return report ? (report.priority_items || []) : [];
}

export async function detectPopularityGaps() {
    return [];
}

export async function detectTemporalGaps() {
    return [];
}

export async function storeGaps(gaps: any[]) {
    // No-op
    return 0;
}

