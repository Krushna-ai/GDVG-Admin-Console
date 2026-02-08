import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// GET - Fetch paginated content with filters
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const searchParams = request.nextUrl.searchParams;

        // Pagination params
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '25');

        // Filter params
        const search = searchParams.get('search') || '';
        const status = searchParams.get('status') || '';

        // Calculate range
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        // Build query
        let query = supabase
            .from('content')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false });

        // Apply filters
        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        if (search) {
            query = query.or(`title.ilike.%${search}%,original_title.ilike.%${search}%,tmdb_id.eq.${search}`);
        }

        // Apply pagination
        query = query.range(from, to);

        const { data: content, error, count } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const totalPages = Math.ceil((count || 0) / pageSize);

        return NextResponse.json({
            content,
            totalCount: count || 0,
            page,
            pageSize,
            totalPages
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 });
    }
}
