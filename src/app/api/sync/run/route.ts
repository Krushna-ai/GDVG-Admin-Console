import { NextResponse } from 'next/server';
import { runSync } from '@/lib/services/sync.service';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { movieIds, tvIds } = body;

        if (!Array.isArray(movieIds) || !Array.isArray(tvIds)) {
            return NextResponse.json(
                { error: 'movieIds and tvIds arrays are required' },
                { status: 400 }
            );
        }

        const result = await runSync(movieIds, tvIds);

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('Sync run error:', error);
        return NextResponse.json(
            { error: 'Failed to run sync' },
            { status: 500 }
        );
    }
}
