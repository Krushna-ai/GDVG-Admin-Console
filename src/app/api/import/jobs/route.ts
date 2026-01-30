import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/import/jobs
 * List import jobs with optional filtering
 */
export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);

        const status = searchParams.get('status');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');

        let query = supabase
            .from('import_jobs')
            .select('*', { count: 'exact' });

        // Filter by status
        if (status) {
            query = query.eq('status', status);
        }

        // Pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error, count } = await query
            .order('priority', { ascending: false })
            .order('created_at', { ascending: false })
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
        console.error('Error fetching import jobs:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * POST /api/import/jobs
 * Create a new import job
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { name, configuration, priority } = body;

        if (!name || !configuration) {
            return NextResponse.json({
                success: false,
                error: 'name and configuration are required',
            }, { status: 400 });
        }

        const { data: { user } } = await supabase.auth.getUser();

        const { data, error } = await supabase
            .from('import_jobs')
            .insert({
                name,
                configuration,
                priority: priority || 0,
                status: 'pending',
                created_by: user?.id,
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            success: true,
            data,
        });
    } catch (error) {
        console.error('Error creating import job:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
