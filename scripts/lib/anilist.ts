const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const RATE_LIMIT_DELAY_MS = 700;

export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// ============================================
// TYPES
// ============================================

export interface AniListTitle {
    romaji: string | null;
    english: string | null;
    native: string | null;
}

export interface AniListDate {
    year: number | null;
    month: number | null;
    day: number | null;
}

export interface AniListTag {
    name: string;
    rank: number;
    isMediaSpoiler: boolean;
    category: string;
}

export interface AniListStudio {
    name: string;
    isAnimationStudio: boolean;
}

export interface AniListStaffEdge {
    role: string;
    node: { name: { full: string }; id: number };
}

export interface AniListMedia {
    id: number;
    idMal: number | null;
    title: AniListTitle;
    description: string | null;
    genres: string[];
    tags: AniListTag[];
    episodes: number | null;
    duration: number | null;
    status: string | null;
    season: string | null;
    seasonYear: number | null;
    startDate: AniListDate;
    endDate: AniListDate;
    averageScore: number | null;
    popularity: number | null;
    coverImage: { large: string | null; extraLarge: string | null };
    bannerImage: string | null;
    studios: { nodes: AniListStudio[] };
    staff: { edges: AniListStaffEdge[] };
    externalLinks: { url: string; site: string }[];
    countryOfOrigin: string | null;
    source: string | null;
    format: string | null;
    synonyms: string[];
}

export interface AniListPageInfo {
    hasNextPage: boolean;
    currentPage: number;
}

export interface AniListPageResponse {
    Page: {
        pageInfo: AniListPageInfo;
        media: AniListMedia[];
    };
}

// ============================================
// GRAPHQL QUERY
// ============================================

