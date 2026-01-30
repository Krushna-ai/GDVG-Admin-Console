import { NextResponse } from 'next/server';
import { getImportJobs } from '@/lib/services/import-job.service';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/import/jobs
 * List import jobs with optional filtering
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status') || undefined;

        const jobs = await getImportJobs(status);

        return NextResponse.json({
            success: true,
            data: jobs,
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
