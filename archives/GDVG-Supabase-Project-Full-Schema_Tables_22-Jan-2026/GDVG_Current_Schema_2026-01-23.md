# GDVG Database Schema - Updated 23 January 2026

This document contains the complete schema for the GDVG project's shared Supabase database.
Both the Admin Console and Main App connect to the same database.

---

## Core Tables

### 1. `content` - Movies, TV Shows, K-Dramas, Anime, etc.

```sql
CREATE TABLE public.content (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tmdb_id integer UNIQUE NOT NULL,
    imdb_id text,
    content_type text NOT NULL,  -- 'movie', 'tv', 'drama', 'anime', 'variety', 'documentary'
    title text NOT NULL,
    original_title text,
    overview text,
    tagline text,
    homepage text,
    
    -- Media
    poster_path text,            -- TMDB path: /xyz.jpg → https://image.tmdb.org/t/p/w500/xyz.jpg
    backdrop_path text,
    
    -- Dates
    release_date date,           -- Movies
    first_air_date date,         -- TV
    last_air_date date,
    
    -- Status
    status text DEFAULT 'draft', -- 'draft', 'published', 'archived'
    tmdb_status text,            -- Original TMDB status
    in_production boolean DEFAULT false,
    
    -- Classification
    original_language text,      -- 'ko', 'ja', 'zh', 'en', etc.
    origin_country text[],       -- ['KR'], ['JP'], ['CN'], etc.
    genres jsonb,                -- [{"id": 18, "name": "Drama"}]
    
    -- Ratings & Popularity
    popularity numeric,
    vote_average numeric,
    vote_count integer,
    
    -- Movie-specific
    runtime integer,
    budget bigint,
    revenue bigint,
    
    -- TV-specific
    number_of_seasons integer,
    number_of_episodes integer,
    networks jsonb,
    
    -- Production
    production_companies jsonb,
    production_countries jsonb,
    spoken_languages jsonb,
    
    -- Timestamps
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
```

**Key Indexes:**
- `idx_content_tmdb_id` - Lookup by TMDB ID
- `idx_content_type_status` - Filter by type + status
- `idx_content_popularity` - Sort by popularity (DESC)
- `idx_content_vote_average` - Sort by rating (DESC)
- `idx_content_title_search` - Full-text search on title (GIN)

---

### 2. `people` - Actors, Directors, Crew

```sql
CREATE TABLE public.people (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tmdb_id integer UNIQUE NOT NULL,
    imdb_id text,
    name text NOT NULL,
    profile_path text,
    biography text,
    birthday date,
    deathday date,
    place_of_birth text,
    gender integer,              -- 1=Female, 2=Male, 3=Non-binary
    popularity numeric,
    known_for_department text,   -- 'Acting', 'Directing', 'Writing', etc.
    also_known_as text[],
    homepage text,
    adult boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
```

---

### 3. `content_cast` - Actor Credits

```sql
CREATE TABLE public.content_cast (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id uuid REFERENCES public.content(id) ON DELETE CASCADE,
    person_id uuid REFERENCES public.people(id) ON DELETE CASCADE,
    character text,              -- Role name
    cast_order integer,          -- Billing order (0 = lead)
    created_at timestamptz DEFAULT now(),
    UNIQUE(content_id, person_id, character)
);
```

---

### 4. `content_crew` - Director/Writer/Producer Credits

```sql
CREATE TABLE public.content_crew (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id uuid REFERENCES public.content(id) ON DELETE CASCADE,
    person_id uuid REFERENCES public.people(id) ON DELETE CASCADE,
    job text NOT NULL,           -- 'Director', 'Writer', 'Producer', etc.
    department text,             -- 'Directing', 'Writing', 'Production'
    created_at timestamptz DEFAULT now(),
    UNIQUE(content_id, person_id, job)
);
```

---

### 5. `import_queue` - Batch Import Tracking

```sql
CREATE TABLE public.import_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tmdb_id integer NOT NULL,
    content_type text NOT NULL,
    status text DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    priority integer DEFAULT 0,
    batch_name text,
    attempts integer DEFAULT 0,
    error_message text,
    metadata jsonb,
    source text DEFAULT 'manual', -- 'manual', 'discover', 'daily_export'
    processed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(tmdb_id, content_type)
);
```

---

### 6. `admin_users` - Admin Access Control

```sql
CREATE TABLE public.admin_users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text UNIQUE NOT NULL,
    role text DEFAULT 'admin',
    created_at timestamptz DEFAULT now()
);

-- Security function
CREATE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE id = auth.uid()
    );
$$;
```

---

## Row Level Security (RLS)

All tables have RLS enabled. Key policies:

| Table | Public Read | Admin Write |
|-------|-------------|-------------|
| `content` | `status = 'published'` | Full access via `is_admin()` |
| `people` | Yes (all) | `is_admin()` required |
| `content_cast` | Yes | `is_admin()` required |
| `content_crew` | Yes | `is_admin()` required |
| `import_queue` | No | `is_admin()` only |
| `admin_users` | No | `is_admin()` only |

---

## Common Queries for Main App

### Get Published Content (Paginated)
```sql
SELECT * FROM content
WHERE status = 'published'
ORDER BY popularity DESC
LIMIT 20 OFFSET 0;
```

### Get Content with Cast
```sql
SELECT 
    c.*,
    json_agg(json_build_object(
        'name', p.name,
        'character', cc.character,
        'profile_path', p.profile_path
    ) ORDER BY cc.cast_order) as cast
FROM content c
LEFT JOIN content_cast cc ON c.id = cc.content_id
LEFT JOIN people p ON cc.person_id = p.id
WHERE c.id = 'content-uuid-here'
GROUP BY c.id;
```

### Search Content
```sql
SELECT * FROM content
WHERE status = 'published'
  AND to_tsvector('english', title) @@ to_tsquery('english', 'search_term')
ORDER BY popularity DESC;
```

### Filter by Type + Country
```sql
SELECT * FROM content
WHERE status = 'published'
  AND content_type = 'tv'
  AND 'KR' = ANY(origin_country)
ORDER BY vote_average DESC;
```

---

## TMDB Image URLs

Base URLs:
- Posters: `https://image.tmdb.org/t/p/w500{poster_path}`
- Backdrops: `https://image.tmdb.org/t/p/w1280{backdrop_path}`
- Profiles: `https://image.tmdb.org/t/p/w185{profile_path}`

Available sizes:
- Posters: w92, w154, w185, w342, w500, w780, original
- Backdrops: w300, w780, w1280, original
- Profiles: w45, w185, h632, original
