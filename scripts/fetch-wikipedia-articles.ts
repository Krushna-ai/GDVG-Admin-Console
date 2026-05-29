/**
 * FETCH WIKIPEDIA ARTICLES
 * ========================
 * 
 * DEV PHASE MODES (controlled by --mode CLI arg):
 * 
 * --mode devptest (DEFAULT during dev phase)
 *   Fetches Wikipedia articles ONLY for 2025-2026 content.
 *   Purpose: Test Wikipedia fetch accuracy and section 
 *   detection quality on recent, well-documented content.
 *   Targets: ~359 items (130 anime + 153 KR TV + 55 KR movies + 21 KR drama)
 * 
 * --mode devp15 (post-2015 dataset)
 *   Fetches Wikipedia articles for all content from 2015 onwards.
 *   Purpose: Broader dev testing with larger dataset.
 *   Targets: ~2,732 published items (2015-2026)
 * 
 * --mode full (production, no year filter)
 *   Fetches Wikipedia articles for ALL published Asian + anime content.
 *   Use only when ready for full production run.
 * 
 * Pre-2015 content is archived (status='archived') and excluded
 * from all Wikipedia fetch modes.
 * 
 * Usage:
 *   npm run script:fetch-wikipedia -- --limit 100 --mode devptest
 *   npm run script:fetch-wikipedia -- --limit 500 --mode devp15
 *   npm run script:fetch-wikipedia -- --limit 1000 --mode full
 */

import { config } from 'dotenv';
import { supabase } from './lib/supabase';
import { findWikipediaTitle, fetchArticleSummary } from './lib/wikipedia-full';

config({ path: '.env.local' });

const ASIAN_COUNTRIES = ['KR', 'JP', 'CN', 'TH', 'TW', 'HK', 'IN'];

function parseCliArgs(): { limit: number; mode: string } {
    const args = process.argv.slice(2);
    let limit = 50;
    let mode = 'devptest'; // default to dev phase test mode

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--limit' && args[i + 1]) {
            limit = parseInt(args[i + 1], 10);
            i++;
        }
        if (args[i] === '--mode' && args[i + 1]) {
            mode = args[i + 1];
            i++;
        }
    }

    return { limit, mode };
}

function detectLang(originCountry: string[] | null, contentType: string): string {
    if (contentType === 'anime') return 'en';
    if (!originCountry || originCountry.length === 0) return 'en';
    if (originCountry.includes('KR')) return 'ko';
    if (originCountry.includes('JP')) return 'ja';
    return 'en';
}

function extractYear(dateStr: string | null | undefined): number | undefined {
    if (!dateStr) return undefined;
    const year = parseInt(dateStr.slice(0, 4), 10);
    return isNaN(year) ? undefined : year;
}

async function main(): Promise<void> {
    const { limit, mode } = parseCliArgs();

    console.log(`\n📖 Wikipedia Article Fetcher`);
    console.log('='.repeat(50));
    console.log(`Target: Asian + Anime content`);
    console.log(`Mode:   ${mode} ${
        mode === 'devptest' ? '(2025-2026 only)' :
        mode === 'devp15' ? '(2015+ content)' :
        '(all content, no year filter)'
    }\n`);
    console.log(`Limit:  ${limit}\n`);

    let query = supabase
        .from('content')
        .select('id, title, content_type, origin_country, first_air_date, release_date, wikipedia_title')
        .eq('status', 'published')
        .or(`origin_country.ov.{${ASIAN_COUNTRIES.join(',')}},content_type.eq.anime`)
        .is('wikipedia_raw_article', null)
        .order('popularity', { ascending: false, nullsFirst: false });

    if (mode === 'devptest') {
        query = query.or(
            'first_air_date.gte.2025-01-01,release_date.gte.2025-01-01'
        );
    } else if (mode === 'devp15') {
        query = query.or(
            'first_air_date.gte.2015-01-01,release_date.gte.2015-01-01'
        );
    }
    // mode === 'full' → no year filter

    const { data: items, error: fetchError } = await query.limit(limit);

    if (fetchError) {
        console.error('❌ Failed to fetch content:', fetchError.message);
        process.exit(1);
    }

    if (!items || items.length === 0) {
        console.log('✅ No items need Wikipedia articles — all up to date.');
        return;
    }

    console.log(`Found ${items.length} items to process.\n`);

    let fetched = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        try {
            const lang = detectLang(
                item.origin_country as string[] | null,
                item.content_type as string
            );
            const year = extractYear(item.first_air_date as string | null);
            const contentHint = item.content_type === 'anime'
                ? 'anime'
                : lang === 'ko'
                    ? 'Korean drama'
                    : undefined;

            // Step 2: Find Wikipedia title — use stored value if present, else search
            let foundTitle = (item.wikipedia_title as string | null) || null;

            if (!foundTitle) {
                foundTitle = await findWikipediaTitle(item.title as string, year, lang, contentHint);
            }

            // Fallback: try English if native lang found nothing
            if (!foundTitle && lang !== 'en') {
                foundTitle = await findWikipediaTitle(item.title as string, year, 'en', contentHint);
            }

            if (!foundTitle) {
                skipped++;
                if (skipped <= 10 || skipped % 20 === 0) {
                    console.log(`  [${i + 1}/${items.length}] ⏭  No Wikipedia article found: "${item.title}"`);
                }
                continue;
            }

            // Step 3: Fetch summary
            const summary = await fetchArticleSummary(foundTitle, lang);

            if (!summary) {
                skipped++;
                console.log(`  [${i + 1}/${items.length}] ⏭  No summary: "${item.title}"`);
                continue;
            }

            const combined = summary.trim();

            // Step 4: Save to DB
            const { error: updateError } = await supabase
                .from('content')
                .update({
                    wikipedia_title: foundTitle,
                    wikipedia_raw_article: combined,
                    wikipedia_article_fetched_at: new Date().toISOString(),
                })
                .eq('id', item.id);

            if (updateError) {
                throw new Error(`DB update failed: ${updateError.message}`);
            }

            fetched++;

            // Step 7: Log every 5 fetched items
            if (fetched % 5 === 0 || i === items.length - 1) {
                console.log(
                    `  [${i + 1}/${items.length}] ✅ #${fetched}: "${item.title}" → "${foundTitle}" ` +
                    `(${lang}, ${combined.length.toLocaleString()} chars)`
                );
            }

        } catch (err: any) {
            errors++;
            console.error(`  [${i + 1}/${items.length}] ❌ Error on "${item.title}": ${err.message}`);
        }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 Wikipedia Fetch Summary`);
    console.log(`   ✅ Fetched:  ${fetched}`);
    console.log(`   ⏭  Skipped:  ${skipped}`);
    console.log(`   ❌ Errors:   ${errors}`);
    console.log(`   📋 Total:    ${items.length}`);
    console.log(`${'='.repeat(50)}\n`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
