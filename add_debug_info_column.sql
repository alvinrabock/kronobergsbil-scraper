-- Add debug_info column to ai_processed_results table
-- This script can be run directly on your Supabase database

-- Add the debug_info column
ALTER TABLE ai_processed_results ADD COLUMN IF NOT EXISTS debug_info JSONB;

-- Create an index on debug_info for better query performance (optional)
CREATE INDEX IF NOT EXISTS idx_ai_processed_results_debug_info ON ai_processed_results USING gin (debug_info);

-- Verify the column was added
\d ai_processed_results;