-- ============================================================
-- GAP REGISTRY TABLE
-- Purpose: Track missing/skipped content for gap detection and filling
-- ============================================================

-- Create gap_registry table
CREATE TABLE IF NOT EXISTS gap_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tmdb_id INTEGER NOT NULL,
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('movie', 'tv_series')),
    gap_type VARCHAR(30) NOT NULL CHECK (gap_type IN ('sequential', 'popularity', 'temporal', 'metadata')),
    priority_score DECIMAL(5,2) DEFAULT 0,
    skip_reason TEXT,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    filled_at TIMESTAMPTZ,
    fill_attempts INTEGER DEFAULT 0,
    last_attempt_error TEXT,
    is_resolved BOOLEAN DEFAULT FALSE,
    UNIQUE(tmdb_id, content_type)
);

-- Enable Row Level Security
ALTER TABLE gap_registry ENABLE ROW LEVEL SECURITY;

-- Create policy: Allow authenticated users to read/write
CREATE POLICY "Authenticated users can manage gap_registry" 
ON gap_registry 
FOR ALL 
USING (auth.role() = 'authenticated');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_gap_registry_unresolved 
ON gap_registry(is_resolved) 
WHERE is_resolved = FALSE;

CREATE INDEX IF NOT EXISTS idx_gap_registry_priority 
ON gap_registry(priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_gap_registry_type 
ON gap_registry(gap_type);

CREATE INDEX IF NOT EXISTS idx_gap_registry_content_type 
ON gap_registry(content_type);

CREATE INDEX IF NOT EXISTS idx_gap_registry_detected_at 
ON gap_registry(detected_at DESC);

-- Add comments for documentation
COMMENT ON TABLE gap_registry IS 'Tracks missing/skipped content for gap detection and filling';
COMMENT ON COLUMN gap_registry.tmdb_id IS 'TMDB ID of the missing content';
COMMENT ON COLUMN gap_registry.content_type IS 'Type of content: movie or tv_series';
COMMENT ON COLUMN gap_registry.gap_type IS 'Type of gap: sequential, popularity, temporal, or metadata';
COMMENT ON COLUMN gap_registry.priority_score IS 'Priority score for filling (based on popularity × recency)';
COMMENT ON COLUMN gap_registry.skip_reason IS 'Reason why content was skipped (duplicate, error, rate_limit, etc.)';
COMMENT ON COLUMN gap_registry.detected_at IS 'When the gap was detected';
COMMENT ON COLUMN gap_registry.filled_at IS 'When the gap was successfully filled';
COMMENT ON COLUMN gap_registry.fill_attempts IS 'Number of attempts to fill this gap';
COMMENT ON COLUMN gap_registry.last_attempt_error IS 'Error message from last fill attempt';
COMMENT ON COLUMN gap_registry.is_resolved IS 'Whether the gap has been filled';