const ANIME_LIST_QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage currentPage }
    media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
      id
      idMal
      title { romaji english native }
      description(asHtml: false)
      genres
      tags { name rank isMediaSpoiler category }
      episodes
      duration
      status
      season
      seasonYear
      startDate { year month day }
      endDate { year month day }
      averageScore
      popularity
      coverImage { large extraLarge }
      bannerImage
      studios { nodes { name isAnimationStudio } }
      staff(perPage: 10) {
        edges {
          role
          node { name { full } id }
        }
      }
      externalLinks { url site }
      countryOfOrigin
      source
      format
      synonyms
    }
  }
}
`;

// ============================================
// INTERNAL FETCH WITH RETRY
// ============================================

async function anilistFetch<T>(query: string, variables: Record<string, any>): Promise<T> {
    await delay(RATE_LIMIT_DELAY_MS);

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const res = await fetch(ANILIST_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ query, variables }),
            });

            if (!res.ok) {
                if (res.status === 429) {
                    if (attempt === maxAttempts) {
                        throw new Error(`AniList API rate limited (429) — retries exhausted`);
                    }
                    const waitTime = 1000 * Math.pow(2, attempt);
                    console.log(`  ⏳ Rate limited (429), waiting ${waitTime}ms (attempt ${attempt}/${maxAttempts})`);
                    await delay(waitTime);
                    continue;
                }

                if (res.status === 500 || res.status === 503) {
                    if (attempt === maxAttempts) {
                        throw new Error(`AniList API server error (${res.status}) — retries exhausted`);
                    }
                    const waitTime = 1000 * attempt;
                    console.log(`  ⚠️ Server error (${res.status}), waiting ${waitTime}ms (attempt ${attempt}/${maxAttempts})`);
                    await delay(waitTime);
                    continue;
                }

                throw new Error(`AniList API error: ${res.status} ${res.statusText}`);
            }

            const json = await res.json();

            if (json.errors?.length) {
                throw new Error(`AniList GraphQL error: ${json.errors[0]?.message || 'Unknown GraphQL error'}`);
            }

            return json.data as T;
        } catch (error: any) {
            if (error?.message?.includes('AniList API error') && !error?.message?.includes('retries exhausted')) {
                throw error;
            }
            if (error?.message?.includes('AniList GraphQL error')) {
                throw error;
            }
            if (attempt === maxAttempts) {
                throw new Error(`AniList API network error after ${maxAttempts} attempts: ${error?.message || error}`);
            }
            const waitTime = 500 * attempt;
            console.log(`  🔌 Network error, waiting ${waitTime}ms (attempt ${attempt}/${maxAttempts})`);
            await delay(waitTime);
        }
    }

    throw new Error('AniList API error: unexpected end of retry loop');
}

// ============================================
// PUBLIC API FUNCTIONS
// ============================================

export async function fetchAnimeListPage(page: number, perPage: number = 50): Promise<AniListPageResponse> {
    return anilistFetch<AniListPageResponse>(ANIME_LIST_QUERY, { page, perPage });
}

// ============================================
// DATA MAPPING
// ============================================

const ANILIST_STATUS_MAP: Record<string, string> = {
    FINISHED: 'Ended',
    RELEASING: 'Returning Series',
    NOT_YET_RELEASED: 'Planned',
    CANCELLED: 'Canceled',
    HIATUS: 'Hiatus',
};

function formatAniListDate(date: AniListDate | null | undefined): string | undefined {
    if (!date?.year) return undefined;
    const month = String(date.month || 1).padStart(2, '0');
    const day = String(date.day || 1).padStart(2, '0');
    return `${date.year}-${month}-${day}`;
}

export function mapAnilistToContent(media: AniListMedia): Record<string, any> {
    const genres = media.genres.map((name, index) => ({ id: index + 1, name }));

    const keywords = media.tags
        .filter(tag => !tag.isMediaSpoiler && tag.rank > 60)
        .map((tag, index) => ({ id: index + 1, name: tag.name }));

    const studios = media.studios.nodes
        .filter(s => s.isAnimationStudio)
        .map(s => ({ name: s.name }));

    return {
        // Identity — use anilist_id as tmdb_id; content_type:'anime' prevents conflicts with real TMDB rows
        tmdb_id: media.id,
        content_type: 'anime' as any,
        // Core metadata
        title: media.title.english || media.title.romaji || 'Unknown Title',
        original_title: media.title.native || null,
        overview: media.description || null,
        poster_path: media.coverImage.extraLarge || media.coverImage.large || null,
        backdrop_path: media.bannerImage || null,
        // Dates
        first_air_date: formatAniListDate(media.startDate),
        last_air_date: formatAniListDate(media.endDate),
        // Locale
        original_language: media.countryOfOrigin === 'JP' ? 'ja' : (media.countryOfOrigin?.toLowerCase() || null),
        origin_country: media.countryOfOrigin ? [media.countryOfOrigin] : [],
        // Ratings & popularity
        genres,
        keywords,
        vote_average: media.averageScore != null ? media.averageScore / 10 : null,
        popularity: media.popularity || null,
        // Episodes
        number_of_episodes: media.episodes || null,
        runtime: media.duration || null,
        // Status
        tmdb_status: media.status ? (ANILIST_STATUS_MAP[media.status] || media.status) : null,
        status: 'published' as const,
        // Production
        production_companies: studios.length > 0 ? studios : null,
        // External IDs
        external_ids: {
            anilist_id: media.id,
            mal_id: media.idMal || null,
        },
        social_ids: {
            anilist: `https://anilist.co/anime/${media.id}`,
            mal: media.idMal ? `https://myanimelist.net/anime/${media.idMal}` : null,
        },
        // AniList-specific metadata
        content_format: media.format || null,
        content_source: media.source || null,
        alternative_titles: media.synonyms.length > 0 ? media.synonyms : null,
        external_links: media.externalLinks.length > 0 ? media.externalLinks : null,
        staff_highlights: (() => {
            const directorRoles = ['Director', 'Chief Animation Director', 'Series Director', 'Music'];
            return media.staff.edges
                .filter(e => directorRoles.some(r => e.role.includes(r)))
                .slice(0, 3)
                .map(e => ({ id: e.node.id, name: e.node.name.full, role: e.role }));
        })() || null,
    };
}
