import { supabase } from './lib/supabase';
import { addToEnrichmentQueue } from './lib/queue';

interface ValidationIssue {
    id: string;
    tmdb_id: number;
    title: string;
    content_type: 'movie' | 'tv';
    missing: string[];
    priority_score: number;
}

interface ValidationResult {
    total_checked: number;
    fully_complete: number;
    with_issues: number;
    issues_by_field: Record<string, number>;
    priority_list: ValidationIssue[];
    status_updates: { published: number; unchanged: number };
}

const PAGE_SIZE = 500;

function calculateContentQuality(content: any): number {
    let score = 0;
    if (content.title) score += 1;
    if (content.original_title) score += 0.5;
    if (content.overview?.length > 50) score += 1;
    if (content.tagline) score += 0.5;
    if (content.poster_path) score += 1;
    if (content.backdrop_path) score += 1;
    if (content.vote_average > 0) score += 0.5;
    if (content.content_rating) score += 0.5;
    if (content.origin_country?.length > 0) score += 0.5;
    return Math.round((score / 6.5) * 100);
}

async function fetchAllContent() {
    const rows: any[] = [];
    let offset = 0;
    while (true) {
        const { data, error } = await supabase
            .from('content')
            .select('id, tmdb_id, title, original_title, content_type, poster_path, backdrop_path, overview, tagline, runtime, number_of_episodes, number_of_seasons, status, release_date, first_air_date, vote_average, vote_count, popularity, tmdb_status, content_rating, origin_country')
            .order('popularity', { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw new Error(`Error fetching content: ${error.message}`);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }
    return rows;
}

async function fetchCastCrewCounts(): Promise<{ cast: Record<string, number>; crew: Record<string, number> }> {
    const cast: Record<string, number> = {};
    const crew: Record<string, number> = {};

    const { data: castData } = await supabase.from('content_cast').select('content_id');
    castData?.forEach(r => { cast[r.content_id] = (cast[r.content_id] || 0) + 1; });

    const { data: crewData } = await supabase.from('content_crew').select('content_id');
    crewData?.forEach(r => { crew[r.content_id] = (crew[r.content_id] || 0) + 1; });

    return { cast, crew };
}

async function validateContent(): Promise<ValidationResult> {
    console.log('🔍 Starting content validation...\n');

    const result: ValidationResult = {
        total_checked: 0,
        fully_complete: 0,
        with_issues: 0,
        issues_by_field: {},
        priority_list: [],
        status_updates: { published: 0, unchanged: 0 },
    };

    const allContent = await fetchAllContent();
    const { cast: castCounts, crew: crewCounts } = await fetchCastCrewCounts();

    result.total_checked = allContent.length;
    console.log(`✓ Loaded ${allContent.length} content items\n`);

    for (const content of allContent) {
        const missing: string[] = [];

        if (!content.poster_path) { missing.push('poster_path'); result.issues_by_field['poster_path'] = (result.issues_by_field['poster_path'] || 0) + 1; }
        if (!content.backdrop_path) { missing.push('backdrop_path'); result.issues_by_field['backdrop_path'] = (result.issues_by_field['backdrop_path'] || 0) + 1; }
        if (!content.overview?.trim()) { missing.push('overview'); result.issues_by_field['overview'] = (result.issues_by_field['overview'] || 0) + 1; }
        if (!content.tagline?.trim()) { missing.push('tagline'); result.issues_by_field['tagline'] = (result.issues_by_field['tagline'] || 0) + 1; }

        if (content.content_type === 'movie' && !content.runtime) { missing.push('runtime'); result.issues_by_field['runtime'] = (result.issues_by_field['runtime'] || 0) + 1; }
        if (content.content_type !== 'movie' && !content.number_of_episodes) { missing.push('number_of_episodes'); result.issues_by_field['number_of_episodes'] = (result.issues_by_field['number_of_episodes'] || 0) + 1; }
        if (content.content_type !== 'movie' && !content.number_of_seasons) { missing.push('number_of_seasons'); result.issues_by_field['number_of_seasons'] = (result.issues_by_field['number_of_seasons'] || 0) + 1; }

        if (content.content_type === 'movie' && !content.release_date) { missing.push('release_date'); result.issues_by_field['release_date'] = (result.issues_by_field['release_date'] || 0) + 1; }
        if (content.content_type !== 'movie' && !content.first_air_date) { missing.push('first_air_date'); result.issues_by_field['first_air_date'] = (result.issues_by_field['first_air_date'] || 0) + 1; }

        if (!content.status) { missing.push('status'); result.issues_by_field['status'] = (result.issues_by_field['status'] || 0) + 1; }
        if (!content.vote_average) { missing.push('vote_average'); result.issues_by_field['vote_average'] = (result.issues_by_field['vote_average'] || 0) + 1; }

        const castCount = castCounts[content.id] || 0;
        const crewCount = crewCounts[content.id] || 0;
        if (castCount < 5) { missing.push('cast (need 5+)'); result.issues_by_field['cast'] = (result.issues_by_field['cast'] || 0) + 1; }
        if (crewCount < 1) { missing.push('crew'); result.issues_by_field['crew'] = (result.issues_by_field['crew'] || 0) + 1; }

        // Auto-publish only (no auto-demotion)
        const quality = calculateContentQuality(content);
        let newStatus = content.status;
        if (quality >= 85) newStatus = 'published';

        if (newStatus !== content.status) {
            await supabase.from('content').update({ status: newStatus }).eq('id', content.id);
            result.status_updates.published++;
        } else {
            result.status_updates.unchanged++;
        }

        if (missing.length === 0) {
            result.fully_complete++;
        } else {
            result.with_issues++;
            result.priority_list.push({
                id: content.id,
                tmdb_id: content.tmdb_id,
                title: content.title,
                content_type: content.content_type,
                missing,
                priority_score: (content.status === 'published' ? 100 : 50) + Number(content.popularity || 0) - (missing.length * 5),
            });
        }
    }

    result.priority_list.sort((a, b) => b.priority_score - a.priority_score);
    return result;
}

function displayResults(result: ValidationResult) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 CONTENT VALIDATION RESULTS');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`✅ Fully Complete: ${result.fully_complete} / ${result.total_checked} (${Math.round(result.fully_complete / result.total_checked * 100)}%)`);
    console.log(`⚠️  With Issues: ${result.with_issues} / ${result.total_checked} (${Math.round(result.with_issues / result.total_checked * 100)}%)\n`);
    console.log('📋 Auto-Publish Status Updates:');
    console.log(`  ✅ Published (quality ≥85): ${result.status_updates.published}`);
    console.log(`  ⏸️  Unchanged: ${result.status_updates.unchanged}\n`);
    console.log('📋 Issues by Field:');
    Object.entries(result.issues_by_field)
        .sort((a, b) => b[1] - a[1])
        .forEach(([field, count]) => {
            const pct = Math.round(count / result.total_checked * 100);
            console.log(`  ${field.padEnd(25)} ${count.toString().padStart(4)} items (${pct}%)`);
        });
    console.log('\n🎯 Top 10 Priority Items:');
    result.priority_list.slice(0, 10).forEach((item, idx) => {
        console.log(`${(idx + 1).toString().padStart(2)}. [${item.content_type.toUpperCase()}] ${item.title}`);
        console.log(`    TMDB: ${item.tmdb_id} | Score: ${item.priority_score}`);
        console.log(`    Missing: ${item.missing.join(', ')}\n`);
    });
    console.log('═══════════════════════════════════════════════════════\n');
}

async function saveResults(result: ValidationResult) {
    const { error } = await supabase.from('quality_reports').insert({
        report_type: 'content',
        total_checked: result.total_checked,
        total_complete: result.fully_complete,
        total_issues: result.with_issues,
        issues_by_field: result.issues_by_field,
        priority_items: result.priority_list.slice(0, 100),
    });
    if (error) console.error('❌ Error saving report:', error);
    else console.log('✓ Report saved to quality_reports table\n');
}

async function autoQueueItems(result: ValidationResult) {
    console.log('🔄 Auto-queueing items with missing data...\n');
    let queued = 0, skipped = 0;

    for (const item of result.priority_list) {
        const ok = await addToEnrichmentQueue(item.id, 'content', item.missing.length, {
            title: item.title,
            tmdb_id: item.tmdb_id,
            missing_fields: item.missing,
        });
        ok ? queued++ : skipped++;
    }

    console.log(`✅ Queued ${queued} items for enrichment`);
    console.log(`⏭️  Skipped ${skipped} items (already queued/processing)\n`);
}

async function main() {
    try {
        const result = await validateContent();
        displayResults(result);
        await saveResults(result);
        await autoQueueItems(result);
    } catch (error) {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    }
}

main();
