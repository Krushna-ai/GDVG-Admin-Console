import { NextResponse } from 'next/server';
import { searchMulti } from '@/lib/tmdb/client';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('query');
        const page = parseInt(searchParams.get('page') || '1', 10);

        if (!query) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        const result = await searchMulti(query, page);

        return NextResponse.json(result);
    } catch (error) {
        console.error('TMDB search error:', error);
        return NextResponse.json(
            { error: 'Search failed' },
            { status: 500 }
        );
    }
}
