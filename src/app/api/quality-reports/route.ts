import { NextResponse } from 'next/server';
import { getReportHistory } from '@/lib/services/quality-report.service';

/**
 * GET /api/quality-reports
 * List all quality reports with pagination
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '10');

        const reports = await getReportHistory(limit);

        return NextResponse.json({
            success: true,
            data: reports,
        });
    } catch (error) {
        console.error('Error fetching quality reports:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
