import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    detectMetadataGaps,
    detectPopularityGaps,
    detectTemporalGaps,
    storeGaps,
} from '@/lib/services/gap.service';

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const body = await request.json().catch(() => ({}));
        const detectionType = body.type || 'metadata'; // Only metadata now

        let allGaps: any[] = [];
        const summary: any = {
            metadata: 0,
            total: 0,
        };

        // Run metadata detection only
        console.log('Running metadata gap detection...');
        const metadataGaps = await detectMetadataGaps();
        allGaps.push(...metadataGaps);
        summary.metadata = metadataGaps.length;

        summary.total = allGaps.length;

        // Store gaps in database
        const storedCount = await storeGaps(allGaps);

        // Log to sync_logs
        await supabase.from('sync_logs').insert({
            type: 'gap_detection',
            status: 'success',
            message: `Gap detection completed: ${storedCount} gaps found`,
            details: { summary, detection_type: detectionType },
            created_at: new Date().toISOString(),
        });

        return NextResponse.json({
            success: true,
            summary,
            stored: storedCount,
            message: `Found ${summary.total} gaps (${summary.metadata} metadata, ${summary.popularity} popularity, ${summary.temporal} temporal)`,
        });

    } catch (error) {
        console.error('Gap detection error:', error);

        // Log error
        const supabase = await createClient();
        await supabase.from('sync_logs').insert({
            type: 'gap_detection',
            status: 'error',
            message: `Gap detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: { error: String(error) },
            created_at: new Date().toISOString(),
        });

        return NextResponse.json(
            { error: 'Gap detection failed', details: String(error) },
            { status: 500 }
        );
    }
}
