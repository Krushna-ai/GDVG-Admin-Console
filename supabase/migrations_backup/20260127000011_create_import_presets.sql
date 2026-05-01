-- ============================================================
-- IMPORT PRESETS TABLE
-- Purpose: Store reusable import filter configurations
-- ============================================================

-- Create import_presets table
CREATE TABLE IF NOT EXISTS import_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    configuration JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    use_count INTEGER DEFAULT 0
);

-- Enable Row Level Security
ALTER TABLE import_presets ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can manage their own presets + read system presets
CREATE POLICY "Users can manage their own presets" 
ON import_presets 
FOR ALL 
USING (
    auth.uid() = created_by 
    OR created_by IS NULL  -- System presets (created_by = NULL)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_import_presets_created_by 
ON import_presets(created_by);

CREATE INDEX IF NOT EXISTS idx_import_presets_use_count 
ON import_presets(use_count DESC);

CREATE INDEX IF NOT EXISTS idx_import_presets_last_used 
ON import_presets(last_used_at DESC NULLS LAST);

-- Add comments for documentation
COMMENT ON TABLE import_presets IS 'Reusable import filter configurations';
COMMENT ON COLUMN import_presets.name IS 'Preset name (e.g., "K-Drama 2024")';
COMMENT ON COLUMN import_presets.description IS 'Optional description of the preset';
COMMENT ON COLUMN import_presets.configuration IS 'JSON configuration: same format as import_jobs.configuration';
COMMENT ON COLUMN import_presets.created_by IS 'User who created the preset (NULL for system presets)';
COMMENT ON COLUMN import_presets.last_used_at IS 'Last time this preset was used';
COMMENT ON COLUMN import_presets.use_count IS 'Number of times this preset has been used';

-- Insert default system presets
INSERT INTO import_presets (name, description, configuration, created_by) VALUES
(
    'K-Drama 2024',
    'Korean dramas released in 2024',
    '{
        "content_type": "tv_series",
        "countries": ["KR"],
        "date_range": {"from": "2024-01-01", "to": "2024-12-31"},
        "genres": [18, 10749],
        "popularity_priority": 80
    }'::jsonb,
    NULL
),
(
    'K-Drama 2025',
    'Korean dramas released in 2025',
    '{
        "content_type": "tv_series",
        "countries": ["KR"],
        "date_range": {"from": "2025-01-01", "to": "2025-12-31"},
        "genres": [18, 10749],
        "popularity_priority": 80
    }'::jsonb,
    NULL
),
(
    'Asian Cinema Mix',
    'Movies from Korea, Japan, China, and Thailand',
    '{
        "content_type": "movie",
        "countries": ["KR", "JP", "CN", "TH"],
        "date_range": {"from": "2020-01-01", "to": "2026-12-31"},
        "genres": [],
        "popularity_priority": 50
    }'::jsonb,
    NULL
),
(
    'Hollywood Blockbusters',
    'High-popularity US movies',
    '{
        "content_type": "movie",
        "countries": ["US"],
        "date_range": {"from": "2020-01-01", "to": "2026-12-31"},
        "genres": [28, 12, 878],
        "popularity_priority": 100
    }'::jsonb,
    NULL
)
ON CONFLICT DO NOTHING;
