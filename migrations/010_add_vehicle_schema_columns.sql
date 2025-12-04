-- Migration 010: Add new vehicle schema columns for rich PDF extraction data
-- These columns store the comprehensive vehicle data extracted from PDF pricelists

-- Add new columns to vehicles table for rich data
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS dimensions JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS colors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS interiors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS accessories JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS connected_services JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS financing JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS warranties JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS dealer_info JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS variant_count INTEGER DEFAULT 0;

-- Add specs column to vehicle_models for per-variant technical data
ALTER TABLE vehicle_models
ADD COLUMN IF NOT EXISTS specs JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS transmission VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS equipment TEXT[] DEFAULT '{}';

-- Create index for faster querying on vehicle colors and variants
CREATE INDEX IF NOT EXISTS idx_vehicles_colors ON vehicles USING GIN (colors);
CREATE INDEX IF NOT EXISTS idx_vehicles_warranties ON vehicles USING GIN (warranties);
CREATE INDEX IF NOT EXISTS idx_vehicle_models_specs ON vehicle_models USING GIN (specs);

-- Add comment explaining the schema
COMMENT ON COLUMN vehicles.dimensions IS 'Vehicle dimensions in mm: length_mm, width_mm, height_mm, wheelbase_mm, interior cargo_volume_l';
COMMENT ON COLUMN vehicles.colors IS 'Array of color options: {name, type (solid/metallic/pearl), price, hex_code, available_for}';
COMMENT ON COLUMN vehicles.interiors IS 'Array of interior options: {name, material (tyg/konstläder/läder/alcantara), price, available_for}';
COMMENT ON COLUMN vehicles.options IS 'Array of optional packages: {name, description, price, available_for}';
COMMENT ON COLUMN vehicles.accessories IS 'Array of accessories: {name, description, price, price_includes_installation, available_for}';
COMMENT ON COLUMN vehicles.services IS 'Array of services: {name, description, duration_years, max_mileage_km}';
COMMENT ON COLUMN vehicles.connected_services IS 'Connected services info: {name, price_monthly, free_period_years, features}';
COMMENT ON COLUMN vehicles.financing IS 'Financing info: {provider, leasing_terms, loan_terms}';
COMMENT ON COLUMN vehicles.warranties IS 'Array of warranties: {name, duration_years, duration_km, deductible}';
COMMENT ON COLUMN vehicles.dealer_info IS 'Dealer info: {general_agent, address, phone, email, website}';
COMMENT ON COLUMN vehicle_models.specs IS 'Per-variant specs: {power_hp, power_kw, torque_nm, fuel_consumption_l_100km, range_km_wltp, battery_kwh, etc}';
COMMENT ON COLUMN vehicle_models.equipment IS 'Array of equipment items for this variant/trim level';
