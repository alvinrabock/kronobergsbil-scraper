-- Migration: Add PDF processing and debug info to ai_processed_results table
-- Date: 2025-01-12
-- Description: Adds pdf_processing and debug_info columns to store complete AI processing results

-- Add pdf_processing column to store PDF processing results
ALTER TABLE ai_processed_results 
ADD COLUMN IF NOT EXISTS pdf_processing jsonb;

-- Add debug_info column to store debug information
ALTER TABLE ai_processed_results 
ADD COLUMN IF NOT EXISTS debug_info jsonb;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ai_results_pdf_processing ON ai_processed_results USING GIN (pdf_processing);
CREATE INDEX IF NOT EXISTS idx_ai_results_debug_info ON ai_processed_results USING GIN (debug_info);

-- Add comments to document the new fields
COMMENT ON COLUMN ai_processed_results.pdf_processing IS 'JSON object containing PDF processing results, status, and metadata';
COMMENT ON COLUMN ai_processed_results.debug_info IS 'JSON object containing debug information about the AI processing pipeline';