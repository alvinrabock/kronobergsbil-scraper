-- Migration: Add URL-Brand Registry and PDF Price Sources
-- Supports:
-- 1. Linking URLs to brands (product pages)
-- 2. Linking PDFs to brands (can be on product page or separate PDF hub)
-- 3. Brand-level configuration for PDF parsing

-- ============================================
-- Table 1: Brand Sources (brand-level config)
-- ============================================
CREATE TABLE IF NOT EXISTS brand_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Brand identification
  brand TEXT NOT NULL UNIQUE,
  brand_slug TEXT,  -- URL-friendly slug (e.g., "fiat-professional")

  -- Main website URLs
  main_website_url TEXT,  -- e.g., https://www.mazda.se
  models_page_url TEXT,   -- e.g., https://www.mazda.se/bilar
  campaigns_page_url TEXT, -- e.g., https://www.mazda.se/erbjudanden

  -- PDF hub URL (if PDFs are collected on a separate page)
  pdf_hub_url TEXT,  -- e.g., https://dealer.se/prislistor or null if PDFs are on product pages

  -- PDF parsing configuration
  pdf_parser_config JSONB DEFAULT '{}'::jsonb,
  -- Example config:
  -- {
  --   "price_page_index": 1,
  --   "price_pattern": "regex here",
  --   "variant_normalizer": "function name or config"
  -- }

  -- Display settings
  logo_url TEXT,
  display_order INTEGER DEFAULT 100,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Table 2: URL-Brand Registry (product pages)
-- ============================================
CREATE TABLE IF NOT EXISTS url_brand_registry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- The URL (product page, campaign page, etc.)
  url TEXT NOT NULL,

  -- Brand association (references brand_sources.brand)
  brand TEXT NOT NULL,

  -- What type of content is on this URL
  content_type TEXT CHECK (content_type IN ('campaigns', 'cars', 'transport_cars', 'model_page')),

  -- Model association (optional - for model-specific pages)
  model_name TEXT,  -- e.g., "CX-80", "Swift", "Mokka"

  -- Optional label for display
  label TEXT,

  -- Link to PDF pricelist (optional - if PDF is on this page or directly linked)
  pdf_pricelist_id UUID,  -- References pdf_pricelists.id

  -- Tracking
  last_scraped_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- Active/inactive flag
  is_active BOOLEAN DEFAULT true
);

-- ============================================
-- Table 3: PDF Pricelists
-- ============================================
CREATE TABLE IF NOT EXISTS pdf_pricelists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- PDF URL
  pdf_url TEXT NOT NULL,

  -- Brand association
  brand TEXT NOT NULL,

  -- Model association (can cover multiple models or be brand-wide)
  model_name TEXT,  -- null = covers all models for this brand

  -- Source information
  source_type TEXT CHECK (source_type IN ('product_page', 'pdf_hub', 'direct_link', 'manual')),
  source_url TEXT,  -- Where we found this PDF (the page it was on)

  -- Display info
  label TEXT,  -- e.g., "Mazda CX-80 Prislista November 2025"

  -- Date info extracted from PDF or filename
  valid_from DATE,
  valid_to DATE,

  -- Change detection
  content_hash TEXT,
  file_size_bytes INTEGER,

  -- Extracted price data (cached)
  extracted_prices JSONB,  -- Cached parsed prices from this PDF
  -- Example:
  -- {
  --   "extracted_at": "2025-12-03T10:00:00Z",
  --   "variants": [
  --     {"name": "e-Skyactiv PHEV Exclusive-line", "price": 574400},
  --     {"name": "e-Skyactiv PHEV Homura", "price": 638200}
  --   ]
  -- }

  -- Tracking
  last_checked_at TIMESTAMP WITH TIME ZONE,
  last_changed_at TIMESTAMP WITH TIME ZONE,
  check_frequency_hours INTEGER DEFAULT 24,  -- How often to check for updates

  -- Status
  is_active BOOLEAN DEFAULT true,
  parse_status TEXT CHECK (parse_status IN ('pending', 'success', 'failed', 'needs_review')),
  parse_error TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

-- brand_sources indexes
CREATE INDEX IF NOT EXISTS idx_brand_sources_brand ON brand_sources(brand);
CREATE INDEX IF NOT EXISTS idx_brand_sources_active ON brand_sources(is_active) WHERE is_active = true;

