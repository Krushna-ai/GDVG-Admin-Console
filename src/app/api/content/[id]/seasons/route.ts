import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { seasons } = await request.json();
        const supabase = await createClient();

        // 1. Identify which seasons need to be kept
        const incomingSeasonIds = seasons.map((s: any) => s.id).filter((sId: string) => !sId.startsWith('new-'));

        // Fetch current seasons for this content
        const { data: existingSeasons, error: fetchErr } = await supabase
            .from('seasons')
            .select('id')
            .eq('content_id', id);

        if (fetchErr) throw fetchErr;

        if (existingSeasons) {
            const existingIds = existingSeasons.map(s => s.id);
            const toDelete = existingIds.filter(eId => !incomingSeasonIds.includes(eId));

            // Delete seasons that are no longer in the payload
            if (toDelete.length > 0) {
                const { error: delErr } = await supabase
                    .from('seasons')
                    .delete()
                    .in('id', toDelete);
                if (delErr) throw delErr;
            }
        }

        // 2. Upsert each season and its episodes
        for (const season of seasons) {
            const isNewSeason = season.id.startsWith('new-');
            const seasonData = { ...season, content_id: id };
            delete seasonData.episodes; // Extracted

            if (isNewSeason) {
                delete seasonData.id;
            }

            // Upsert Season
            const { data: savedSeason, error: sErr } = await supabase
                .from('seasons')
                .upsert(seasonData)
                .select()
                .single();

            if (sErr) throw sErr;

            // Reconcile Episodes
            const localEps = season.episodes || [];
            const incomingEpIds = localEps.map((e: any) => e.id).filter((eId: string) => !eId.startsWith('new-'));

            const { data: existingEpisodes } = await supabase
                .from('episodes')
                .select('id')
                .eq('season_id', savedSeason.id);

            if (existingEpisodes) {
                const existingEpIds = existingEpisodes.map(e => e.id);
                const epsToDelete = existingEpIds.filter(eId => !incomingEpIds.includes(eId));
                if (epsToDelete.length > 0) {
                    await supabase
                        .from('episodes')
                        .delete()
                        .in('id', epsToDelete);
                }
            }

            // Prepare episodes for bulk upsert
            const episodesToUpsert = localEps.map((ep: any) => {
                const epData = { ...ep, season_id: savedSeason.id };
                if (epData.id.startsWith('new-')) {
                    delete epData.id;
                }
                return epData;
            });

            if (episodesToUpsert.length > 0) {
                const { error: eErr } = await supabase
                    .from('episodes')
                    .upsert(episodesToUpsert);
                if (eErr) throw eErr;
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Save Seasons Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
