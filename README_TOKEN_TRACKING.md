# Token Usage and Cost Tracking Implementation

This document explains the comprehensive token usage and cost tracking system implemented for monitoring API costs from ChatGPT (OpenAI) and Perplexity APIs.

## 📋 Overview

The system tracks:
- **OpenAI API calls** (GPT-4o, GPT-4o-mini, GPT-5)
- **Perplexity API calls** (Sonar model)
- **Real-time cost calculations** based on current pricing
- **Per-scrape cost tracking** for saved links
- **Comprehensive cost analytics** and reporting

## 🏗️ Architecture

### Core Components

1. **Token Usage Types** (`src/lib/ai-processor-types.ts`)
   - Enhanced `TokenUsage` interface with cost tracking
   - `ApiCallDetails` for detailed API call information
   - Cost calculation utilities with current pricing

2. **Database Schema** (`migrations/002_add_token_cost_tracking.sql`)
   - Enhanced `ai_processed_results` table with cost fields
   - Extended `saved_links` table with cost tracking
   - Cost analytics view for reporting
   - Database function for saved link cost updates

3. **AI Processing** (`src/lib/ai-processor.ts`)
   - Token tracking in all OpenAI API calls
   - Token tracking in all Perplexity API calls
   - Cost calculation and logging

4. **Database Service** (`src/lib/database/scrapeService.ts`)
   - Cost storage in AI processing results
   - Saved link cost tracking updates
   - Enhanced result saving with cost information

5. **User Interface** (`src/components/SavedLinks/SavedLinksManager.tsx`)
   - Cost display for each saved link
   - Total cost, average cost, and last scrape cost
   - User-friendly cost formatting

## 💰 Pricing Configuration

Current API pricing (as of 2024):

### OpenAI Pricing
- **GPT-4o**: $2.50 per 1M prompt tokens, $10.00 per 1M completion tokens
- **GPT-4o-mini**: $0.15 per 1M prompt tokens, $0.60 per 1M completion tokens
- **GPT-5**: $3.00 per 1M prompt tokens, $15.00 per 1M completion tokens (estimated)

### Perplexity Pricing
- **Sonar**: $1.00 per 1M prompt tokens, $3.00 per 1M completion tokens (estimated)

> **Note**: Pricing should be updated regularly in `src/lib/ai-processor-types.ts`

## 🗄️ Database Schema Changes

### New Fields in `ai_processed_results`
```sql
total_estimated_cost_usd DECIMAL(10, 8) -- Total cost for all API calls
api_calls JSONB                        -- Detailed API call information
```

### New Fields in `saved_links`
```sql
total_cost_usd DECIMAL(10, 8)        -- Cumulative cost for all scrapes
avg_cost_per_scrape DECIMAL(10, 8)   -- Average cost per scrape
last_scrape_cost DECIMAL(10, 8)      -- Cost of most recent scrape
```

### Cost Analytics View
```sql
CREATE VIEW cost_analytics AS
SELECT 
    DATE(created_at) as scrape_date,
    content_type,
    COUNT(*) as total_scrapes,
    SUM(total_estimated_cost_usd) as daily_cost,
    AVG(total_estimated_cost_usd) as avg_cost_per_scrape,
    -- ... more analytics fields
```

## 🔧 Implementation Details

### Token Tracking Flow

1. **API Call Made**
   - OpenAI or Perplexity API called
   - Response includes usage information

2. **Cost Calculation**
   - Extract prompt_tokens and completion_tokens
   - Calculate cost using current pricing
   - Create TokenUsage object with cost

3. **Database Storage**
   - Store token usage in ai_processed_results
   - Calculate total cost for the session
   - Update saved_links cost tracking if applicable

4. **User Display**
   - Show costs in SavedLinksManager
   - Format costs appropriately (show in thousandths for small amounts)

### Key Functions

#### Cost Calculation
```typescript
export function calculateTokenCost(
  promptTokens: number,
  completionTokens: number,
  model: string,
  provider: 'openai' | 'perplexity'
): number
```

#### Token Usage Creation
```typescript
export function createTokenUsage(
  promptTokens: number,
  completionTokens: number,
  model: string,
  provider: 'openai' | 'perplexity'
): TokenUsage
```

#### Cost Formatting
```typescript
export function formatCost(costUsd: number): string
```

## 📊 Usage Examples

### Console Logging
The system provides detailed logging:
```
💰 Token usage - Prompt: 1234, Completion: 567, Cost: $0.012345
💰 Stored AI result with total cost: $0.015678
💰 Updated cost tracking for link abc123: $0.003456
```

### User Interface
Saved links display shows:
- **Total cost**: $0.0234 (cumulative for all scrapes)
- **Avg**: $0.0078 (average per scrape)
- **Last**: $0.0089 (most recent scrape cost)

### Database Queries
```sql
-- Daily cost analysis
SELECT * FROM cost_analytics WHERE scrape_date = CURRENT_DATE;

-- Most expensive links
SELECT label, total_cost_usd, scrape_count 
FROM saved_links 
ORDER BY total_cost_usd DESC;

-- Cost by content type
SELECT content_type, SUM(total_estimated_cost_usd) as total_cost
FROM ai_processed_results 
GROUP BY content_type;
```

## 🚀 Setup Instructions

1. **Apply Database Migration**
   ```sql
   -- Run the migration file in Supabase Dashboard
   migrations/002_add_token_cost_tracking.sql
   ```

2. **Update Environment Variables**
   Ensure API keys are configured:
   ```env
   OPENAI_API_KEY=your_openai_key
   PERPLEXITY_API_KEY=your_perplexity_key
   ```

3. **Test the Implementation**
   - Perform a scrape operation
   - Check console logs for cost information
   - Verify cost display in SavedLinksManager
   - Check database for stored cost data

## 📈 Cost Analytics Features

### Built-in Analytics
- Daily cost breakdowns
- Cost per content type (campaigns, cars, transport_cars)
- Cost per API provider (OpenAI vs Perplexity)
- Average cost trends
- Most expensive scraping operations

### Database Views
- `cost_analytics`: Aggregated daily cost analysis
- Ready-to-use for dashboards and reporting

### Future Enhancements
- Cost budgets and alerts
- Monthly/weekly cost reports
- Cost optimization recommendations
- API usage trends and predictions

## 🛡️ Security Notes

- All cost data is user-specific (RLS enabled)
- API keys are server-side only
- Cost information is stored with proper precision (8 decimal places)
- No sensitive pricing information exposed to client

## 🔄 Maintenance

### Regular Tasks
1. **Update API Pricing**: Review and update pricing in `ai-processor-types.ts`
2. **Monitor Costs**: Use cost_analytics view for monthly reviews
3. **Optimize Usage**: Identify high-cost operations and optimize
4. **Archive Data**: Consider archiving old cost data for performance

### Troubleshooting
- Check console logs for token usage information
- Verify API keys are configured correctly
- Ensure database migration has been applied
- Check RLS policies if cost data isn't appearing

This implementation provides comprehensive cost tracking while maintaining performance and security. All costs are calculated in real-time and stored for historical analysis.