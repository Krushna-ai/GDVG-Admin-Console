import { NextResponse } from 'next/server';
import { previewChanges } from '@/lib/services/sync.service';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate') || undefined;
        const endDate = searchParams.get('endDate') || undefined;

        const preview = await previewChanges(startDate, endDate);

        return NextResponse.json({
            success: true,
            ...preview,
        });
    } catch (error) {
        console.error('Sync preview error:', error);
        return NextResponse.json(
            { error: 'Failed to preview changes' },
            { status: 500 }
        );
    }
}
