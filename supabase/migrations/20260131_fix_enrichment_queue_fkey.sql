-- Fix enrichment_queue to support both content and people IDs
-- Remove the foreign key constraint that only allows content IDs

-- Step 1: Drop the foreign key constraint
ALTER TABLE enrichment_queue 
DROP CONSTRAINT IF EXISTS enrichment_queue_content_id_fkey;

-- Step 2: Rename column to be more generic
ALTER TABLE enrichment_queue 
RENAME COLUMN content_id TO entity_id;

-- Step 3: Add comment to clarify usage
COMMENT ON COLUMN enrichment_queue.entity_id IS 'UUID of the entity (content or person) to enrich';
