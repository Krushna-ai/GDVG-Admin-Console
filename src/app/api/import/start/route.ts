import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface StartImportRequest {
    content_type: 'movie' | 'tv' | 'both';
    origin_countries: string[];
    min_popularity?: number;
    max_items?: number;
    release_date_from?: string;
    release_date_to?: string;
    genres?: number[];
    popularity_priority?: number;
    check_duplicates?: boolean;
    update_existing?: boolean;
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body: StartImportRequest = await request.json();

        // Validate required fields
        if (!body.origin_countries || body.origin_countries.length === 0) {
            return NextResponse.json(
                { error: 'At least one origin country is required' },
                { status: 400 }
            );
        }

        // Create import job record
        const { data: job, error: jobError } = await supabase
            .from('import_jobs')
            .insert({
                status: 'pending',
                config: body,
                progress: 0,
                total_items: 0,
                processed_items: 0,
                created_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (jobError || !job) {
            console.error('Failed to create import job:', jobError);
            return NextResponse.json(
                { error: 'Failed to create import job' },
                { status: 500 }
            );
        }

        // Log to sync_logs
        await supabase.from('sync_logs').insert({
            type: 'bulk_import',
            status: 'pending',
            message: `Bulk import job created: ${job.id}`,
            details: { job_id: job.id, config: body },
            created_at: new Date().toISOString(),
        });

        // Return job ID for tracking
        return NextResponse.json({
            job_id: job.id,
            status: 'pending',
            message: 'Import job created successfully',
        });

    } catch (error) {
        console.error('Import start error:', error);
        return NextResponse.json(
            { error: 'Failed to start import' },
            { status: 500 }
        );
    }
}
