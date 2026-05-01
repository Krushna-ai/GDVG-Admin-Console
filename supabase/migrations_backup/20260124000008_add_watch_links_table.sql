-- Run this in Supabase SQL Editor to add content_watch_links table

-- Create content_watch_links table for editable streaming platform links with affiliate support
CREATE TABLE IF NOT EXISTS content_watch_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    platform_name TEXT NOT NULL,
    region TEXT DEFAULT 'ALL',
    link_url TEXT NOT NULL,
    is_affiliate BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_content_watch_links_content_id ON content_watch_links(content_id);

-- Enable RLS
ALTER TABLE content_watch_links ENABLE ROW LEVEL SECURITY;

-- Create policies for access
CREATE POLICY "Allow public read access to watch links" ON content_watch_links
    FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert to watch links" ON content_watch_links
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update to watch links" ON content_watch_links
    FOR UPDATE USING (true);

CREATE POLICY "Allow authenticated delete from watch links" ON content_watch_links
    FOR DELETE USING (true);
