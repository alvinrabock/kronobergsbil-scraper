-- Migration: Add comprehensive token and cost tracking
-- File: migrations/002_add_token_cost_tracking.sql

-- Add cost tracking fields to ai_processed_results table
ALTER TABLE public.ai_processed_results 
ADD COLUMN IF NOT EXISTS total_estimated_cost_usd DECIMAL(10, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS api_calls JSONB DEFAULT '[]'::jsonb;

-- Add cost tracking to saved_links for per-link cost monitoring
ALTER TABLE public.saved_links 
ADD COLUMN IF NOT EXISTS total_cost_usd DECIMAL(10, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_cost_per_scrape DECIMAL(10, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_scrape_cost DECIMAL(10, 8) DEFAULT 0;

-- Create indexes for cost analysis
CREATE INDEX IF NOT EXISTS idx_ai_processed_results_cost 
ON public.ai_processed_results(total_estimated_cost_usd);

CREATE INDEX IF NOT EXISTS idx_ai_processed_results_created_date 
ON public.ai_processed_results(created_at);

CREATE INDEX IF NOT EXISTS idx_saved_links_cost 
ON public.saved_links(total_cost_usd);

-- Create a view for cost analysis
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
FROM public.ai_processed_results 
WHERE total_estimated_cost_usd IS NOT NULL
GROUP BY DATE(created_at), content_type
ORDER BY scrape_date DESC;

-- Function to update saved_links cost tracking
CREATE OR REPLACE FUNCTION update_saved_link_cost(
    link_id UUID,
    scrape_cost DECIMAL(10, 8)
) RETURNS void AS $$
BEGIN
    UPDATE public.saved_links 
    SET 
        total_cost_usd = total_cost_usd + scrape_cost,
        last_scrape_cost = scrape_cost,
        avg_cost_per_scrape = (total_cost_usd + scrape_cost) / GREATEST(scrape_count, 1)
    WHERE id = link_id;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON COLUMN ai_processed_results.total_estimated_cost_usd IS 'Total estimated cost in USD for all API calls in this processing session';
COMMENT ON COLUMN ai_processed_results.api_calls IS 'JSON array containing details of each API call made during processing';
COMMENT ON COLUMN saved_links.total_cost_usd IS 'Cumulative cost in USD for all scrapes of this link';
COMMENT ON COLUMN saved_links.avg_cost_per_scrape IS 'Average cost per scrape for this link';
COMMENT ON COLUMN saved_links.last_scrape_cost IS 'Cost of the most recent scrape';
COMMENT ON VIEW cost_analytics IS 'Aggregated view for analyzing daily scraping costs by content type and AI provider';