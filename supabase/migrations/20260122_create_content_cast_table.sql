-- Migration: Create content_cast junction table
-- Date: 2026-01-22

CREATE TABLE IF NOT EXISTS public.content_cast (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id uuid NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    character_name text,
    order_index integer,
    created_at timestamptz DEFAULT now(),
    UNIQUE(content_id, person_id, character_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cast_content ON public.content_cast(content_id);
CREATE INDEX IF NOT EXISTS idx_cast_person ON public.content_cast(person_id);

-- Enable Row Level Security
ALTER TABLE public.content_cast ENABLE ROW LEVEL SECURITY;