-- url_brand_registry indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_url_brand_registry_url_brand
ON url_brand_registry (url, brand);
CREATE INDEX IF NOT EXISTS idx_url_brand_registry_brand ON url_brand_registry(brand);
CREATE INDEX IF NOT EXISTS idx_url_brand_registry_content_type ON url_brand_registry(content_type);
CREATE INDEX IF NOT EXISTS idx_url_brand_registry_model ON url_brand_registry(model_name) WHERE model_name IS NOT NULL;

-- pdf_pricelists indexes
CREATE INDEX IF NOT EXISTS idx_pdf_pricelists_brand ON pdf_pricelists(brand);
CREATE INDEX IF NOT EXISTS idx_pdf_pricelists_model ON pdf_pricelists(model_name) WHERE model_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pdf_pricelists_active ON pdf_pricelists(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pdf_pricelists_check ON pdf_pricelists(last_checked_at) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_pricelists_url_brand ON pdf_pricelists(pdf_url, brand);

-- ============================================
-- Foreign key for url_brand_registry -> pdf_pricelists
-- ============================================
ALTER TABLE url_brand_registry
ADD CONSTRAINT fk_url_brand_pdf_pricelist
FOREIGN KEY (pdf_pricelist_id) REFERENCES pdf_pricelists(id) ON DELETE SET NULL;

-- ============================================
-- Triggers for updated_at
-- ============================================
CREATE TRIGGER update_brand_sources_updated_at
BEFORE UPDATE ON brand_sources
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_url_brand_registry_updated_at
BEFORE UPDATE ON url_brand_registry
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pdf_pricelists_updated_at
BEFORE UPDATE ON pdf_pricelists
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE brand_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE url_brand_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_pricelists ENABLE ROW LEVEL SECURITY;

-- Policies for viewing (all authenticated users)
CREATE POLICY "Users can view brand sources" ON brand_sources
  FOR SELECT USING (true);

CREATE POLICY "Users can view URL registry" ON url_brand_registry
  FOR SELECT USING (true);

CREATE POLICY "Users can view PDF pricelists" ON pdf_pricelists
  FOR SELECT USING (true);

-- Policies for managing (authenticated users only)
CREATE POLICY "Users can manage brand sources" ON brand_sources
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage URL registry" ON url_brand_registry
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage PDF pricelists" ON pdf_pricelists
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================
-- Add brand column to scrape_sessions
-- ============================================
ALTER TABLE scrape_sessions ADD COLUMN IF NOT EXISTS brand TEXT;
CREATE INDEX IF NOT EXISTS idx_scrape_sessions_brand ON scrape_sessions(brand);

-- ============================================
-- Seed data: Initial brand sources
-- ============================================
INSERT INTO brand_sources (brand, brand_slug, main_website_url, is_active) VALUES
  ('Mazda', 'mazda', 'https://www.mazda.se', true),
  ('Suzuki', 'suzuki', 'https://suzukibilar.se', true),
  ('Honda', 'honda', 'https://www.honda.se', true),
  ('Opel', 'opel', 'https://www.opel.se', true),
  ('Subaru', 'subaru', 'https://www.subaru.se', true),
  ('Isuzu', 'isuzu', 'https://www.isuzu.se', true),
  ('MG', 'mg', 'https://www.mg.se', true),
  ('Maxus', 'maxus', 'https://www.maxus.se', true),
  ('Fiat Professional', 'fiat-professional', 'https://www.fiatprofessional.se', true)
ON CONFLICT (brand) DO NOTHING;

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE brand_sources IS 'Brand-level configuration including PDF hub URLs and parser settings';
COMMENT ON TABLE url_brand_registry IS 'Registry of product/campaign URLs and their brand associations';
COMMENT ON TABLE pdf_pricelists IS 'PDF price list sources with change detection and cached prices';

COMMENT ON COLUMN brand_sources.pdf_hub_url IS 'URL where all PDFs for this brand are collected (if not on product pages)';
COMMENT ON COLUMN brand_sources.pdf_parser_config IS 'JSON config for parsing PDFs (page index, regex patterns, etc.)';

COMMENT ON COLUMN url_brand_registry.pdf_pricelist_id IS 'Link to the PDF containing prices for this product page';
COMMENT ON COLUMN url_brand_registry.model_name IS 'Specific model this URL is for (e.g., CX-80, Swift)';

COMMENT ON COLUMN pdf_pricelists.source_type IS 'Where we found this PDF: product_page, pdf_hub, direct_link, or manual';
COMMENT ON COLUMN pdf_pricelists.extracted_prices IS 'Cached parsed price data from this PDF';
COMMENT ON COLUMN pdf_pricelists.content_hash IS 'Hash for detecting if PDF content has changed';
