import { config } from 'dotenv';
import { supabase } from './lib/supabase';
import { findWikipediaTitle, fetchArticleSummary, fetchArticleSections } from './lib/wikipedia-full';

config({ path: '.env.local' });

const ASIAN_COUNTRIES = ['KR', 'JP', 'CN', 'TH', 'TW', 'HK', 'IN'];

function parseCliArgs(): { limit: number } {
    const args = process.argv.slice(2);
    let limit = 50;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--limit' && args[i + 1]) {
            limit = parseInt(args[i + 1], 10);
            i++;
        }
    }

    return { limit };
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
    const { limit } = parseCliArgs();

    console.log(`\n📖 Wikipedia Article Fetcher`);
    console.log('='.repeat(50));
    console.log(`Target: Asian + Anime content`);
    console.log(`Limit:  ${limit}\n`);

    const { data: items, error: fetchError } = await supabase
        .from('content')
        .select('id, title, content_type, origin_country, first_air_date, wikipedia_title')
        .eq('status', 'published')
        .or(`origin_country.ov.{${ASIAN_COUNTRIES.join(',')}},content_type.eq.anime`)
        .is('wikipedia_raw_article', null)
        .order('popularity', { ascending: false, nullsFirst: false })
        .limit(limit);

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

            // Steps 3 & 4: Fetch summary and sections (sequential — each has internal rate delay)
            const summary = await fetchArticleSummary(foundTitle, lang);
            const sections = await fetchArticleSections(foundTitle, lang);

            // Step 5: Combine into raw article, filter empty parts
            const parts: string[] = [
                summary,
                sections?.plot ?? null,
                sections?.cast ?? null,
                sections?.production ?? null,
            ].filter((p): p is string => typeof p === 'string' && p.length > 0);

            const combined = parts.join('\n\n').trim();

            if (combined.length === 0) {
                skipped++;
                if (skipped <= 10 || skipped % 20 === 0) {
                    console.log(`  [${i + 1}/${items.length}] ⏭  Empty article: "${item.title}"`);
                }
                continue;
            }

            // Step 6: Save to DB
            const { error: updateError } = await supabase
                .from('content')
                .update({
                    wikipedia_title: foundTitle,
                    wikipedia_raw_article: combined,
                    wikipedia_article_fetched_at: new Date().toISOString(),
                    wikipedia_sections_found: (sections
                        ? [
                            sections.plot ? 'plot' : null,
                            sections.cast ? 'cast' : null,
                            sections.production ? 'production' : null
                        ].filter(Boolean)
                        : []) as string[],
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
