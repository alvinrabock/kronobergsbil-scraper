-- Migration: Add PDF source URL to vehicles table
-- Date: 2025-01-12
-- Description: Adds pdf_source_url field to track which PDF file vehicle data came from

-- Add pdf_source_url column to vehicles table
ALTER TABLE vehicles 
ADD COLUMN IF NOT EXISTS pdf_source_url text;

-- Add index for better performance when filtering by PDF source
CREATE INDEX IF NOT EXISTS idx_vehicles_pdf_source_url ON vehicles(pdf_source_url);

-- Add comment to document the new field
COMMENT ON COLUMN vehicles.pdf_source_url IS 'URL of the PDF file where this vehicle data was extracted from';