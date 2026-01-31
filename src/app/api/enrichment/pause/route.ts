import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/enrichment/pause
 * Pause enrichment cron jobs (pauses both content and people enrichment workflows)
 */
export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Update sync_settings - use JSONB structure
        const { error } = await supabase
            .from('sync_settings')
            .update({
                setting_value: {
                    is_paused: true,
                    paused_at: new Date().toISOString(),
                    paused_by: user.id,
                    resumed_at: null,
                    resumed_by: null,
                },
                updated_at: new Date().toISOString(),
                updated_by: user.id,
            })
            .eq('setting_key', 'cron_status');

        if (error) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Enrichment workflows paused',
        });

    } catch (error) {
        console.error('Error pausing enrichment:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
