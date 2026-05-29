-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Content embeddings table
CREATE TABLE IF NOT EXISTS content_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  embedding vector(768),
  embedding_model text DEFAULT 'bge-large-en-v1.5',
  source_text text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(content_id)
);

CREATE INDEX IF NOT EXISTS content_embeddings_embedding_idx 
  ON content_embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Add AI enrichment columns to content table
ALTER TABLE content 
  ADD COLUMN IF NOT EXISTS mood_tags jsonb,
  ADD COLUMN IF NOT EXISTS trope_tags jsonb,
  ADD COLUMN IF NOT EXISTS vibe_description text,
  ADD COLUMN IF NOT EXISTS ai_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_enrichment_version integer DEFAULT 0;
