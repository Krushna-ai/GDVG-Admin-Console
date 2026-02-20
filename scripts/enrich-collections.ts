import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { supabase } from './lib/supabase';
import { getCollectionDetails, delay } from './lib/tmdb';
import { upsertCollection, CollectionRow } from './lib/database';

const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = 1000; // Large batch size since we're just querying existing DB rows

async function main() {
    console.log(`🎬 Starting Collections Enrichment`);
    console.log(`Settings: DRY_RUN=${DRY_RUN}`);

    let processedCount = 0;
    let hasMore = true;
    let lastId = '00000000-0000-0000-0000-000000000000';

    // Map of TMDB Collection ID to internal database UUID
    const collectionCache = new Map<number, string>();

    while (hasMore) {
        let query = supabase
            .from('content')
            .select('id, tmdb_id, title, belongs_to_collection')
            .not('belongs_to_collection', 'is', null)
            .order('id', { ascending: true })
            .limit(BATCH_SIZE);

        if (processedCount > 0) {
            query = query.gt('id', lastId);
        }

        const { data: shows, error } = await query;

        if (error) {
            console.error('❌ Error fetching content with collections:', error);
            process.exit(1);
        }

        if (!shows || shows.length === 0) {
            hasMore = false;
            break;
        }

        for (const show of shows) {
            processedCount++;
            lastId = show.id;

            const collectionDataRaw = show.belongs_to_collection;
            // Parse if it's a string, otherwise use directly if JSON
            const collectionIdData = typeof collectionDataRaw === 'string' ? JSON.parse(collectionDataRaw) : collectionDataRaw;

            if (!collectionIdData || !collectionIdData.id) {
                continue; // Malformed collection data
            }

            const tmdbCollectionId = collectionIdData.id;
            let internalUuid = collectionCache.get(tmdbCollectionId);

            if (!internalUuid) {
                console.log(`\n[${processedCount}] Fetching Collection: ${collectionIdData.name} (TMDB ID: ${tmdbCollectionId}) for "${show.title}"`);

                try {
                    let collectionDetails;
                    if (!DRY_RUN) {
                        collectionDetails = await getCollectionDetails(tmdbCollectionId);
                    } else {
                        // Mock details for dry run
                        collectionDetails = {
                            id: tmdbCollectionId,
                            name: collectionIdData.name || 'Mock Collection',
                            overview: 'Mock overview',
                            poster_path: null,
                            backdrop_path: null,
                            parts: []
                        };
                        console.log(`  ⬇️  [DRY RUN] Would fetch collection ${tmdbCollectionId}`);
                    }

                    if (!DRY_RUN) {
                        const collectionRow: CollectionRow = {
                            tmdb_id: collectionDetails.id,
                            name: collectionDetails.name,
                            overview: collectionDetails.overview,
                            poster_path: collectionDetails.poster_path,
                            backdrop_path: collectionDetails.backdrop_path,
                            parts: collectionDetails.parts
                        };

                        internalUuid = await upsertCollection(collectionRow);
                        console.log(`  ✅ Saved Collection ${tmdbCollectionId} -> ${internalUuid}`);
                    } else {
                        internalUuid = `dry-run-uuid-${tmdbCollectionId}`;
                    }

                    // Cache it
                    collectionCache.set(tmdbCollectionId, internalUuid);

                } catch (err: any) {
                    console.error(`  ❌ Error fetching/saving collection ${tmdbCollectionId}:`, err.message);
                    continue; // Skip updating content if collection fails
                }
            } else {
                console.log(`\n[${processedCount}] Reusing Collection: ${collectionIdData.name} (TMDB ID: ${tmdbCollectionId}) for "${show.title}"`);
            }

            // Update content record with the collection UUID
            if (!DRY_RUN && internalUuid) {
                const { error: updateError } = await supabase
                    .from('content')
                    .update({ collection_id: internalUuid })
                    .eq('id', show.id);

                if (updateError) {
                    console.error(`  ❌ Error linking collection to content ${show.id}:`, updateError.message);
                } else {
                    console.log(`  🔗 Linked "${show.title}" to collection ${internalUuid}`);
                }
            } else if (DRY_RUN) {
                console.log(`  🔗 [DRY RUN] Would link "${show.title}" to collection ${internalUuid}`);
            }
        }
    }

    console.log(`\n🎉 Finished processing ${processedCount} content items with collections!`);
    console.log(`📊 Cached/Processed ${collectionCache.size} unique collections.`);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
