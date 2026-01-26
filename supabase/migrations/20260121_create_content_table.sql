-- Migration: Create content table
-- Date: 2026-01-21

CREATE TABLE IF NOT EXISTS public.content (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tmdb_id integer UNIQUE NOT NULL,
    imdb_id text,
    content_type text NOT NULL CHECK (content_type IN ('movie', 'tv')),
    title text NOT NULL,
    original_title text,
    overview text,
    poster_path text,
    backdrop_path text,
    release_date date,
    first_air_date date,
    status text DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    original_language text,
    origin_country text[],
    genres jsonb,
    popularity numeric,
    vote_average numeric,
    vote_count integer,
    runtime integer,
    number_of_seasons integer,
    number_of_episodes integer,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_tmdb_id ON public.content(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_content_type ON public.content(content_type);
CREATE INDEX IF NOT EXISTS idx_content_status ON public.content(status);
CREATE INDEX IF NOT EXISTS idx_content_release_date ON public.content(release_date);
CREATE INDEX IF NOT EXISTS idx_content_first_air_date ON public.content(first_air_date);

-- Enable Row Level Security
ALTER TABLE public.content ENABLE ROW LEVEL SECURITY;
