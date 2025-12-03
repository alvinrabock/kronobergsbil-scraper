-- =============================================================================
-- MIGRATION 005: Master Vehicle Database
-- Separates static vehicle data from dynamic pricing
-- =============================================================================
--
-- Architecture:
--   1. Master tables (static) - Populated once from technical PDFs
--      - master_brands: Brand information (Suzuki, Opel, Mazda, etc.)
--      - master_vehicles: Base vehicle info (Mokka, eVitara, CX-80, etc.)
--      - master_variants: Specific variants (Select, Exclusive, Homura, etc.)
--      - master_motor_specs: Engine specifications per motor type
--      - master_equipment: Equipment items with standard/option tracking
--      - master_dimensions: Vehicle dimensions
--      - master_colors: Available colors with prices
--      - master_packages: Option packages (Plus-paket, etc.)
--
--   2. Price tables (dynamic) - Updated daily via scraping
--      - variant_prices: Current and old prices for each variant
--      - price_history: Historical price tracking for analytics
--
-- =============================================================================

-- =============================================================================
-- MASTER TABLES (STATIC DATA FROM PDFs)
-- =============================================================================

-- Master brands table
CREATE TABLE IF NOT EXISTS master_brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,  -- Suzuki, Opel, Mazda, Honda, etc.
  logo_url TEXT,
  website_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Master vehicles table (base vehicle models)
CREATE TABLE IF NOT EXISTS master_vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID REFERENCES master_brands(id) ON DELETE CASCADE,

  name TEXT NOT NULL,                    -- Mokka, eVitara, CX-80, Swift
  slug TEXT UNIQUE,                      -- mokka, evitara, cx-80, swift (for URLs)
  vehicle_type TEXT CHECK (vehicle_type IN ('cars', 'transport_cars')) DEFAULT 'cars',

  -- Common metadata
  description TEXT,
  thumbnail_url TEXT,
  model_year INTEGER,                    -- 2025, 2024, etc.

  -- PDF source tracking
  pdf_source_url TEXT,
  pdf_extracted_at TIMESTAMP WITH TIME ZONE,
  pdf_type TEXT CHECK (pdf_type IN ('pricelist', 'brochure', 'specifications', 'combined')),

  -- Status
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(brand_id, name, model_year)
);

-- Master variants table (specific trim levels/configurations)
CREATE TABLE IF NOT EXISTS master_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES master_vehicles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,                    -- Select, Exclusive, GS, Homura, Takumi
  trim_level TEXT,                       -- Base, Mid, High, Premium

  -- Motor configuration
  motor_type TEXT,                       -- EL, BENSIN, DIESEL, HYBRID, LADDHYBRID, PHEV
  motor_key TEXT,                        -- Reference to master_motor_specs

  -- Drivetrain
  drivlina TEXT,                         -- 2WD, 4WD, AWD
  vaxellada TEXT,                        -- Automat, Manuell

  -- Sub-variant tracking (e.g., "Homura Plus" = Homura + packages)
  is_plus_variant BOOLEAN DEFAULT false,
  base_variant_id UUID REFERENCES master_variants(id),  -- Points to Homura if this is Homura Plus
  included_packages TEXT[],              -- ['Plus-paket', 'Komfortpaket']

  -- Display order
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(vehicle_id, name, motor_type, drivlina)
);

-- Master motor specifications
CREATE TABLE IF NOT EXISTS master_motor_specs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES master_vehicles(id) ON DELETE CASCADE,

  motor_key TEXT NOT NULL,               -- EL, BENSIN_1.0T, DIESEL_2.2, PHEV, HYBRID
  motor_type TEXT NOT NULL,              -- EL, BENSIN, DIESEL, HYBRID, LADDHYBRID, PHEV

  -- Engine specs
  effekt_kw INTEGER,
  effekt_hk INTEGER,
  systemeffekt_kw INTEGER,               -- For hybrids (combined power)
  systemeffekt_hk INTEGER,

  -- Electric specs
  batterikapacitet_kwh DECIMAL(5,1),
  rackvidd_km INTEGER,                   -- Electric range

  -- Performance
  acceleration_0_100 DECIMAL(4,1),       -- 0-100 km/h in seconds
  toppfart INTEGER,                      -- Max speed km/h

  -- Consumption
  forbrukning TEXT,                      -- "15.2 kWh/100km" or "5.8 l/100km"
  co2_utslapp INTEGER,                   -- g/km (0 for electric)

  -- Transmission
  vaxellada TEXT,                        -- Automat, Manuell, CVT, DSG
  antal_vaxlar INTEGER,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(vehicle_id, motor_key)
);

