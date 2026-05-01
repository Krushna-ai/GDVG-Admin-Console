-- Migration: Data Quality Dashboard Views
-- Phase 8.1: Monitoring & Analytics
-- Creates SQL views and functions for tracking data quality metrics

-- ============================================
-- PREREQUISITE: Add Region Column
-- ============================================

-- Add region column to content table for regional analytics
ALTER TABLE content 
ADD COLUMN IF NOT EXISTS region TEXT;

COMMENT ON COLUMN content.region IS 'Content region categorization: KR (Korean), CN (Chinese), JP (Japanese), IN (Indian), TH (Thai), TR (Turkish), WESTERN, OTHER';

-- Create function to determine region from origin_country
CREATE OR REPLACE FUNCTION determine_region(origin_country TEXT[])
RETURNS TEXT AS $$
BEGIN
  IF origin_country IS NULL OR array_length(origin_country, 1) = 0 THEN
    RETURN 'UNKNOWN';
  END IF;
  
  -- Check for specific regions (priority order)
  IF 'KR' = ANY(origin_country) THEN RETURN 'KR';
  END IF;
  IF 'CN' = ANY(origin_country) OR 'HK' = ANY(origin_country) OR 'TW' = ANY(origin_country) THEN RETURN 'CN';
  END IF;
  IF 'JP' = ANY(origin_country) THEN RETURN 'JP';
  END IF;
  IF 'IN' = ANY(origin_country) THEN RETURN 'IN';
  END IF;
  IF 'TH' = ANY(origin_country) THEN RETURN 'TH';
  END IF;
  IF 'TR' = ANY(origin_country) THEN RETURN 'TR';
  END IF;
  
  -- Check for Western countries
  IF 'US' = ANY(origin_country) OR 'GB' = ANY(origin_country) OR 'CA' = ANY(origin_country) 
     OR 'AU' = ANY(origin_country) OR 'FR' = ANY(origin_country) OR 'DE' = ANY(origin_country)
     OR 'IT' = ANY(origin_country) OR 'ES' = ANY(origin_country) THEN 
    RETURN 'WESTERN';
  END IF;
  
  RETURN 'OTHER';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Populate region column for existing data
UPDATE content 
SET region = determine_region(origin_country)
WHERE region IS NULL;

-- ============================================
-- VIEW 1: Source Distribution
-- ============================================

CREATE OR REPLACE VIEW analytics_source_distribution AS
SELECT 
  overview_source,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM content), 2) as percentage
FROM content
WHERE overview_source IS NOT NULL
GROUP BY overview_source
ORDER BY count DESC;

COMMENT ON VIEW analytics_source_distribution IS 
  'Shows distribution of overview sources (Wikipedia, TMDB, etc.) with counts and percentages';

-- ============================================
-- VIEW 2: Enrichment Coverage
-- ============================================

CREATE OR REPLACE VIEW analytics_enrichment_coverage AS
SELECT 
  -- Wikipedia enrichment
  COUNT(*) FILTER (WHERE wikipedia_url IS NOT NULL) AS has_wikipedia,
  ROUND(COUNT(*) FILTER (WHERE wikipedia_url IS NOT NULL) * 100.0 / COUNT(*), 2) AS wikipedia_percentage,
  
  -- Overview coverage
  COUNT(*) FILTER (WHERE overview IS NOT NULL) AS has_overview,
  ROUND(COUNT(*) FILTER (WHERE overview IS NOT NULL) * 100.0 / COUNT(*), 2) AS overview_percentage,
  
  -- Tagline coverage
  COUNT(*) FILTER (WHERE tagline IS NOT NULL) AS has_tagline,
  ROUND(COUNT(*) FILTER (WHERE tagline IS NOT NULL) * 100.0 / COUNT(*), 2) AS tagline_percentage,
  
  -- Wikidata coverage
  COUNT(*) FILTER (WHERE wikidata_id IS NOT NULL) AS has_wikidata,
  ROUND(COUNT(*) FILTER (WHERE wikidata_id IS NOT NULL) * 100.0 / COUNT(*), 2) AS wikidata_percentage,
  
  -- Batch tracking
  COUNT(*) FILTER (WHERE import_batch_id IS NOT NULL) AS has_batch_tracking,
  ROUND(COUNT(*) FILTER (WHERE import_batch_id IS NOT NULL) * 100.0 / COUNT(*), 2) AS batch_tracking_percentage,
  
  -- Total count
  COUNT(*) AS total_content
FROM content;

COMMENT ON VIEW analytics_enrichment_coverage IS 
  'Tracks percentage of content with various enrichment fields populated';

-- ============================================
-- VIEW 3: Quality Score Tracking
-- ============================================

CREATE OR REPLACE VIEW analytics_quality_scores AS
SELECT 
  -- Quality scoring based on overview source
  CASE 
    WHEN overview_source = 'wikipedia' THEN 'Excellent (Wikipedia)'
    WHEN overview_source = 'tmdb' THEN 'Good (TMDB)'
    WHEN overview_source IS NULL AND overview IS NOT NULL THEN 'Fair (Unknown Source)'
    ELSE 'Poor (No Overview)'
  END AS quality_tier,
  
  CASE 
    WHEN overview_source = 'wikipedia' THEN 100
    WHEN overview_source = 'tmdb' THEN 75
    WHEN overview_source IS NULL AND overview IS NOT NULL THEN 50
    ELSE 0
  END AS quality_score,
  
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM content), 2) as percentage
FROM content
GROUP BY quality_tier, quality_score
ORDER BY quality_score DESC;

COMMENT ON VIEW analytics_quality_scores IS 
  'Groups content by quality tiers based on data source quality';

-- ============================================
-- VIEW 4: Regional Distribution
-- ============================================

