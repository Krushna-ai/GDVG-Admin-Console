import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { supabase } from './lib/supabase';
import { getSeasonDetails, delay } from './lib/tmdb';
import { upsertSeason, upsertEpisode, SeasonRow, EpisodeRow } from './lib/database';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50', 10);
const START_FROM_ID = process.env.START_FROM_ID || null;
const DRY_RUN = process.env.DRY_RUN === 'true';
const SKIP_EXISTING = process.env.SKIP_EXISTING !== 'false'; // true by default

async function main() {
    console.log(`🎬 Starting TV Seasons & Episodes Enrichment`);
    console.log(`Settings: BATCH_SIZE=${BATCH_SIZE}, DRY_RUN=${DRY_RUN}, SKIP_EXISTING=${SKIP_EXISTING}`);
    if (START_FROM_ID) console.log(`Starting from ID: ${START_FROM_ID}`);

    let processedCount = 0;
    let hasMore = true;
    let lastId = START_FROM_ID || '00000000-0000-0000-0000-000000000000';

    while (hasMore) {
        let shows: any[] | null = null;
        let error: any = null;

        if (SKIP_EXISTING) {
            const result = await supabase.rpc('get_incomplete_tv_shows', {
                limit_num: BATCH_SIZE,
                start_id: (START_FROM_ID && processedCount === 0) ? START_FROM_ID : lastId
            });
            shows = result.data;
            error = result.error;
        } else {
            let query = supabase
                .from('content')
                .select('id, tmdb_id, title, number_of_seasons')
                .eq('content_type', 'tv')
                .gt('number_of_seasons', 0)
                .order('id', { ascending: true })
                .limit(BATCH_SIZE);

            if (START_FROM_ID && processedCount === 0) {
                query = query.gte('id', START_FROM_ID);
            } else if (processedCount > 0) {
                query = query.gt('id', lastId);
            }
            const result = await query;
            shows = result.data;
            error = result.error;
        }

        if (error) {
            console.error('❌ Error fetching TV shows:', error);
            process.exit(1);
        }

        if (!shows || shows.length === 0) {
            hasMore = false;
            break;
        }

        for (const show of shows) {
            processedCount++;
            lastId = show.id;

            const numSeasons = show.number_of_seasons;
            console.log(`\n[${processedCount}] Processing: ${show.title} - ${numSeasons} seasons (TMDB ID: ${show.tmdb_id})`);

            if (!numSeasons) {
                console.log(`  ⚠️  number_of_seasons is null or 0. Skipping.`);
                continue;
            }

            let savedSeasons = 0;
            let savedEpisodes = 0;

            for (let s = 1; s <= numSeasons; s++) {
                try {
                    if (SKIP_EXISTING && !DRY_RUN) {
                        const { data: existingSeason } = await supabase
                            .from('seasons')
                            .select('id')
                            .eq('content_id', show.id)
                            .eq('season_number', s)
                            .single();

                        if (existingSeason) {
                            console.log(`  ⏭️  Season ${s} already exists. Skipping.`);
                            continue;
                        }
                    }

                    console.log(`  ⬇️  Fetching Season ${s}...`);
                    if (!DRY_RUN) await delay(100);

                    // Fetch from TMDB
                    let seasonData;
                    try {
                        seasonData = await getSeasonDetails(show.tmdb_id, s);
                    } catch (err: any) {
                        if (err.message && err.message.includes('404')) {
                            console.log(`  ⚠️  Season ${s} returned 404 from TMDB. Marking as 0 episodes.`);
                            if (!DRY_RUN) {
                                await upsertSeason({
                                    content_id: show.id,
                                    tmdb_id: show.tmdb_id, // We might not have a season TMDB ID, fallback to show's or 0 if needed (schema requires tmdb_id)
                                    season_number: s,
                                    episode_count: 0
                                });
                            }
                            continue;
                        } else {
                            throw err; // Re-throw other errors
                        }
                    }

                    if (!seasonData) continue;

                    let seasonId = 'dry-run-season-id';

                    if (!DRY_RUN) {
                        // Insert Season
                        const seasonRow: SeasonRow = {
                            content_id: show.id,
                            tmdb_id: seasonData.id,
                            season_number: seasonData.season_number,
                            name: seasonData.name,
                            overview: seasonData.overview,
                            air_date: seasonData.air_date,
                            episode_count: seasonData.episodes ? seasonData.episodes.length : 0,
                            poster_path: seasonData.poster_path
                        };
                        seasonId = await upsertSeason(seasonRow);
                    }
                    savedSeasons++;

                    // Insert Episodes
                    if (seasonData.episodes && seasonData.episodes.length > 0) {
                        for (const ep of seasonData.episodes) {
                            if (!DRY_RUN) {
                                const episodeRow: EpisodeRow = {
                                    content_id: show.id,
                                    season_id: seasonId,
                                    tmdb_id: ep.id,
                                    season_number: seasonData.season_number,
                                    episode_number: ep.episode_number,
                                    name: ep.name,
                                    overview: ep.overview,
                                    air_date: ep.air_date,
                                    runtime: ep.runtime,
                                    still_path: ep.still_path,
                                    vote_average: ep.vote_average,
                                    vote_count: ep.vote_count,
                                    production_code: ep.production_code,
                                    // Crew and guest_stars arrays maps directly to jsonb
                                    guest_stars: ep.guest_stars,
                                    crew: ep.crew
                                };
                                await upsertEpisode(episodeRow);
                            }
                            savedEpisodes++;
                        }
                    }
                } catch (error: any) {
                    console.error(`  ❌ Error processing Season ${s} for ${show.title}:`, error.message);
                }
            } // end season loop

            console.log(`  ✅ ${show.title}: ${savedSeasons} seasons, ${savedEpisodes} episodes saved`);
        } // end shows loop
    }

    console.log(`\n🎉 Finished processing ${processedCount} TV shows!`);
    process.exit(0);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
