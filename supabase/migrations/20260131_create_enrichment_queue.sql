-- ============================================================
-- ENRICHMENT QUEUE TABLE
-- Purpose: Queue-based enrichment system with resume capability
-- ============================================================

-- Create enrichment_queue table
CREATE TABLE IF NOT EXISTS enrichment_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES content(id) ON DELETE CASCADE,
    queue_type VARCHAR(50) NOT NULL, -- 'content', 'people', 'quality'
    priority INTEGER DEFAULT 0, -- Higher priority = processed first
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE enrichment_queue ENABLE ROW LEVEL SECURITY;

-- Create policy: Allow authenticated users to manage queue
CREATE POLICY "Authenticated users can manage enrichment_queue" 
ON enrichment_queue 
FOR ALL 
USING (auth.role() = 'authenticated');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_status ON enrichment_queue(status);
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_priority ON enrichment_queue(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_type ON enrichment_queue(queue_type);
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_content_id ON enrichment_queue(content_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_created_at ON enrichment_queue(created_at);

-- Create composite index for queue processing (status + priority + created_at)
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_processing 
ON enrichment_queue(status, priority DESC, created_at ASC);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_enrichment_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enrichment_queue_updated_at
    BEFORE UPDATE ON enrichment_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_enrichment_queue_updated_at();

-- Add comments for documentation
COMMENT ON TABLE enrichment_queue IS 'Queue for content and people enrichment tasks with resume capability';
COMMENT ON COLUMN enrichment_queue.queue_type IS 'Type of enrichment: content, people, or quality';
COMMENT ON COLUMN enrichment_queue.priority IS 'Higher priority items processed first (default: 0)';
COMMENT ON COLUMN enrichment_queue.status IS 'Current status: pending, processing, completed, failed';
COMMENT ON COLUMN enrichment_queue.retry_count IS 'Number of retry attempts made';
COMMENT ON COLUMN enrichment_queue.max_retries IS 'Maximum number of retry attempts allowed';
COMMENT ON COLUMN enrichment_queue.metadata IS 'Additional metadata in JSON format';
