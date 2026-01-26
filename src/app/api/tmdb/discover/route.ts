import { NextResponse } from 'next/server';
import {
    discoverKoreanDramas,
    discoverChineseDramas,
    discoverAnime,
    discoverThaiDramas,
    discoverTurkishDramas,
    discoverIndianDramas,
    discoverBollywood,
} from '@/lib/tmdb/client';

const discoverFunctions: Record<string, (page: number) => Promise<any>> = {
    korean: discoverKoreanDramas,
    chinese: discoverChineseDramas,
    japanese: discoverAnime,
    thai: discoverThaiDramas,
    turkish: discoverTurkishDramas,
    indian: discoverIndianDramas,
    bollywood: discoverBollywood,
};

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'korean';
        const page = parseInt(searchParams.get('page') || '1', 10);

        const discoverFn = discoverFunctions[type];

        if (!discoverFn) {
            return NextResponse.json(
                { error: `Unknown discover type: ${type}` },
                { status: 400 }
            );
        }

        const result = await discoverFn(page);

        return NextResponse.json(result);
    } catch (error) {
        console.error('TMDB discover error:', error);
        return NextResponse.json(
            { error: 'Discover failed' },
            { status: 500 }
        );
    }
}
