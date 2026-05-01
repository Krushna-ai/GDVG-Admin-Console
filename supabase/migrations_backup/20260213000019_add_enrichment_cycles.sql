-- Add enrichment cycle tracking fields to content and people tables
-- This enables round-robin enrichment cycles to ensure fair coverage

-- Add cycle field to content table
ALTER TABLE content ADD COLUMN IF NOT EXISTS enrichment_cycle INTEGER DEFAULT 0;

-- Add cycle field to people table
ALTER TABLE people ADD COLUMN IF NOT EXISTS enrichment_cycle INTEGER DEFAULT 0;

-- Create enrichment_cycles tracking table
CREATE TABLE IF NOT EXISTS enrichment_cycles (
    id SERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL UNIQUE, -- 'content' or 'people'
    current_cycle INTEGER DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    items_completed INTEGER DEFAULT 0,
    cycle_started_at TIMESTAMPTZ,
    cycle_completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize tracking for content and people
INSERT INTO enrichment_cycles (entity_type, current_cycle, updated_at)
VALUES 
    ('content', 0, NOW()),
    ('people', 0, NOW())
ON CONFLICT (entity_type) DO NOTHING;

-- Initialize existing enriched items to cycle 1
-- Items that have been enriched should be marked as completing cycle 1
UPDATE content 
SET enrichment_cycle = 1 
WHERE enriched_at IS NOT NULL;

UPDATE people 
SET enrichment_cycle = 1 
WHERE enriched_at IS NOT NULL;

-- Create index for efficient cycle-based queries
CREATE INDEX IF NOT EXISTS idx_content_enrichment_cycle ON content(enrichment_cycle, enriched_at);
CREATE INDEX IF NOT EXISTS idx_people_enrichment_cycle ON people(enrichment_cycle, enriched_at);

-- Comment for documentation
COMMENT ON COLUMN content.enrichment_cycle IS 'Tracks which enrichment cycle this content was last enriched in (0-8, auto-resets)';
COMMENT ON COLUMN people.enrichment_cycle IS 'Tracks which enrichment cycle this person was last enriched in (0-8, auto-resets)';
COMMENT ON TABLE enrichment_cycles IS 'Tracks global enrichment cycle progress to ensure fair round-robin enrichment';
