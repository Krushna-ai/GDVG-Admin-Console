import { supabase } from './supabase';
import { getWikidataById, getWikidataByTmdbId } from './wikidata';
import { Award, upsertAwards } from './database';

export async function enrichContentWithWiki(contentId: string): Promise<{ success: boolean; error?: string }> {
    try {
        // 1. Fetch existing content
        const { data: content, error: fetchError } = await supabase
            .from('content')
            .select('*')
            .eq('id', contentId)
            .single();

        if (fetchError || !content) {
            return { success: false, error: fetchError?.message || 'Content not found' };
        }

        const externalIds = content.external_ids || {};
        const wikidataId = externalIds.wikidata_id;
        const imdbId = externalIds.imdb_id;
        const contentType = content.content_type;
        const tmdbId = content.tmdb_id;

        console.log(`\n  🌐 Starting Wikipedia/Wikidata Enrichment for: ${content.title} (${contentType} ${tmdbId})`);

        // 2. Fetch Wikidata
        let wikidataResult;
        if (wikidataId) {
            console.log(`  🔍 Using Wikidata ID from TMDB: ${wikidataId}`);
            wikidataResult = await getWikidataById(wikidataId);
        } else {
            console.log(`  🔍 Querying Wikidata by TMDB ID`);
            wikidataResult = await getWikidataByTmdbId(tmdbId, contentType, imdbId);
        }

        const wikipediaTitle = wikidataResult?.wikipedia_title;
        const wikipediaUrl = wikidataResult?.wikipedia_url;

        let overviewEnrichment: { overview?: string, overview_source?: string, wikipedia_url?: string } = {};

        // 3. Fetch Wikipedia (TEMPORARILY DISABLED)
        /*
        if (wikipediaTitle) {
            try {
                const wikiSummary = await getContentSummary(wikipediaTitle, 'en');
                console.log(`  🌐 Fetching full article sections for: ${wikipediaTitle}`);
                const wikiData = await parseArticleForContent(wikipediaTitle, 'en');

                if (wikiSummary && wikiSummary.extract) {
                    console.log(`  ✅ Using Wikipedia overview (${wikiSummary.extract.length} chars)`);
                    overviewEnrichment = {
                        overview: wikiSummary.extract,
                        overview_source: 'wikipedia',
                        wikipedia_url: wikiSummary.page_url || wikipediaUrl,
                        ...wikiData
                    };
                } else if (Object.keys(wikiData).length > 0) {
                    overviewEnrichment = {
                        wikipedia_url: wikipediaUrl,
                        ...wikiData
                    };
                }
            } catch (err) {
                console.error(`  ❌ Error fetching Wikipedia article sections:`, err);
            }
        } else {
            console.log(`  ℹ️  No Wikipedia title found in Wikidata`);
        }
        */

        // 4. Merge Data
        const updates: any = {};

        // Overview
        if (overviewEnrichment.overview) {
            updates.overview = overviewEnrichment.overview;
            updates.overview_source = overviewEnrichment.overview_source;
        }
        if (overviewEnrichment.wikipedia_url) {
            updates.wikipedia_url = overviewEnrichment.wikipedia_url;
        }

        // WikiArticleData Fields (DISABLED)
        /*
        const wikiFields: (keyof WikiArticleData)[] = [
            'wiki_plot', 'wiki_production', 'wiki_cast_notes', 'wiki_accolades',
            'wiki_reception', 'wiki_soundtrack', 'wiki_release', 'wiki_episode_guide'
        ];

        for (const field of wikiFields) {
            const newValue = (overviewEnrichment as any)[field];
            if (newValue && newValue.trim() !== '') {
                if (!content[field] || (typeof content[field] === 'string' && content[field].trim() === '')) {
                    updates[field] = newValue.trim();
                }
            }
        }
        */

        // Wikidata fields
        if (wikidataResult) {
            if (wikidataResult.original_network && !content.original_network) {
                updates.original_network = wikidataResult.original_network;
            }
            if (wikidataResult.based_on && !content.based_on) updates.based_on = wikidataResult.based_on;
            if (wikidataResult.filming_location && !content.filming_location) updates.filming_location = wikidataResult.filming_location;
            if (wikidataResult.narrative_location && !content.narrative_location) updates.narrative_location = wikidataResult.narrative_location;
            if (wikidataResult.box_office && !content.box_office) updates.box_office = wikidataResult.box_office;

            let updatedExternalIds = false;
            if (wikidataResult.rt_id && !externalIds.rotten_tomatoes_id) { externalIds.rotten_tomatoes_id = wikidataResult.rt_id; updatedExternalIds = true; }
            if (wikidataResult.mc_id && !externalIds.metacritic_id) { externalIds.metacritic_id = wikidataResult.mc_id; updatedExternalIds = true; }
            if (wikidataResult.mdl_id && !externalIds.mydramalist_id) { externalIds.mydramalist_id = wikidataResult.mdl_id; updatedExternalIds = true; }

            if (updatedExternalIds) {
                updates.external_ids = externalIds;
            }

            // Native standard properties fallbacks (if TMDB missed them)
            if (wikidataResult.duration && !content.runtime) {
                updates.runtime = Math.round(wikidataResult.duration);
            }
            if (wikidataResult.production_companies?.length && (!content.production_companies || content.production_companies.length === 0)) {
                // Mocking TMDB object structure for production companies
                updates.production_companies = wikidataResult.production_companies.map(name => ({ name, id: 0 }));
            }
            if (wikidataResult.country_of_origin?.length && (!content.origin_country || content.origin_country.length === 0)) {
                updates.origin_country = wikidataResult.country_of_origin;
            }
            if (wikidataResult.original_language?.length && (!content.spoken_languages || content.spoken_languages.length === 0)) {
                // Mocking TMDB object structure for spoken languages
                updates.spoken_languages = wikidataResult.original_language.map(name => ({ english_name: name, iso_639_1: '', name: name }));
            }

            // Extended Metadata JSONB
            const metadataUpdates: any = content.wikidata_metadata || {};
            let hasMetadataUpdates = false;

            if (wikidataResult.filming_start && !metadataUpdates.filming_start) { metadataUpdates.filming_start = wikidataResult.filming_start; hasMetadataUpdates = true; }
            if (wikidataResult.filming_end && !metadataUpdates.filming_end) { metadataUpdates.filming_end = wikidataResult.filming_end; hasMetadataUpdates = true; }
            if (wikidataResult.aspect_ratio && !metadataUpdates.aspect_ratio) { metadataUpdates.aspect_ratio = wikidataResult.aspect_ratio; hasMetadataUpdates = true; }
            if (wikidataResult.distributors?.length && !metadataUpdates.distributors) { metadataUpdates.distributors = wikidataResult.distributors; hasMetadataUpdates = true; }

            if (hasMetadataUpdates) {
                updates.wikidata_metadata = metadataUpdates;
            }

            // Genres
            if (wikidataResult.genres && wikidataResult.genres.length > 0) {
                // Merge carefully without removing existing
                const existingGenres = content.genres || [];
                const mergedGenres = [...new Set([...existingGenres, ...wikidataResult.genres])];
                if (mergedGenres.length > existingGenres.length) {
                    updates.genres = mergedGenres;
                }
            }
        }

        if (Object.keys(updates).length > 0) {
            console.log(`  💾 Saving updates to Supabase:`, JSON.stringify(updates, null, 2));
            const { error: updateError } = await supabase
                .from('content')
                .update(updates)
                .eq('id', contentId);

            if (updateError) {
                return { success: false, error: updateError.message };
            }
        }

        // 5. Save Awards
        if (wikidataResult?.awards && wikidataResult.awards.length > 0) {
            console.log(`\n🏆 Saving awards to database...`);
            await upsertAwards(contentId, null, wikidataResult.awards);
            console.log(`  ✅ Saved ${wikidataResult.awards.length} awards`);
        }

        return { success: true };

    } catch (e: any) {
        console.error('Error enriching wiki data:', e);
        return { success: false, error: e.message || String(e) };
    }
}
