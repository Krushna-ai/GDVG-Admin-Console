import { delay, USER_AGENT } from './wikipedia';

export interface WikiArticleData {
    wiki_plot?: string | null;
    wiki_production?: string | null;
    wiki_cast_notes?: string | null;
    wiki_accolades?: string | null;
    wiki_reception?: string | null;
    wiki_soundtrack?: string | null;
    wiki_release?: string | null;
    wiki_episode_guide?: string | null;
}

export const SECTION_MAP: Array<{ keywords: string[]; column: keyof WikiArticleData }> = [
    { keywords: ['plot', 'synopsis', 'story', 'storyline', 'narrative'], column: 'wiki_plot' },
    { keywords: ['production', 'development', 'creation'], column: 'wiki_production' },
    { keywords: ['cast', 'characters', 'casting'], column: 'wiki_cast_notes' },
    { keywords: ['accolades', 'awards', 'recognition', 'honors'], column: 'wiki_accolades' },
    { keywords: ['reception', 'critical', 'reviews', 'response'], column: 'wiki_reception' },
    { keywords: ['soundtrack', 'music', 'ost', 'score'], column: 'wiki_soundtrack' },
    { keywords: ['release', 'broadcast', 'distribution', 'premiere'], column: 'wiki_release' },
    { keywords: ['episode', 'episodes', 'episode guide', 'series overview'], column: 'wiki_episode_guide' },
];

export async function getArticleSections(title: string, language: string = 'en'): Promise<Array<{ index: string; line: string; anchor: string }>> {
    await delay(100);
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
    url.searchParams.set('action', 'parse');
    url.searchParams.set('page', title);
    url.searchParams.set('prop', 'sections');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');

    try {
        const response = await fetch(url.toString(), {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json',
            }
        });

        if (!response.ok) return [];
        const data = await response.json();
        if (data.error || !data.parse || !data.parse.sections) return [];

        return data.parse.sections.map((sec: any) => ({
            index: sec.index,
            line: sec.line,
            anchor: sec.anchor
        }));
    } catch (e) {
        return [];
    }
}

export function stripHtml(html: string): string {
    // Remove all HTML tags with regex
    let text = html.replace(/<[^>]*>?/gm, '');

    // Remove [edit], [1], [2] citation markers
    text = text.replace(/\[edit\]/g, '');
    text = text.replace(/\[\d+\]/g, '');

    // Collapse multiple whitespace/newline to single space
    text = text.replace(/\s+/g, ' ').trim();

    // Hard cap at 8,000 chars (after clean)
    if (text.length > 8000) {
        text = text.substring(0, 8000) + '...';
    }

    return text;
}

export async function fetchSection(title: string, sectionIndex: string, language: string = 'en'): Promise<string | null> {
    await delay(200);
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
    url.searchParams.set('action', 'parse');
    url.searchParams.set('page', title);
    url.searchParams.set('section', sectionIndex);
    url.searchParams.set('prop', 'text');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');

    try {
        const response = await fetch(url.toString(), {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json',
            }
        });

        if (!response.ok) return null;
        const data = await response.json();
        if (data.error || !data.parse || !data.parse.text) return null;

        const html = data.parse.text['*'];
        if (!html) return null;

        return stripHtml(html);
    } catch (e) {
        return null;
    }
}

export async function parseArticleForContent(wikipediaTitle: string, language: string = 'en'): Promise<WikiArticleData> {
    const sections = await getArticleSections(wikipediaTitle, language);
    const result: WikiArticleData = {};

    for (const section of sections) {
        const lineLower = section.line.toLowerCase();

        // Skip disambiguation/maintenance sections
        if (lineLower.includes('see also') || lineLower.includes('references') || lineLower.includes('external links') || lineLower.includes('notes') || lineLower.includes('further reading') || lineLower.includes('disambiguation')) {
            continue;
        }

        for (const map of SECTION_MAP) {
            // Check if any keyword fuzzy matches
            if (map.keywords.some(keyword => lineLower.includes(keyword))) {
                // If match found and column not yet populated
                if (!result[map.column]) {
                    const content = await fetchSection(wikipediaTitle, section.index, language);
                    if (content) {
                        result[map.column] = content;
                    }
                }
                break;
            }
        }
    }

    return result;
}
