import { supabase } from './lib/supabase';

interface PeopleValidationIssue {
    id: string;
    tmdb_id: number;
    name: string;
    missing: string[];
    popularity: number;
}

interface PeopleValidationResult {
    total_checked: number;
    fully_complete: number;
    with_issues: number;
    issues_by_field: Record<string, number>;
    priority_list: PeopleValidationIssue[];
}

const PAGE_SIZE = 500;

async function fetchAllPeople() {
    const rows: any[] = [];
    let offset = 0;
    while (true) {
        const { data, error } = await supabase
            .from('people')
            .select('id, tmdb_id, name, profile_path, biography, birthday, deathday, place_of_birth, gender, known_for_department, popularity')
            .order('popularity', { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw new Error(`Error fetching people: ${error.message}`);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }
    return rows;
}

async function validatePeople(): Promise<PeopleValidationResult> {
    console.log('🔍 Starting people validation...\n');

    const result: PeopleValidationResult = {
        total_checked: 0,
        fully_complete: 0,
        with_issues: 0,
        issues_by_field: {},
        priority_list: [],
    };

    const allPeople = await fetchAllPeople();
    result.total_checked = allPeople.length;
    console.log(`✓ Loaded ${allPeople.length} people\n`);

    for (const person of allPeople) {
        const missing: string[] = [];

        if (!person.profile_path) { missing.push('profile_path'); result.issues_by_field['profile_path'] = (result.issues_by_field['profile_path'] || 0) + 1; }
        if (!person.biography?.trim()) { missing.push('biography'); result.issues_by_field['biography'] = (result.issues_by_field['biography'] || 0) + 1; }
        if (!person.birthday) { missing.push('birthday'); result.issues_by_field['birthday'] = (result.issues_by_field['birthday'] || 0) + 1; }
        if (!person.place_of_birth) { missing.push('place_of_birth'); result.issues_by_field['place_of_birth'] = (result.issues_by_field['place_of_birth'] || 0) + 1; }
        if (!person.gender || person.gender === 0) { missing.push('gender'); result.issues_by_field['gender'] = (result.issues_by_field['gender'] || 0) + 1; }
        if (!person.known_for_department) { missing.push('known_for_department'); result.issues_by_field['known_for_department'] = (result.issues_by_field['known_for_department'] || 0) + 1; }
        if (!person.popularity) { missing.push('popularity'); result.issues_by_field['popularity'] = (result.issues_by_field['popularity'] || 0) + 1; }

        if (missing.length === 0) {
            result.fully_complete++;
        } else {
            result.with_issues++;
            result.priority_list.push({ id: person.id, tmdb_id: person.tmdb_id, name: person.name, missing, popularity: person.popularity || 0 });
        }
    }

    result.priority_list.sort((a, b) => b.popularity - a.popularity);
    result.priority_list = result.priority_list.slice(0, 100);
    return result;
}

function displayResults(result: PeopleValidationResult) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('👥 PEOPLE VALIDATION RESULTS');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`✅ Fully Complete: ${result.fully_complete} / ${result.total_checked} (${Math.round(result.fully_complete / result.total_checked * 100)}%)`);
    console.log(`⚠️  With Issues: ${result.with_issues} / ${result.total_checked} (${Math.round(result.with_issues / result.total_checked * 100)}%)\n`);
    console.log('📋 Issues by Field:');
    Object.entries(result.issues_by_field)
        .sort((a, b) => b[1] - a[1])
        .forEach(([field, count]) => {
            const pct = Math.round(count / result.total_checked * 100);
            console.log(`  ${field.padEnd(25)} ${count.toString().padStart(4)} people (${pct}%)`);
        });
    console.log('\n🎯 Top 10 Priority People to Enrich:');
    result.priority_list.slice(0, 10).forEach((person, idx) => {
        console.log(`${(idx + 1).toString().padStart(2)}. ${person.name}`);
        console.log(`    TMDB: ${person.tmdb_id} | Popularity: ${person.popularity}`);
        console.log(`    Missing: ${person.missing.join(', ')}\n`);
    });
    console.log('═══════════════════════════════════════════════════════\n');
}

async function saveResults(result: PeopleValidationResult) {
    const { error } = await supabase.from('quality_reports').insert({
        report_type: 'people',
        total_checked: result.total_checked,
        total_complete: result.fully_complete,
        total_issues: result.with_issues,
        issues_by_field: result.issues_by_field,
        priority_items: result.priority_list.slice(0, 100),
    });
    if (error) console.error('❌ Error saving report:', error);
    else console.log('✓ Report saved to quality_reports table\n');
}

async function main() {
    try {
        const result = await validatePeople();
        displayResults(result);
        await saveResults(result);
    } catch (error) {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    }
}

main();
