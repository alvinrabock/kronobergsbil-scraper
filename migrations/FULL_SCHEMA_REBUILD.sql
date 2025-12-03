-- =============================================================================
-- FULL DATABASE SCHEMA REBUILD
-- Kronobergsbil Scraper - Complete database setup
-- Run this entire script in Supabase SQL Editor to recreate the database
-- =============================================================================

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Scrape sessions table - tracks each scraping session
CREATE TABLE IF NOT EXISTS scrape_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,

  -- Page metadata
  page_title TEXT,
  page_description TEXT,
  content_length INTEGER,
  links_found INTEGER DEFAULT 0,
  links_fetched INTEGER DEFAULT 0,

  -- Processing results
  content_type TEXT CHECK (content_type IN ('campaigns', 'cars', 'transport_cars')),
  total_items INTEGER DEFAULT 0,
  success_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0
);

-- Raw scraped content table - stores the HTML and basic data
CREATE TABLE IF NOT EXISTS scraped_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES scrape_sessions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  cleaned_html TEXT,
  raw_html TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Basic scraped fields
  price TEXT,
  year TEXT,
  mileage TEXT,
  content TEXT
);

-- AI processed results table - stores the AI-enhanced data
CREATE TABLE IF NOT EXISTS ai_processed_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES scrape_sessions(id) ON DELETE CASCADE,
  scraped_content_id UUID REFERENCES scraped_content(id) ON DELETE CASCADE,
  content_type TEXT CHECK (content_type IN ('campaigns', 'cars', 'transport_cars')) NOT NULL,
  success BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- AI processing metadata
  token_usage JSONB,
  processing_time_ms INTEGER,
  model_used TEXT,

  -- Fact checking results
  fact_check_score INTEGER CHECK (fact_check_score >= 0 AND fact_check_score <= 100),
  fact_check_confidence TEXT CHECK (fact_check_confidence IN ('high', 'medium', 'low')),
  fact_check_issues JSONB,
  verified_fields TEXT[],

  -- Debug information for troubleshooting
  debug_info JSONB,

  error_message TEXT,

  -- Cost tracking (from migration 002)
  total_estimated_cost_usd DECIMAL(10, 8) DEFAULT 0,
  api_calls JSONB DEFAULT '[]'::jsonb,

  -- PDF processing (from migration 004)
  pdf_processing JSONB
);

