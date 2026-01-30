import { NextResponse } from 'next/server';
import { getReportById } from '@/lib/services/quality-report.service';

/**
 * GET /api/quality-reports/[id]
 * Fetch single quality report by ID
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const report = await getReportById(id);

        if (!report) {
            return NextResponse.json({
                success: false,
                error: 'Report not found',
            }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            data: report,
        });
    } catch (error) {
        console.error('Error fetching quality report:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
