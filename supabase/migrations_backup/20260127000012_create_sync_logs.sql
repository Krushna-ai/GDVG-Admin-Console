-- ============================================================
-- SYNC LOGS TABLE
-- Purpose: Track all sync operation history for debugging and analytics
-- ============================================================

-- Create sync_logs table
CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_type VARCHAR(30) NOT NULL CHECK (sync_type IN ('cron', 'manual', 'bulk_import', 'gap_fill')),
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    summary JSONB DEFAULT '{}'::jsonb,
    error_details TEXT[],
    triggered_by UUID REFERENCES auth.users(id),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable Row Level Security
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Create policy: Allow authenticated users to read/write
CREATE POLICY "Authenticated users can manage sync_logs" 
ON sync_logs 
FOR ALL 
USING (auth.role() = 'authenticated');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sync_logs_date 
ON sync_logs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_logs_type 
ON sync_logs(sync_type);

CREATE INDEX IF NOT EXISTS idx_sync_logs_status 
ON sync_logs(status);

CREATE INDEX IF NOT EXISTS idx_sync_logs_triggered_by 
ON sync_logs(triggered_by);

-- Add comments for documentation
COMMENT ON TABLE sync_logs IS 'History of all sync operations for debugging and analytics';
COMMENT ON COLUMN sync_logs.sync_type IS 'Type of sync: cron, manual, bulk_import, gap_fill';
COMMENT ON COLUMN sync_logs.started_at IS 'When the sync operation started';
COMMENT ON COLUMN sync_logs.completed_at IS 'When the sync operation completed';
COMMENT ON COLUMN sync_logs.status IS 'Current status: running, completed, failed, cancelled';
COMMENT ON COLUMN sync_logs.summary IS 'Summary statistics: {"total":100,"added":45,"updated":30,"skipped":20,"failed":5}';
COMMENT ON COLUMN sync_logs.error_details IS 'Array of error messages encountered during sync';
COMMENT ON COLUMN sync_logs.triggered_by IS 'User who triggered the sync (NULL for automated cron)';
COMMENT ON COLUMN sync_logs.metadata IS 'Additional metadata (e.g., filters used, TMDB API calls made)';
