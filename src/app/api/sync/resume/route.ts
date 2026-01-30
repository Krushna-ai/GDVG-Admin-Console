import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/sync/resume
 * Resume the automated sync cron job
 */
export async function POST() {
    try {
        const supabase = await createClient();

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();

        // Update cron_status setting
        const { data, error } = await supabase
            .from('sync_settings')
            .update({
                setting_value: {
                    is_paused: false,
                    paused_at: null,
                    paused_by: null,
                    resumed_at: new Date().toISOString(),
                    resumed_by: user?.id || null,
                },
                updated_at: new Date().toISOString(),
                updated_by: user?.id || null,
            })
            .eq('setting_key', 'cron_status')
            .select()
            .single();

        if (error) throw error;

        // Log the resume action
        await supabase
            .from('sync_logs')
            .insert({
                sync_type: 'manual',
                started_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
                status: 'completed',
                summary: {
                    action: 'resume_cron',
                    resumed_by: user?.email || 'unknown',
                },
                triggered_by: user?.id || null,
            });

        return NextResponse.json({
            success: true,
            message: 'Sync cron resumed successfully',
            data,
            resumed_at: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error resuming sync:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
