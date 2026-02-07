-- Migration: API Usage Monitoring
-- Phase 8.2: Monitoring & Analytics - API Usage
-- Creates table and views for tracking API usage, performance, and rate limits

-- ============================================
-- TABLE: API Usage Log
-- ============================================

CREATE TABLE IF NOT EXISTS api_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name varchar(50) NOT NULL,  -- 'wikipedia', 'wikidata', 'tmdb'
  endpoint text NOT NULL,
  method varchar(10) DEFAULT 'GET',  -- HTTP method
  status_code int,
  response_time_ms int,
  error_message text,
  retry_count int DEFAULT 0,
  rate_limited boolean DEFAULT false,
  request_metadata jsonb,  -- Additional context (entity_id, search_query, etc.)
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE api_usage_log IS 
  'Logs all external API calls for performance monitoring and rate limit tracking';

COMMENT ON COLUMN api_usage_log.api_name IS 
  'Name of the API: wikipedia, wikidata, tmdb';

COMMENT ON COLUMN api_usage_log.endpoint IS 
  'API endpoint URL or path';

COMMENT ON COLUMN api_usage_log.status_code IS 
  'HTTP status code (200, 404, 429, 500, etc.)';

COMMENT ON COLUMN api_usage_log.response_time_ms IS 
  'Response time in milliseconds';

COMMENT ON COLUMN api_usage_log.rate_limited IS 
  'Whether this request encountered rate limiting (429 status)';

COMMENT ON COLUMN api_usage_log.request_metadata IS 
  'Additional metadata about the request in JSON format';

-- ============================================
-- INDEXES for Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_api_usage_api_name ON api_usage_log(api_name);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_status_code ON api_usage_log(status_code);
CREATE INDEX IF NOT EXISTS idx_api_usage_rate_limited ON api_usage_log(rate_limited) WHERE rate_limited = true;

-- ============================================
-- VIEW: API Performance Summary
-- ============================================

CREATE OR REPLACE VIEW analytics_api_performance AS
SELECT 
  api_name,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) AS successful_requests,
  COUNT(*) FILTER (WHERE status_code >= 400) AS failed_requests,
  ROUND(COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) * 100.0 / NULLIF(COUNT(*), 0), 2) AS success_rate,
  
  -- Response time metrics
  ROUND(AVG(response_time_ms), 2) AS avg_response_time_ms,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms), 2) AS median_response_time_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms), 2) AS p95_response_time_ms,
  MIN(response_time_ms) AS min_response_time_ms,
  MAX(response_time_ms) AS max_response_time_ms,
  
  -- Error tracking
  COUNT(*) FILTER (WHERE rate_limited = true) AS rate_limit_hits,
  COUNT(*) FILTER (WHERE retry_count > 0) AS retry_attempts,
  
  -- Time window
  MIN(created_at) as first_request,
  MAX(created_at) as last_request
FROM api_usage_log
GROUP BY api_name
ORDER BY total_requests DESC;

COMMENT ON VIEW analytics_api_performance IS 
  'Aggregated API performance metrics by API name';

-- ============================================
-- VIEW: API Error Tracking
-- ============================================

CREATE OR REPLACE VIEW analytics_api_errors AS
SELECT 
  api_name,
  endpoint,
  status_code,
  COUNT(*) as error_count,
  array_agg(DISTINCT error_message) FILTER (WHERE error_message IS NOT NULL) as error_messages,
  MAX(created_at) as last_occurrence
FROM api_usage_log
WHERE status_code >= 400 OR error_message IS NOT NULL
GROUP BY api_name, endpoint, status_code
ORDER BY error_count DESC, last_occurrence DESC;

COMMENT ON VIEW analytics_api_errors IS 
  'Tracks API errors grouped by API, endpoint, and status code';

-- ============================================
-- VIEW: API Hourly Usage
-- ============================================

CREATE OR REPLACE VIEW analytics_api_hourly_usage AS
SELECT 
  api_name,
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as requests_per_hour,
  COUNT(*) FILTER (WHERE rate_limited = true) AS rate_limited_count,
  ROUND(AVG(response_time_ms), 2) AS avg_response_time
FROM api_usage_log
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY api_name, DATE_TRUNC('hour', created_at)
ORDER BY hour DESC, api_name;

COMMENT ON VIEW analytics_api_hourly_usage IS 
  'Hourly API usage breakdown for the last 7 days';

-- ============================================
-- VIEW: Slow Endpoints (95th percentile > 2 seconds)
-- ============================================

CREATE OR REPLACE VIEW analytics_slow_endpoints AS
SELECT 
  api_name,
  endpoint,
  COUNT(*) as request_count,
  ROUND(AVG(response_time_ms), 2) AS avg_response_time_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms), 2) AS p95_response_time_ms,
  MAX(response_time_ms) AS max_response_time_ms
FROM api_usage_log
WHERE response_time_ms IS NOT NULL
GROUP BY api_name, endpoint
HAVING PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) > 2000  -- 2 seconds
ORDER BY p95_response_time_ms DESC;

COMMENT ON VIEW analytics_slow_endpoints IS 
  'Identifies slow API endpoints with 95th percentile > 2 seconds';

-- ============================================
-- FUNCTION: Get API Usage Summary
-- ============================================

CREATE OR REPLACE FUNCTION get_api_usage_summary(hours_back INTEGER DEFAULT 24)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_requests', (
      SELECT COUNT(*) 
      FROM api_usage_log 
      WHERE created_at >= NOW() - (hours_back || ' hours')::INTERVAL
    ),
    'by_api', (
      SELECT json_agg(
        json_build_object(
          'api_name', api_name,
          'total_requests', total_requests,
          'success_rate', success_rate,
          'avg_response_time_ms', avg_response_time_ms,
          'rate_limit_hits', rate_limit_hits
        )
      )
      FROM analytics_api_performance
    ),
    'recent_errors', (
      SELECT json_agg(
        json_build_object(
          'api_name', api_name,
          'endpoint', endpoint,
          'status_code', status_code,
          'error_count', error_count,
          'last_occurrence', last_occurrence
        )
      )
      FROM (
        SELECT * FROM analytics_api_errors ORDER BY last_occurrence DESC LIMIT 10
      ) recent
    ),
    'slow_endpoints', (
      SELECT json_agg(
        json_build_object(
          'api_name', api_name,
          'endpoint', endpoint,
          'p95_response_time_ms', p95_response_time_ms
        )
      )
      FROM (
        SELECT * FROM analytics_slow_endpoints LIMIT 5
      ) slow
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_api_usage_summary IS 
  'Returns comprehensive API usage summary for the last N hours';

-- ============================================
-- FUNCTION: Clean Old Logs (Retention Policy)
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_api_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM api_usage_log
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_api_logs IS 
  'Deletes API logs older than N days (default 30). Returns number of deleted rows.';

-- ============================================
-- Grant Permissions
-- ============================================

GRANT SELECT ON api_usage_log TO authenticated;
GRANT INSERT ON api_usage_log TO authenticated;
GRANT SELECT ON analytics_api_performance TO authenticated;
GRANT SELECT ON analytics_api_errors TO authenticated;
GRANT SELECT ON analytics_api_hourly_usage TO authenticated;
GRANT SELECT ON analytics_slow_endpoints TO authenticated;

GRANT EXECUTE ON FUNCTION get_api_usage_summary TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_api_logs TO authenticated;
