// Client-side API helpers for quality reports

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

export async function getLatestReport(type: 'content' | 'people' | 'full'): Promise<QualityReport | null> {
    try {
        const res = await fetch(`/api/quality-reports?limit=10`);
        if (!res.ok) return null;

        const { data } = await res.json();
        const reports = data as QualityReport[];

        return reports.find(r => r.report_type === type) || null;
    } catch {
        return null;
    }
}

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
