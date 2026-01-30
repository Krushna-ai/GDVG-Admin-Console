import { createClient } from '@/lib/supabase/server';

// Interfaces matching quality_reports table schema
export interface PriorityItem {
    id: string;
    tmdb_id: number;
    name: string;
    missing: string[];
    popularity: number;
}

export interface QualityReport {
    id: string;
    report_type: 'content' | 'people' | 'full';
    total_checked: number;
    total_complete: number;
    total_issues: number;
    issues_by_field: Record<string, number>;
    priority_items: PriorityItem[];
    created_at: string;
}

export interface QualityReportSummary {
    completion_percentage: number;
    issues_percentage: number;
    top_missing_fields: Array<{ field: string; count: number }>;
}

/**
 * Fetch the most recent quality report by type
 */
export async function getLatestReport(type: 'content' | 'people' | 'full'): Promise<QualityReport | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('quality_reports')
        .select('*')
        .eq('report_type', type)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) return null;

    return data as QualityReport;
}

/**
 * Fetch paginated quality report history
 */
export async function getReportHistory(limit: number = 10): Promise<QualityReport[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('quality_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error || !data) return [];

    return data as QualityReport[];
}

/**
 * Fetch a single report by ID
 */
export async function getReportById(id: string): Promise<QualityReport | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('quality_reports')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) return null;

    return data as QualityReport;
}

/**
 * Calculate summary statistics from a quality report
 */
export function calculateReportSummary(report: QualityReport): QualityReportSummary {
    const completion_percentage = report.total_checked > 0
        ? Math.round((report.total_complete / report.total_checked) * 100)
        : 0;

    const issues_percentage = report.total_checked > 0
        ? Math.round((report.total_issues / report.total_checked) * 100)
        : 0;

    const top_missing_fields = Object.entries(report.issues_by_field)
        .map(([field, count]) => ({ field, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    return {
        completion_percentage,
        issues_percentage,
        top_missing_fields,
    };
}
