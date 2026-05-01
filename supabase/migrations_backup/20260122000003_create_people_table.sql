-- Migration: Create people table
-- Date: 2026-01-22

CREATE TABLE IF NOT EXISTS public.people (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tmdb_id integer UNIQUE NOT NULL,
    imdb_id text,
    name text NOT NULL,
    profile_path text,
    biography text,
    birthday date,
    place_of_birth text,
    popularity numeric,
    known_for_department text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_people_tmdb_id ON public.people(tmdb_id);

-- Enable Row Level Security
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
