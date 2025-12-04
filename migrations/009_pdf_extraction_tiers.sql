-- Migration: Add Two-Tier PDF Extraction Support
-- Purpose: Track full extraction vs price-only updates to minimize expensive custom extractor usage
--
-- Strategy:
-- - First time or new model: Use custom Document AI extractor (expensive, ~$1.50/1000 pages)
-- - Subsequent updates: Use standard OCR (cheap) for price updates only
-- - Track extraction history to know when full extraction was done

-- ============================================
-- Add columns to pdf_pricelists for extraction tracking
-- ============================================

-- Full extraction data (variants, equipment, specs from custom extractor)
ALTER TABLE pdf_pricelists ADD COLUMN IF NOT EXISTS full_extraction_data JSONB;
-- Example:
-- {
--   "extracted_at": "2025-12-03T10:00:00Z",
--   "extractor_type": "custom",
--   "variants": [...],
--   "equipment": {...},
--   "specifications": {...}
-- }

-- Track when full extraction was done (custom extractor)
ALTER TABLE pdf_pricelists ADD COLUMN IF NOT EXISTS full_extraction_at TIMESTAMP WITH TIME ZONE;

-- Track which processor was used
ALTER TABLE pdf_pricelists ADD COLUMN IF NOT EXISTS last_extractor_type TEXT CHECK (last_extractor_type IN ('custom', 'standard_ocr', 'pdf_parse', 'claude'));

-- Track price-only updates separately
ALTER TABLE pdf_pricelists ADD COLUMN IF NOT EXISTS last_price_update_at TIMESTAMP WITH TIME ZONE;

-- Store the custom extractor processor ID used (in case it changes)
ALTER TABLE pdf_pricelists ADD COLUMN IF NOT EXISTS custom_extractor_processor_id TEXT;

-- ============================================
-- Table: model_extraction_status
-- Tracks which models have full data vs need custom extraction
-- ============================================
CREATE TABLE IF NOT EXISTS model_extraction_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Model identification
  brand TEXT NOT NULL,
  model_name TEXT NOT NULL,

  -- Status of extraction
  has_full_data BOOLEAN DEFAULT false,

  -- What data we have
  has_variants BOOLEAN DEFAULT false,
  has_equipment BOOLEAN DEFAULT false,
  has_specifications BOOLEAN DEFAULT false,
  has_prices BOOLEAN DEFAULT false,

  -- Source PDF for full extraction
  source_pdf_url TEXT,
  source_pdf_pricelist_id UUID REFERENCES pdf_pricelists(id),

  -- Timestamps
  full_extraction_at TIMESTAMP WITH TIME ZONE,
  last_price_update_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(brand, model_name)
);

-- ============================================
-- Indexes for model_extraction_status
-- ============================================
CREATE INDEX IF NOT EXISTS idx_model_extraction_brand ON model_extraction_status(brand);
CREATE INDEX IF NOT EXISTS idx_model_extraction_model ON model_extraction_status(model_name);
CREATE INDEX IF NOT EXISTS idx_model_extraction_needs_full
  ON model_extraction_status(brand, model_name)
  WHERE has_full_data = false;

-- ============================================
-- Trigger for updated_at
-- ============================================
CREATE TRIGGER update_model_extraction_status_updated_at
BEFORE UPDATE ON model_extraction_status
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE model_extraction_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view model extraction status" ON model_extraction_status
  FOR SELECT USING (true);

CREATE POLICY "Users can manage model extraction status" ON model_extraction_status
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE model_extraction_status IS 'Tracks which models have full extraction data vs need custom extraction';
COMMENT ON COLUMN pdf_pricelists.full_extraction_data IS 'Complete extracted data from custom Document AI extractor (variants, equipment, specs)';
COMMENT ON COLUMN pdf_pricelists.full_extraction_at IS 'When full extraction with custom extractor was performed';
COMMENT ON COLUMN pdf_pricelists.last_extractor_type IS 'Which extractor was used last (custom, standard_ocr, pdf_parse, claude)';
COMMENT ON COLUMN model_extraction_status.has_full_data IS 'True if model has complete data from custom extractor';
