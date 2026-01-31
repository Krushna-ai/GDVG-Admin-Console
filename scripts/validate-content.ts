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
}

/**
 * Comprehensive content validation - checks ALL fields
 */
async function validateContent(): Promise<ValidationResult> {
    console.log('🔍 Starting content validation for all 1096 items...\n');

    const result: ValidationResult = {
        total_checked: 0,
        fully_complete: 0,
        with_issues: 0,
        issues_by_field: {},
        priority_list: [],
    };

    // Fetch ALL content
    const { data: allContent, error } = await supabase
        .from('content')
        .select(`
            id,
            tmdb_id,
            title,
            content_type,
            poster_path,
            backdrop_path,
            overview,
            tagline,
            runtime,
            number_of_episodes,
            number_of_seasons,
            status,
            release_date,
            first_air_date,
            vote_average,
            vote_count,
            popularity,
            tmdb_status
        `)
        .order('popularity', { ascending: false });

    if (error || !allContent) {
        console.error('❌ Error fetching content:', error);
        return result;
    }

    result.total_checked = allContent.length;
    console.log(`✓ Loaded ${allContent.length} content items\n`);

    // Check cast/crew counts for all content
    const { data: castCounts } = await supabase
        .from('content_cast')
        .select('content_id')
        .then(res => {
            const counts: Record<string, number> = {};
            res.data?.forEach(row => {
                counts[row.content_id] = (counts[row.content_id] || 0) + 1;
            });
            return { data: counts };
        });

    const { data: crewCounts } = await supabase
        .from('content_crew')
        .select('content_id')
        .then(res => {
            const counts: Record<string, number> = {};
            res.data?.forEach(row => {
                counts[row.content_id] = (counts[row.content_id] || 0) + 1;
            });
            return { data: counts };
        });

    // Validate each content item
    for (const content of allContent) {
        const missing: string[] = [];

        // Core visual assets
        if (!content.poster_path) {
            missing.push('poster_path');
            result.issues_by_field['poster_path'] = (result.issues_by_field['poster_path'] || 0) + 1;
        }
        if (!content.backdrop_path) {
            missing.push('backdrop_path');
            result.issues_by_field['backdrop_path'] = (result.issues_by_field['backdrop_path'] || 0) + 1;
        }

        // Text content
        if (!content.overview || content.overview.trim() === '') {
            missing.push('overview');
            result.issues_by_field['overview'] = (result.issues_by_field['overview'] || 0) + 1;
        }
        if (!content.tagline || content.tagline.trim() === '') {
            missing.push('tagline');
            result.issues_by_field['tagline'] = (result.issues_by_field['tagline'] || 0) + 1;
        }

        // Runtime/episodes
        if (content.content_type === 'movie' && !content.runtime) {
            missing.push('runtime');
            result.issues_by_field['runtime'] = (result.issues_by_field['runtime'] || 0) + 1;
        }
        if (content.content_type === 'tv') {
            if (!content.number_of_episodes) {
                missing.push('number_of_episodes');
                result.issues_by_field['number_of_episodes'] = (result.issues_by_field['number_of_episodes'] || 0) + 1;
            }
            if (!content.number_of_seasons) {
                missing.push('number_of_seasons');
                result.issues_by_field['number_of_seasons'] = (result.issues_by_field['number_of_seasons'] || 0) + 1;
            }
        }

        // Dates
        if (content.content_type === 'movie' && !content.release_date) {
            missing.push('release_date');
            result.issues_by_field['release_date'] = (result.issues_by_field['release_date'] || 0) + 1;
        }
        if (content.content_type === 'tv' && !content.first_air_date) {
            missing.push('first_air_date');
            result.issues_by_field['first_air_date'] = (result.issues_by_field['first_air_date'] || 0) + 1;
        }

        // Status and ratings
        if (!content.status) {
            missing.push('status');
            result.issues_by_field['status'] = (result.issues_by_field['status'] || 0) + 1;
        }
        if (!content.vote_average || content.vote_average === 0) {
            missing.push('vote_average');
            result.issues_by_field['vote_average'] = (result.issues_by_field['vote_average'] || 0) + 1;
        }
        if (!content.vote_count || content.vote_count === 0) {
            missing.push('vote_count');
            result.issues_by_field['vote_count'] = (result.issues_by_field['vote_count'] || 0) + 1;
        }

        // Cast and crew
        const castCount = castCounts?.[content.id] || 0;
        const crewCount = crewCounts?.[content.id] || 0;

        if (castCount < 5) {
            missing.push('cast (need 5+)');
            result.issues_by_field['cast'] = (result.issues_by_field['cast'] || 0) + 1;
        }
        if (crewCount < 1) {
            missing.push('crew');
            result.issues_by_field['crew'] = (result.issues_by_field['crew'] || 0) + 1;
        }

        // Track results
        if (missing.length === 0) {
            result.fully_complete++;
        } else {
            result.with_issues++;

            // Calculate priority score (published/active items get higher priority)
            const isPublished = content.tmdb_status === 'published' || content.tmdb_status === 'active';
            const priorityScore = (isPublished ? 100 : 50) +
                Number(content.popularity || 0) -
                (missing.length * 5);

            result.priority_list.push({
                id: content.id,
                tmdb_id: content.tmdb_id,
                title: content.title,
                content_type: content.content_type,
                missing,
                priority_score: priorityScore,
            });
        }
    }

    // Sort priority list by score
    result.priority_list.sort((a, b) => b.priority_score - a.priority_score);
    result.priority_list = result.priority_list.slice(0, 100); // Top 100

    return result;
}

