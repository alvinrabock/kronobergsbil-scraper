-- Migration: Add PDF tracking columns to scraped_content table
-- Date: 2024-09-09
-- Description: Adds comprehensive PDF processing tracking fields

-- Add PDF tracking columns to scraped_content table
ALTER TABLE scraped_content 
ADD COLUMN IF NOT EXISTS pdf_links_found jsonb,
ADD COLUMN IF NOT EXISTS pdf_processing_status text CHECK (pdf_processing_status IN ('not_found', 'pending', 'success', 'failed', 'partial')),
ADD COLUMN IF NOT EXISTS pdf_success_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pdf_total_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pdf_extracted_content text,
ADD COLUMN IF NOT EXISTS pdf_processing_errors jsonb,
ADD COLUMN IF NOT EXISTS pdf_processing_time_ms integer,
ADD COLUMN IF NOT EXISTS pdf_last_attempted timestamp with time zone,
ADD COLUMN IF NOT EXISTS pdf_metadata jsonb,
ADD COLUMN IF NOT EXISTS pdf_file_hashes text[],
ADD COLUMN IF NOT EXISTS pdf_retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pdf_last_retry_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS pdf_retryable_failures jsonb;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_scraped_content_pdf_status ON scraped_content(pdf_processing_status);
CREATE INDEX IF NOT EXISTS idx_scraped_content_pdf_counts ON scraped_content(pdf_total_count, pdf_success_count);
CREATE INDEX IF NOT EXISTS idx_scraped_content_pdf_last_attempted ON scraped_content(pdf_last_attempted);
CREATE INDEX IF NOT EXISTS idx_scraped_content_pdf_retry ON scraped_content(pdf_retry_count, pdf_last_retry_at);
CREATE INDEX IF NOT EXISTS idx_scraped_content_pdf_retryable ON scraped_content(pdf_processing_status) WHERE pdf_retryable_failures IS NOT NULL;

-- Add comment to document the new fields
COMMENT ON COLUMN scraped_content.pdf_links_found IS 'JSON array of PDF URLs found in the scraped content';
COMMENT ON COLUMN scraped_content.pdf_processing_status IS 'Overall status of PDF processing: not_found, pending, success, failed, partial';
COMMENT ON COLUMN scraped_content.pdf_success_count IS 'Number of PDFs successfully processed';
COMMENT ON COLUMN scraped_content.pdf_total_count IS 'Total number of PDFs found';
COMMENT ON COLUMN scraped_content.pdf_extracted_content IS 'Concatenated text content from all successfully processed PDFs';
COMMENT ON COLUMN scraped_content.pdf_processing_errors IS 'JSON array of error messages from failed PDF processing attempts';
COMMENT ON COLUMN scraped_content.pdf_processing_time_ms IS 'Total time spent processing PDFs in milliseconds';
COMMENT ON COLUMN scraped_content.pdf_last_attempted IS 'Timestamp of last PDF processing attempt';
COMMENT ON COLUMN scraped_content.pdf_metadata IS 'JSON object containing PDF metadata (size, pages, creation date, author, etc.)';
COMMENT ON COLUMN scraped_content.pdf_file_hashes IS 'Array of SHA-256 hashes for detecting PDF changes';
COMMENT ON COLUMN scraped_content.pdf_retry_count IS 'Number of retry attempts made for failed PDF processing';
COMMENT ON COLUMN scraped_content.pdf_last_retry_at IS 'Timestamp of last retry attempt';
COMMENT ON COLUMN scraped_content.pdf_retryable_failures IS 'JSON array of retryable errors encountered during processing';