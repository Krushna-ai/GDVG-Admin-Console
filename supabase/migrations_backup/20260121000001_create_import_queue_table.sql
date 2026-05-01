-- Migration: Create import_queue table
-- Date: 2026-01-21

CREATE TABLE IF NOT EXISTS public.import_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tmdb_id integer NOT NULL,
    content_type text NOT NULL CHECK (content_type IN ('movie', 'tv')),
    priority integer DEFAULT 0,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
    batch_name text,
    release_year integer,
    release_month integer,
    error_message text,
    attempts integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    processed_at timestamptz,
    UNIQUE(tmdb_id, content_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_queue_status ON public.import_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_batch ON public.import_queue(batch_name);
CREATE INDEX IF NOT EXISTS idx_queue_release ON public.import_queue(release_year, release_month);
CREATE INDEX IF NOT EXISTS idx_queue_priority ON public.import_queue(priority DESC, created_at ASC);

-- Enable Row Level Security
ALTER TABLE public.import_queue ENABLE ROW LEVEL SECURITY;
