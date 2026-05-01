-- Phase 0.2: Schema Enhancements
-- Date: 2026-01-23
-- Applied to Supabase via MCP

-- ============================================
-- CONTENT TABLE ENHANCEMENTS
-- ============================================

-- 1. Expanded content_type check constraint
ALTER TABLE public.content DROP CONSTRAINT IF EXISTS content_content_type_check;
ALTER TABLE public.content 
ADD CONSTRAINT content_content_type_check 
CHECK (content_type IN ('movie', 'tv', 'drama', 'anime', 'variety', 'documentary'));
-- Note: Country of origin (Korean, Chinese, Japanese, Indian, Thai, Turkish, Western) 
-- is determined by the origin_country column, not content_type

-- 2. New columns for richer content data
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS tagline text;
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS homepage text;
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS budget bigint;
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS revenue bigint;
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS production_companies jsonb;
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS production_countries jsonb;
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS spoken_languages jsonb;
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS networks jsonb;
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS last_air_date date;
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS in_production boolean DEFAULT false;
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS tmdb_status text;

-- 3. Content indexes
CREATE INDEX IF NOT EXISTS idx_content_title_search ON public.content USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_content_popularity ON public.content(popularity DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_content_vote_average ON public.content(vote_average DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_content_type_status ON public.content(content_type, status);
CREATE INDEX IF NOT EXISTS idx_content_language ON public.content(original_language);

COMMENT ON TABLE public.content IS 'Unified content table for movies, TV shows, anime, K-dramas, etc. Enriched from TMDB.';

-- ============================================
-- PEOPLE TABLE ENHANCEMENTS
-- ============================================

ALTER TABLE public.people ADD COLUMN IF NOT EXISTS also_known_as text[];
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS homepage text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS adult boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_people_name_search ON public.people USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_people_department ON public.people(known_for_department);
CREATE INDEX IF NOT EXISTS idx_people_popularity ON public.people(popularity DESC NULLS LAST);

COMMENT ON TABLE public.people IS 'Cast and crew profiles enriched from TMDB. Linked to content via content_cast and content_crew.';

-- ============================================
-- IMPORT_QUEUE TABLE ENHANCEMENTS
-- ============================================

ALTER TABLE public.import_queue ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.import_queue ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.import_queue ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_import_queue_batch ON public.import_queue(batch_name);
CREATE INDEX IF NOT EXISTS idx_import_queue_priority_created ON public.import_queue(priority DESC, created_at ASC);

COMMENT ON TABLE public.import_queue IS 'Queue for batch TMDB imports. Tracks status, attempts, and errors.';

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Increment attempts for a queue item
CREATE OR REPLACE FUNCTION public.increment_queue_attempts(queue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.import_queue
    SET attempts = attempts + 1,
        updated_at = now()
    WHERE id = queue_id;
END;
$$;

-- Claim next pending queue item for processing (with row locking)
CREATE OR REPLACE FUNCTION public.claim_queue_item(max_attempts int DEFAULT 3)
RETURNS TABLE(
    id uuid,
    tmdb_id integer,
    content_type text,
    priority integer,
    attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.import_queue q
    SET status = 'processing',
        updated_at = now()
    WHERE q.id = (
        SELECT q2.id 
        FROM public.import_queue q2
        WHERE q2.status = 'pending' 
          AND q2.attempts < max_attempts
        ORDER BY q2.priority DESC, q2.created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING q.id, q.tmdb_id, q.content_type, q.priority, q.attempts;
END;
$$;
