import { NextResponse } from 'next/server';
import { enrichContent } from '@/lib/services/tmdb.service';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { tmdbId, contentType } = body;

        if (!tmdbId || !contentType) {
            return NextResponse.json(
                { error: 'tmdbId and contentType are required' },
                { status: 400 }
            );
        }

        if (contentType !== 'movie' && contentType !== 'tv') {
            return NextResponse.json(
                { error: 'contentType must be "movie" or "tv"' },
                { status: 400 }
            );
        }

        const result = await enrichContent(tmdbId, contentType);

        if (result.success) {
            return NextResponse.json({
                success: true,
                contentId: result.contentId,
            });
        } else {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('TMDB import error:', error);
        return NextResponse.json(
            { success: false, error: 'Import failed' },
            { status: 500 }
        );
    }
}
