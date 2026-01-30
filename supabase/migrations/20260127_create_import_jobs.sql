-- ============================================================
-- IMPORT JOBS TABLE
-- Purpose: Track bulk import jobs with progress and queue management
-- ============================================================

-- Create import_jobs table
CREATE TABLE IF NOT EXISTS import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    configuration JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
    progress JSONB DEFAULT '{"current": 0, "total": 0, "success": 0, "failed": 0, "skipped": 0}'::jsonb,
    priority INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    error_log TEXT[]
);

-- Enable Row Level Security
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- Create policy: Allow authenticated users to read/write
CREATE POLICY "Authenticated users can manage import_jobs" 
ON import_jobs 
FOR ALL 
USING (auth.role() = 'authenticated');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_import_jobs_status 
ON import_jobs(status);

CREATE INDEX IF NOT EXISTS idx_import_jobs_status_priority 
ON import_jobs(status, priority DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_created_at 
ON import_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_jobs_created_by 
ON import_jobs(created_by);

-- Add comments for documentation
COMMENT ON TABLE import_jobs IS 'Tracks bulk import jobs with progress and queue management';
COMMENT ON COLUMN import_jobs.name IS 'User-friendly name for the import job';
COMMENT ON COLUMN import_jobs.configuration IS 'JSON configuration: filters (type, country, date, genre, popularity)';
COMMENT ON COLUMN import_jobs.status IS 'Current status: pending, running, paused, completed, failed, cancelled';
COMMENT ON COLUMN import_jobs.progress IS 'Progress tracking: current, total, success, failed, skipped counts';
COMMENT ON COLUMN import_jobs.priority IS 'Priority for queue processing (higher = processed first)';
COMMENT ON COLUMN import_jobs.started_at IS 'When the job started processing';
COMMENT ON COLUMN import_jobs.completed_at IS 'When the job completed (success or failure)';
COMMENT ON COLUMN import_jobs.created_by IS 'User who created the job';
COMMENT ON COLUMN import_jobs.error_log IS 'Array of error messages encountered during processing';
