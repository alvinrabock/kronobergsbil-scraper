-- Migration: Add unique constraint to prevent duplicate vehicles
-- This ensures only one vehicle per brand+title combination exists

-- First, let's clean up existing duplicates by keeping only the most recent one
-- Create a temporary table with the IDs to keep
CREATE TEMP TABLE vehicles_to_keep AS
SELECT DISTINCT ON (LOWER(brand), LOWER(title)) id
FROM vehicles
ORDER BY LOWER(brand), LOWER(title), updated_at DESC;

-- Delete vehicle_models for vehicles we're going to delete
DELETE FROM vehicle_models
WHERE vehicle_id NOT IN (SELECT id FROM vehicles_to_keep);

-- Delete duplicate vehicles
DELETE FROM vehicles
WHERE id NOT IN (SELECT id FROM vehicles_to_keep);

-- Drop the temp table
DROP TABLE vehicles_to_keep;

-- Now add a unique constraint on brand + title (case-insensitive)
-- First create a functional index for case-insensitive uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_brand_title_unique
ON vehicles (LOWER(COALESCE(brand, '')), LOWER(title));

-- Add source_url column if it doesn't exist (for tracking where data came from)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Add pdf_source_url column if it doesn't exist
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS pdf_source_url TEXT;

-- Add body_type column if it doesn't exist
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS body_type TEXT;

-- Create index for faster brand lookups
CREATE INDEX IF NOT EXISTS idx_vehicles_brand ON vehicles(brand);

-- Similarly for vehicle_models, add unique constraint on vehicle_id + name
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_models_vehicle_name_unique
ON vehicle_models (vehicle_id, LOWER(name));

-- Add comment explaining the constraint
COMMENT ON INDEX idx_vehicles_brand_title_unique IS 'Ensures only one vehicle per brand+title combination (case-insensitive)';
COMMENT ON INDEX idx_vehicle_models_vehicle_name_unique IS 'Ensures only one model variant per vehicle+name combination (case-insensitive)';
