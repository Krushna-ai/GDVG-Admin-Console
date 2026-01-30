import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/sync/logs
 * List sync logs with filtering and pagination
 */
export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);

        const type = searchParams.get('type');
        const status = searchParams.get('status');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');

        let query = supabase
            .from('sync_logs')
            .select('*', { count: 'exact' });

        // Apply filters
        if (type) {
            query = query.eq('sync_type', type);
        }

        if (status) {
            query = query.eq('status', status);
        }

        // Pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error, count } = await query
            .order('started_at', { ascending: false })
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
        console.error('Error fetching sync logs:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * POST /api/sync/logs
 * Create a new sync log entry (internal use)
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { sync_type, metadata } = body;

        if (!sync_type) {
            return NextResponse.json({
                success: false,
                error: 'sync_type is required',
            }, { status: 400 });
        }

        const { data: { user } } = await supabase.auth.getUser();

        const { data, error } = await supabase
            .from('sync_logs')
            .insert({
                sync_type,
                started_at: new Date().toISOString(),
                status: 'running',
                triggered_by: user?.id || null,
                metadata: metadata || {},
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            success: true,
            data,
        });
    } catch (error) {
        console.error('Error creating sync log:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