CREATE OR REPLACE VIEW analytics_regional_distribution AS
SELECT 
  region,
  COUNT(*) as total_content,
  
  -- Enrichment stats per region
  COUNT(*) FILTER (WHERE wikipedia_url IS NOT NULL) AS has_wikipedia,
  ROUND(COUNT(*) FILTER (WHERE wikipedia_url IS NOT NULL) * 100.0 / COUNT(*), 2) AS wikipedia_pct,
  
  COUNT(*) FILTER (WHERE overview_source = 'wikipedia') AS wikipedia_overviews,
  ROUND(COUNT(*) FILTER (WHERE overview_source = 'wikipedia') * 100.0 / COUNT(*), 2) AS wikipedia_overview_pct,
  
  -- Most recent import
  MAX(imported_at) as last_import
FROM content
WHERE region IS NOT NULL
GROUP BY region
ORDER BY total_content DESC;

COMMENT ON VIEW analytics_regional_distribution IS 
  'Shows content distribution by region with enrichment stats';

-- ============================================
-- VIEW 5: Batch Import Analytics
-- ============================================

CREATE OR REPLACE VIEW analytics_batch_imports AS
SELECT 
  import_batch_name,
  import_batch_id,
  MIN(imported_at) as batch_start,
  MAX(imported_at) as batch_end,
  COUNT(*) as items_imported,
  
  -- Enrichment coverage for this batch
  COUNT(*) FILTER (WHERE wikipedia_url IS NOT NULL) AS wikipedia_enriched,
  ROUND(COUNT(*) FILTER (WHERE wikipedia_url IS NOT NULL) * 100.0 / COUNT(*), 2) AS wikipedia_enriched_pct
FROM content
WHERE import_batch_id IS NOT NULL
GROUP BY import_batch_name, import_batch_id
ORDER BY batch_start DESC;

COMMENT ON VIEW analytics_batch_imports IS 
  'Tracks batch import statistics and enrichment effectiveness per batch';

-- ============================================
-- VIEW 6: Data Quality Timeline
-- ============================================

CREATE OR REPLACE VIEW analytics_quality_timeline AS
SELECT 
  DATE(imported_at) as import_date,
  COUNT(*) as items_imported,
  
  -- Quality distribution for this date
  COUNT(*) FILTER (WHERE overview_source = 'wikipedia') AS wikipedia_count,
  COUNT(*) FILTER (WHERE overview_source = 'tmdb') AS tmdb_count,
  COUNT(*) FILTER (WHERE overview_source IS NULL) AS no_source_count,
  
  -- Average quality score for the day
  ROUND(AVG(
    CASE 
      WHEN overview_source = 'wikipedia' THEN 100
      WHEN overview_source = 'tmdb' THEN 75
      WHEN overview_source IS NULL AND overview IS NOT NULL THEN 50
      ELSE 0
    END
  ), 2) as avg_quality_score
FROM content
WHERE imported_at IS NOT NULL
GROUP BY DATE(imported_at)
ORDER BY import_date DESC;

COMMENT ON VIEW analytics_quality_timeline IS 
  'Shows data quality trends over time by import date';

-- ============================================
-- FUNCTION: Get Dashboard Summary
-- ============================================

CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_content', (SELECT COUNT(*) FROM content),
    'enrichment_coverage', (
      SELECT json_build_object(
        'wikipedia_url', wikipedia_percentage,
        'overview', overview_percentage,
        'wikidata_id', wikidata_percentage
      )
      FROM analytics_enrichment_coverage
    ),
    'source_distribution', (
      SELECT json_agg(json_build_object(
        'source', overview_source,
        'count', count,
        'percentage', percentage
      ))
      FROM analytics_source_distribution
    ),
    'quality_distribution', (
      SELECT json_agg(json_build_object(
        'tier', quality_tier,
        'score', quality_score,
        'count', count,
        'percentage', percentage
      ))
      FROM analytics_quality_scores
    ),
    'recent_batches', (
      SELECT json_agg(json_build_object(
        'name', import_batch_name,
        'date', batch_start,
        'items', items_imported,
        'wikipedia_enriched_pct', wikipedia_enriched_pct
      ))
      FROM analytics_batch_imports
      LIMIT 5
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_dashboard_summary IS 
  'Returns comprehensive dashboard summary JSON with all key metrics';

-- ============================================
-- FUNCTION: Get Quality Trend (Last N Days)
-- ============================================

CREATE OR REPLACE FUNCTION get_quality_trend(days INTEGER DEFAULT 30)
RETURNS TABLE (
  date DATE,
  items_imported BIGINT,
  avg_quality_score NUMERIC,
  wikipedia_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    import_date as date,
    analytics_quality_timeline.items_imported,
    analytics_quality_timeline.avg_quality_score,
    ROUND(wikipedia_count * 100.0 / NULLIF(analytics_quality_timeline.items_imported, 0), 2) as wikipedia_percentage
  FROM analytics_quality_timeline
  WHERE import_date >= CURRENT_DATE - days
  ORDER BY import_date DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_quality_trend IS 
  'Returns quality metrics trend for the last N days';

-- ============================================
-- Grant permissions (adjust as needed)
-- ============================================

GRANT SELECT ON analytics_source_distribution TO authenticated;
GRANT SELECT ON analytics_enrichment_coverage TO authenticated;
GRANT SELECT ON analytics_quality_scores TO authenticated;
GRANT SELECT ON analytics_regional_distribution TO authenticated;
GRANT SELECT ON analytics_batch_imports TO authenticated;
GRANT SELECT ON analytics_quality_timeline TO authenticated;

GRANT EXECUTE ON FUNCTION get_dashboard_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_quality_trend TO authenticated;
