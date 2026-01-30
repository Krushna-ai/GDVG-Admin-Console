import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/import/presets
 * List all presets (user's own + system presets)
 */
export async function GET() {
    try {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('import_presets')
            .select('*')
            .order('created_by', { ascending: true, nullsFirst: true }) // System presets first
            .order('use_count', { ascending: false });

        if (error) throw error;

        return NextResponse.json({
            success: true,
            data,
        });
    } catch (error) {
        console.error('Error fetching presets:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * POST /api/import/presets
 * Create a new preset
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { name, description, configuration } = body;

        if (!name || !configuration) {
            return NextResponse.json({
                success: false,
                error: 'name and configuration are required',
            }, { status: 400 });
        }

        const { data: { user } } = await supabase.auth.getUser();

        const { data, error } = await supabase
            .from('import_presets')
            .insert({
                name,
                description,
                configuration,
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
        console.error('Error creating preset:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
