import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// GET - Fetch paginated people with filters
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const searchParams = request.nextUrl.searchParams;

        // Pagination params
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '25');

        // Filter params
        const search = searchParams.get('search') || '';
        const department = searchParams.get('department') || '';

        // Calculate range
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        // Build query
        let query = supabase
            .from('people')
            .select('*', { count: 'exact' })
            .order('popularity', { ascending: false, nullsFirst: false });

        // Apply filters
        if (department && department !== 'all') {
            query = query.eq('known_for_department', department);
        }

        if (search) {
            query = query.or(`name.ilike.%${search}%,tmdb_id.eq.${search}`);
        }

        // Apply pagination
        query = query.range(from, to);

        const { data: people, error, count } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const totalPages = Math.ceil((count || 0) / pageSize);

        return NextResponse.json({
            people,
            totalCount: count || 0,
            page,
            pageSize,
            totalPages
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch people' }, { status: 500 });
    }
}
