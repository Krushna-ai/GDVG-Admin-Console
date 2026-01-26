# GDVG Main App Integration Guide

This guide helps integrate the Main App with the shared Supabase database managed by the Admin Console.

---

## Quick Start

### 1. Environment Variables

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://liyzgvpgjkjgnddhgdwz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Supabase Client Setup

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
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
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  first_air_date?: string;
  last_air_date?: string;
  status: 'draft' | 'published' | 'archived';
  original_language?: string;
  origin_country?: string[];
  genres?: Array<{ id: number; name: string }>;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  runtime?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  networks?: any[];
  production_companies?: any[];
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  tmdb_id: number;
  imdb_id?: string;
  name: string;
  profile_path?: string;
  biography?: string;
  birthday?: string;
  deathday?: string;
  place_of_birth?: string;
  gender?: number;
  popularity?: number;
  known_for_department?: string;
  also_known_as?: string[];
}

export interface CastMember {
  id: string;
  person_id: string;
  character: string;
  cast_order: number;
  person: Person;
}

export interface CrewMember {
  id: string;
  person_id: string;
  job: string;
  department: string;
  person: Person;
}
```

---

## Data Fetching Examples

### Get Published Content List

```typescript
// src/lib/api/content.ts
import { createClient } from '@/lib/supabase/server';

export async function getPublishedContent(options: {
  limit?: number;
  offset?: number;
  type?: string;
  country?: string;
}) {
  const supabase = await createClient();
  const { limit = 20, offset = 0, type, country } = options;

  let query = supabase
    .from('content')
    .select('*')
    .eq('status', 'published')
    .order('popularity', { ascending: false })
    .range(offset, offset + limit - 1);

  if (type) query = query.eq('content_type', type);
  if (country) query = query.contains('origin_country', [country]);

  const { data, error } = await query;
  return { data, error };
}
```

### Get Content Detail with Cast & Crew

```typescript
export async function getContentDetail(id: string) {
  const supabase = await createClient();

  // Get content
  const { data: content } = await supabase
    .from('content')
    .select('*')
    .eq('id', id)
    .eq('status', 'published')
    .single();

  if (!content) return null;

  // Get cast
  const { data: cast } = await supabase
    .from('content_cast')
    .select(`
      character,
      cast_order,
      person:person_id (
        id, name, profile_path, known_for_department
      )
    `)
    .eq('content_id', id)
    .order('cast_order', { ascending: true })
    .limit(20);

  // Get crew
  const { data: crew } = await supabase
    .from('content_crew')
    .select(`
      job,
      department,
      person:person_id (
        id, name, profile_path
      )
    `)
    .eq('content_id', id);

  return { ...content, cast, crew };
}
```

### Search Content

```typescript
export async function searchContent(query: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('content')
    .select('id, title, poster_path, content_type, vote_average')
    .eq('status', 'published')
    .ilike('title', `%${query}%`)
    .order('popularity', { ascending: false })
    .limit(10);

  return data;
}
```

### Get K-Dramas

```typescript
export async function getKoreanDramas() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('content')
    .select('*')
    .eq('status', 'published')
    .eq('content_type', 'tv')
    .contains('origin_country', ['KR'])
    .order('popularity', { ascending: false })
    .limit(20);

  return data;
}
```

---

## Image URL Helper

```typescript
// src/lib/utils/images.ts

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export function getPosterUrl(path?: string, size: 'w185' | 'w342' | 'w500' | 'w780' = 'w342') {
  if (!path) return '/placeholder-poster.jpg';
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function getBackdropUrl(path?: string, size: 'w300' | 'w780' | 'w1280' = 'w1280') {
  if (!path) return '/placeholder-backdrop.jpg';
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function getProfileUrl(path?: string, size: 'w45' | 'w185' | 'h632' = 'w185') {
  if (!path) return '/placeholder-profile.jpg';
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}
```

---

## Country Codes Reference

| Code | Country |
|------|---------|
| KR | South Korea |
| JP | Japan |
| CN | China |
| TW | Taiwan |
| TH | Thailand |
| TR | Turkey |
| IN | India |
| PH | Philippines |
| US | United States |
| GB | United Kingdom |

---

## RLS - What Main App Can Access

| Table | Read Access |
|-------|-------------|
| `content` | Only `status = 'published'` |
| `people` | All records |
| `content_cast` | All records |
| `content_crew` | All records |
| `import_queue` | ❌ No access |
| `admin_users` | ❌ No access |

---

## Testing Published Content

1. **In Admin Console**: Import content → Edit → Change Status to "Published"
2. **In Main App**: Query should now return the content

```typescript
// Test query
const { data } = await supabase
  .from('content')
  .select('title, status')
  .eq('status', 'published');
console.log('Published content:', data);
```
