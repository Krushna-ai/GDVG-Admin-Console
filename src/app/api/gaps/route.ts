import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/gaps
 * List gaps with optional filtering
 */
export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);

        const resolved = searchParams.get('resolved');
        const type = searchParams.get('type');
        const contentType = searchParams.get('content_type');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');

        let query = supabase
            .from('gap_registry')
            .select('*', { count: 'exact' });

        // Apply filters
        if (resolved !== null) {
            query = query.eq('is_resolved', resolved === 'true');
        }

        if (type) {
            query = query.eq('gap_type', type);
        }

        if (contentType) {
            query = query.eq('content_type', contentType);
        }

        // Pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error, count } = await query
            .order('priority_score', { ascending: false })
            .range(from, to);

        if (error) throw error;

        return NextResponse.json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit),
            },
        });
    } catch (error) {
        console.error('Error fetching gaps:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * POST /api/gaps
 * Register a new gap
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const body = await request.json();

        const { tmdb_id, content_type, gap_type, priority_score, skip_reason } = body;

        if (!tmdb_id || !content_type || !gap_type) {
            return NextResponse.json({
                success: false,
                error: 'tmdb_id, content_type, and gap_type are required',
            }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('gap_registry')
            .insert({
                tmdb_id,
                content_type,
                gap_type,
                priority_score: priority_score || 0,
                skip_reason,
            })
            .select()
            .single();

        if (error) {
            // Handle unique constraint violation
            if (error.code === '23505') {
                return NextResponse.json({
                    success: false,
                    error: 'Gap already exists for this TMDB ID and content type',
                }, { status: 409 });
            }
            throw error;
        }

        return NextResponse.json({
            success: true,
            data,
        });
    } catch (error) {
        console.error('Error creating gap:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