/**
 * Display validation results
 */
function displayResults(result: ValidationResult) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 CONTENT VALIDATION RESULTS');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`✅ Fully Complete: ${result.fully_complete} / ${result.total_checked} (${Math.round(result.fully_complete / result.total_checked * 100)}%)`);
    console.log(`⚠️  With Issues: ${result.with_issues} / ${result.total_checked} (${Math.round(result.with_issues / result.total_checked * 100)}%)\n`);

    console.log('📋 Issues by Field:');
    console.log('─────────────────────────────────────────────────────');
    const sortedIssues = Object.entries(result.issues_by_field)
        .sort((a, b) => b[1] - a[1]);

    for (const [field, count] of sortedIssues) {
        const percentage = Math.round(count / result.total_checked * 100);
        console.log(`  ${field.padEnd(20)} ${count.toString().padStart(4)} items (${percentage}%)`);
    }

    console.log('\n🎯 Top 10 Priority Items to Enrich:');
    console.log('─────────────────────────────────────────────────────');
    result.priority_list.slice(0, 10).forEach((item, idx) => {
        console.log(`${(idx + 1).toString().padStart(2)}. [${item.content_type.toUpperCase()}] ${item.title}`);
        console.log(`    TMDB: ${item.tmdb_id} | Score: ${item.priority_score}`);
        console.log(`    Missing: ${item.missing.join(', ')}\n`);
    });

    console.log('═══════════════════════════════════════════════════════\n');
}

/**
 * Save results to database
 */
async function saveResults(result: ValidationResult) {
    const { error } = await supabase
        .from('quality_reports')
        .insert({
            report_type: 'content',
            total_checked: result.total_checked,
            total_complete: result.fully_complete,
            total_issues: result.with_issues,
            issues_by_field: result.issues_by_field,
            priority_items: result.priority_list.slice(0, 100),
        });

    if (error) {
        console.error('❌ Error saving report:', error);
    } else {
        console.log('✓ Report saved to quality_reports table\n');
    }
}

/**
 * Auto-queue items with missing data
 * Priority: Items with most issues get queued first
 */
async function autoQueueItems(result: ValidationResult) {
    console.log('🔄 Auto-queueing items with missing data...\\n');

    let queued = 0;
    let skipped = 0;

    // Queue top priority items (items with most issues = highest priority)
    for (const item of result.priority_list) {
        const result = await addToEnrichmentQueue(
            item.id,
            'content',
            item.missing.length, // More missing = higher priority
            {
                title: item.title,
                tmdb_id: item.tmdb_id,
                missing_fields: item.missing,
            }
        );

        if (result) {
            queued++;
        } else {
            skipped++;
        }
    }

    console.log(`✅ Queued ${queued} items for enrichment`);
    console.log(`⏭️  Skipped ${skipped} items (already queued/processing)\\n`);
}

// Main execution
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