-- Master dimensions (shared across all variants of a vehicle)
CREATE TABLE IF NOT EXISTS master_dimensions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES master_vehicles(id) ON DELETE CASCADE UNIQUE,

  -- Exterior dimensions (mm)
  langd INTEGER,
  bredd INTEGER,
  bredd_med_speglar INTEGER,
  hojd INTEGER,
  axelavstand INTEGER,

  -- Interior dimensions
  bagageutrymme_liter INTEGER,
  bagageutrymme_max_liter INTEGER,       -- With seats folded

  -- Weights (kg)
  tjanstevikt INTEGER,
  max_last INTEGER,
  totalvikt INTEGER,
  max_slap_bromsat INTEGER,
  max_slap_obromsat INTEGER,

  -- Tank
  tankvolym_liter INTEGER,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Master equipment items
CREATE TABLE IF NOT EXISTS master_equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES master_vehicles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  category TEXT,                         -- Säkerhet, Komfort, Exteriör, Interiör, Teknik, etc.
  description TEXT,

  -- Availability tracking
  standard_for TEXT[],                   -- ['Select', 'Exclusive'] - trim levels where standard
  tillval_for TEXT[],                    -- ['Base'] - trim levels where optional
  tillval_via_paket TEXT,                -- Package name if only available via package
  tillval_pris DECIMAL(12,2),            -- Individual option price if available

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(vehicle_id, name)
);

-- Master colors
CREATE TABLE IF NOT EXISTS master_colors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES master_vehicles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  color_code TEXT,                       -- Manufacturer color code
  color_type TEXT CHECK (color_type IN ('solid', 'metallic', 'pearl', 'matte')),
  hex_code TEXT,                         -- For UI display

  pris DECIMAL(12,2),                    -- Extra cost (0 if included)
  is_standard BOOLEAN DEFAULT false,
  available_for_trims TEXT[],            -- Which trims can have this color

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(vehicle_id, name)
);

-- Master wheels/rims
CREATE TABLE IF NOT EXISTS master_wheels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES master_vehicles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  size TEXT,                             -- 17", 18", 19"
  style TEXT,                            -- Alloy, Steel, etc.

  pris DECIMAL(12,2),                    -- Extra cost
  standard_for TEXT[],                   -- Trim levels where standard
  tillval_for TEXT[],                    -- Trim levels where optional

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(vehicle_id, name)
);

-- Master interior options
CREATE TABLE IF NOT EXISTS master_interiors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES master_vehicles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,                    -- "Svart tyg", "Läder", etc.
  material TEXT,
  color TEXT,

  pris DECIMAL(12,2),
  standard_for TEXT[],
  tillval_for TEXT[],

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(vehicle_id, name)
);

-- Master packages (option bundles)
CREATE TABLE IF NOT EXISTS master_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES master_vehicles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,                    -- "Plus-paket", "Komfortpaket", "Vinterpaket"
  description TEXT,

  pris DECIMAL(12,2),
  available_for_trims TEXT[],            -- Which trims can add this package

  -- What's included
  included_items TEXT[],                 -- List of equipment/features

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(vehicle_id, name)
);

