-- Database schema for scraper results

-- Enable RLS (Row Level Security)
ALTER DATABASE postgres SET "app.jwt_secret" = 'your-jwt-secret';

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Scrape sessions table - tracks each scraping session
CREATE TABLE scrape_sessions (
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
CREATE TABLE scraped_content (
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
CREATE TABLE ai_processed_results (
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
  
  error_message TEXT
);

-- Campaigns table - stores processed campaign data
CREATE TABLE campaigns (
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
CREATE TABLE campaign_vehicle_models (
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
CREATE TABLE campaign_included_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vehicles table - stores processed car/transport car data
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ai_result_id UUID REFERENCES ai_processed_results(id) ON DELETE CASCADE,
  session_id UUID REFERENCES scrape_sessions(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  brand TEXT,
  description TEXT,
  thumbnail_url TEXT,
  vehicle_type TEXT CHECK (vehicle_type IN ('cars', 'transport_cars')) NOT NULL,
  free_text TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vehicle models - stores specific model variants within vehicles
CREATE TABLE vehicle_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  price DECIMAL(12,2),
  old_price DECIMAL(12,2),
  privatleasing DECIMAL(12,2),
  company_leasing_price DECIMAL(12,2),
  loan_price DECIMAL(12,2),
  thumbnail_url TEXT,

  -- Vehicle specifications
  bransle TEXT,  -- Fuel type: El, Bensin, Diesel, Hybrid, Laddhybrid
  biltyp TEXT,   -- Vehicle type: suv, sedan, kombi, halvkombi, cab, coupe, minibuss, pickup, transportbil
  vaxellada TEXT, -- Transmission: Automat, Manuell

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns to existing table if they don't exist (for migrations)
-- ALTER TABLE vehicle_models ADD COLUMN IF NOT EXISTS bransle TEXT;
-- ALTER TABLE vehicle_models ADD COLUMN IF NOT EXISTS biltyp TEXT;
-- ALTER TABLE vehicle_models ADD COLUMN IF NOT EXISTS vaxellada TEXT;

-- Linked content table - stores content from followed links
CREATE TABLE linked_content (
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

-- Scrape logs table - stores server-side processing logs for debugging
CREATE TABLE scrape_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES scrape_sessions(id) ON DELETE CASCADE,

  level TEXT CHECK (level IN ('info', 'warn', 'error', 'debug')) NOT NULL DEFAULT 'info',
  step TEXT,  -- e.g., 'scraping', 'pdf_extraction', 'ai_processing', 'saving'
  message TEXT NOT NULL,
  details JSONB,  -- Additional structured data (e.g., PDF URLs, token usage, errors)

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_scrape_sessions_user_id ON scrape_sessions(user_id);
CREATE INDEX idx_scrape_sessions_status ON scrape_sessions(status);
CREATE INDEX idx_scrape_sessions_created_at ON scrape_sessions(created_at);

CREATE INDEX idx_scraped_content_session_id ON scraped_content(session_id);
CREATE INDEX idx_ai_processed_results_session_id ON ai_processed_results(session_id);

CREATE INDEX idx_campaigns_session_id ON campaigns(session_id);
CREATE INDEX idx_vehicles_session_id ON vehicles(session_id);
CREATE INDEX idx_vehicles_vehicle_type ON vehicles(vehicle_type);
CREATE INDEX idx_scrape_logs_session_id ON scrape_logs(session_id);
CREATE INDEX idx_scrape_logs_level ON scrape_logs(level);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_scrape_sessions_updated_at BEFORE UPDATE ON scrape_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security policies
ALTER TABLE scrape_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_processed_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_vehicle_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_included_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE linked_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users to access their own data
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

CREATE POLICY "Users can view their own scrape logs" ON scrape_logs
  FOR ALL USING (auth.uid() = (SELECT user_id FROM scrape_sessions WHERE id = session_id));