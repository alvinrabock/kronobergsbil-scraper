-- Migration: Create saved_links table and add default links
-- File: migrations/001_create_saved_links_with_defaults.sql

-- Create the saved_links table
CREATE TABLE IF NOT EXISTS public.saved_links (
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
    
    -- Prevent duplicate URLs per user
    UNIQUE(user_id, url)
);

-- Add Row Level Security (RLS)
ALTER TABLE public.saved_links ENABLE ROW LEVEL SECURITY;

-- Create policies for RLS
CREATE POLICY "Users can view their own saved links" ON public.saved_links
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved links" ON public.saved_links
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved links" ON public.saved_links
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved links" ON public.saved_links
    FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_saved_links_user_id ON public.saved_links(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_links_content_type ON public.saved_links(content_type);
CREATE INDEX IF NOT EXISTS idx_saved_links_is_active ON public.saved_links(is_active);
CREATE INDEX IF NOT EXISTS idx_saved_links_updated_at ON public.saved_links(updated_at);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_saved_links_updated_at
    BEFORE UPDATE ON public.saved_links
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default links (these will be available to all users)
-- Note: These are inserted with a NULL user_id so they appear as system defaults
-- You might want to create a specific system user instead

-- For now, we'll create a function to insert default links for new users
CREATE OR REPLACE FUNCTION create_default_links_for_user(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.saved_links (user_id, url, label, content_type, brand, car_type, description) VALUES
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
    
    ON CONFLICT (user_id, url) DO NOTHING; -- Prevent duplicates
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a trigger to automatically add default links when a new user is created
-- This would require access to the auth.users table which might not be available depending on your setup

COMMENT ON TABLE public.saved_links IS 'User saved links with metadata for AI processing';
COMMENT ON FUNCTION create_default_links_for_user IS 'Creates default saved links for a specific user';

-- Grant necessary permissions
GRANT ALL ON public.saved_links TO authenticated;
GRANT EXECUTE ON FUNCTION create_default_links_for_user TO authenticated;