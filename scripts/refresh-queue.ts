import { supabase } from './lib/supabase';

const INCLUDE_CONTENT = process.env.INCLUDE_CONTENT !== 'false';
const INCLUDE_PEOPLE = process.env.INCLUDE_PEOPLE !== 'false';
const PAGE_SIZE = 500;

async function fetchAllContent() {
    const rows: any[] = [];
    let offset = 0;
    while (true) {
        const { data, error } = await supabase
            .from('content')
            .select('id, tmdb_id, title, content_type, poster_path, backdrop_path, overview, tagline, runtime, number_of_episodes, number_of_seasons, status, release_date, first_air_date, vote_average, vote_count')
            .order('popularity', { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw new Error(`Failed to fetch content: ${error.message}`);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }
    return rows;
}

async function fetchAllPeople() {
    const rows: any[] = [];
    let offset = 0;
    while (true) {
        const { data, error } = await supabase
            .from('people')
            .select('id, tmdb_id, name, profile_path, biography, birthday, deathday, known_for_department')
            .order('popularity', { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw new Error(`Failed to fetch people: ${error.message}`);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }
    return rows;
}

async function main() {
    console.log('🔄 Refreshing Enrichment Queue\n');
    console.log(`Include Content: ${INCLUDE_CONTENT}`);
    console.log(`Include People: ${INCLUDE_PEOPLE}\n`);

    // Clear existing queue
    console.log('📋 Clearing existing queue...');
    const { error: clearError } = await supabase
        .from('enrichment_queue')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

    if (clearError) throw new Error(`Failed to clear queue: ${clearError.message}`);
    console.log('✅ Queue cleared\n');

    const queueItems: any[] = [];

    if (INCLUDE_CONTENT) {
        console.log('🎬 Scanning content for gaps...');
        const allContent = await fetchAllContent();

        const { data: castData } = await supabase.from('content_cast').select('content_id');
        const { data: crewData } = await supabase.from('content_crew').select('content_id');

        const castCounts: Record<string, number> = {};
        const crewCounts: Record<string, number> = {};
        castData?.forEach(r => { castCounts[r.content_id] = (castCounts[r.content_id] || 0) + 1; });
        crewData?.forEach(r => { crewCounts[r.content_id] = (crewCounts[r.content_id] || 0) + 1; });

        console.log(`Found ${allContent.length} content items`);

        for (const content of allContent) {
            const missing: string[] = [];
            if (!content.poster_path) missing.push('poster_path');
            if (!content.backdrop_path) missing.push('backdrop_path');
            if (!content.overview) missing.push('overview');
            if (!content.tagline) missing.push('tagline');
            if (content.content_type === 'movie' && !content.runtime) missing.push('runtime');
            if (content.content_type !== 'movie' && !content.number_of_episodes) missing.push('number_of_episodes');
            if (content.content_type !== 'movie' && !content.number_of_seasons) missing.push('number_of_seasons');
            if (content.content_type === 'movie' && !content.release_date) missing.push('release_date');
            if (content.content_type !== 'movie' && !content.first_air_date) missing.push('first_air_date');
            if (!content.status) missing.push('status');
            if (!content.vote_average) missing.push('vote_average');
            if (!content.vote_count) missing.push('vote_count');
            if ((castCounts[content.id] || 0) < 5) missing.push('cast');
            if ((crewCounts[content.id] || 0) < 1) missing.push('crew');

            if (missing.length > 0) {
                queueItems.push({ entity_id: content.id, queue_type: 'content', priority: missing.length, status: 'pending', metadata: { title: content.title, tmdb_id: content.tmdb_id, missing_fields: missing }, retry_count: 0, max_retries: 3 });
            }
        }
        console.log(`✅ Found ${queueItems.filter(i => i.queue_type === 'content').length} content items with gaps\n`);
    }

    if (INCLUDE_PEOPLE) {
        console.log('👤 Scanning people for gaps...');
        const allPeople = await fetchAllPeople();
        console.log(`Found ${allPeople.length} people`);

        for (const person of allPeople) {
            const missing: string[] = [];
            if (!person.profile_path) missing.push('profile_path');
            if (!person.biography) missing.push('biography');
            if (!person.birthday) missing.push('birthday');
            if (!person.known_for_department) missing.push('known_for_department');

            if (missing.length > 0) {
                queueItems.push({ entity_id: person.id, queue_type: 'people', priority: missing.length, status: 'pending', metadata: { name: person.name, tmdb_id: person.tmdb_id, missing_fields: missing }, retry_count: 0, max_retries: 3 });
            }
        }
        console.log(`✅ Found ${queueItems.filter(i => i.queue_type === 'people').length} people with gaps\n`);
    }

    if (queueItems.length > 0) {
        console.log(`📥 Inserting ${queueItems.length} items into queue...`);
        const batchSize = 500;
        for (let i = 0; i < queueItems.length; i += batchSize) {
            const batch = queueItems.slice(i, i + batchSize);
            const { error } = await supabase.from('enrichment_queue').insert(batch);
            if (error) throw new Error(`Failed to insert batch: ${error.message}`);
            console.log(`  Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(queueItems.length / batchSize)}`);
        }
        console.log('✅ All items inserted\n');
    }

    const contentCount = queueItems.filter(i => i.queue_type === 'content').length;
    const peopleCount = queueItems.filter(i => i.queue_type === 'people').length;

    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 QUEUE REFRESH SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total Items: ${queueItems.length}`);
    console.log(`  Content: ${contentCount}`);
    console.log(`  People: ${peopleCount}`);
    console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
