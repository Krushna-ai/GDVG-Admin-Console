-- ============================================================
-- SYNC SETTINGS TABLE
-- Purpose: Store global sync configuration and cron controller state
-- ============================================================

-- Create sync_settings table
CREATE TABLE IF NOT EXISTS sync_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE sync_settings ENABLE ROW LEVEL SECURITY;

-- Create policy: Allow authenticated users to read/write
CREATE POLICY "Authenticated users can manage sync_settings" 
ON sync_settings 
FOR ALL 
USING (auth.role() = 'authenticated');

-- Create index on setting_key for faster lookups
CREATE INDEX IF NOT EXISTS idx_sync_settings_key ON sync_settings(setting_key);

-- Insert default settings
INSERT INTO sync_settings (setting_key, setting_value) VALUES
(
    'cron_status',
    '{
        "is_paused": false,
        "paused_at": null,
        "paused_by": null,
        "resumed_at": null,
        "resumed_by": null
    }'::jsonb
),
(
    'sync_schedule',
    '{
        "frequency": "daily",
        "cron_expression": "30 21 * * *",
        "description": "Daily at 3:00 AM IST (21:30 UTC)"
    }'::jsonb
),
(
    'last_run',
    '{
        "started_at": null,
        "completed_at": null,
        "status": null,
        "summary": {}
    }'::jsonb
)
ON CONFLICT (setting_key) DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE sync_settings IS 'Global sync configuration and cron controller state';
COMMENT ON COLUMN sync_settings.setting_key IS 'Unique identifier for the setting (e.g., cron_status, sync_schedule)';
COMMENT ON COLUMN sync_settings.setting_value IS 'JSON value of the setting';
COMMENT ON COLUMN sync_settings.updated_at IS 'Timestamp of last update';
COMMENT ON COLUMN sync_settings.updated_by IS 'User who last updated the setting';
