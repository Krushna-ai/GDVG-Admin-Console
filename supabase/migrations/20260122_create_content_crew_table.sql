-- Migration: Create content_crew junction table
-- Date: 2026-01-22

CREATE TABLE IF NOT EXISTS public.content_crew (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id uuid NOT NULL REFERENCES public.content(id) ON DELETE CASCADE,
    person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    job text NOT NULL,
    department text,
    created_at timestamptz DEFAULT now(),
    UNIQUE(content_id, person_id, job)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crew_content ON public.content_crew(content_id);
CREATE INDEX IF NOT EXISTS idx_crew_person ON public.content_crew(person_id);
CREATE INDEX IF NOT EXISTS idx_crew_job ON public.content_crew(job);

-- Enable Row Level Security
ALTER TABLE public.content_crew ENABLE ROW LEVEL SECURITY;
