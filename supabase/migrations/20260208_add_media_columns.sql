-- Media Enrichment Enhancement
-- Date: 2026-02-08
-- Adds comprehensive media storage for TMDB photos/videos

-- ============================================
-- CONTENT TABLE: Add Media Columns
-- ============================================

-- Main poster for app UI (single, best quality poster)
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS main_poster text;

-- All additional images from TMDB (posters, backdrops, logos)
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS images jsonb;

COMMENT ON COLUMN public.content.main_poster IS 'Primary poster image displayed in main app UI';
COMMENT ON COLUMN public.content.poster_path IS 'Legacy TMDB poster path (kept for compatibility)';
COMMENT ON COLUMN public.content.backdrop_path IS 'Legacy TMDB backdrop path (kept for compatibility)';
COMMENT ON COLUMN public.content.videos IS 'TMDB videos (trailers, teasers, interviews, featurettes) organized by type';
COMMENT ON COLUMN public.content.images IS 'TMDB image collections: {posters: [], backdrops: [], logos: []}';

-- ============================================
-- PEOPLE TABLE: Add Media Columns
-- ============================================

-- Main profile photo for app UI (single, best quality photo)
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS main_profile_photo text;

-- All additional images from TMDB (profiles, tagged photos)
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS images jsonb;

COMMENT ON COLUMN public.people.main_profile_photo IS 'Primary profile photo displayed in main app UI';
COMMENT ON COLUMN public.people.profile_path IS 'Legacy TMDB profile path (kept for compatibility)';
COMMENT ON COLUMN public.people.images IS 'TMDB image collections: {profiles: [], tagged: []}';

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Index for searching content by main poster availability
CREATE INDEX IF NOT EXISTS idx_content_main_poster 
ON public.content(main_poster) 
WHERE main_poster IS NOT NULL;

-- Index for searching people by main profile photo availability
CREATE INDEX IF NOT EXISTS idx_people_main_profile_photo 
ON public.people(main_profile_photo) 
WHERE main_profile_photo IS NOT NULL;

-- GIN indexes for JSONB image queries
CREATE INDEX IF NOT EXISTS idx_content_images_gin 
ON public.content USING gin(images);

CREATE INDEX IF NOT EXISTS idx_content_videos_gin 
ON public.content USING gin(videos);

CREATE INDEX IF NOT EXISTS idx_people_images_gin 
ON public.people USING gin(images);