-- Campaigns table - stores processed campaign data
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ai_result_id UUID REFERENCES ai_processed_results(id) ON DELETE CASCADE,
  session_id UUID REFERENCES scrape_sessions(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  thumbnail_url TEXT,
  brand TEXT,

  campaign_start DATE,
  campaign_end DATE,
  free_text TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Campaign vehicle models - stores vehicle data within campaigns
CREATE TABLE IF NOT EXISTS campaign_vehicle_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  price DECIMAL(12,2),
  old_price DECIMAL(12,2),
  privatleasing DECIMAL(12,2),
  company_leasing_price DECIMAL(12,2),
  loan_price DECIMAL(12,2),
  thumbnail_url TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Campaign included items - what's included in campaign offers
CREATE TABLE IF NOT EXISTS campaign_included_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vehicles table - stores processed car/transport car data
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ai_result_id UUID REFERENCES ai_processed_results(id) ON DELETE CASCADE,
  session_id UUID REFERENCES scrape_sessions(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  brand TEXT,
  description TEXT,
  thumbnail_url TEXT,
  vehicle_type TEXT CHECK (vehicle_type IN ('cars', 'transport_cars')) NOT NULL,
  free_text TEXT,

  -- PDF source tracking (from migration 003)
  pdf_source_url TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vehicle models - stores specific model variants within vehicles
CREATE TABLE IF NOT EXISTS vehicle_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  price DECIMAL(12,2),
  old_price DECIMAL(12,2),
  privatleasing DECIMAL(12,2),
  company_leasing_price DECIMAL(12,2),
  loan_price DECIMAL(12,2),
  thumbnail_url TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Linked content table - stores content from followed links
CREATE TABLE IF NOT EXISTS linked_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES scrape_sessions(id) ON DELETE CASCADE,

  url TEXT NOT NULL,
  title TEXT,
  content TEXT,
  cleaned_html TEXT,
  link_text TEXT,
  success BOOLEAN DEFAULT false,
  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Saved links table (from migration 001)
CREATE TABLE IF NOT EXISTS saved_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  label TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('campaigns', 'cars', 'transport_cars')),
  brand TEXT,
  car_type TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_scraped TIMESTAMPTZ,
  scrape_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,

  -- Cost tracking (from migration 002)
  total_cost_usd DECIMAL(10, 8) DEFAULT 0,
  avg_cost_per_scrape DECIMAL(10, 8) DEFAULT 0,
  last_scrape_cost DECIMAL(10, 8) DEFAULT 0,

  -- Prevent duplicate URLs per user
  UNIQUE(user_id, url)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_scrape_sessions_user_id ON scrape_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_scrape_sessions_status ON scrape_sessions(status);
CREATE INDEX IF NOT EXISTS idx_scrape_sessions_created_at ON scrape_sessions(created_at);

CREATE INDEX IF NOT EXISTS idx_scraped_content_session_id ON scraped_content(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_processed_results_session_id ON ai_processed_results(session_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_session_id ON campaigns(session_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_session_id ON vehicles(session_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_type ON vehicles(vehicle_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_pdf_source_url ON vehicles(pdf_source_url);

CREATE INDEX IF NOT EXISTS idx_saved_links_user_id ON saved_links(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_links_content_type ON saved_links(content_type);
CREATE INDEX IF NOT EXISTS idx_saved_links_is_active ON saved_links(is_active);
CREATE INDEX IF NOT EXISTS idx_saved_links_updated_at ON saved_links(updated_at);
CREATE INDEX IF NOT EXISTS idx_saved_links_cost ON saved_links(total_cost_usd);

CREATE INDEX IF NOT EXISTS idx_ai_processed_results_cost ON ai_processed_results(total_estimated_cost_usd);
CREATE INDEX IF NOT EXISTS idx_ai_processed_results_created_date ON ai_processed_results(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_results_pdf_processing ON ai_processed_results USING GIN (pdf_processing);
CREATE INDEX IF NOT EXISTS idx_ai_results_debug_info ON ai_processed_results USING GIN (debug_info);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to create default links for a user
CREATE OR REPLACE FUNCTION create_default_links_for_user(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO saved_links (user_id, url, label, content_type, brand, car_type, description) VALUES
    -- Campaign URLs
    (target_user_id, 'https://kronobergsbil.bilforetag.se/vaxjo/erbjudanden/', 'Main Offers', 'campaigns', 'Multi-brand', NULL, 'Main offers and campaigns page'),
    (target_user_id, 'https://suzukibilar.se/kopa-suzuki/kampanjer-erbjudanden', 'Suzuki Campaigns', 'campaigns', 'Suzuki', NULL, 'Suzuki specific campaigns and offers'),
    (target_user_id, 'https://www.honda.se/cars/offers0.html', 'Honda Campaigns', 'campaigns', 'Honda', NULL, 'Honda car offers and promotions'),

    -- Car URLs
    (target_user_id, 'https://kronobergsbil.bilforetag.se/vaxjo/personbilar/', 'Personbilar', 'cars', 'Multi-brand', 'Passenger Cars', 'Main passenger car inventory'),
    (target_user_id, 'https://suzukibilar.se/modeller', 'Suzuki Models', 'cars', 'Suzuki', 'Passenger Cars', 'Suzuki car models and specifications'),
    (target_user_id, 'https://www.honda.se/cars.html', 'Honda Models', 'cars', 'Honda', 'Passenger Cars', 'Honda car lineup and models'),

    -- Transport Car URLs
    (target_user_id, 'https://kronobergsbil.bilforetag.se/vaxjo/transportbilar/', 'Transportbilar', 'transport_cars', 'Multi-brand', 'Commercial Vehicles', 'Commercial and transport vehicle inventory')

    ON CONFLICT (user_id, url) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Function to update saved_link cost tracking
CREATE OR REPLACE FUNCTION update_saved_link_cost(
    link_id UUID,
    scrape_cost DECIMAL(10, 8)
) RETURNS void AS $$
BEGIN
    UPDATE saved_links
    SET
        total_cost_usd = total_cost_usd + scrape_cost,
        last_scrape_cost = scrape_cost,
        avg_cost_per_scrape = (total_cost_usd + scrape_cost) / GREATEST(scrape_count, 1)
    WHERE id = link_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Drop existing triggers if they exist (to avoid conflicts)
DROP TRIGGER IF EXISTS update_scrape_sessions_updated_at ON scrape_sessions;
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
DROP TRIGGER IF EXISTS update_vehicles_updated_at ON vehicles;
DROP TRIGGER IF EXISTS update_saved_links_updated_at ON saved_links;

-- Create triggers
CREATE TRIGGER update_scrape_sessions_updated_at
  BEFORE UPDATE ON scrape_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saved_links_updated_at
  BEFORE UPDATE ON saved_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE scrape_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_processed_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_vehicle_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_included_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE linked_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_links ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own scrape sessions" ON scrape_sessions;
DROP POLICY IF EXISTS "Users can view their own scraped content" ON scraped_content;
DROP POLICY IF EXISTS "Users can view their own AI results" ON ai_processed_results;
DROP POLICY IF EXISTS "Users can view their own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can view their own campaign vehicle models" ON campaign_vehicle_models;
DROP POLICY IF EXISTS "Users can view their own campaign included items" ON campaign_included_items;
DROP POLICY IF EXISTS "Users can view their own vehicles" ON vehicles;
DROP POLICY IF EXISTS "Users can view their own vehicle models" ON vehicle_models;
DROP POLICY IF EXISTS "Users can view their own linked content" ON linked_content;
DROP POLICY IF EXISTS "Users can view their own saved links" ON saved_links;
DROP POLICY IF EXISTS "Users can insert their own saved links" ON saved_links;
DROP POLICY IF EXISTS "Users can update their own saved links" ON saved_links;
DROP POLICY IF EXISTS "Users can delete their own saved links" ON saved_links;

-- Create policies
CREATE POLICY "Users can view their own scrape sessions" ON scrape_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own scraped content" ON scraped_content
  FOR ALL USING (auth.uid() = (SELECT user_id FROM scrape_sessions WHERE id = session_id));

CREATE POLICY "Users can view their own AI results" ON ai_processed_results
  FOR ALL USING (auth.uid() = (SELECT user_id FROM scrape_sessions WHERE id = session_id));

CREATE POLICY "Users can view their own campaigns" ON campaigns
  FOR ALL USING (auth.uid() = (SELECT user_id FROM scrape_sessions WHERE id = session_id));

CREATE POLICY "Users can view their own campaign vehicle models" ON campaign_vehicle_models
  FOR ALL USING (auth.uid() = (SELECT s.user_id FROM scrape_sessions s JOIN campaigns c ON c.session_id = s.id WHERE c.id = campaign_id));

CREATE POLICY "Users can view their own campaign included items" ON campaign_included_items
  FOR ALL USING (auth.uid() = (SELECT s.user_id FROM scrape_sessions s JOIN campaigns c ON c.session_id = s.id WHERE c.id = campaign_id));

CREATE POLICY "Users can view their own vehicles" ON vehicles
  FOR ALL USING (auth.uid() = (SELECT user_id FROM scrape_sessions WHERE id = session_id));

CREATE POLICY "Users can view their own vehicle models" ON vehicle_models
  FOR ALL USING (auth.uid() = (SELECT s.user_id FROM scrape_sessions s JOIN vehicles v ON v.session_id = s.id WHERE v.id = vehicle_id));

CREATE POLICY "Users can view their own linked content" ON linked_content
  FOR ALL USING (auth.uid() = (SELECT user_id FROM scrape_sessions WHERE id = session_id));

CREATE POLICY "Users can view their own saved links" ON saved_links
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved links" ON saved_links
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved links" ON saved_links
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved links" ON saved_links
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Cost analytics view
CREATE OR REPLACE VIEW cost_analytics AS
SELECT
    DATE(created_at) as scrape_date,
    content_type,
    COUNT(*) as total_scrapes,
    SUM(total_estimated_cost_usd) as daily_cost,
    AVG(total_estimated_cost_usd) as avg_cost_per_scrape,
    MIN(total_estimated_cost_usd) as min_cost,
    MAX(total_estimated_cost_usd) as max_cost,
    SUM(CASE WHEN model_used ILIKE '%gpt-4%' THEN total_estimated_cost_usd ELSE 0 END) as openai_cost,
    SUM(CASE WHEN model_used ILIKE '%sonar%' THEN total_estimated_cost_usd ELSE 0 END) as perplexity_cost
FROM ai_processed_results
WHERE total_estimated_cost_usd IS NOT NULL
GROUP BY DATE(created_at), content_type
ORDER BY scrape_date DESC;

-- =============================================================================
-- PERMISSIONS
-- =============================================================================

GRANT ALL ON saved_links TO authenticated;
GRANT EXECUTE ON FUNCTION create_default_links_for_user TO authenticated;
GRANT EXECUTE ON FUNCTION update_saved_link_cost TO authenticated;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE saved_links IS 'User saved links with metadata for AI processing';
COMMENT ON FUNCTION create_default_links_for_user IS 'Creates default saved links for a specific user';
COMMENT ON COLUMN ai_processed_results.total_estimated_cost_usd IS 'Total estimated cost in USD for all API calls in this processing session';
COMMENT ON COLUMN ai_processed_results.api_calls IS 'JSON array containing details of each API call made during processing';
COMMENT ON COLUMN ai_processed_results.pdf_processing IS 'JSON object containing PDF processing results, status, and metadata';
COMMENT ON COLUMN ai_processed_results.debug_info IS 'JSON object containing debug information about the AI processing pipeline';
COMMENT ON COLUMN saved_links.total_cost_usd IS 'Cumulative cost in USD for all scrapes of this link';
COMMENT ON COLUMN saved_links.avg_cost_per_scrape IS 'Average cost per scrape for this link';
COMMENT ON COLUMN saved_links.last_scrape_cost IS 'Cost of the most recent scrape';
COMMENT ON COLUMN vehicles.pdf_source_url IS 'URL of the PDF file where this vehicle data was extracted from';
COMMENT ON VIEW cost_analytics IS 'Aggregated view for analyzing daily scraping costs by content type and AI provider';

-- =============================================================================
-- DONE!
-- =============================================================================
-- Your database schema has been recreated successfully.
--
-- Tables created:
--   - scrape_sessions
--   - scraped_content
--   - ai_processed_results
--   - campaigns
--   - campaign_vehicle_models
--   - campaign_included_items
--   - vehicles
--   - vehicle_models
--   - linked_content
--   - saved_links
--
-- Next steps:
--   1. Create a user in Supabase Auth
--   2. The app should now work with the new database
-- =============================================================================
