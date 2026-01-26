import { NextResponse } from 'next/server';
import { getFilteredExport } from '@/lib/services/exports.service';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const type = (searchParams.get('type') || 'tv') as 'movie' | 'tv';
        const minPopularity = parseInt(searchParams.get('minPopularity') || '20', 10);
        const maxItems = parseInt(searchParams.get('maxItems') || '500', 10);

        const result = await getFilteredExport(type, {
            minPopularity,
            maxItems,
            excludeAdult: true,
        });

        return NextResponse.json({
            totalCount: result.totalCount,
            filteredCount: result.filteredCount,
            date: result.date,
        });
    } catch (error) {
        console.error('Preview error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch export preview' },
            { status: 500 }
        );
    }
}
