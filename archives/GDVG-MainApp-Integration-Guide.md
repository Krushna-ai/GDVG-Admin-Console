# GDVG Main App Integration Guide
## Database Schema (23-Jan-2026)

---

## Quick Setup

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://liyzgvpgjkjgnddhgdwz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## TypeScript Types

```typescript
// src/types/database.ts

export interface Content {
  id: string;
  tmdb_id: number;
  imdb_id?: string;
  content_type: 'movie' | 'tv' | 'drama' | 'anime' | 'variety' | 'documentary';
  title: string;
  original_title?: string;
  overview?: string;
  tagline?: string;
  homepage?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;         // Movies (YYYY-MM-DD)
  first_air_date?: string;       // TV Shows
  last_air_date?: string;
  status: 'draft' | 'published' | 'archived';
  tmdb_status?: string;
  in_production?: boolean;
  original_language?: string;
  origin_country?: string[];     // ['KR', 'JP', 'CN', etc.]
  genres?: Array<{ id: number; name: string }>;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  runtime?: number;              // Movies (minutes)
  number_of_seasons?: number;    // TV
  number_of_episodes?: number;   // TV
  budget?: number;               // Movies
  revenue?: number;              // Movies
  networks?: any[];              // TV
  production_companies?: any[];
  production_countries?: any[];
  spoken_languages?: any[];
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  tmdb_id: number;
  imdb_id?: string;
  name: string;
  gender?: number;               // 1=Female, 2=Male, 3=Non-binary
  biography?: string;
  birthday?: string;
  deathday?: string;
  place_of_birth?: string;
  profile_path?: string;
  known_for_department?: string; // 'Acting', 'Directing', 'Writing'
  popularity?: number;
  also_known_as?: string[];
  homepage?: string;
  adult?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CastMember {
  id: string;
  content_id: string;
  person_id: string;
  character_name?: string;       // Role name
  order_index?: number;          // 0 = lead actor
  person?: Person;               // Joined data
}

export interface CrewMember {
  id: string;
  content_id: string;
  person_id: string;
  job: string;                   // 'Director', 'Writer', 'Producer'
  department?: string;           // 'Directing', 'Writing', 'Production'
  person?: Person;               // Joined data
}
```

---

## Data Fetching Examples

### Get Published Content (Paginated)
```typescript
const { data } = await supabase
  .from('content')
  .select('*')
  .eq('status', 'published')
  .order('popularity', { ascending: false })
  .range(0, 19);  // First 20 items
```

### Get Content by ID with Cast & Crew
```typescript
// Content
const { data: content } = await supabase
  .from('content')
  .select('*')
  .eq('id', contentId)
  .eq('status', 'published')
  .single();

// Cast (with person details)
const { data: cast } = await supabase
  .from('content_cast')
  .select(`
    character_name,
    order_index,
    person:person_id (id, name, profile_path, known_for_department)
  `)
  .eq('content_id', contentId)
  .order('order_index', { ascending: true });

// Crew
const { data: crew } = await supabase
  .from('content_crew')
  .select(`
    job,
    department,
    person:person_id (id, name, profile_path)
  `)
  .eq('content_id', contentId);
```

### Filter by Country (K-Dramas)
```typescript
const { data } = await supabase
  .from('content')
  .select('*')
  .eq('status', 'published')
  .contains('origin_country', ['KR'])  // Korean content
  .order('vote_average', { ascending: false });
```

### Search by Title
```typescript
const { data } = await supabase
  .from('content')
  .select('id, title, poster_path, content_type, vote_average')
  .eq('status', 'published')
  .ilike('title', `%${searchTerm}%`)
  .limit(10);
```

---

## Image URL Helper

```typescript
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export const getPosterUrl = (path?: string, size = 'w342') =>
  path ? `${TMDB_IMAGE_BASE}/${size}${path}` : '/placeholder-poster.jpg';

export const getBackdropUrl = (path?: string, size = 'w1280') =>
  path ? `${TMDB_IMAGE_BASE}/${size}${path}` : '/placeholder-backdrop.jpg';

export const getProfileUrl = (path?: string, size = 'w185') =>
  path ? `${TMDB_IMAGE_BASE}/${size}${path}` : '/placeholder-profile.jpg';
```

**Size Options:**
- Posters: `w92`, `w154`, `w185`, `w342`, `w500`, `w780`, `original`
- Backdrops: `w300`, `w780`, `w1280`, `original`
- Profiles: `w45`, `w185`, `h632`, `original`

---

## Country Codes

| Code | Country | Use Case |
|------|---------|----------|
| KR | South Korea | K-Dramas |
| JP | Japan | Anime, J-Dramas |
| CN | China | C-Dramas |
| TW | Taiwan | Tw-Dramas |
| TH | Thailand | Thai Dramas |
| TR | Turkey | Turkish Dramas |
| IN | India | Bollywood, Hindi Series |
| PH | Philippines | Filipino Content |

---

## RLS Access (Main App / Anon Key)

| Table | Read Access | Write |
|-------|-------------|-------|
| `content` | ✅ Only `status = 'published'` | ❌ |
| `people` | ✅ All | ❌ |
| `content_cast` | ✅ All | ❌ |
| `content_crew` | ✅ All | ❌ |
| `import_queue` | ❌ | ❌ |
| `admin_users` | ❌ | ❌ |

---

## Testing Publish Flow

1. **Admin Console** → Import content → Edit → Set status to **"Published"**
2. **Main App** → Query with `.eq('status', 'published')` → Content appears
