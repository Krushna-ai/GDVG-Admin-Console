import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/sync/settings
 * Fetch all sync settings
 */
export async function GET() {
    try {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from('sync_settings')
            .select('*')
            .order('setting_key');

        if (error) throw error;

        // Transform array to object for easier access
        const settings: Record<string, any> = {};
        data?.forEach((setting) => {
            settings[setting.setting_key] = setting.setting_value;
        });

        return NextResponse.json({
            success: true,
            settings,
            raw: data,
        });
    } catch (error) {
        console.error('Error fetching sync settings:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * PUT /api/sync/settings
 * Update a specific setting
 */
export async function PUT(request: Request) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { setting_key, setting_value } = body;

        if (!setting_key || !setting_value) {
            return NextResponse.json({
                success: false,
                error: 'setting_key and setting_value are required',
            }, { status: 400 });
        }

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();

        const { data, error } = await supabase
            .from('sync_settings')
            .update({
                setting_value,
                updated_at: new Date().toISOString(),
                updated_by: user?.id || null,
            })
            .eq('setting_key', setting_key)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            success: true,
            data,
        });
    } catch (error) {
        console.error('Error updating sync settings:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