-- Master warranty/service info
CREATE TABLE IF NOT EXISTS master_warranty (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES master_vehicles(id) ON DELETE CASCADE UNIQUE,

  nybilsgaranti TEXT,                    -- "5 år"
  vagassistans TEXT,                     -- "5 år"
  rostgaranti TEXT,                      -- "12 år"
  batterigaranti TEXT,                   -- "8 år / 160 000 km"
  lackgaranti TEXT,

  service_interval TEXT,                 -- "20 000 km / 12 månader"

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- PRICE TABLES (DYNAMIC DATA FROM SCRAPING)
-- =============================================================================

-- Current variant prices
CREATE TABLE IF NOT EXISTS variant_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_id UUID REFERENCES master_variants(id) ON DELETE CASCADE,

  -- Current prices
  pris DECIMAL(12,2),                    -- Cash price
  old_pris DECIMAL(12,2),                -- Campaign: previous cash price

  privatleasing DECIMAL(12,2),           -- Monthly private leasing
  old_privatleasing DECIMAL(12,2),       -- Campaign: previous leasing

  foretagsleasing DECIMAL(12,2),         -- Monthly company leasing
  old_foretagsleasing DECIMAL(12,2),

  billan_per_man DECIMAL(12,2),          -- Monthly loan payment
  old_billan_per_man DECIMAL(12,2),

  -- Leasing terms (for display)
  leasing_months INTEGER,                -- 36
  leasing_km_per_year INTEGER,           -- 1500
  leasing_deposit DECIMAL(12,2),         -- Down payment

  -- Campaign info
  is_campaign BOOLEAN DEFAULT false,
  campaign_name TEXT,
  campaign_end DATE,

  -- Source tracking
  source_url TEXT,
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Validity
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE,  -- NULL = current

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Price history for analytics
CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_id UUID REFERENCES master_variants(id) ON DELETE CASCADE,

  -- Snapshot of prices at this time
  pris DECIMAL(12,2),
  privatleasing DECIMAL(12,2),
  foretagsleasing DECIMAL(12,2),
  billan_per_man DECIMAL(12,2),

  -- Was this a campaign price?
  is_campaign BOOLEAN DEFAULT false,
  campaign_name TEXT,

  -- Tracking
  source_url TEXT,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- LINKING TABLE (Connect scrape sessions to master data)
-- =============================================================================

-- Links scraped vehicles to master vehicles for deduplication
CREATE TABLE IF NOT EXISTS vehicle_master_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- From scraping system
  scraped_vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  scraped_model_id UUID REFERENCES vehicle_models(id) ON DELETE CASCADE,

  -- To master system
  master_vehicle_id UUID REFERENCES master_vehicles(id) ON DELETE SET NULL,
  master_variant_id UUID REFERENCES master_variants(id) ON DELETE SET NULL,

  -- Matching confidence
  match_confidence DECIMAL(3,2),         -- 0.00 to 1.00
  match_method TEXT,                     -- 'exact', 'fuzzy', 'manual'

  -- Price update tracking
  last_price_update TIMESTAMP WITH TIME ZONE,
  prices_updated_count INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_master_vehicles_brand ON master_vehicles(brand_id);
CREATE INDEX IF NOT EXISTS idx_master_vehicles_slug ON master_vehicles(slug);
CREATE INDEX IF NOT EXISTS idx_master_vehicles_active ON master_vehicles(is_active);

CREATE INDEX IF NOT EXISTS idx_master_variants_vehicle ON master_variants(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_master_variants_motor ON master_variants(motor_type);

CREATE INDEX IF NOT EXISTS idx_master_motor_specs_vehicle ON master_motor_specs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_master_equipment_vehicle ON master_equipment(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_master_colors_vehicle ON master_colors(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_master_packages_vehicle ON master_packages(vehicle_id);

CREATE INDEX IF NOT EXISTS idx_variant_prices_variant ON variant_prices(variant_id);
CREATE INDEX IF NOT EXISTS idx_variant_prices_campaign ON variant_prices(is_campaign);
CREATE INDEX IF NOT EXISTS idx_variant_prices_valid ON variant_prices(valid_until);

CREATE INDEX IF NOT EXISTS idx_price_history_variant ON price_history(variant_id);
CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(recorded_at);

CREATE INDEX IF NOT EXISTS idx_vehicle_master_links_scraped ON vehicle_master_links(scraped_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_master_links_master ON vehicle_master_links(master_vehicle_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

DROP TRIGGER IF EXISTS update_master_brands_updated_at ON master_brands;
DROP TRIGGER IF EXISTS update_master_vehicles_updated_at ON master_vehicles;
DROP TRIGGER IF EXISTS update_master_variants_updated_at ON master_variants;
DROP TRIGGER IF EXISTS update_variant_prices_updated_at ON variant_prices;

CREATE TRIGGER update_master_brands_updated_at
  BEFORE UPDATE ON master_brands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_master_vehicles_updated_at
  BEFORE UPDATE ON master_vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_master_variants_updated_at
  BEFORE UPDATE ON master_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_variant_prices_updated_at
  BEFORE UPDATE ON variant_prices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to record price history when prices change
CREATE OR REPLACE FUNCTION record_price_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Only record if prices actually changed
  IF (OLD.pris IS DISTINCT FROM NEW.pris) OR
     (OLD.privatleasing IS DISTINCT FROM NEW.privatleasing) OR
     (OLD.foretagsleasing IS DISTINCT FROM NEW.foretagsleasing) OR
     (OLD.billan_per_man IS DISTINCT FROM NEW.billan_per_man) THEN

    INSERT INTO price_history (
      variant_id,
      pris,
      privatleasing,
      foretagsleasing,
      billan_per_man,
      is_campaign,
      campaign_name,
      source_url
    ) VALUES (
      NEW.variant_id,
      NEW.pris,
      NEW.privatleasing,
      NEW.foretagsleasing,
      NEW.billan_per_man,
      NEW.is_campaign,
      NEW.campaign_name,
      NEW.source_url
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-record price changes
DROP TRIGGER IF EXISTS trigger_record_price_history ON variant_prices;
CREATE TRIGGER trigger_record_price_history
  AFTER UPDATE ON variant_prices
  FOR EACH ROW EXECUTE FUNCTION record_price_history();

-- Function to get current price for a variant
CREATE OR REPLACE FUNCTION get_current_price(p_variant_id UUID)
RETURNS TABLE (
  pris DECIMAL(12,2),
  old_pris DECIMAL(12,2),
  privatleasing DECIMAL(12,2),
  foretagsleasing DECIMAL(12,2),
  billan_per_man DECIMAL(12,2),
  is_campaign BOOLEAN,
  campaign_name TEXT,
  last_updated TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vp.pris,
    vp.old_pris,
    vp.privatleasing,
    vp.foretagsleasing,
    vp.billan_per_man,
    vp.is_campaign,
    vp.campaign_name,
    vp.updated_at as last_updated
  FROM variant_prices vp
  WHERE vp.variant_id = p_variant_id
    AND (vp.valid_until IS NULL OR vp.valid_until > NOW())
  ORDER BY vp.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Complete vehicle view with current prices
CREATE OR REPLACE VIEW vehicle_catalog AS
SELECT
  mb.name as brand,
  mv.name as vehicle_name,
  mv.slug,
  mv.vehicle_type,
  mv.model_year,
  mv.thumbnail_url,
  mvar.name as variant_name,
  mvar.trim_level,
  mvar.motor_type,
  mvar.drivlina,
  mvar.vaxellada,
  vp.pris,
  vp.old_pris,
  vp.privatleasing,
  vp.foretagsleasing,
  vp.billan_per_man,
  vp.is_campaign,
  vp.campaign_name,
  vp.campaign_end,
  vp.updated_at as price_updated_at,
  ms.effekt_hk,
  ms.rackvidd_km,
  ms.forbrukning,
  md.langd,
  md.bagageutrymme_liter
FROM master_vehicles mv
JOIN master_brands mb ON mv.brand_id = mb.id
JOIN master_variants mvar ON mvar.vehicle_id = mv.id
LEFT JOIN variant_prices vp ON vp.variant_id = mvar.id
  AND (vp.valid_until IS NULL OR vp.valid_until > NOW())
LEFT JOIN master_motor_specs ms ON ms.vehicle_id = mv.id
  AND ms.motor_key = mvar.motor_key
LEFT JOIN master_dimensions md ON md.vehicle_id = mv.id
WHERE mv.is_active = true
ORDER BY mb.name, mv.name, mvar.sort_order;

-- Price change history view
CREATE OR REPLACE VIEW price_changes AS
SELECT
  mb.name as brand,
  mv.name as vehicle,
  mvar.name as variant,
  ph.pris,
  ph.privatleasing,
  ph.is_campaign,
  ph.campaign_name,
  ph.recorded_at,
  LAG(ph.pris) OVER (PARTITION BY ph.variant_id ORDER BY ph.recorded_at) as prev_pris,
  ph.pris - LAG(ph.pris) OVER (PARTITION BY ph.variant_id ORDER BY ph.recorded_at) as price_change
FROM price_history ph
JOIN master_variants mvar ON ph.variant_id = mvar.id
JOIN master_vehicles mv ON mvar.vehicle_id = mv.id
JOIN master_brands mb ON mv.brand_id = mb.id
ORDER BY ph.recorded_at DESC;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Master tables are public read, admin write
ALTER TABLE master_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_motor_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_wheels ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_interiors ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_warranty ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_master_links ENABLE ROW LEVEL SECURITY;

-- Public read access for catalog data
CREATE POLICY "Public read master_brands" ON master_brands FOR SELECT USING (true);
CREATE POLICY "Public read master_vehicles" ON master_vehicles FOR SELECT USING (true);
CREATE POLICY "Public read master_variants" ON master_variants FOR SELECT USING (true);
CREATE POLICY "Public read master_motor_specs" ON master_motor_specs FOR SELECT USING (true);
CREATE POLICY "Public read master_dimensions" ON master_dimensions FOR SELECT USING (true);
CREATE POLICY "Public read master_equipment" ON master_equipment FOR SELECT USING (true);
CREATE POLICY "Public read master_colors" ON master_colors FOR SELECT USING (true);
CREATE POLICY "Public read master_wheels" ON master_wheels FOR SELECT USING (true);
CREATE POLICY "Public read master_interiors" ON master_interiors FOR SELECT USING (true);
CREATE POLICY "Public read master_packages" ON master_packages FOR SELECT USING (true);
CREATE POLICY "Public read master_warranty" ON master_warranty FOR SELECT USING (true);
CREATE POLICY "Public read variant_prices" ON variant_prices FOR SELECT USING (true);
CREATE POLICY "Public read price_history" ON price_history FOR SELECT USING (true);

-- Authenticated users can write (for scraper service)
CREATE POLICY "Authenticated write master_brands" ON master_brands FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write master_vehicles" ON master_vehicles FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write master_variants" ON master_variants FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write master_motor_specs" ON master_motor_specs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write master_dimensions" ON master_dimensions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write master_equipment" ON master_equipment FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write master_colors" ON master_colors FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write master_wheels" ON master_wheels FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write master_interiors" ON master_interiors FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write master_packages" ON master_packages FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write master_warranty" ON master_warranty FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write variant_prices" ON variant_prices FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write price_history" ON price_history FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write vehicle_master_links" ON vehicle_master_links FOR ALL USING (auth.role() = 'authenticated');

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT SELECT ON vehicle_catalog TO anon;
GRANT SELECT ON vehicle_catalog TO authenticated;
GRANT SELECT ON price_changes TO authenticated;

GRANT ALL ON master_brands TO authenticated;
GRANT ALL ON master_vehicles TO authenticated;
GRANT ALL ON master_variants TO authenticated;
GRANT ALL ON master_motor_specs TO authenticated;
GRANT ALL ON master_dimensions TO authenticated;
GRANT ALL ON master_equipment TO authenticated;
GRANT ALL ON master_colors TO authenticated;
GRANT ALL ON master_wheels TO authenticated;
GRANT ALL ON master_interiors TO authenticated;
GRANT ALL ON master_packages TO authenticated;
GRANT ALL ON master_warranty TO authenticated;
GRANT ALL ON variant_prices TO authenticated;
GRANT ALL ON price_history TO authenticated;
GRANT ALL ON vehicle_master_links TO authenticated;

GRANT EXECUTE ON FUNCTION get_current_price TO anon;
GRANT EXECUTE ON FUNCTION get_current_price TO authenticated;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE master_brands IS 'Car manufacturers/brands';
COMMENT ON TABLE master_vehicles IS 'Base vehicle models populated from technical PDFs';
COMMENT ON TABLE master_variants IS 'Specific trim levels and configurations';
COMMENT ON TABLE master_motor_specs IS 'Engine/motor specifications per motor type';
COMMENT ON TABLE master_dimensions IS 'Vehicle dimensions (shared across variants)';
COMMENT ON TABLE master_equipment IS 'Equipment items with standard/option tracking per trim';
COMMENT ON TABLE master_colors IS 'Available colors with pricing';
COMMENT ON TABLE master_packages IS 'Option packages (Plus-paket, etc.)';
COMMENT ON TABLE variant_prices IS 'Current prices - updated daily via scraping';
COMMENT ON TABLE price_history IS 'Historical price tracking for analytics';
COMMENT ON VIEW vehicle_catalog IS 'Complete vehicle catalog with current prices';
COMMENT ON VIEW price_changes IS 'Price change history with deltas';

-- =============================================================================
-- DONE!
-- =============================================================================
--
-- New architecture:
--   - Master tables store static data from PDFs (specs, equipment, dimensions)
--   - Price tables store dynamic data from scraping (updated daily)
--   - price_history automatically tracks all price changes
--   - vehicle_catalog view provides easy access to complete vehicle data
--
-- Workflow:
--   1. Import PDF → Populate master_* tables (one-time per vehicle)
--   2. Daily scrape → Update variant_prices only
--   3. Price changes auto-recorded to price_history
--
-- =============================================================================
