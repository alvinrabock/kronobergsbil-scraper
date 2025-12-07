'use server';

import axios from 'axios';
import {
    ProcessedResult,
    detectContentType,
    validateCampaignData,
    validateVehicleData,
    CampaignData,
    VehicleData,
    VehicleVariant,
    VehicleDimensions,
    ColorOption,
    InteriorOption,
    VehicleOption,
    VehicleAccessory,
    VehicleService,
    ConnectedServices,
    FinancingInfo,
    VehicleWarranty,
    DealerInfo,
    truncateDescription,
    CampaignVehicleModel,
    VehicleModel as ExternalVehicleModel,
    TokenUsage as EnhancedTokenUsage,
    createTokenUsage
} from './ai-processor-types';
import {
    isClaudeEnabled,
    extractVehicleDataFromHTML,
    extractVehicleDataFromPDF as claudeExtractVehicleDataFromPDF,
    selectBestImageWithClaude,
    ExtractedVehicle,
} from './claude-client';
import {
    extractPDFLinksFromHTML,
    categorizePDF,
    filterPricelistPDFs,
} from './pdf-extractor';
import {
    extractPDFWithTwoTierSystem,
    TwoTierExtractionResult,
} from './pdf-two-tier-processor';
import { isCustomExtractorEnabled } from './google-custom-extractor';

// AI Provider configuration - Claude is now the primary provider
const USE_CLAUDE = isClaudeEnabled();
console.log(`🤖 AI Provider: ${USE_CLAUDE ? 'Anthropic Claude (Sonnet 4.5)' : 'No AI configured - please set CLAUDE_API_KEY'}`);

// Cost tracking for Claude
function createClaudeTokenUsage(
    promptTokens: number,
    completionTokens: number,
    model: string,
    cacheReadTokens: number = 0,
    cacheCreationTokens: number = 0
): {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
    model_used: string;
    api_provider: 'claude';
} {
    // Model-specific pricing (per 1M tokens)
    let inputCostPer1M: number;
    let outputCostPer1M: number;
    let cacheReadCostPer1M: number;
    let cacheCreationCostPer1M: number;

    if (model.includes('haiku')) {
        // Claude Haiku 3.5 pricing
        // Input: $0.80, Output: $4.00
        // Cache read: $0.08 (90% discount), Cache creation: $1.00 (25% premium)
        inputCostPer1M = 0.80;
        outputCostPer1M = 4.0;
        cacheReadCostPer1M = 0.08;
        cacheCreationCostPer1M = 1.0;
    } else {
        // Claude Sonnet 4.5 pricing (default)
        // Input: $3.00, Output: $15.00
        // Cache read: $0.30 (90% discount), Cache creation: $3.75 (25% premium)
        inputCostPer1M = 3.0;
        outputCostPer1M = 15.0;
        cacheReadCostPer1M = 0.30;
        cacheCreationCostPer1M = 3.75;
    }

    const regularInputTokens = promptTokens - cacheReadTokens - cacheCreationTokens;
    const inputCost = (regularInputTokens / 1_000_000) * inputCostPer1M;
    const outputCost = (completionTokens / 1_000_000) * outputCostPer1M;
    const cacheReadCost = (cacheReadTokens / 1_000_000) * cacheReadCostPer1M;
    const cacheCreationCost = (cacheCreationTokens / 1_000_000) * cacheCreationCostPer1M;

    return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        estimated_cost_usd: inputCost + outputCost + cacheReadCost + cacheCreationCost,
        model_used: model,
        api_provider: 'claude'
    };
}

// Perplexity API configuration
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_BASE_URL = 'https://api.perplexity.ai/chat/completions';

// Helper functions for brand/model extraction from URL
function extractBrandFromUrl(url: string): string | null {
    const urlLower = url.toLowerCase();
    const brands = [
        'opel', 'peugeot', 'suzuki', 'honda', 'mazda', 'toyota',
        'subaru', 'isuzu', 'mg', 'maxus', 'fiat'
    ];

    for (const brand of brands) {
        if (urlLower.includes(brand)) {
            return brand.charAt(0).toUpperCase() + brand.slice(1);
        }
    }
    return null;
}

function extractModelFromUrl(url: string): string | null {
    // Common car model patterns in URLs
    const urlPath = new URL(url).pathname.toLowerCase();

    // Try to extract model from path segments like /bilar/corsa or /models/cx-80
    const segments = urlPath.split('/').filter(s => s.length > 0);

    // Look for model-like segments (after "bilar", "models", "personbilar", etc.)
    const modelIndicators = ['bilar', 'models', 'personbilar', 'transportbilar', 'fordon'];
    for (let i = 0; i < segments.length - 1; i++) {
        if (modelIndicators.includes(segments[i]) && segments[i + 1]) {
            // Capitalize and return the next segment
            const model = segments[i + 1].replace(/-/g, ' ');
            return model.charAt(0).toUpperCase() + model.slice(1);
        }
    }

    // Fall back to last non-empty segment that looks like a model name
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment.length > 2 && !lastSegment.includes('.')) {
        const model = lastSegment.replace(/-/g, ' ');
        return model.charAt(0).toUpperCase() + model.slice(1);
    }

    return null;
}

// Enhanced interfaces
interface FactCheckResult {
    success: boolean;
    accuracy_score: number; // 0-100
    verified_fields: string[];
    flagged_issues: FactCheckIssue[];
    corrected_data?: VehicleData | CampaignData;
    confidence_level: 'high' | 'medium' | 'low';
    token_usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    error?: string;
}

interface FactCheckIssue {
    field: string;
    issue_type: 'missing_in_html' | 'price_mismatch' | 'incorrect_value' | 'formatting_error' | 'suspicious_data';
    severity: 'critical' | 'warning' | 'minor';
    description: string;
    suggested_fix?: string;
    html_evidence?: string;
}

// Enhanced ProcessedResult with fact-checking data
interface EnhancedProcessedResult extends ProcessedResult {
    fact_check?: {
        enabled: boolean;
        results: FactCheckResult[];
        overall_accuracy: number;
        total_issues: number;
        critical_issues: number;
        token_usage: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
        };
    };
}

// Type definitions
interface FinancingOption {
    monthly_price: number;
    old_monthly_price?: number;  // Previous price before campaign discount
    period_months: number;
    annual_mileage?: number;
    down_payment?: number;
    benefit_value?: number;
    interest_rate?: number;
    down_payment_percent?: number;
    total_amount?: number;
    conditions?: string;
}

interface FinancingOptions {
    privatleasing?: FinancingOption[];
    company_leasing?: FinancingOption[];
    loan?: FinancingOption[];
}

interface VehicleModel {
    name: string;
    price?: number;
    old_price?: number;
    // Flat financing prices (primary format)
    privatleasing?: number;
    old_privatleasing?: number;  // Campaign: original monthly price before discount
    company_leasing_price?: number;
    old_company_leasing_price?: number;  // Campaign: original monthly price before discount
    loan_price?: number;
    old_loan_price?: number;  // Campaign: original monthly price before discount
    // Legacy nested format
    financing_options?: FinancingOptions;
    thumbnail?: string;
    // Vehicle specifications
    bransle?: string;      // Fuel type: El, Bensin, Diesel, Hybrid, Laddhybrid
    biltyp?: string;       // Vehicle type: suv, sedan, kombi, halvkombi, cab, coupe, minibuss, pickup, transportbil
    vaxellada?: string;    // Transmission: Automat, Manuell
    fuel_type?: string;    // Alias for bransle
    car_type?: string;     // Alias for biltyp
    transmission?: string; // Alias for vaxellada
    price_source?: 'pdf' | 'html';  // Track where price came from - PDF takes priority
    utrustning?: string[]; // Equipment list for this trim level
}

interface WhatsIncluded {
    name: string;
    description?: string;
}

interface Vehicle {
    title: string;
    brand: string;
    description?: string;
    thumbnail?: string;
    vehicle_model?: VehicleModel[];
    free_text?: string;
    vehicle_type?: 'cars' | 'transport_cars';  // Main category: personbil or transportbil
    body_type?: string;  // Body style: suv, sedan, kombi, halvkombi, cab, coupe, minibuss, pickup, etc.
    source_url?: string;  // URL of the page where this vehicle was found
    pdf_source_url?: string;  // URL of the PDF where pricing data was extracted

    // NEW SCHEMA: Additional fields
    variants?: VehicleVariant[];
    dimensions?: VehicleDimensions | null;
    colors?: ColorOption[];
    interiors?: InteriorOption[];
    options?: VehicleOption[];
    accessories?: VehicleAccessory[];
    services?: VehicleService[];
    connected_services?: ConnectedServices | null;
    financing?: FinancingInfo | null;
    warranties?: VehicleWarranty[];
    dealer_info?: DealerInfo | null;
}

interface Campaign {
    title: string;
    description?: string;
    content?: string;
    thumbnail?: string;
    brand: string;
    vehicle_model?: VehicleModel[];
    campaign_start?: string;
    campaign_end?: string;
    whats_included?: WhatsIncluded[];
    free_text?: string;
}

interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd?: number;
    model_used?: string;
    api_provider?: 'claude' | 'perplexity';
}

interface BatchProcessResult {
    data: (Vehicle | Campaign)[];
    token_usage: TokenUsage;
}

interface DuplicateInfo<T> {
    original: T;
    duplicate: T;
    merged: T;
}

// Perplexity API function (your existing code)
async function callPerplexityAPI(messages: Array<{ role: string; content: string }>): Promise<any> {
    if (!PERPLEXITY_API_KEY) {
        throw new Error('PERPLEXITY_API_KEY environment variable is required');
    }

    try {
        console.log('🔍 Calling Perplexity API...');

        const response = await axios.post(PERPLEXITY_BASE_URL, {
            model: 'sonar',
            messages,
            max_tokens: 1500, // Reduced for simpler responses
            temperature: 0.0, // Zero temperature for consistency
            top_p: 0.1,
            return_citations: false,
            return_images: false,
            return_related_questions: false,
        }, {
            headers: {
                'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 60000,
        });

        console.log('✅ Perplexity API call successful');
        
        // Track token usage and cost for Perplexity
        const usage = response.data.usage;
        if (usage) {
            const tokenUsage = createTokenUsage(
                usage.prompt_tokens,
                usage.completion_tokens,
                'sonar',
                'perplexity'
            );
            console.log(`💰 Perplexity token usage - Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens}, Cost: $${tokenUsage.estimated_cost_usd.toFixed(6)}`);
        }
        
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('❌ Perplexity API Error:');
            console.error('Status:', error.response?.status);
            console.error('Response:', JSON.stringify(error.response?.data, null, 2));

            if (error.response?.status === 401) {
                throw new Error('Invalid Perplexity API key');
            } else if (error.response?.status === 400) {
                throw new Error(`Bad request: ${JSON.stringify(error.response?.data)}`);
            } else if (error.response?.status === 429) {
                throw new Error('Rate limit exceeded');
            }
        }

        console.error('❌ Perplexity API call failed:', error);
        throw error;
    }
}

// Fact-checking function with improved error handling
function parseJsonResponse(content: string): any {
    if (!content) {
        throw new Error('Empty response content');
    }

    console.log('Raw response length:', content.length);
    console.log('Raw response preview:', content.substring(0, 200));

    // Strategy 1: Try multiple cleaning approaches
    const cleaningStrategies = [
        // Original cleaning
        (text: string) => {
            let cleaned = text.trim();
            cleaned = cleaned.replace(/```(?:json)?\s*\n?/g, '').replace(/\n?\s*```/g, '');
            cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>\s*/g, '');

            const jsonStart = Math.max(cleaned.indexOf('{'), cleaned.indexOf('['));
            if (jsonStart > 0) {
                cleaned = cleaned.substring(jsonStart);
            }

            const lastBrace = cleaned.lastIndexOf('}');
            const lastBracket = cleaned.lastIndexOf(']');
            const jsonEnd = Math.max(lastBrace, lastBracket);
            if (jsonEnd !== -1 && jsonEnd < cleaned.length - 1) {
                cleaned = cleaned.substring(0, jsonEnd + 1);
            }

            return cleaned.trim();
        },

        // More aggressive cleaning
        (text: string) => {
            let cleaned = text.trim();

            // Remove all markdown formatting
            cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
            cleaned = cleaned.replace(/`([^`]*)`/g, '$1');

            // Remove thinking blocks and explanations
            cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '');
            cleaned = cleaned.replace(/\*\*[^*]*\*\*/g, ''); // Bold text
            cleaned = cleaned.replace(/\*[^*]*\*/g, ''); // Italic text

            // Remove common prefixes
            cleaned = cleaned.replace(/^(Here's?|Based on|The|This is|Response:|Answer:)[\s\S]*?(?=\{|\[)/i, '');

            // Find JSON boundaries more aggressively
            const jsonPatterns = [
                /\{[\s\S]*\}/,  // Match outermost braces
                /\[[\s\S]*\]/   // Match outermost brackets
            ];

            for (const pattern of jsonPatterns) {
                const match = cleaned.match(pattern);
                if (match) {
                    cleaned = match[0];
                    break;
                }
            }

            return cleaned.trim();
        },

        // Extract by brace counting
        (text: string) => {
            const startIndex = text.indexOf('{');
            if (startIndex === -1) return text;

            let braceCount = 0;
            let endIndex = startIndex;

            for (let i = startIndex; i < text.length; i++) {
                if (text[i] === '{') braceCount++;
                if (text[i] === '}') braceCount--;
                if (braceCount === 0) {
                    endIndex = i;
                    break;
                }
            }

            return text.substring(startIndex, endIndex + 1);
        }
    ];

    // Try each cleaning strategy
    for (let i = 0; i < cleaningStrategies.length; i++) {
        try {
            const cleaned = cleaningStrategies[i](content);
            console.log(`Strategy ${i + 1} cleaned:`, cleaned.substring(0, 100));

            if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
                const parsed = JSON.parse(cleaned);
                console.log(`✅ Successfully parsed with strategy ${i + 1}`);
                return parsed;
            }
        } catch (error) {
            console.log(`Strategy ${i + 1} failed:`, error instanceof Error ? error.message : 'Unknown error');
            continue;
        }
    }

    // Strategy 2: Try to extract JSON from mixed content
    try {
        // Look for JSON-like patterns and extract them
        const jsonMatches = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
        if (jsonMatches && jsonMatches.length > 0) {
            // Try the largest match first
            const sortedMatches = jsonMatches.sort((a, b) => b.length - a.length);

            for (const match of sortedMatches) {
                try {
                    const parsed = JSON.parse(match);
                    console.log('✅ Extracted JSON from mixed content');
                    return parsed;
                } catch {
                    continue;
                }
            }
        }
    } catch (error) {
        console.log('JSON extraction from mixed content failed:', error);
    }

    // Strategy 3: Create fallback JSON structure
    console.warn('⚠️ All JSON parsing strategies failed, creating fallback structure');

    // Try to extract at least some meaningful information
    const fallbackData = {
        accuracy_score: 50, // Default moderate score
        confidence_level: "low",
        verified_fields: [],
        flagged_issues: [{
            field: "response",
            issue_type: "formatting_error" as const,
            severity: "warning" as const,
            description: "Unable to parse fact-check response - using fallback data",
            suggested_fix: "Manual review recommended"
        }],
        summary: "Parsing failed - response format not recognized"
    };

    // Try to extract at least the accuracy score if visible
    const scoreMatch = content.match(/accuracy[_\s]*score["\s:]*(\d+)/i);
    if (scoreMatch) {
        fallbackData.accuracy_score = parseInt(scoreMatch[1]);
        console.log(`Extracted accuracy score: ${fallbackData.accuracy_score}`);
    }

    // Try to extract confidence level
    const confidenceMatch = content.match(/confidence[_\s]*level["\s:]*["']?(high|medium|low)["']?/i);
    if (confidenceMatch) {
        fallbackData.confidence_level = confidenceMatch[1].toLowerCase() as "high" | "medium" | "low";
        console.log(`Extracted confidence level: ${fallbackData.confidence_level}`);
    }

    return fallbackData;
}

// Enhanced fact-checking function with better error handling
async function factCheckData(
    extractedData: VehicleData | CampaignData,
    htmlContent: string,
    contentType: 'vehicle' | 'campaign'
): Promise<FactCheckResult> {
    try {
        console.log(`🔍 Fact-checking ${contentType} data for: ${extractedData.title}`);

        const dataType = contentType === 'vehicle' ? 'vehicle/car' : 'campaign';

        // Truncate HTML content to prevent token limit issues
        const truncatedHtml = htmlContent.length > 30000
            ? htmlContent.substring(0, 30000) + '... [TRUNCATED DUE TO LENGTH]'
            : htmlContent;

        // More explicit prompt for JSON format
        const prompt = `CRITICAL: You must respond with ONLY valid JSON. Do not include any explanations, markdown, or additional text.

You are fact-checking Swedish automotive data. Analyze the extracted data against the HTML content.

EXTRACTED DATA TO VERIFY:
${JSON.stringify(extractedData, null, 2)}

HTML SOURCE (TRUNCATED):
${truncatedHtml}

Return ONLY this JSON structure with no additional text:
{
  "accuracy_score": 85,
  "confidence_level": "high",
  "verified_fields": ["title", "brand", "price"],
  "flagged_issues": [
    {
      "field": "price",
      "issue_type": "price_mismatch",
      "severity": "warning",
      "description": "Price format differs from HTML",
      "suggested_fix": "Update price format"
    }
  ],
  "summary": "Brief assessment"
}

Verify these aspects:
1. Price accuracy (Swedish format "319.900:-" = 319900)
2. Brand name consistency  
3. Vehicle/campaign model names
4. Description relevance
5. Missing important details

JSON ONLY - NO OTHER TEXT:`;

        const response = await callPerplexityAPI([
            {
                role: 'system',
                content: 'You are a JSON-only response system. Return ONLY valid JSON without any markdown, explanations, or additional formatting. Never add commentary before or after the JSON.'
            },
            {
                role: 'user',
                content: prompt
            }
        ]);

        const content = response.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('No content in Perplexity API response');
        }

        console.log('Raw Perplexity response length:', content.length);
        console.log('Raw Perplexity response preview:', content.substring(0, 200));

        // Use enhanced JSON parsing
        let verificationResult;
        try {
            verificationResult = parseJsonResponse(content);
        } catch (parseError) {
            console.error('❌ Enhanced JSON parsing failed:', parseError);

            // Last resort: return minimal structure
            return {
                success: false,
                accuracy_score: 0,
                verified_fields: [],
                flagged_issues: [{
                    field: "parsing",
                    issue_type: "formatting_error",
                    severity: "critical",
                    description: `JSON parsing completely failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
                    suggested_fix: "Review fact-checking system configuration"
                }],
                confidence_level: 'low',
                error: `JSON parsing failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
            };
        }

        // Validate and build result with more defensive checks
        const result: FactCheckResult = {
            success: true,
            accuracy_score: typeof verificationResult.accuracy_score === 'number'
                ? Math.min(100, Math.max(0, verificationResult.accuracy_score))
                : 50,
            verified_fields: Array.isArray(verificationResult.verified_fields)
                ? verificationResult.verified_fields : [],
            flagged_issues: Array.isArray(verificationResult.flagged_issues)
                ? verificationResult.flagged_issues.map((issue: any) => ({
                    field: String(issue.field || 'unknown'),
                    issue_type: issue.issue_type || 'formatting_error',
                    severity: ['critical', 'warning', 'minor'].includes(issue.severity)
                        ? issue.severity : 'warning',
                    description: String(issue.description || 'No description provided'),
                    suggested_fix: issue.suggested_fix ? String(issue.suggested_fix) : undefined,
                    html_evidence: issue.html_evidence ? String(issue.html_evidence) : undefined
                })) : [],
            confidence_level: ['high', 'medium', 'low'].includes(verificationResult.confidence_level)
                ? verificationResult.confidence_level : 'medium',
            token_usage: {
                prompt_tokens: response.usage?.prompt_tokens || 0,
                completion_tokens: response.usage?.completion_tokens || 0,
                total_tokens: response.usage?.total_tokens || 0,
            }
        };

        // Apply corrections if confidence is high and no critical issues
        if (result.confidence_level === 'high' &&
            result.flagged_issues.every(issue => issue.severity !== 'critical')) {
            result.corrected_data = applySuggestedFixes(extractedData, result.flagged_issues);
        }

        console.log(`✅ Fact-check complete. Accuracy: ${result.accuracy_score}%, Issues: ${result.flagged_issues.length}`);

        return result;

    } catch (error) {
        console.error('❌ Fact-checking failed:', error);
        return {
            success: false,
            accuracy_score: 0,
            verified_fields: [],
            flagged_issues: [{
                field: "system",
                issue_type: "formatting_error",
                severity: "critical",
                description: `Fact-checking system error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                suggested_fix: "Review system configuration and API connectivity"
            }],
            confidence_level: 'low',
            error: error instanceof Error ? error.message : 'Fact-checking failed'
        };
    }
}

// PDF-based fact-checking - validates extracted data against PDF source
interface VariantDuplicatePair {
    vehicle: string;
    variant1: string;
    variant2: string;
    keep: string;      // Which variant name to keep (has more data)
    discard: string;   // Which variant name to discard
    reason: string;
}

interface PDFFactCheckResult {
    success: boolean;
    duplicate_vehicles: {
        found: boolean;
        details: string[];
        suggested_merges: Array<{ vehicle1: string; vehicle2: string; reason: string }>;
    };
    duplicate_variants: {
        found: boolean;
        pairs: VariantDuplicatePair[];  // Specific duplicate pairs with reasons
        details: string[];
        affected_vehicles: string[];
    };
    missing_data: {
        found: boolean;
        details: Array<{
            vehicle: string;
            variant?: string;
            field: string;
            expected_value?: string;
            severity: 'critical' | 'warning' | 'minor';
        }>;
    };
    accuracy_score: number;
    summary: string;
    token_usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export async function factCheckPDFExtraction(
    extractedVehicles: VehicleData[],
    pdfUrl: string
): Promise<PDFFactCheckResult> {
    try {
        console.log(`🔍 [PDF Fact-Check] Validating ${extractedVehicles.length} vehicles from ${pdfUrl}`);

        // Build a summary of extracted data for validation
        const extractedSummary = extractedVehicles.map(v => ({
            title: v.title,
            brand: v.brand,
            variants: (v.vehicle_model || []).map(m => ({
                name: m.name,
                price: m.price,
                privatleasing: m.privatleasing,
                fuel_type: m.bransle,
                transmission: m.vaxellada,
                equipment_count: (m.utrustning || []).length,
                has_specs: !!m.specs
            }))
        }));

        // Create a detailed list with data richness info for duplicate detection
        const variantDetailsForAnalysis = extractedVehicles.map(v => ({
            vehicle: v.title,
            variants: (v.vehicle_model || []).map(m => ({
                name: m.name,
                has_price: !!(m.price && m.price > 0),
                has_privatleasing: !!(m.privatleasing && m.privatleasing > 0),
                equipment_count: (m.utrustning || []).length,
                has_specs: !!m.specs && Object.keys(m.specs || {}).length > 0,
                has_fuel_type: !!m.bransle,
                has_transmission: !!m.vaxellada
            }))
        }));

        const prompt = `CRITICAL: Respond with ONLY valid JSON. No explanations or markdown.

You are validating vehicle data extracted from a Swedish car dealership PDF pricelist.
Your PRIMARY task is to detect DUPLICATE VARIANTS by analyzing variant names.
IMPORTANT: When duplicates are found, identify which one has MORE DATA to keep.

PDF SOURCE URL: ${pdfUrl}

EXTRACTED DATA TO VALIDATE (with data richness info):
${JSON.stringify(extractedSummary, null, 2)}

=== VARIANT DETAILS FOR DUPLICATE ANALYSIS ===
${JSON.stringify(variantDetailsForAnalysis, null, 2)}

=== VARIANT DUPLICATION RULES (CRITICAL) ===

Analyze each vehicle's variants and find duplicates. Two variants are DUPLICATES if:

1. SAME POWER + TRANSMISSION with different formatting:
   - "Elektrisk 100kW" vs "Elektrisk 100kW Steglös Automat" → DUPLICATE (same 100kW, "Steglös Automat" is just transmission detail)
   - "PureTech 100 hk Manuell" vs "PureTech 100 hk Manuell 6-steg" → DUPLICATE (6-steg is extra detail)
   - "Style Hybrid AUT" vs "Style Hybrid 110 hk AUT" → DUPLICATE (AUT vs 110 hk AUT same variant)

2. TRIM LEVEL variations with same engine:
   - "Corsa Elektrisk 100kW" vs "Corsa GS Elektrisk 100kW" → NOT duplicate (GS is different trim)
   - "208 Style 100 hk" vs "208 Active 100 hk" → NOT duplicate (different trims)

3. Common Swedish transmission terms to normalize:
   - "Steglös", "Steglös Automat", "CVT" = same transmission (auto)
   - "e-DCT", "DCT", "AUT", "Automat" = same transmission (auto)
   - "Manuell", "6-steg", "5-steg" = same transmission (manual)

4. Power notation variations:
   - "100kW" vs "100 kW" vs "100kw" = same power
   - "100 hk" vs "100hk" vs "100hp" = same power

=== DATA RICHNESS - WHICH TO KEEP ===

For each duplicate pair, check which variant has MORE DATA:
- More equipment (equipment_count)
- Has price/privatleasing
- Has specs
- Has fuel_type and transmission

The variant with MORE data should be kept. Set "keep" to that variant name.

=== OTHER CHECKS ===

1. DUPLICATE VEHICLES:
   - "e-208" and "208" should be ONE vehicle
   - "e-Corsa" and "Corsa" should be merged

2. MISSING DATA:
   - Variants without prices
   - Variants without equipment (equipment_count = 0)
   - Missing fuel type or transmission

Return ONLY this JSON:
{
  "duplicate_vehicles": {
    "found": true/false,
    "details": ["e-208 and 208 are separate but should be one vehicle"],
    "suggested_merges": [{"vehicle1": "e-208", "vehicle2": "208", "reason": "Same model, different powertrains"}]
  },
  "duplicate_variants": {
    "found": true/false,
    "pairs": [
      {
        "vehicle": "Corsa",
        "variant1": "Elektrisk 100kW Steglös Automat",
        "variant2": "Elektrisk 100kW",
        "keep": "Elektrisk 100kW",
        "discard": "Elektrisk 100kW Steglös Automat",
        "reason": "Same 100kW power - variant2 has 15 equipment items, variant1 has 0"
      },
      {
        "vehicle": "208",
        "variant1": "Style Hybrid AUT",
        "variant2": "Style Hybrid 110 hk AUT",
        "keep": "Style Hybrid 110 hk AUT",
        "discard": "Style Hybrid AUT",
        "reason": "Same variant - variant2 has more specific name and equipment"
      }
    ],
    "details": ["Summary of duplicate issues"],
    "affected_vehicles": ["Corsa", "208"]
  },
  "missing_data": {
    "found": true/false,
    "details": [
      {"vehicle": "208", "variant": "Style PureTech 100", "field": "equipment", "severity": "warning"}
    ]
  },
  "accuracy_score": 85,
  "summary": "Brief 1-2 sentence assessment focusing on duplicate variants found"
}`;

        const response = await callPerplexityAPI([
            {
                role: 'system',
                content: 'You are a JSON-only validation system for Swedish vehicle data. Return ONLY valid JSON.'
            },
            {
                role: 'user',
                content: prompt
            }
        ]);

        const content = response.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('No content in Perplexity response');
        }

        console.log(`📝 [PDF Fact-Check] Response length: ${content.length}`);

        const result = parseJsonResponse(content);

        const factCheckResult: PDFFactCheckResult = {
            success: true,
            duplicate_vehicles: {
                found: result.duplicate_vehicles?.found || false,
                details: result.duplicate_vehicles?.details || [],
                suggested_merges: result.duplicate_vehicles?.suggested_merges || []
            },
            duplicate_variants: {
                found: result.duplicate_variants?.found || false,
                pairs: result.duplicate_variants?.pairs || [],
                details: result.duplicate_variants?.details || [],
                affected_vehicles: result.duplicate_variants?.affected_vehicles || []
            },
            missing_data: {
                found: result.missing_data?.found || false,
                details: result.missing_data?.details || []
            },
            accuracy_score: result.accuracy_score || 0,
            summary: result.summary || 'Validation complete',
            token_usage: response.usage ? {
                prompt_tokens: response.usage.prompt_tokens,
                completion_tokens: response.usage.completion_tokens,
                total_tokens: response.usage.total_tokens
            } : undefined
        };

        // Log findings
        if (factCheckResult.duplicate_vehicles.found) {
            console.log(`⚠️ [PDF Fact-Check] Duplicate vehicles found:`, factCheckResult.duplicate_vehicles.details);
        }
        if (factCheckResult.duplicate_variants.found) {
            console.log(`⚠️ [PDF Fact-Check] Duplicate variants found: ${factCheckResult.duplicate_variants.pairs.length} pairs`);
            for (const pair of factCheckResult.duplicate_variants.pairs) {
                console.log(`   🔗 ${pair.vehicle}: KEEP "${pair.keep}" | DISCARD "${pair.discard}" - ${pair.reason}`);
            }
        }
        if (factCheckResult.missing_data.found) {
            console.log(`⚠️ [PDF Fact-Check] Missing data found:`, factCheckResult.missing_data.details.length, 'issues');
        }
        console.log(`✅ [PDF Fact-Check] Accuracy score: ${factCheckResult.accuracy_score}%`);

        return factCheckResult;

    } catch (error) {
        console.error('❌ [PDF Fact-Check] Failed:', error);
        return {
            success: false,
            duplicate_vehicles: { found: false, details: [], suggested_merges: [] },
            duplicate_variants: { found: false, pairs: [], details: [], affected_vehicles: [] },
            missing_data: { found: false, details: [] },
            accuracy_score: 0,
            summary: `Fact-checking failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

// Apply suggested fixes function
function applySuggestedFixes(
    originalData: VehicleData | CampaignData,
    issues: FactCheckIssue[]
): VehicleData | CampaignData {
    const corrected = JSON.parse(JSON.stringify(originalData)); // Deep clone

    issues.forEach(issue => {
        if (issue.suggested_fix && issue.severity !== 'critical') {
            // Apply simple field corrections
            const fieldPath = issue.field.split('.');
            let current: any = corrected;

            for (let i = 0; i < fieldPath.length - 1; i++) {
                if (current[fieldPath[i]]) {
                    current = current[fieldPath[i]];
                }
            }

            const finalField = fieldPath[fieldPath.length - 1];
            if (current && finalField in current) {
                // Apply basic corrections
                if (issue.issue_type === 'price_mismatch' && typeof issue.suggested_fix === 'string') {
                    const numMatch = issue.suggested_fix.match(/\d+/);
                    if (numMatch) {
                        current[finalField] = parseInt(numMatch[0]);
                    }
                } else if (issue.issue_type === 'formatting_error') {
                    current[finalField] = issue.suggested_fix;
                }
            }
        }
    });

    return corrected;
}

function generateVehicleKey(vehicle: VehicleModel, parentBrand?: string): string {
    const name = (vehicle.name || '').toLowerCase().trim();
    const brand = (parentBrand || '').toLowerCase().trim();

    // Aggressive normalization for better deduplication
    const normalizedName = name
        .replace(/\s+/g, ' ')
        .replace(/[-_]/g, ' ')
        // Remove year variations
        .replace(/\b(nya|new|2024|2025|2026)\b/gi, '')
        // Remove hybrid/electric variations (normalize for matching)
        .replace(/\b(e:hev|fullhybrid|mildhybrid|plug-in|phev|hev)\b/gi, 'hybrid')
        .replace(/\b(electric|ev|bev)\b/gi, 'el')
        // Normalize common trim level names
        .replace(/\b(elegance|advance|sport|style|plus|comfort|premium|executive|limited)\b/gi, '')
        // Remove common Swedish words
        .replace(/\b(med|och|för|till)\b/gi, '')
        // Remove extra spaces
        .replace(/\s+/g, ' ')
        .trim();

    // Create a key that captures the essential identity of the variant
    return `${brand}:${normalizedName}`;
}

/**
 * Normalize variant name for display (keeps important info but cleans formatting)
 */
function normalizeVariantName(name: string): string {
    return name
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*-\s*/g, ' ')
        .trim();
}

function generateVehicleMainKey(vehicle: Vehicle): string {
    const title = (vehicle.title || '').toLowerCase().trim();
    const brand = (vehicle.brand || '').toLowerCase().trim();

    // Normalize title by removing common variations
    const normalizedTitle = title
        .replace(/\s+/g, ' ')
        .replace(/[-_]/g, ' ')
        .replace(/\b(nya|new|2024|2025|hybrid|e:hev|fullhybrid)\b/g, '')
        .replace(/\b(elegance|advance|sport|style|plus)\b/g, '')
        .replace(/\b(privatleasing|från|kr\/mån)\b/g, '') // Remove pricing terms
        .trim();

    return `${brand}:${normalizedTitle}`;
}

function shouldMergeVehicles(existing: Vehicle, duplicate: Vehicle): boolean {
    const existingKey = generateVehicleMainKey(existing);
    const duplicateKey = generateVehicleMainKey(duplicate);

    // Check if they're the same base vehicle
    if (existingKey === duplicateKey) return true;

    // Must be same brand to merge
    if (existing.brand !== duplicate.brand) return false;

    // Normalize titles by removing brand prefix if present
    // This handles cases like "Corsa" vs "Opel Corsa" where both have brand="Opel"
    const brand = existing.brand?.toLowerCase() || '';
    const existingTitle = existing.title.toLowerCase()
        .replace(new RegExp(`^${brand}\\s+`, 'i'), '')
        .trim();
    const duplicateTitle = duplicate.title.toLowerCase()
        .replace(new RegExp(`^${brand}\\s+`, 'i'), '')
        .trim();

    // After removing brand prefix, if titles are identical
    if (existingTitle === duplicateTitle) return true;

    // Check if one title is contained in the other (e.g., "208" vs "208 GTi")
    // BUT exclude cases where one has a prefix that indicates a different model variant
    // e.g., "e VITARA" vs "VITARA" should NOT merge (electric vs hybrid are different models)
    const electricPrefixes = ['e ', 'e-', 'i-', 'id.', 'id ', 'eq ', 'ev '];
    const hasElectricPrefix = (title: string) => electricPrefixes.some(p => title.startsWith(p));

    // Don't merge if one has electric prefix and the other doesn't
    if (hasElectricPrefix(existingTitle) !== hasElectricPrefix(duplicateTitle)) {
        return false;
    }

    if (existingTitle.includes(duplicateTitle) || duplicateTitle.includes(existingTitle)) {
        return true;
    }

    // Check for partial matches (e.g., "Honda Jazz" vs "Honda Jazz Hybrid")
    const existingWords = existingTitle.split(/\s+/);
    const duplicateWords = duplicateTitle.split(/\s+/);

    // If one title is contained within another (accounting for common additions)
    const commonWords = existingWords.filter(word =>
        duplicateWords.includes(word) &&
        word.length > 1 && // Skip single-char words
        !['hybrid', 'e:hev', 'nya', 'new', '2024', '2025', 'electric', 'elektrisk'].includes(word)
    );

    // For short titles (1-2 words), require at least 1 significant common word
    // For longer titles, require at least 2 common words
    const minCommonWords = Math.min(existingWords.length, duplicateWords.length) <= 2 ? 1 : 2;

    return commonWords.length >= minCommonWords;
}

function generateCampaignKey(campaign: Campaign): string {
    const title = (campaign.title || '').toLowerCase().trim();
    const brand = (campaign.brand || '').toLowerCase().trim();
    const startDate = campaign.campaign_start || '';

    const normalizedTitle = title
        .replace(/\s+/g, ' ')
        .replace(/[-_]/g, ' ')
        .trim();

    return `${brand}:${normalizedTitle}:${startDate}`;
}

function intelligentMergeVehicles(existing: Vehicle, duplicate: Vehicle): Vehicle {
    const merged: Vehicle = { ...existing };

    // Prefer more detailed/complete information

    // Title: Prefer longer, more descriptive titles
    if (duplicate.title && duplicate.title.length > existing.title.length) {
        merged.title = duplicate.title;
    }

    // Description: Prefer longer, more informative descriptions
    if (duplicate.description &&
        (!existing.description || duplicate.description.length > existing.description.length)) {
        merged.description = duplicate.description;
    }

    // Brand: Keep consistent
    if (duplicate.brand && (!existing.brand || duplicate.brand.length > existing.brand.length)) {
        merged.brand = duplicate.brand;
    }

    // Thumbnail: Prefer non-generic images
    if (duplicate.thumbnail &&
        (!existing.thumbnail ||
            existing.thumbnail.includes('generic/flyout') ||
            duplicate.thumbnail.length > existing.thumbnail.length)) {
        merged.thumbnail = duplicate.thumbnail;
    }

    // Free text: Combine or prefer longer
    if (duplicate.free_text && existing.free_text) {
        // Combine if different, or keep longer one
        if (existing.free_text !== duplicate.free_text) {
            merged.free_text = `${existing.free_text} ${duplicate.free_text}`.trim();
        }
    } else if (duplicate.free_text) {
        merged.free_text = duplicate.free_text;
    }

    // Vehicle models: Intelligent merging (legacy)
    if (duplicate.vehicle_model && Array.isArray(duplicate.vehicle_model)) {
        const existingModels = merged.vehicle_model || [];
        const duplicateModels = duplicate.vehicle_model;

        // Create a map for better deduplication
        const modelMap = new Map<string, VehicleModel>();

        // Add existing models first
        existingModels.forEach(model => {
            const key = generateVehicleKey(model, existing.brand);
            modelMap.set(key, model);
        });

        // Merge or add duplicate models
        duplicateModels.forEach(model => {
            const key = generateVehicleKey(model, duplicate.brand);

            if (modelMap.has(key)) {
                // Merge existing model with duplicate
                const existingModel = modelMap.get(key)!;
                const mergedModel = intelligentMergeVehicleModels(existingModel, model);
                modelMap.set(key, mergedModel);
            } else {
                // Add new model
                modelMap.set(key, model);
            }
        });

        merged.vehicle_model = Array.from(modelMap.values());
    }

    // NEW SCHEMA: Merge variants array
    if (duplicate.variants && Array.isArray(duplicate.variants) && duplicate.variants.length > 0) {
        const existingVariants = merged.variants || [];
        const variantMap = new Map<string, VehicleVariant>();

        // Add existing variants
        existingVariants.forEach(v => {
            variantMap.set(v.name.toLowerCase(), v);
        });

        // Merge or add duplicate variants
        duplicate.variants.forEach(v => {
            const key = v.name.toLowerCase();
            if (variantMap.has(key)) {
                // Merge: prefer non-null values
                const existing = variantMap.get(key)!;
                variantMap.set(key, {
                    ...existing,
                    price: v.price ?? existing.price,
                    privatleasing: v.privatleasing ?? existing.privatleasing,
                    company_leasing: v.company_leasing ?? existing.company_leasing,
                    loan_price: v.loan_price ?? existing.loan_price,
                    fuel_type: v.fuel_type ?? existing.fuel_type,
                    transmission: v.transmission ?? existing.transmission,
                    specs: v.specs ?? existing.specs,
                    equipment: (v.equipment?.length ?? 0) > (existing.equipment?.length ?? 0) ? v.equipment : existing.equipment,
                });
            } else {
                variantMap.set(key, v);
            }
        });

        merged.variants = Array.from(variantMap.values());
    }

    // NEW SCHEMA: Merge additional extracted data (prefer non-empty arrays)
    if (!merged.dimensions && duplicate.dimensions) {
        merged.dimensions = duplicate.dimensions;
    }

    if ((duplicate.colors?.length ?? 0) > (merged.colors?.length ?? 0)) {
        merged.colors = duplicate.colors;
    }

    if ((duplicate.interiors?.length ?? 0) > (merged.interiors?.length ?? 0)) {
        merged.interiors = duplicate.interiors;
    }

    if ((duplicate.options?.length ?? 0) > (merged.options?.length ?? 0)) {
        merged.options = duplicate.options;
    }

    if ((duplicate.accessories?.length ?? 0) > (merged.accessories?.length ?? 0)) {
        merged.accessories = duplicate.accessories;
    }

    if ((duplicate.services?.length ?? 0) > (merged.services?.length ?? 0)) {
        merged.services = duplicate.services;
    }

    if ((duplicate.warranties?.length ?? 0) > (merged.warranties?.length ?? 0)) {
        merged.warranties = duplicate.warranties;
    }

    if (!merged.connected_services && duplicate.connected_services) {
        merged.connected_services = duplicate.connected_services;
    }

    if (!merged.financing && duplicate.financing) {
        merged.financing = duplicate.financing;
    }

    if (!merged.dealer_info && duplicate.dealer_info) {
        merged.dealer_info = duplicate.dealer_info;
    }

    return merged;
}

function intelligentMergeVehicleModels(existing: VehicleModel, duplicate: VehicleModel): VehicleModel {
    const merged: VehicleModel = { ...existing };

    // Prefer longer, more descriptive names (but normalize)
    if (duplicate.name && duplicate.name.length > existing.name.length) {
        merged.name = normalizeVariantName(duplicate.name);
    } else if (existing.name) {
        merged.name = normalizeVariantName(existing.name);
    }

    // ============================================
    // PRICE PRIORITY: PDF > HTML
    // ============================================
    // PDF prices are more reliable (official price lists)
    // Always prefer PDF prices over HTML prices

    const existingFromPdf = existing.price_source === 'pdf';
    const duplicateFromPdf = duplicate.price_source === 'pdf';

    if (duplicateFromPdf && !existingFromPdf) {
        // Duplicate is from PDF, existing is from HTML - use PDF price
        if (duplicate.price && duplicate.price > 0) {
            merged.price = duplicate.price;
            merged.price_source = 'pdf';
            console.log(`📄 PDF price priority: Using ${duplicate.price} SEK from PDF (was ${existing.price} from HTML)`);
        }
        if (duplicate.old_price && duplicate.old_price > 0) {
            merged.old_price = duplicate.old_price;
        }
    } else if (existingFromPdf && !duplicateFromPdf) {
        // Existing is from PDF, keep it - don't override with HTML price
        merged.price_source = 'pdf';
        console.log(`📄 PDF price priority: Keeping ${existing.price} SEK from PDF (ignoring ${duplicate.price} from HTML)`);
    } else {
        // Both from same source or both have no source - prefer actual prices over null/0
        if (duplicate.price && duplicate.price > 0 && (!existing.price || existing.price === 0)) {
            merged.price = duplicate.price;
            merged.price_source = duplicate.price_source;
        }
        if (duplicate.old_price && duplicate.old_price > 0 && (!existing.old_price || existing.old_price === 0)) {
            merged.old_price = duplicate.old_price;
        }
    }

    // Prefer non-generic thumbnails
    if (duplicate.thumbnail &&
        (!existing.thumbnail ||
            existing.thumbnail.includes('generic/flyout') ||
            duplicate.thumbnail.length > existing.thumbnail.length)) {
        merged.thumbnail = duplicate.thumbnail;
    }

    // Merge vehicle specifications - prefer values that are set
    if (duplicate.bransle && !existing.bransle) merged.bransle = duplicate.bransle;
    if (duplicate.biltyp && !existing.biltyp) merged.biltyp = duplicate.biltyp;
    if (duplicate.vaxellada && !existing.vaxellada) merged.vaxellada = duplicate.vaxellada;

    // Merge financing options intelligently
    if (duplicate.financing_options && existing.financing_options) {
        merged.financing_options = intelligentMergeFinancingOptions(existing.financing_options, duplicate.financing_options);
    } else if (duplicate.financing_options) {
        merged.financing_options = duplicate.financing_options;
    }

    return merged;
}

function intelligentMergeFinancingOptions(existing: FinancingOptions, duplicate: FinancingOptions): FinancingOptions {
    const merged: FinancingOptions = { ...existing };

    (['privatleasing', 'company_leasing', 'loan'] as const).forEach(type => {
        if (duplicate[type] && Array.isArray(duplicate[type])) {
            if (!merged[type] || merged[type]!.length === 0) {
                // Use duplicate if existing is empty
                merged[type] = duplicate[type];
            } else {
                // Merge arrays, removing duplicates and preferring complete information
                const existingItems = merged[type] || [];
                const duplicateItems = duplicate[type] || [];

                const mergedItems = [...existingItems];

                duplicateItems.forEach((item: FinancingOption) => {
                    // Check for existing similar option
                    const similarIndex = existingItems.findIndex((existing: FinancingOption) => {
                        // Consider similar if monthly price and period are close
                        const priceDiff = Math.abs((existing.monthly_price || 0) - (item.monthly_price || 0));
                        const periodMatch = existing.period_months === item.period_months;

                        return priceDiff < 100 && (periodMatch || (!existing.period_months && !item.period_months));
                    });

                    if (similarIndex >= 0) {
                        // Merge with existing item, preferring more complete information
                        const existingItem = mergedItems[similarIndex];
                        mergedItems[similarIndex] = {
                            monthly_price: item.monthly_price || existingItem.monthly_price,
                            period_months: item.period_months || existingItem.period_months,
                            annual_mileage: item.annual_mileage || existingItem.annual_mileage,
                            down_payment: item.down_payment ?? existingItem.down_payment,
                            benefit_value: item.benefit_value || existingItem.benefit_value,
                            interest_rate: item.interest_rate || existingItem.interest_rate,
                            down_payment_percent: item.down_payment_percent || existingItem.down_payment_percent,
                            total_amount: item.total_amount || existingItem.total_amount,
                            conditions: item.conditions || existingItem.conditions
                        };
                    } else {
                        // Add as new option
                        mergedItems.push(item);
                    }
                });

                merged[type] = mergedItems;
            }
        }
    });

    return merged;
}

function findVehicleModelDuplicates(vehicleModels: VehicleModel[], parentBrand?: string): VehicleModel[] {
    if (!vehicleModels || vehicleModels.length === 0) return vehicleModels;

    const seen = new Map<string, VehicleModel>();
    const duplicates: DuplicateInfo<VehicleModel>[] = [];

    vehicleModels.forEach((model) => {
        const key = generateVehicleKey(model, parentBrand);

        if (seen.has(key)) {
            const existing = seen.get(key)!;
            console.log(`🔍 Duplicate vehicle model: "${existing.name}" + "${model.name}"`);

            const merged = intelligentMergeVehicleModels(existing, model);
            seen.set(key, merged);
            duplicates.push({ original: existing, duplicate: model, merged });
        } else {
            seen.set(key, model);
        }
    });

    if (duplicates.length > 0) {
        console.log(`🔧 Removed ${duplicates.length} duplicate vehicle models`);
    }

    return Array.from(seen.values());
}


function removeDuplicateCampaigns(campaigns: Campaign[]): Campaign[] {
    if (!campaigns || campaigns.length === 0) return campaigns;

    const seen = new Map<string, Campaign>();
    const duplicates: DuplicateInfo<Campaign>[] = [];

    campaigns.forEach((campaign, index) => {
        const key = generateCampaignKey(campaign);

        if (seen.has(key)) {
            const existing = seen.get(key)!;
            console.log(`🔍 Duplicate campaign detected:`, {
                index,
                existing: existing.title,
                duplicate: campaign.title,
                key
            });

            const merged = mergeDuplicateCampaigns(existing, campaign);
            seen.set(key, merged);
            duplicates.push({ original: existing, duplicate: campaign, merged });
        } else {
            seen.set(key, campaign);
        }
    });

    if (duplicates.length > 0) {
        console.log(`🔧 Removed ${duplicates.length} duplicate campaigns`);
    }

    return Array.from(seen.values());
}

function mergeDuplicateCampaigns(existing: Campaign, duplicate: Campaign): Campaign {
    const merged: Campaign = { ...existing };

    if (duplicate.title && (!existing.title || duplicate.title.length > existing.title.length)) {
        merged.title = duplicate.title;
    }

    if (duplicate.description && (!existing.description || duplicate.description.length > existing.description.length)) {
        merged.description = duplicate.description;
    }

    if (duplicate.content && (!existing.content || duplicate.content.length > existing.content.length)) {
        merged.content = duplicate.content;
    }

    if (duplicate.thumbnail && (!existing.thumbnail || duplicate.thumbnail.length > existing.thumbnail.length)) {
        merged.thumbnail = duplicate.thumbnail;
    }

    if (duplicate.brand && (!existing.brand || duplicate.brand.length > existing.brand.length)) {
        merged.brand = duplicate.brand;
    }

    if (duplicate.campaign_start && (!existing.campaign_start || duplicate.campaign_start.length > existing.campaign_start.length)) {
        merged.campaign_start = duplicate.campaign_start;
    }

    if (duplicate.campaign_end && (!existing.campaign_end || duplicate.campaign_end.length > existing.campaign_end.length)) {
        merged.campaign_end = duplicate.campaign_end;
    }

    if (duplicate.free_text && (!existing.free_text || duplicate.free_text.length > existing.free_text.length)) {
        merged.free_text = duplicate.free_text;
    }

    if (duplicate.vehicle_model && Array.isArray(duplicate.vehicle_model)) {
        const existingModels = merged.vehicle_model || [];
        const duplicateModels = duplicate.vehicle_model;

        const allModels = [...existingModels, ...duplicateModels];
        merged.vehicle_model = findVehicleModelDuplicates(allModels);
    }

    if (duplicate.whats_included && Array.isArray(duplicate.whats_included)) {
        const existingIncludes = merged.whats_included || [];
        const duplicateIncludes = duplicate.whats_included;

        const combinedIncludes = [...existingIncludes];

        duplicateIncludes.forEach((item: WhatsIncluded) => {
            const isDuplicate = existingIncludes.some((existing: WhatsIncluded) =>
                existing.name === item.name
            );

            if (!isDuplicate) {
                combinedIncludes.push(item);
            }
        });

        merged.whats_included = combinedIncludes;
    }

    return merged;
}

function removeDuplicateVehicles(vehicles: Vehicle[]): Vehicle[] {
    if (!vehicles || vehicles.length === 0) return vehicles;

    console.log(`🔍 Enhanced deduplication starting with ${vehicles.length} vehicles`);

    const mergedVehicles = new Map<string, Vehicle>();
    const duplicates: Array<{ original: string, duplicate: string, merged: string }> = [];

    vehicles.forEach((vehicle, index) => {
        const mainKey = generateVehicleMainKey(vehicle);

        // Check for existing similar vehicle
        let foundMatch = false;

        for (const [existingKey, existingVehicle] of mergedVehicles.entries()) {
            if (shouldMergeVehicles(existingVehicle, vehicle)) {
                console.log(`🔍 Merging duplicate: "${existingVehicle.title}" + "${vehicle.title}"`);
                console.log(`🔍 Merge reason: same brand (${existingVehicle.brand} = ${vehicle.brand}) and shared words`);

                const merged = intelligentMergeVehicles(existingVehicle, vehicle);
                mergedVehicles.set(existingKey, merged);

                duplicates.push({
                    original: existingVehicle.title,
                    duplicate: vehicle.title,
                    merged: merged.title
                });

                foundMatch = true;
                break;
            } else {
                // Debug why vehicles are NOT being merged
                const existingWords = existingVehicle.title.toLowerCase().split(/\s+/);
                const duplicateWords = vehicle.title.toLowerCase().split(/\s+/);
                const commonWords = existingWords.filter(word =>
                    duplicateWords.includes(word) &&
                    !['hybrid', 'e:hev', 'nya', 'new', '2024', '2025'].includes(word)
                );
                if (existingVehicle.brand === vehicle.brand && commonWords.length > 0) {
                    console.log(`🔍 NOT merging "${existingVehicle.title}" + "${vehicle.title}": common words = ${commonWords.length} (${commonWords.join(', ')}), same brand = ${existingVehicle.brand === vehicle.brand}`);
                }
            }
        }

        if (!foundMatch) {
            // Deduplicate vehicle models within this vehicle
            if (vehicle.vehicle_model && Array.isArray(vehicle.vehicle_model)) {
                vehicle.vehicle_model = findVehicleModelDuplicates(vehicle.vehicle_model);
            }
            mergedVehicles.set(mainKey, vehicle);
        }
    });

    if (duplicates.length > 0) {
        console.log(`🔧 Enhanced deduplication removed ${duplicates.length} duplicates:`);
        duplicates.forEach((dup, index) => {
            console.log(`  ${index + 1}. "${dup.original}" + "${dup.duplicate}" → "${dup.merged}"`);
        });
    }

    const result = Array.from(mergedVehicles.values());
    console.log(`✅ Enhanced deduplication complete: ${vehicles.length} → ${result.length} vehicles`);

    return result;
}

function deduplicateExtractedData(data: (Vehicle | Campaign)[], contentType: string): (Vehicle | Campaign)[] {
    if (!data || data.length === 0) return data;

    console.log(`🔍 Starting deduplication for ${data.length} ${contentType} items`);

    let deduplicatedData: (Vehicle | Campaign)[];

    switch (contentType) {
        case 'campaigns':
            deduplicatedData = removeDuplicateCampaigns(data as Campaign[]);
            break;
        case 'cars':
        case 'transport_cars':
            deduplicatedData = removeDuplicateVehicles(data as Vehicle[]);
            break;
        default:
            deduplicatedData = data;
            break;
    }

    const removedCount = data.length - deduplicatedData.length;
    if (removedCount > 0) {
        console.log(`✅ Deduplication complete: ${deduplicatedData.length} unique items (removed ${removedCount} duplicates)`);
    } else {
        console.log(`✅ No duplicates found in ${deduplicatedData.length} items`);
    }

    return deduplicatedData;
}

// Validate and fix image-to-vehicle matching
function validateAndFixImageMatching(vehicles: Vehicle[], availableImages: string[]): Vehicle[] {
    console.log(`🔍 Validating image matching for ${vehicles.length} vehicles with ${availableImages.length} available images`);

    // Common car model names to check against
    // IMPORTANT: More specific models (like evitara) must come BEFORE generic ones (vitara)
    // to ensure proper matching - otherwise "evitara" would match "vitara" first
    const carModelKeywords = [
        // Suzuki - evitara/e-vitara MUST come before vitara to avoid false matches
        'evitara', 'e-vitara', 'swift', 's-cross', 'scross', 'jimny', 'across', 'swace', 'ignis', 'baleno', 'vitara',
        // Peugeot
        '208', '308', '408', '508', '2008', '3008', '5008', 'rifter', 'partner', 'expert', 'traveller',
        // Opel
        'corsa', 'astra', 'mokka', 'crossland', 'grandland', 'combo', 'vivaro', 'movano', 'zafira',
        // Toyota
        'yaris', 'corolla', 'camry', 'rav4', 'highlander', 'hilux', 'proace', 'aygo', 'prius',
        // Volvo
        'xc40', 'xc60', 'xc90', 's60', 's90', 'v60', 'v90', 'c40', 'ex30', 'ex90',
        // VW
        'golf', 'polo', 'passat', 'tiguan', 'touareg', 't-roc', 'troc', 't-cross', 'tcross', 'id3', 'id4', 'id5', 'arteon', 'taigo',
        // Other
        'kona', 'tucson', 'ioniq', 'sportage', 'niro', 'ev6', 'qashqai', 'juke', 'leaf'
    ];

    // Function to extract model name from vehicle title
    const extractModelName = (title: string): string | null => {
        const titleLower = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const model of carModelKeywords) {
            if (titleLower.includes(model.replace(/[^a-z0-9]/g, ''))) {
                return model;
            }
        }
        return null;
    };

    // Function to find best matching image for a vehicle
    const findBestImageForVehicle = (vehicle: Vehicle, usedImages: Set<string>): string | null => {
        const modelName = extractModelName(vehicle.title);
        if (!modelName) {
            console.log(`  ⚠️ Could not extract model name from "${vehicle.title}"`);
            return null;
        }

        // Look for image that contains the model name
        for (const imageUrl of availableImages) {
            if (usedImages.has(imageUrl)) continue;

            const imageLower = imageUrl.toLowerCase();
            const imageFileName = imageLower.substring(imageLower.lastIndexOf('/') + 1);

            // SPECIAL CASE: eVitara vs Vitara - need exact matching
            if (modelName === 'evitara' || modelName === 'e-vitara') {
                const hasEVitara = imageFileName.includes('evitara') ||
                                  imageFileName.includes('e-vitara') ||
                                  imageFileName.includes('e_vitara');
                if (hasEVitara) {
                    console.log(`  ✅ Found matching eVitara image for "${vehicle.title}": ${imageFileName}`);
                    return imageUrl;
                }
                // Skip plain Vitara images for eVitara
                continue;
            }

            if (modelName === 'vitara') {
                // For plain Vitara, skip eVitara images
                const hasEVitara = imageFileName.includes('evitara') ||
                                  imageFileName.includes('e-vitara') ||
                                  imageFileName.includes('e_vitara');
                if (hasEVitara) {
                    continue;
                }
                if (imageFileName.includes('vitara')) {
                    console.log(`  ✅ Found matching Vitara image for "${vehicle.title}": ${imageFileName}`);
                    return imageUrl;
                }
                continue;
            }

            // Standard matching for other models
            const modelVariants = [
                modelName,
                modelName.replace('-', ''),
                modelName.replace('-', '_')
            ];

            for (const variant of modelVariants) {
                if (imageLower.includes(variant)) {
                    console.log(`  ✅ Found matching image for "${vehicle.title}": ${imageUrl.substring(imageUrl.lastIndexOf('/') + 1)}`);
                    return imageUrl;
                }
            }
        }

        return null;
    };

    // Function to check if image matches vehicle
    const imageMatchesVehicle = (imageUrl: string | undefined, vehicleTitle: string): boolean => {
        if (!imageUrl) return false;

        const modelName = extractModelName(vehicleTitle);
        if (!modelName) return true; // Can't validate, assume it's fine

        const imageLower = imageUrl.toLowerCase();
        const imageFileName = imageLower.substring(imageLower.lastIndexOf('/') + 1);

        // SPECIAL CASE: eVitara vs Vitara distinction
        // These need special handling because "vitara" is a substring of "evitara"
        if (modelName === 'evitara' || modelName === 'e-vitara') {
            // For eVitara, image must contain "evitara" or "e-vitara" or "e_vitara"
            // but NOT just "vitara" without the "e" prefix
            const hasEVitara = imageFileName.includes('evitara') ||
                              imageFileName.includes('e-vitara') ||
                              imageFileName.includes('e_vitara');

            if (hasEVitara) {
                return true;
            }

            // Check if it's a plain Vitara image (without "e" prefix)
            // Pattern: starts with "vitara" or has "-vitara", "_vitara", or "/vitara"
            const isPlainVitara = /(?:^|[-_\/])vitara(?:[-_\/\.]|$)/i.test(imageFileName) && !hasEVitara;
            if (isPlainVitara) {
                console.log(`  ⚠️ Image "${imageFileName}" is for Vitara, not eVitara`);
                return false;
            }

            // Generic image, allow it
            return true;
        }

        if (modelName === 'vitara') {
            // For plain Vitara, reject images that contain "evitara"
            const hasEVitara = imageFileName.includes('evitara') ||
                              imageFileName.includes('e-vitara') ||
                              imageFileName.includes('e_vitara');
            if (hasEVitara) {
                console.log(`  ⚠️ Image "${imageFileName}" is for eVitara, not Vitara`);
                return false;
            }
            // Check for plain vitara match
            if (imageFileName.includes('vitara')) {
                return true;
            }
        }

        // Check if image contains vehicle model name
        const modelVariants = [
            modelName,
            modelName.replace('-', ''),
            modelName.replace('-', '_')
        ];

        for (const variant of modelVariants) {
            if (imageLower.includes(variant)) {
                return true;
            }
        }

        // Check if image contains a DIFFERENT model name (wrong match)
        for (const otherModel of carModelKeywords) {
            if (otherModel !== modelName && imageLower.includes(otherModel.replace(/[^a-z0-9]/g, ''))) {
                // Skip vitara/evitara comparison here - handled above
                if ((modelName === 'vitara' || modelName === 'evitara' || modelName === 'e-vitara') &&
                    (otherModel === 'vitara' || otherModel === 'evitara' || otherModel === 'e-vitara')) {
                    continue;
                }
                // Image contains a different model name - likely wrong
                console.log(`  ⚠️ Image "${imageUrl.substring(imageUrl.lastIndexOf('/') + 1)}" seems to be for ${otherModel}, not ${vehicleTitle}`);
                return false;
            }
        }

        // Image doesn't contain any model name - could be generic, allow it
        return true;
    };

    const usedImages = new Set<string>();
    const fixedVehicles: Vehicle[] = [];

    for (const vehicle of vehicles) {
        const currentImage = vehicle.thumbnail;

        // Check if current image is valid for this vehicle
        const isValid = imageMatchesVehicle(currentImage, vehicle.title);

        if (!isValid || !currentImage) {
            // Try to find a better image
            const betterImage = findBestImageForVehicle(vehicle, usedImages);

            if (betterImage) {
                console.log(`  🔄 Replacing image for "${vehicle.title}"`);
                fixedVehicles.push({
                    ...vehicle,
                    thumbnail: betterImage
                });
                usedImages.add(betterImage);
            } else if (currentImage && !isValid) {
                // Image is wrong but no better option found - clear it
                console.log(`  ❌ Clearing invalid image for "${vehicle.title}" (no valid replacement found)`);
                fixedVehicles.push({
                    ...vehicle,
                    thumbnail: undefined
                });
            } else {
                fixedVehicles.push(vehicle);
            }
        } else {
            // Image is valid, mark as used
            if (currentImage) usedImages.add(currentImage);
            fixedVehicles.push(vehicle);
        }
    }

    console.log(`🔍 Image validation complete`);
    return fixedVehicles;
}

async function analyzeImages(imageUrls: string[], vehicleName?: string, vehicleBrand?: string): Promise<string | null> {
    if (!imageUrls || imageUrls.length === 0) {
        console.log(`No images provided for analysis`);
        return null;
    }

    try {
        // Filter out invalid URLs and obvious non-car images
        const processedUrls = imageUrls
            .filter(url => {
                if (!url || url.includes('data:image') || url.includes('placeholder') || url.includes('loading.gif') || url.length < 10) {
                    console.log(`Filtered out invalid URL: ${url}`);
                    return false;
                }
                return true;
            })
            .filter(url => {
                const hasImageExt = url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.webp');
                if (!hasImageExt) {
                    console.log(`Filtered out non-image URL: ${url}`);
                }
                return hasImageExt;
            })
            .filter(url => {
                // Pre-filter obvious non-car images before sending to AI
                const urlLower = url.toLowerCase();
                const filename = urlLower.substring(urlLower.lastIndexOf('/') + 1);

                // Reject obvious logos, icons, and UI elements
                if (filename.includes('logo') || filename.includes('icon') || filename.includes('favicon')) {
                    console.log(`Pre-filtered logo/icon: ${filename}`);
                    return false;
                }

                // Reject obvious price/campaign graphics
                if (filename.includes('prisplatta') || filename.includes('pris-') || filename.includes('-pris')) {
                    console.log(`Pre-filtered price plate: ${filename}`);
                    return false;
                }

                // Reject arrows, navigation elements
                if (filename.includes('arrow') || filename.includes('chevron') || filename.includes('nav-')) {
                    console.log(`Pre-filtered UI element: ${filename}`);
                    return false;
                }

                return true;
            })
            .slice(0, 12);

        if (processedUrls.length === 0) {
            console.log(`No valid image URLs after filtering`);
            return null;
        }

        // Enhanced logging with full URLs for debugging
        console.log(`🔍 AI analyzing ${processedUrls.length} images:`);
        processedUrls.forEach((url, index) => {
            const filename = url.substring(url.lastIndexOf('/') + 1);
            console.log(`  ${index + 1}. ${filename}`);
            console.log(`     Full URL: ${url}`);
        });

        // Use Claude for image selection (prefers environmental backgrounds)
        // Skip AI image selection in TEST_MODE to speed up testing
        const testMode = process.env.TEST_MODE === 'true';
        if (USE_CLAUDE && vehicleName && vehicleBrand && !testMode) {
            console.log(`🚀 Using Claude for image selection (prefers environmental backgrounds)...`);

            const claudeResult = await selectBestImageWithClaude(
                vehicleName,
                vehicleBrand,
                processedUrls,
                { model: 'fast' }
            );

            if (claudeResult.success && claudeResult.selectedImageUrl) {
                console.log(`✅ Claude selected: ${claudeResult.selectedImageUrl.substring(claudeResult.selectedImageUrl.lastIndexOf('/') + 1)}`);
                console.log(`   Confidence: ${(claudeResult.confidence * 100).toFixed(0)}%`);
                console.log(`   Reasoning: ${claudeResult.reasoning || 'N/A'}`);
                console.log(`   Environmental background: ${claudeResult.hasEnvironmentalBackground ? 'Yes' : 'No'}`);
                return claudeResult.selectedImageUrl;
            } else {
                console.warn(`⚠️ Claude image selection failed: ${claudeResult.error}`);
                // Fall through to simple selection
            }
        }

        // Simple fallback: select first valid image if Claude not available
        console.log(`📡 Using simple image selection (first valid image)...`);

        // Try to find an image with the vehicle name in the URL
        const vehicleNameLower = (vehicleName || '').toLowerCase();
        const matchingImage = processedUrls.find(url =>
            url.toLowerCase().includes(vehicleNameLower.split(' ')[0])
        );

        if (matchingImage) {
            console.log(`✅ Found image matching vehicle name: ${matchingImage.substring(matchingImage.lastIndexOf('/') + 1)}`);
            return matchingImage;
        }

        // Return first image as fallback
        if (processedUrls.length > 0) {
            console.log(`✅ Using first available image: ${processedUrls[0].substring(processedUrls[0].lastIndexOf('/') + 1)}`);
            return processedUrls[0];
        }

        return null;

    } catch (error) {
        console.error('❌ Image analysis failed with error:', error);
        console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
        return null;
    }
}

async function enhanceWithImageAnalysis(item: Vehicle | Campaign, htmlContent: string, sourceUrl: string): Promise<void> {
    try {
        const availableImages = extractImageUrls(htmlContent, sourceUrl);

        if (availableImages.length === 0) return;

        console.log(`🖼️ Found ${availableImages.length} images for ${item.title}`);

        // Extract vehicle name and brand for Claude image selection
        const vehicleName = item.title || '';
        const vehicleBrand = item.brand || '';

        // Enhance vehicle models with best images (but don't override if they already have good ones)
        if (item.vehicle_model && Array.isArray(item.vehicle_model)) {
            for (const [index, model] of item.vehicle_model.entries()) {
                // Only replace thumbnails that are generic or missing
                const needsNewThumbnail = !model.thumbnail ||
                    model.thumbnail.includes('generic/flyout') ||
                    model.thumbnail.includes('placeholder');

                if (needsNewThumbnail && availableImages.length > 0) {
                    // For vehicle models, try to use the same image as the main item
                    // or analyze again if we have many images with vehicle context
                    const modelImage = item.thumbnail || await analyzeImages(availableImages, model.name || vehicleName, vehicleBrand);
                    if (modelImage) {
                        console.log(`🎯 Setting model thumbnail for ${model.name}: ${modelImage.substring(0, 80)}...`);
                        model.thumbnail = modelImage;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in image analysis enhancement:', error);
        // Don't fail the entire process for image issues
    }
}

function extractImageUrls(htmlContent: string, sourceUrl: string): string[] {
    const imageUrls: string[] = [];
    const linkedPageUrls = new Set<string>(); // Track images from linked pages (hero images)

    // Helper to decode HTML entities in URLs
    const decodeHtmlEntities = (url: string): string => {
        if (!url) return url;
        return url
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
    };

    // Extract images from linked page sections FIRST (these are hero images from individual vehicle pages)
    const linkedPageRegex = /<!-- LINKED PAGE \d+ START -->([\s\S]*?)<!-- LINKED PAGE \d+ END -->/gi;
    let linkedPageMatch;
    while ((linkedPageMatch = linkedPageRegex.exec(htmlContent)) !== null) {
        const linkedPageContent = linkedPageMatch[1];
        console.log('🔗 Parsing images from linked page section...');

        // Extract <picture> elements first (highest quality)
        const pictureRegex = /<picture[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["'][^>]*>[\s\S]*?<\/picture>/gi;
        let pictureMatch;
        while ((pictureMatch = pictureRegex.exec(linkedPageContent)) !== null) {
            const decodedUrl = decodeHtmlEntities(pictureMatch[1]);
            if (decodedUrl && !imageUrls.includes(decodedUrl)) {
                imageUrls.push(decodedUrl);
                linkedPageUrls.add(decodedUrl);
                console.log('📸 [LINKED PAGE] Found picture element hero image:', decodedUrl);
            }
        }

        // Extract srcset from linked page picture/source elements (get highest quality)
        const linkedSrcsetRegex = /<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi;
        let linkedSrcsetMatch;
        while ((linkedSrcsetMatch = linkedSrcsetRegex.exec(linkedPageContent)) !== null) {
            const srcsetValue = linkedSrcsetMatch[1];
            const srcsetEntries = srcsetValue.split(',').map(entry => {
                const parts = entry.trim().split(' ');
                return { url: parts[0], width: parseInt(parts[1]) || 0 };
            });
            srcsetEntries.sort((a, b) => b.width - a.width);
            if (srcsetEntries.length > 0 && srcsetEntries[0].url) {
                const decodedUrl = decodeHtmlEntities(srcsetEntries[0].url);
                if (!imageUrls.includes(decodedUrl)) {
                    imageUrls.push(decodedUrl);
                    linkedPageUrls.add(decodedUrl);
                    console.log('📸 [LINKED PAGE] Found srcset hero image:', decodedUrl);
                }
            }
        }

        // Extract regular img tags from linked page
        const linkedImgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
        let linkedImgMatch;
        while ((linkedImgMatch = linkedImgRegex.exec(linkedPageContent)) !== null) {
            const decodedUrl = decodeHtmlEntities(linkedImgMatch[1]);
            if (decodedUrl && !imageUrls.includes(decodedUrl)) {
                imageUrls.push(decodedUrl);
                linkedPageUrls.add(decodedUrl);
                console.log('📸 [LINKED PAGE] Found img hero image:', decodedUrl);
            }
        }
    }

    console.log(`🔗 Found ${linkedPageUrls.size} images from linked pages (hero images)`);

    // First, extract Next.js optimized images (these are usually the main content images)
    const nextImageRegex = /<img[^>]+src=["']([^"']*\/_next\/image\/[^"']*)["'][^>]*>/gi;
    let nextMatch;
    while ((nextMatch = nextImageRegex.exec(htmlContent)) !== null) {
        const url = nextMatch[1];
        // Decode the URL parameter to get the actual image URL
        try {
            const urlObj = new URL(url, sourceUrl);
            const actualImageUrl = urlObj.searchParams.get('url');
            if (actualImageUrl) {
                const decodedUrl = decodeURIComponent(actualImageUrl);
                imageUrls.push(decodedUrl);
                console.log('📸 Found Next.js optimized image:', decodedUrl);
            }
        } catch (error) {
            console.warn('Failed to parse Next.js image URL:', url);
        }
    }

    // Extract from srcset in Next.js images (get highest quality version)
    const srcsetRegex = /srcset=["']([^"']+)["']/gi;
    let srcsetMatch;
    while ((srcsetMatch = srcsetRegex.exec(htmlContent)) !== null) {
        const srcsetValue = srcsetMatch[1];
        // Parse srcset and get the highest quality image
        const srcsetEntries = srcsetValue.split(',').map(entry => {
            const [url, width] = entry.trim().split(' ');
            return { url, width: parseInt(width) || 0 };
        });

        // Sort by width descending to get highest quality
        srcsetEntries.sort((a, b) => b.width - a.width);

        for (const entry of srcsetEntries) {
            try {
                const urlObj = new URL(entry.url, sourceUrl);
                const actualImageUrl = urlObj.searchParams.get('url');
                if (actualImageUrl) {
                    const decodedUrl = decodeURIComponent(actualImageUrl);
                    if (!imageUrls.includes(decodedUrl)) {
                        imageUrls.push(decodedUrl);
                        console.log('📸 Found srcset image:', decodedUrl);
                    }
                }
            } catch (error) {
                // If it's not a Next.js URL, add it directly
                if (!imageUrls.includes(entry.url)) {
                    imageUrls.push(entry.url);
                }
            }
        }
    }

    // Then extract regular img tags
    const imgRegex = /<img[^>]+>/gi;
    const imgMatches = htmlContent.match(imgRegex) || [];

    imgMatches.forEach(imgTag => {
        // Skip if this is already a Next.js image we processed
        if (imgTag.includes('_next/image')) return;

        const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
        const dataSrcMatch = imgTag.match(/data-src=["']([^"']+)["']/i);

        if (srcMatch) {
            const decodedUrl = decodeHtmlEntities(srcMatch[1]);
            if (!imageUrls.includes(decodedUrl)) {
                imageUrls.push(decodedUrl);
                console.log('📸 Found regular img src:', decodedUrl);
            }
        }
        if (dataSrcMatch) {
            const decodedUrl = decodeHtmlEntities(dataSrcMatch[1]);
            if (!imageUrls.includes(decodedUrl)) {
                imageUrls.push(decodedUrl);
                console.log('📸 Found img data-src:', decodedUrl);
            }
        }
    });

    // Extract from CSS background-image
    const bgImageRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi;
    let bgMatch;
    while ((bgMatch = bgImageRegex.exec(htmlContent)) !== null) {
        const decodedUrl = decodeHtmlEntities(bgMatch[1]);
        if (!imageUrls.includes(decodedUrl)) {
            imageUrls.push(decodedUrl);
            console.log('📸 Found background image:', decodedUrl);
        }
    }

    // Resolve relative URLs and prioritize car images
    const resolvedUrls = imageUrls.map(url => {
        if (!url) return null;

        // Already absolute URL
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }

        // Protocol-relative URL
        if (url.startsWith('//')) {
            return 'https:' + url;
        }

        // Relative URL
        if (url.startsWith('/')) {
            try {
                const urlObj = new URL(sourceUrl);
                return `${urlObj.protocol}//${urlObj.host}${url}`;
            } catch {
                return null;
            }
        }

        return url;
    }).filter((url): url is string => Boolean(url));

    // Remove duplicates and prioritize by likely car content
    const uniqueUrls = [...new Set(resolvedUrls)];

    // Sort URLs to prioritize car images over price plates/graphics
    // IMPORTANT: Give huge bonus to images from linked pages (hero images from individual vehicle pages)
    const prioritizedUrls = uniqueUrls.sort((a, b) => {
        let aScore = getImagePriorityScore(a);
        let bScore = getImagePriorityScore(b);

        // +100 bonus for images from linked pages (hero images)
        if (linkedPageUrls.has(a)) aScore += 100;
        if (linkedPageUrls.has(b)) bScore += 100;

        return bScore - aScore; // Higher score first
    });

    console.log(`📸 Extracted ${prioritizedUrls.length} unique images, prioritized by car content likelihood`);
    console.log(`🔗 ${linkedPageUrls.size} images from linked pages will get +100 bonus`);
    prioritizedUrls.forEach((url, index) => {
        const baseScore = getImagePriorityScore(url);
        const linkedBonus = linkedPageUrls.has(url) ? 100 : 0;
        const totalScore = baseScore + linkedBonus;
        const linkedTag = linkedPageUrls.has(url) ? ' [LINKED PAGE HERO]' : '';
        console.log(`  ${index + 1}. ${url.substring(url.lastIndexOf('/') + 1)} (${totalScore} pts = ${baseScore} base + ${linkedBonus} linked)${linkedTag}`);
    });

    return prioritizedUrls;
}

// Score images based on likelihood of containing car content
function getImagePriorityScore(url: string): number {
    const urlLower = url.toLowerCase();
    const filename = urlLower.substring(urlLower.lastIndexOf('/') + 1);
    let score = 0;

    // VERY HIGH priority - Car model names from various brands
    // Suzuki models
    if (filename.includes('vitara') || filename.includes('swift') || filename.includes('ignis') ||
        filename.includes('sx4') || filename.includes('jimny') || filename.includes('across') ||
        filename.includes('s-cross') || filename.includes('baleno')) score += 60;

    // Peugeot models
    if (filename.includes('208') || filename.includes('308') || filename.includes('408') ||
        filename.includes('508') || filename.includes('2008') || filename.includes('3008') ||
        filename.includes('5008') || filename.includes('rifter') || filename.includes('partner') ||
        filename.includes('expert') || filename.includes('traveller')) score += 60;

    // Opel models
    if (filename.includes('corsa') || filename.includes('astra') || filename.includes('mokka') ||
        filename.includes('crossland') || filename.includes('grandland') || filename.includes('combo') ||
        filename.includes('vivaro') || filename.includes('movano') || filename.includes('zafira')) score += 60;

    // Citroën models
    if (filename.includes('c3') || filename.includes('c4') || filename.includes('c5') ||
        filename.includes('berlingo') || filename.includes('spacetourer') || filename.includes('jumpy')) score += 60;

    // Toyota models
    if (filename.includes('yaris') || filename.includes('corolla') || filename.includes('camry') ||
        filename.includes('rav4') || filename.includes('highlander') || filename.includes('land-cruiser') ||
        filename.includes('hilux') || filename.includes('proace') || filename.includes('aygo')) score += 60;

    // Volvo models
    if (filename.includes('xc40') || filename.includes('xc60') || filename.includes('xc90') ||
        filename.includes('s60') || filename.includes('s90') || filename.includes('v60') ||
        filename.includes('v90') || filename.includes('c40') || filename.includes('ex30') ||
        filename.includes('ex90')) score += 60;

    // VW models
    if (filename.includes('golf') || filename.includes('polo') || filename.includes('passat') ||
        filename.includes('tiguan') || filename.includes('touareg') || filename.includes('t-roc') ||
        filename.includes('t-cross') || filename.includes('id.3') || filename.includes('id.4') ||
        filename.includes('id.5') || filename.includes('arteon') || filename.includes('taigo')) score += 60;

    // Other common models
    if (filename.includes('kona') || filename.includes('tucson') || filename.includes('ioniq') ||
        filename.includes('sportage') || filename.includes('niro') || filename.includes('ev6') ||
        filename.includes('qashqai') || filename.includes('juke') || filename.includes('leaf')) score += 60;

    // HIGH priority - Exterior/view keywords
    if (filename.includes('exterior') || filename.includes('front') || filename.includes('side') ||
        filename.includes('rear') || filename.includes('quarter') || filename.includes('angle')) score += 45;

    // HIGH priority - Hero/main images (but prefer lifestyle over studio)
    if (filename.includes('hero') || filename.includes('main') || filename.includes('primary') ||
        filename.includes('product') || filename.includes('beauty')) score += 40;

    // BONUS for lifestyle/environment images (cars with real backgrounds)
    if (filename.includes('outdoor') || filename.includes('lifestyle') || filename.includes('action') ||
        filename.includes('driving') || filename.includes('road') || filename.includes('nature') ||
        filename.includes('scene') || filename.includes('environment') || filename.includes('cover') ||
        urlLower.includes('lifestyle') || urlLower.includes('outdoor')) score += 35;

    // MEDIUM-HIGH priority - Gallery/photo keywords
    if (filename.includes('gallery') || filename.includes('photo') || filename.includes('image') ||
        filename.includes('picture') || filename.includes('view')) score += 30;

    // MEDIUM priority - Vehicle-related keywords
    if (urlLower.includes('vehicle') || urlLower.includes('car') || urlLower.includes('auto') ||
        urlLower.includes('bil') || urlLower.includes('fordon')) score += 25;

    // MEDIUM priority - Model/range keywords
    if (filename.includes('model') || filename.includes('range') || filename.includes('lineup')) score += 20;

    // LOW priority - Banners (only if not price-related)
    if (filename.includes('banner') && !filename.includes('pris') && !filename.includes('price')) score += 10;

    // NEGATIVE priority - Price/campaign graphics (these are NOT car photos)
    if (filename.includes('pris') || filename.includes('price')) score -= 60;
    if (filename.includes('kampanj') || filename.includes('campaign') || filename.includes('offer')) score -= 50;
    if (filename.includes('erbjudande') || filename.includes('deal')) score -= 50;

    // NEGATIVE priority - Plates/badges/labels
    if (filename.includes('platta') || filename.includes('plate') || filename.includes('badge')) score -= 60;
    if (filename.includes('label') || filename.includes('tag') || filename.includes('sticker')) score -= 50;

    // NEGATIVE priority - Logos/icons/graphics
    if (filename.includes('logo') || filename.includes('icon') || filename.includes('symbol')) score -= 70;
    if (filename.includes('text') || filename.includes('info') || filename.includes('button')) score -= 40;

    // NEGATIVE priority - UI elements
    if (filename.includes('arrow') || filename.includes('nav') || filename.includes('menu')) score -= 50;
    if (filename.includes('background') || filename.includes('bg-') || filename.includes('_bg')) score -= 40;

    // NEGATIVE priority - Small/thumbnail indicators (we want full-size)
    if (filename.includes('thumb') || filename.includes('small') || filename.includes('mini')) score -= 20;
    if (filename.includes('_s.') || filename.includes('_xs.') || filename.includes('_sm.')) score -= 20;

    // NEGATIVE priority - Studio/transparent/cutout images (prefer lifestyle with backgrounds)
    if (filename.includes('studio') || filename.includes('cutout') || filename.includes('transparent') ||
        filename.includes('white-bg') || filename.includes('whitebg') || filename.includes('no-bg') ||
        filename.includes('nobg') || filename.includes('isolated') || filename.includes('freisteller')) score -= 25;

    // Prefer higher resolution images
    if (url.includes('w=3840') || url.includes('1920') || url.includes('2048') || url.includes('4k')) score += 20;
    if (url.includes('w=1200') || url.includes('1080') || url.includes('hd')) score += 15;
    if (url.includes('w=640') || url.includes('w=750') || url.includes('w=828')) score += 8;

    // Prefer certain file types - JPG/WEBP usually have real backgrounds, PNG often transparent
    if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) score += 10;
    if (filename.endsWith('.webp')) score += 8;
    // PNG often indicates transparent/studio images - slight penalty unless it's a specific car photo
    if (filename.endsWith('.png') && !filename.includes('logo')) score -= 5;

    // Bonus for images from known car image paths
    if (urlLower.includes('/models/') || urlLower.includes('/vehicles/') || urlLower.includes('/cars/')) score += 25;
    if (urlLower.includes('/bilar/') || urlLower.includes('/fordon/') || urlLower.includes('/modeller/')) score += 25;

    return score; // Can go negative to filter out bad images
}


function getOptimizedPrompt(contentType: string): { system: string; user: string } {
    const isCampaign = contentType === 'campaigns';

    const commonInstructions = `
ESSENTIAL RULES:
- Return ONLY valid JSON, no explanations
- Convert Swedish prices (kr) to numbers: "319.900:-" → 319900
- Keep descriptions under 160 characters
- For financing options, extract ALL available terms (12, 24, 36, 48 months etc.)
- Look for different prices based on contract length/terms
- Extract mileage limits (1000 mil/år, 1500 mil/år etc.)
- Extract down payments and interest rates when mentioned
- If only one financing option per type, still put it in an array
- Use null for missing values, empty arrays [] for missing financing types
- AVOID DUPLICATES: If you see similar vehicles/campaigns with the same name, combine their information instead of creating separate entries
- For vehicle models with the same name but different variants, create ONE vehicle with multiple financing options or specifications

CAMPAIGN/DISCOUNT PRICING - Extract OLD prices when available:
- Look for strikethrough prices, "ord. pris", "tidigare", "från X kr till Y kr"
- For purchase prices: old_price = original price before discount, price = current discounted price
- For financing (privatleasing, company_leasing, loan): old_monthly_price = original monthly cost, monthly_price = discounted
- Common patterns: "2 995 kr/mån (ord. 3 495 kr)", price crossed out with new price below
- If no discount/campaign, set old_monthly_price to null

CRITICAL - PDF PRICELIST DATA:
- If the content contains "<!-- PDF CONTENT FROM:" sections, use this as the PRIMARY source for vehicle variants and prices
- PDF pricelists contain the official price data - extract EVERY row that has pricing information

PDF TABLE STRUCTURE RECOGNITION:
- Swedish car pricelists follow a TABLE format with columns like:
  * MODELL (model/variant name with technical specs)
  * Rek.cirkapris / Kontantpris (purchase price in kr) → maps to "price" field
  * Billån/mån* (loan monthly payment) → maps to "loan_price" field
  * PL/mån** or Privatleasing/mån (private leasing monthly) → maps to "privatleasing" field (CRITICAL!)
  * Sometimes: Elförbrukning, Räckvidd, Skatt, CO2, etc.

COLUMN TO FIELD MAPPING (CRITICAL - DO NOT MIX UP!):
- "Rek.cirkapris" / "Kontantpris" → price (purchase price)
- "Billån/mån" / "Billån" → loan_price (monthly loan payment)
- "PL/mån" / "Privatleasing" → privatleasing (monthly private leasing - ALWAYS extract this!)
- Campaign format "(ord. pris X kr)" → old_price, old_loan_price, old_privatleasing respectively

HOW TO IDENTIFY VARIANTS vs SECTION HEADERS:
- SECTION HEADERS: Text in ALL CAPS or bold with equipment level names (BASE, SELECT, INCLUSIVE, STYLE, COMFORT) but NO technical specs and NO prices
- ACTUAL VARIANT ROWS: Have BOTH technical specifications AND price data on the same row
- Technical specs include: kWh (battery), hk (horsepower), engine size (1.2, 1.5, etc.), drivetrain (2WD, 4x4, AWD, AllGrip)

COUNTING RULE - A variant is ONLY a row that has:
1. Technical specifications (battery kWh, engine size, horsepower, drivetrain like 2WD/4x4)
2. At least ONE price (Rek.cirkapris OR Billån/mån OR PL/mån)
Count ALL rows matching this pattern - do not skip any!

PDF VARIANT EXTRACTION - SIMPLE RULE:
Every row with a price = one variant. Copy the EXACT text from that row as the variant name.

CRITICAL: Do NOT simplify variant names - use them EXACTLY as written in the PDF:
- "49 kWh 2WD Base" → name: "49 kWh 2WD Base" (NOT just "Base")
- "61 kWh 4x4 Inclusive" → name: "61 kWh 4x4 Inclusive"
- "1.2 82 hk Hybrid Select CVT" → name: "1.2 82 hk Hybrid Select CVT"

Section headers without prices are NOT variants - skip them.

CAMPAIGN PRICES - Extract BOTH current and original:
- Current price: The main visible price number
- Original price: Look for "(ord. pris X kr)" or "(ord. X kr)" patterns - store in old_price, old_privatleasing, old_loan_price
- PDF prices take precedence over HTML prices

CRITICAL IMAGE MATCHING RULES:
- Each vehicle MUST have its OWN correct image - do NOT use the same image for multiple vehicles
- Look for images that are DIRECTLY associated with each specific car model
- Match images by looking at:
  * Images inside the same HTML container/section as the car name
  * Image filenames containing the model name (e.g., "swift_2000x2000.jpg" for Swift)
  * Alt text or data attributes mentioning the model name
  * JSON data structures linking models to their images (mediaItemUrl, menu.image, etc.)
- If a page lists multiple cars (Swift, Vitara, S-Cross, etc.), each MUST get its own unique image
- NEVER assign one car's image to another car
- If you cannot find a specific image for a model, use null instead of using another car's image
- CRITICAL: Be careful with similar model names like "eVitara" vs "Vitara" - they are COMPLETELY DIFFERENT cars:
  * "eVitara" or "e Vitara" or "e-Vitara" = ELECTRIC version
    - MUST use images with "evitara" or "e-vitara" or "e_vitara" in the filename
    - Example: "eVITARA_header_pris_start_16-9.jpg" = CORRECT for eVitara
  * "Vitara" (without "e" prefix) = HYBRID/petrol version
    - MUST use images with "vitara" in filename but NOT "evitara"
    - Example: "Vitara-miljo-10-3x2-1.jpg" = CORRECT for Vitara, WRONG for eVitara
  * ALWAYS check the exact filename before assigning an image!
  * If the filename starts with just "Vitara" (not "eVitara"), it belongs to regular Vitara only

JSON STRUCTURE:
- The output should be a single JSON object.
- If multiple items are extracted, they should be in an array under the root key (e.g., "campaigns").
- If only one item is extracted, it should still be placed in an array.
`;

    const system = isCampaign
        ? `You are an expert AI for extracting campaign information from Swedish car dealership websites. Your task is to analyze the provided HTML snippet and extract the MAIN campaign information while avoiding duplicates.

${commonInstructions}

DUPLICATE PREVENTION FOR CAMPAIGNS:
- If you see multiple mentions of the same campaign (same title/brand/timeframe), merge them into ONE campaign entry
- Combine all vehicle models from duplicate campaigns into a single campaign
- Merge financing options and benefits from all sources
- Use the most complete information available

- Each HTML snippet represents content from a single linked page and should typically contain ONE main campaign.
- Extract only the primary/main campaign from the page, not secondary offers or sub-campaigns.
- Focus on the most prominent campaign with the largest content section.
- If multiple campaigns appear to be equally prominent, choose the first/top one.

JSON STRUCTURE - Return an array with the main campaign:
{
  "campaigns": [
    {
      "title": "string (specific campaign title)",
      "description": "string (max 160, specific campaign description)", 
      "content": "string (full campaign text)",
      "thumbnail": "string (campaign-specific image path)",
      "brand": "string (e.g., Peugeot, Suzuki, Opel)",
      "vehicle_model": [
        {
          "name": "string (FULL variant name, e.g. '1.2 82 hk Hybrid Base')",
          "price": number,
          "old_price": number or null (original price before campaign discount),
          "privatleasing": number (monthly price in kr),
          "old_privatleasing": number or null (original monthly price, e.g. from "ord. pris X kr"),
          "company_leasing_price": number (monthly price in kr),
          "old_company_leasing_price": number or null (original monthly price before campaign),
          "loan_price": number (monthly price in kr),
          "old_loan_price": number or null (original monthly price, e.g. from "ord. pris X kr"),
          "thumbnail": "string (model-specific image path)"
        }
      ],
      "campaign_start": "YYYY-MM-DD",
      "campaign_end": "YYYY-MM-DD", 
      "whats_included": [{"name": "string", "description": "string"}],
      "free_text": "string"
    }
  ]
}`
        : `You are an expert AI for extracting vehicle information from Swedish car dealership websites. Your task is to analyze the provided HTML snippet and extract all relevant vehicle data while avoiding duplicates.

${commonInstructions}

DUPLICATE PREVENTION FOR VEHICLES:
- If you see multiple mentions of the same vehicle model (same name/brand), merge them into ONE vehicle entry
- Combine all financing options from different sources for the same vehicle
- Use the most complete information available (best price, most financing options, etc.)
- For vehicles with same name but different trim levels, treat as separate models under the same vehicle

IMAGE EXTRACTION - CRITICAL:
- For each vehicle, find the image that belongs SPECIFICALLY to that car
- Look for img tags, background-image URLs, or JSON data (mediaItemUrl, menu, image fields)
- Match by: filename containing model name, proximity in HTML to car name, alt text
- Example: For "Swift", look for URLs containing "swift", not "vitara"
- If multiple cars on page, each needs its OWN distinct image URL
- Prefer high-resolution images (look for 2000x, 1920x, 1200x in URL)

VEHICLE TYPE CLASSIFICATION:
- Determine "vehicle_type": "cars" for personbilar (passenger cars), "transport_cars" for transportbilar (vans, trucks)
- Determine "body_type" based on vehicle description and name. Valid body types:
  * "suv" - SUV, crossover (e.g., Vitara, eVitara, S-Cross)
  * "sedan" - Traditional sedan
  * "kombi" - Station wagon/estate (e.g., Peugeot 308 SW)
  * "halvkombi" - Hatchback (e.g., Swift, 208)
  * "cab" - Cabriolet/convertible
  * "coupe" - Coupe/sporty 2-door
  * "minibuss" - MPV/minivan (e.g., Rifter)
  * "pickup" - Pickup truck
  * "skåpbil" - Van/panel van (for transport vehicles)
- Use vehicle name, description and context clues to determine body type

JSON STRUCTURE - Return an array of vehicles:
{
  "${contentType}": [{
    "title": "string (car model name, e.g., 'Swift', 'Vitara', 'e VITARA')",
    "brand": "string (e.g., 'Suzuki', 'Peugeot')",
    "description": "string (max 160)",
    "thumbnail": "string (FULL image URL specific to THIS car - must match the model)",
    "vehicle_type": "cars" or "transport_cars",
    "body_type": "suv" | "sedan" | "kombi" | "halvkombi" | "cab" | "coupe" | "minibuss" | "pickup" | "skåpbil",
    "source_url": "string (the URL of the page where this vehicle was found, from <!-- URL: ... --> comment)",
    "vehicle_model": [
      // ONE entry per PDF row with pricing - use EXACT text from PDF as name
      {
      "name": "string (EXACT variant name from PDF row - e.g. '49 kWh 2WD Base', '1.2 82 hk Hybrid Select CVT')",
      "price": number,
      "old_price": number or null (original price before campaign discount),
      "bransle": "El" | "Bensin" | "Diesel" | "Hybrid" | "Laddhybrid" (extract from variant name: 'Hybrid' = Hybrid, 'el'/'kwh' = El, 'diesel' = Diesel)",
      "vaxellada": "Automat" | "Manuell" (extract from variant: 'CVT'/'Auto' = Automat, otherwise = Manuell)",
      "biltyp": "suv" | "sedan" | "kombi" | "halvkombi" | "cab" | "coupe" | "pickup" | null,
      "privatleasing": number (monthly price in kr),
      "old_privatleasing": number or null (original monthly price before campaign, e.g. from "ord. pris X kr"),
      "company_leasing_price": number (monthly price in kr),
      "old_company_leasing_price": number or null (original monthly price before campaign),
      "loan_price": number (monthly price in kr),
      "old_loan_price": number or null (original monthly price before campaign, e.g. from "ord. pris X kr"),
      "thumbnail": "string (variant-specific image if available)"
    }],
    "free_text": "string"
  }]
}

EXTRACTING VEHICLE SPECS FROM VARIANT NAMES:
- "1.2 82 hk Hybrid Base" → bransle: "Hybrid", vaxellada: "Manuell"
- "1.2 82 hk Hybrid Select CVT" → bransle: "Hybrid", vaxellada: "Automat" (CVT = automatic)
- "1.2 82 hk Hybrid Select AllGrip Auto 4x4" → bransle: "Hybrid", vaxellada: "Automat" (Auto = automatic)
- "61 kWh 4x4 Inclusive" → bransle: "El" (kWh indicates electric), vaxellada: "Automat"

SOURCE URL EXTRACTION:
- Look for <!-- URL: https://... --> comments in the HTML to find the source page URL
- Each vehicle should have its source_url set to the page it was found on`;

    const user = `Analyze the following HTML content and extract all relevant information based on the instructions in the system prompt.

IMPORTANT:
- Avoid creating duplicate entries for the same vehicles or campaigns
- Each vehicle MUST have its own CORRECT image URL - match images by model name in filename or alt text
- Return the data as a single JSON object.`;

    return { system, user };
}

async function processHtmlBatch(
    htmlSnippet: string,
    sourceUrl: string,
    contentType: string,
    enableImageAnalysis: boolean = true
): Promise<BatchProcessResult> {
    const processedHtml = htmlSnippet
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n+/g, '\n')
        .trim();

    const prompts = getOptimizedPrompt(contentType);
    let tokenUsage: TokenUsage | undefined;

    // Use Claude for HTML parsing
    if (!USE_CLAUDE) {
        throw new Error('Claude API not configured. Please set CLAUDE_API_KEY environment variable.');
    }

    console.log('🚀 Using Claude Haiku for HTML parsing (cost-efficient)...');

    // Use the Claude client to extract vehicle data from HTML
    // Using 'haiku' model for cost efficiency - ~75% cheaper than Sonnet
    const claudeResult = await extractVehicleDataFromHTML(processedHtml, sourceUrl, {
        useCache: true,
        model: 'haiku',
    });

    if (!claudeResult.success) {
        throw new Error(`Claude extraction failed: ${claudeResult.error}`);
    }

    // Track token usage - use Haiku pricing since we're using Haiku model
    if (claudeResult.usage) {
        const claudeUsage = createClaudeTokenUsage(
            claudeResult.usage.inputTokens,
            claudeResult.usage.outputTokens,
            'claude-haiku-3-5-20241022',  // Haiku model for correct cost calculation
            claudeResult.usage.cacheReadTokens || 0,
            claudeResult.usage.cacheCreationTokens || 0
        );
        tokenUsage = {
            prompt_tokens: claudeUsage.prompt_tokens,
            completion_tokens: claudeUsage.completion_tokens,
            total_tokens: claudeUsage.total_tokens,
            estimated_cost_usd: claudeUsage.estimated_cost_usd,
            model_used: claudeUsage.model_used,
            api_provider: 'claude' as const
        };
        console.log(`💰 Claude token usage - Prompt: ${claudeUsage.prompt_tokens}, Completion: ${claudeUsage.completion_tokens}, Cost: $${claudeUsage.estimated_cost_usd.toFixed(6)}`);
    }

    // Convert Claude's vehicle format to internal format
    // Now supports both new schema (variants) and legacy (vehicleModels)
    const extractedVehicles = claudeResult.vehicles || [];
    const convertedData: (Vehicle | Campaign)[] = extractedVehicles.map(v => ({
        title: v.title || v.name,
        brand: v.brand,
        thumbnail: v.thumbnail,
        description: v.description,
        vehicle_type: v.vehicle_type || v.vehicleType || 'cars',
        body_type: v.body_type || v.bodyType,
        source_url: v.source_url || v.sourceUrl || sourceUrl,
        free_text: v.free_text || v.freeText || '',

        // NEW SCHEMA: Preserve all extracted data
        variants: v.variants || [],
        dimensions: v.dimensions ?? null,
        colors: v.colors || [],
        interiors: v.interiors || [],
        options: v.options || [],
        accessories: v.accessories || [],
        services: v.services || [],
        connected_services: v.connected_services ?? null,
        financing: v.financing ?? null,
        warranties: v.warranties || [],
        dealer_info: v.dealer_info ?? null,

        // LEGACY: vehicle_model for backward compatibility
        vehicle_model: v.vehicleModels?.map(m => ({
            name: m.name,
            price: m.price,
            old_price: m.oldPrice,
            // Flat financing prices (primary format for database)
            privatleasing: m.privatleasing,
            old_privatleasing: m.oldPrivatleasing,
            company_leasing_price: m.companyLeasingPrice,
            old_company_leasing_price: m.oldCompanyLeasingPrice,
            loan_price: m.loanPrice,
            old_loan_price: m.oldLoanPrice,
            // Legacy nested format for backwards compatibility
            financing_options: {
                privatleasing: m.privatleasing ? [{ monthly_price: m.privatleasing, old_monthly_price: m.oldPrivatleasing, period_months: 36 }] : undefined,
                company_leasing: m.companyLeasingPrice ? [{ monthly_price: m.companyLeasingPrice, old_monthly_price: m.oldCompanyLeasingPrice, period_months: 36 }] : undefined,
                loan: m.loanPrice ? [{ monthly_price: m.loanPrice, old_monthly_price: m.oldLoanPrice, period_months: 60 }] : undefined,
            },
            thumbnail: m.thumbnail,
            bransle: m.bransle,
            biltyp: m.biltyp,
            vaxellada: m.vaxellada,
            utrustning: m.utrustning || [],
        })) || [],
    }));

    // Enhance with image analysis if enabled
    if (enableImageAnalysis) {
        for (const item of convertedData) {
            await enhanceWithImageAnalysis(item, htmlSnippet, sourceUrl);
        }
    }

    return {
        data: convertedData,
        token_usage: tokenUsage || {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        },
    };
}

// Data conversion functions
function extractFinancingPrice(financingOptions: FinancingOption[] | undefined, fallback: number = 0): number {
    if (!financingOptions || financingOptions.length === 0) return fallback;

    const firstOption = financingOptions[0];
    return firstOption?.monthly_price || fallback;
}

function convertToExternalVehicleModel(model: VehicleModel): ExternalVehicleModel {
    return {
        name: model.name,
        price: model.price || 0,
        old_price: model.old_price,
        // Use flat prices if available, otherwise extract from financing_options
        privatleasing: model.privatleasing || extractFinancingPrice(model.financing_options?.privatleasing),
        old_privatleasing: model.old_privatleasing,
        company_leasing_price: model.company_leasing_price || extractFinancingPrice(model.financing_options?.company_leasing),
        old_company_leasing_price: model.old_company_leasing_price,
        loan_price: model.loan_price || extractFinancingPrice(model.financing_options?.loan),
        old_loan_price: model.old_loan_price,
        thumbnail: model.thumbnail || '',
        bransle: model.bransle,
        biltyp: model.biltyp,
        vaxellada: model.vaxellada,
    };
}

function convertToCampaignVehicleModel(model: VehicleModel): CampaignVehicleModel {
    return {
        name: model.name,
        price: model.price || 0,
        old_price: model.old_price,
        // Use flat prices if available, otherwise extract from financing_options
        privatleasing: model.privatleasing || extractFinancingPrice(model.financing_options?.privatleasing),
        old_privatleasing: model.old_privatleasing,
        company_leasing_price: model.company_leasing_price || extractFinancingPrice(model.financing_options?.company_leasing),
        old_company_leasing_price: model.old_company_leasing_price,
        loan_price: model.loan_price || extractFinancingPrice(model.financing_options?.loan),
        old_loan_price: model.old_loan_price,
        thumbnail: model.thumbnail || ''
    };
}

function convertCampaignToCampaignData(campaign: Campaign): CampaignData {
    return {
        title: campaign.title,
        description: truncateDescription(campaign.description || ''),
        content: campaign.content || '',
        thumbnail: campaign.thumbnail || '',
        brand: campaign.brand,
        vehicle_model: (campaign.vehicle_model || []).map(convertToCampaignVehicleModel),
        campaign_start: campaign.campaign_start || '',
        campaign_end: campaign.campaign_end || '',
        whats_included: (campaign.whats_included || []).map(item => ({
            name: item.name,
            description: item.description || ''
        })),
        free_text: campaign.free_text || ''
    };
}

/**
 * Convert PDF-extracted vehicle (from Claude) to VehicleData format (NEW SCHEMA)
 * This is used in the PDF-PRIMARY flow where PDFs are the main data source
 *
 * @param usedImages - Set to track which images have been assigned to avoid duplicates
 * @param vehicleIndex - Index of this vehicle in the array (for round-robin fallback)
 */
function convertExtractedVehicleToVehicleData(
    vehicle: ExtractedVehicle,
    sourceUrl: string,
    availableImages: string[],
    usedImages: Set<string> = new Set(),
    vehicleIndex: number = 0,
    linkedPageHeroImages?: Map<string, string>  // Hero images from linked pages (model slug -> URL)
): VehicleData {
    // Try to find a matching image - PRIORITY: Hero images from linked pages
    let thumbnail = vehicle.thumbnail || null;

    // FIRST: Check hero images extracted from linked pages (high quality)
    if (!thumbnail && linkedPageHeroImages && linkedPageHeroImages.size > 0) {
        const vehicleTitle = vehicle.title?.toLowerCase() || '';
        const vehicleBrand = vehicle.brand?.toLowerCase() || '';

        // Try different matching strategies for hero images
        // 1. Exact model match (e.g., "208" for Peugeot 208)
        const modelMatch = vehicleTitle.match(/\b(\d+|[a-z]+-?\d*)\b/i);
        if (modelMatch) {
            const heroUrl = linkedPageHeroImages.get(modelMatch[1].toLowerCase());
            if (heroUrl) {
                thumbnail = heroUrl;
                console.log(`🖼️ [HERO] Matched hero image for "${vehicle.title}" by model "${modelMatch[1]}": ${heroUrl.substring(heroUrl.lastIndexOf('/') + 1)}`);
            }
        }

        // 2. Try brand-model slug match (e.g., "peugeot-208")
        if (!thumbnail) {
            const brandModelSlug = `${vehicleBrand}-${vehicleTitle}`.replace(/\s+/g, '-').toLowerCase();
            for (const [slug, url] of linkedPageHeroImages) {
                if (brandModelSlug.includes(slug) || slug.includes(vehicleTitle.replace(/\s+/g, '-'))) {
                    thumbnail = url;
                    console.log(`🖼️ [HERO] Matched hero image for "${vehicle.title}" by slug "${slug}": ${url.substring(url.lastIndexOf('/') + 1)}`);
                    break;
                }
            }
        }

        // 3. Try partial match on model name
        if (!thumbnail) {
            for (const [slug, url] of linkedPageHeroImages) {
                if (vehicleTitle.includes(slug) || slug.includes(vehicleTitle.split(' ')[0]?.toLowerCase() || '')) {
                    thumbnail = url;
                    console.log(`🖼️ [HERO] Matched hero image for "${vehicle.title}" by partial "${slug}": ${url.substring(url.lastIndexOf('/') + 1)}`);
                    break;
                }
            }
        }
    }

    // FALLBACK: Try to find a matching image from HTML based on vehicle/brand name
    if (!thumbnail && availableImages.length > 0) {
        // Try to match image by brand or vehicle name (prioritize unused images)
        const searchTerms = [
            vehicle.brand?.toLowerCase(),
            vehicle.title?.toLowerCase(),
            vehicle.title?.split(' ')[0]?.toLowerCase()
        ].filter(Boolean);

        for (const term of searchTerms) {
            // First try to find an UNUSED image that matches
            const matchedImage = availableImages.find(img =>
                img.toLowerCase().includes(term as string) && !usedImages.has(img)
            );
            if (matchedImage) {
                thumbnail = matchedImage;
                usedImages.add(matchedImage);
                console.log(`🖼️ Matched image for "${vehicle.title}" by term "${term}": ${matchedImage.substring(matchedImage.lastIndexOf('/') + 1)}`);
                break;
            }
        }

        // Fallback: distribute unique images round-robin to avoid all vehicles getting the same one
        if (!thumbnail) {
            // Find an unused image, cycling through available images
            const unusedImages = availableImages.filter(img => !usedImages.has(img));
            if (unusedImages.length > 0) {
                // Use round-robin based on vehicle index
                thumbnail = unusedImages[vehicleIndex % unusedImages.length];
                usedImages.add(thumbnail);
                console.log(`🖼️ Round-robin image for "${vehicle.title}" (index ${vehicleIndex}): ${thumbnail.substring(thumbnail.lastIndexOf('/') + 1)}`);
            } else if (availableImages.length > 0) {
                // All images used, fall back to cycling through all images
                thumbnail = availableImages[vehicleIndex % availableImages.length];
                console.log(`🖼️ Recycled image for "${vehicle.title}" (index ${vehicleIndex}): ${thumbnail.substring(thumbnail.lastIndexOf('/') + 1)}`);
            }
        }
    }

    // Convert variants to new schema format
    const variants: VehicleVariant[] = (vehicle.variants || []).map(v => ({
        name: v.name,
        price: v.price ?? null,
        old_price: v.old_price ?? null,
        privatleasing: v.privatleasing ?? null,
        old_privatleasing: v.old_privatleasing ?? null,
        company_leasing: v.company_leasing ?? null,
        old_company_leasing: v.old_company_leasing ?? null,
        loan_price: v.loan_price ?? null,
        old_loan_price: v.old_loan_price ?? null,
        fuel_type: v.fuel_type as VehicleVariant['fuel_type'] ?? null,
        transmission: v.transmission as VehicleVariant['transmission'] ?? null,
        thumbnail: v.thumbnail ?? null,
        specs: v.specs ?? null,
        equipment: v.equipment ?? []
    }));

    return {
        id: undefined,  // Will be assigned by database
        brand: vehicle.brand,
        title: vehicle.title,
        description: truncateDescription(vehicle.description || ''),
        thumbnail,
        vehicle_type: vehicle.vehicle_type ?? 'cars',
        body_type: vehicle.body_type ?? null,
        source_url: sourceUrl,
        updated_at: new Date().toISOString(),

        // Variants (new schema)
        variants,
        variant_count: variants.length,

        // Additional data from PDF
        dimensions: vehicle.dimensions ?? null,
        colors: vehicle.colors ?? [],
        interiors: vehicle.interiors ?? [],
        options: vehicle.options ?? [],
        accessories: vehicle.accessories ?? [],
        services: vehicle.services ?? [],
        connected_services: vehicle.connected_services ?? null,
        financing: vehicle.financing ?? null,
        warranties: vehicle.warranties ?? [],
        dealer_info: vehicle.dealer_info ?? null,

        // Legacy compatibility
        free_text: vehicle.freeText || '',
        pdf_source_url: vehicle.source_url || undefined
    };
}

function convertVehicleToVehicleData(vehicle: Vehicle): VehicleData {
    // Use new schema variants if available, otherwise convert from legacy vehicle_model
    let variants: VehicleVariant[] = [];

    // Check if vehicle has new schema variants
    if ((vehicle as any).variants && Array.isArray((vehicle as any).variants) && (vehicle as any).variants.length > 0) {
        variants = (vehicle as any).variants.map((v: any) => ({
            name: v.name,
            price: v.price ?? null,
            old_price: v.old_price ?? null,
            privatleasing: v.privatleasing ?? null,
            old_privatleasing: v.old_privatleasing ?? null,
            company_leasing: v.company_leasing ?? null,
            old_company_leasing: v.old_company_leasing ?? null,
            loan_price: v.loan_price ?? null,
            old_loan_price: v.old_loan_price ?? null,
            fuel_type: v.fuel_type ?? null,
            transmission: v.transmission ?? null,
            thumbnail: v.thumbnail ?? null,
            specs: v.specs ?? null,
            equipment: v.equipment || []
        }));
    }
    // Fallback: Convert from legacy vehicle_model
    else if (vehicle.vehicle_model && vehicle.vehicle_model.length > 0) {
        variants = vehicle.vehicle_model.map(m => ({
            name: m.name,
            price: m.price ?? null,
            old_price: m.old_price ?? null,
            privatleasing: m.privatleasing || extractFinancingPrice(m.financing_options?.privatleasing) || null,
            old_privatleasing: m.old_privatleasing ?? null,
            company_leasing: m.company_leasing_price || extractFinancingPrice(m.financing_options?.company_leasing) || null,
            old_company_leasing: m.old_company_leasing_price ?? null,
            loan_price: m.loan_price || extractFinancingPrice(m.financing_options?.loan) || null,
            old_loan_price: m.old_loan_price ?? null,
            fuel_type: (m.bransle as VehicleVariant['fuel_type']) ?? null,
            transmission: (m.vaxellada as VehicleVariant['transmission']) ?? null,
            thumbnail: m.thumbnail ?? null,
            equipment: m.utrustning ?? []
        }));
    }

    // Cast vehicle to any to access new schema fields that may exist
    const v = vehicle as any;

    return {
        brand: vehicle.brand,
        title: vehicle.title,
        description: truncateDescription(vehicle.description || ''),
        thumbnail: vehicle.thumbnail || null,
        vehicle_type: v.vehicle_type || 'cars',
        body_type: v.body_type ?? null,
        source_url: vehicle.source_url,
        updated_at: new Date().toISOString(),

        // New schema: variants
        variants,
        variant_count: variants.length,

        // NEW SCHEMA: Additional extracted data (preserve if available)
        dimensions: v.dimensions ?? null,
        colors: Array.isArray(v.colors) ? v.colors : [],
        interiors: Array.isArray(v.interiors) ? v.interiors : [],
        options: Array.isArray(v.options) ? v.options : [],
        accessories: Array.isArray(v.accessories) ? v.accessories : [],
        services: Array.isArray(v.services) ? v.services : [],
        connected_services: v.connected_services ?? null,
        financing: v.financing ?? null,
        warranties: Array.isArray(v.warranties) ? v.warranties : [],
        dealer_info: v.dealer_info ?? null,

        // Legacy fields
        free_text: vehicle.free_text || '',
        pdf_source_url: vehicle.pdf_source_url
    };
}

// Type for content types
type ContentType = 'cars' | 'campaigns' | 'transport_cars';

// MAIN ENHANCED FUNCTION WITH COMPLETE FACT-CHECKING INTEGRATION
export async function processHtmlWithAI(
    htmlContent: string,
    sourceUrl: string,
    category: string = 'unknown',
    enableImageAnalysis: boolean = true,
    enableFactChecking: boolean = false,
    pdfExtractedText: string = '' // PDF data to include with each batch
): Promise<EnhancedProcessedResult> {
    const startTime = Date.now();
    let contentType: ContentType = 'cars';
    let allExtractedData: (Vehicle | Campaign)[] = [];
    const totalTokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    try {
        console.log(`Starting processing for ${sourceUrl} ${enableImageAnalysis ? '(with image analysis)' : '(text only)'} ${enableFactChecking ? '(with fact-checking)' : ''}`);

        contentType = detectContentType(htmlContent, sourceUrl, category) as ContentType;

        // Parse HTML content and extract main page + linked pages
        let batchesToProcess: string[] = [];

        // FIRST: Extract main page content (always process this!)
        const mainPageMatch = htmlContent.match(/<!-- MAIN PAGE CONTENT START -->([\s\S]*?)<!-- MAIN PAGE CONTENT END -->/);
        if (mainPageMatch && mainPageMatch[1]) {
            const mainPageContent = mainPageMatch[1].trim();
            const cleanMainContent = mainPageContent.replace(/<!--.*?-->/g, '').trim();
            if (cleanMainContent.length > 100) {
                console.log(`📄 Found main page content: ${mainPageContent.length} chars`);
                batchesToProcess.push(mainPageContent);
            }
        }

        // SECOND: Extract linked pages
        const linkedContentStartDelimiter = '<!-- LINKED CONTENT START';
        const linkedPageDelimiter = /<!-- LINKED PAGE \d+ START -->/;

        const linkedContentStartIndex = htmlContent.indexOf(linkedContentStartDelimiter);

        if (linkedContentStartIndex !== -1) {
            const linkedContentSection = htmlContent.substring(linkedContentStartIndex);
            const linkedPageSections = linkedContentSection.split(linkedPageDelimiter);

            const linkedPages = linkedPageSections.slice(1).map(pageContent => {
                const contentStart = pageContent.indexOf('<!-- CONTENT START -->');
                const contentEnd = pageContent.indexOf('<!-- CONTENT END -->');

                if (contentStart !== -1 && contentEnd !== -1) {
                    return pageContent.substring(contentStart + '<!-- CONTENT START -->'.length, contentEnd).trim();
                }

                const nextPageIndex = pageContent.indexOf('<!-- LINKED PAGE');
                const endIndex = pageContent.indexOf('<!-- LINKED CONTENT END -->');

                if (nextPageIndex !== -1) {
                    return pageContent.substring(0, nextPageIndex).trim();
                } else if (endIndex !== -1) {
                    return pageContent.substring(0, endIndex).trim();
                } else {
                    return pageContent.trim();
                }
            }).filter(content => {
                const cleanContent = content.replace(/<!--.*?-->/g, '').trim();
                return cleanContent.length > 100;
            });

            console.log(`Found ${linkedPages.length} linked pages with substantial content`);
            batchesToProcess.push(...linkedPages);
        } else {
            console.log('No linked content start delimiter found - checking for legacy format');

            const legacyDelimiter = /<!-- LINKED CONTENT \(\d+ pages\) -->/;
            const legacyMatch = htmlContent.match(legacyDelimiter);

            if (legacyMatch) {
                const linkedContentStartIndex = legacyMatch.index! + legacyMatch[0].length;
                const linkedContentSection = htmlContent.substring(linkedContentStartIndex);
                const linkDelimiter = /<!-- Link \d+: .+? -->/;

                const linkedPages = linkedContentSection.split(linkDelimiter).filter(page => {
                    const trimmed = page.trim();
                    const withoutComments = trimmed
                        .replace(/<!-- URL: .+? -->/g, '')
                        .replace(/<!-- Title: .+? -->/g, '')
                        .trim();
                    return withoutComments.length > 100;
                });

                console.log(`Found ${linkedPages.length} linked pages using legacy format`);
                batchesToProcess.push(...linkedPages);
            } else {
                console.log('No linked pages found - will process main page content only');
            }
        }

        console.log(`Processing ${batchesToProcess.length} batches total`);

        // TEST MODE: Limit batches to speed up testing
        const testMode = process.env.TEST_MODE === 'true';
        const maxBatches = testMode ? 3 : batchesToProcess.length;
        if (testMode && batchesToProcess.length > maxBatches) {
            console.log(`🧪 TEST MODE: Limiting to ${maxBatches} batches (was ${batchesToProcess.length})`);
            batchesToProcess = batchesToProcess.slice(0, maxBatches);
        }

        if (batchesToProcess.length === 0) {
            // Last resort: try to process the raw HTML content if no delimiters found
            const rawContent = htmlContent.replace(/<!--.*?-->/g, '').trim();
            if (rawContent.length > 100) {
                console.log(`⚠️ No delimited content found - processing raw HTML (${rawContent.length} chars)`);
                batchesToProcess = [htmlContent];
            } else {
                console.log('No content batches to process');
                return {
                    success: true,
                    content_type: contentType,
                    source_url: sourceUrl,
                    processed_at: new Date().toISOString(),
                    raw_analysis: { [contentType]: [] },
                    data: [],
                    token_usage: totalTokenUsage,
                };
            }
        }

        // Process batches SEQUENTIALLY to avoid Claude rate limits (10k tokens/min)
        // Using Promise.all causes all batches to hit the API simultaneously, triggering 429 errors
        const batchDelayMs = 5000; // 5 seconds between batches to stay under rate limit

        for (let index = 0; index < batchesToProcess.length; index++) {
            // Include PDF data with each batch so variant/pricing info is available for all vehicles
            const batchHtml = pdfExtractedText
                ? `${batchesToProcess[index]}\n\n<!-- EXTRACTED PDF PRICELIST DATA - Use this for variant names, prices, and specifications -->\n${pdfExtractedText}`
                : batchesToProcess[index];

            // Add delay between batches (not before the first one)
            if (index > 0) {
                console.log(`⏳ Waiting ${batchDelayMs / 1000}s between batches to avoid rate limits...`);
                await new Promise(resolve => setTimeout(resolve, batchDelayMs));
            }

            console.log(`Processing batch ${index + 1}/${batchesToProcess.length} (${batchHtml.length} chars${pdfExtractedText ? `, includes ${pdfExtractedText.length} chars of PDF data` : ''})`);
            const batchResult = await processHtmlBatch(batchHtml, sourceUrl, contentType, enableImageAnalysis);

            console.log(`Batch ${index + 1} extracted ${batchResult.data.length} items`);
            if (batchResult.data.length > 1) {
                console.log(`  ⚠️  Page ${index + 1} contained ${batchResult.data.length} ${contentType}:`);
                batchResult.data.forEach((item: Vehicle | Campaign, itemIndex: number) => {
                    console.log(`    ${itemIndex + 1}. ${item.title?.substring(0, 60)}...`);
                });
            }
            allExtractedData.push(...batchResult.data);
            totalTokenUsage.prompt_tokens += batchResult.token_usage.prompt_tokens;
            totalTokenUsage.completion_tokens += batchResult.token_usage.completion_tokens;
            totalTokenUsage.total_tokens += batchResult.token_usage.total_tokens;
        }

        // Apply deduplication
        console.log(`🔍 Pre-deduplication: ${allExtractedData.length} items`);
        console.log('🔍 Pre-deduplication items:', allExtractedData.map(item => item.title));
        allExtractedData = deduplicateExtractedData(allExtractedData, contentType);
        console.log(`✅ Post-deduplication: ${allExtractedData.length} items`);
        console.log('✅ Post-deduplication items:', allExtractedData.map(item => item.title));

        // Safety limit: Always apply MAX_VEHICLES_PER_BATCH to prevent runaway costs
        // In test mode uses smaller limit, in production uses larger safety limit
        const maxVehicles = parseInt(process.env.MAX_VEHICLES_PER_BATCH || '50', 10);
        if (allExtractedData.length > maxVehicles) {
            console.log(`⚠️ SAFETY LIMIT: Limiting to ${maxVehicles} vehicles (was ${allExtractedData.length})`);
            allExtractedData = allExtractedData.slice(0, maxVehicles);
        }

        allExtractedData = resolveImageUrls(allExtractedData, sourceUrl);

        // Validate and fix image-to-vehicle matching (for vehicles only)
        if (contentType !== 'campaigns') {
            // Extract all available images from the HTML for validation
            const availableImages = extractImageUrls(htmlContent, sourceUrl);
            allExtractedData = validateAndFixImageMatching(allExtractedData as Vehicle[], availableImages) as (Vehicle | Campaign)[];
        }

        // Convert internal data to external format
        let convertedData: (CampaignData | VehicleData)[];
        let campaigns: CampaignData[] | undefined;
        let cars: VehicleData[] | undefined;
        let transport_cars: VehicleData[] | undefined;

        if (contentType === 'campaigns') {
            const campaignData = (allExtractedData as Campaign[]).map(convertCampaignToCampaignData);
            convertedData = campaignData;
            campaigns = campaignData;
        } else {
            const vehicleData = (allExtractedData as Vehicle[]).map(convertVehicleToVehicleData);
            convertedData = vehicleData;

            if (contentType === 'cars') {
                cars = vehicleData;
            } else {
                transport_cars = vehicleData;
            }
        }

        let result: EnhancedProcessedResult = {
            success: true,
            content_type: contentType,
            source_url: sourceUrl,
            processed_at: new Date().toISOString(),
            raw_analysis: { [contentType]: allExtractedData },
            data: convertedData,
            campaigns,
            cars,
            transport_cars,
            token_usage: totalTokenUsage,
        };

        // FACT-CHECKING INTEGRATION
        if (enableFactChecking && PERPLEXITY_API_KEY && convertedData.length > 0) {
            console.log(`🔍 Starting fact-checking for ${convertedData.length} items`);

            const factCheckResults: FactCheckResult[] = [];
            const factCheckTokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

            // Limit fact-checking to prevent excessive costs (max 5 items)
            const itemsToCheck = convertedData.slice(0, 5);

            for (let i = 0; i < itemsToCheck.length; i++) {
                const item = itemsToCheck[i];
                console.log(`Fact-checking ${i + 1}/${itemsToCheck.length}: ${item.title}`);

                const factCheckResult = await factCheckData(
                    item,
                    htmlContent,
                    contentType === 'campaigns' ? 'campaign' : 'vehicle'
                );

                factCheckResults.push(factCheckResult);

                // Accumulate token usage
                if (factCheckResult.token_usage) {
                    factCheckTokenUsage.prompt_tokens += factCheckResult.token_usage.prompt_tokens;
                    factCheckTokenUsage.completion_tokens += factCheckResult.token_usage.completion_tokens;
                    factCheckTokenUsage.total_tokens += factCheckResult.token_usage.total_tokens;
                }

                // Apply corrections if available and accuracy is high
                if (factCheckResult.corrected_data && factCheckResult.accuracy_score >= 80) {
                    console.log(`✅ Applying corrections for item ${i + 1}`);
                    convertedData[i] = factCheckResult.corrected_data;
                }

                // Rate limiting between fact-checks (2 second delay)
                if (i < itemsToCheck.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            // Calculate overall metrics
            const overallAccuracy = factCheckResults.length > 0
                ? factCheckResults.reduce((sum, r) => sum + r.accuracy_score, 0) / factCheckResults.length
                : 100;

            const allIssues = factCheckResults.flatMap(r => r.flagged_issues);
            const criticalIssues = allIssues.filter(i => i.severity === 'critical').length;

            // Add fact-check data to result
            result.fact_check = {
                enabled: true,
                results: factCheckResults,
                overall_accuracy: overallAccuracy,
                total_issues: allIssues.length,
                critical_issues: criticalIssues,
                token_usage: factCheckTokenUsage
            };

            // Update data arrays with corrected data
            result.data = convertedData;
            if (contentType === 'campaigns') {
                result.campaigns = convertedData as CampaignData[];
            } else if (contentType === 'cars') {
                result.cars = convertedData as VehicleData[];
            } else if (contentType === 'transport_cars') {
                result.transport_cars = convertedData as VehicleData[];
            }

            console.log(`✅ Fact-checking complete: ${overallAccuracy.toFixed(1)}% accuracy, ${allIssues.length} total issues, ${criticalIssues} critical`);

            // Log critical issues for immediate attention
            if (criticalIssues > 0) {
                console.warn(`⚠️ CRITICAL ISSUES DETECTED:`);
                factCheckResults.forEach((factCheck, index) => {
                    const critical = factCheck.flagged_issues.filter(i => i.severity === 'critical');
                    if (critical.length > 0) {
                        console.warn(`  ${convertedData[index].title}:`);
                        critical.forEach(issue => {
                            console.warn(`    - ${issue.field}: ${issue.description}`);
                        });
                    }
                });
            }
        } else if (enableFactChecking && !PERPLEXITY_API_KEY) {
            console.warn('⚠️ Fact-checking requested but PERPLEXITY_API_KEY not found');
        }

        const processingTime = Date.now() - startTime;
        console.log(`✅ Processed ${convertedData.length} unique ${contentType} items in ${processingTime}ms`);

        return result;

    } catch (error: unknown) {
        const processingTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Processing failed';
        console.error(`❌ Processing failed after ${processingTime}ms:`, errorMessage);

        return {
            success: false,
            content_type: contentType,
            error: errorMessage,
            source_url: sourceUrl,
            processed_at: new Date().toISOString(),
        };
    }
}

// Add this function to your code after the enhanceWithImageAnalysis function
function resolveImageUrls<T extends Vehicle | Campaign>(data: T[], sourceUrl: string): T[];
function resolveImageUrls<T extends Vehicle | Campaign>(data: T, sourceUrl: string): T;
function resolveImageUrls<T extends Vehicle | Campaign>(data: T | T[], sourceUrl: string): T | T[] {
    if (!data) return data;

    let baseOrigin: string;
    try {
        const urlObj = new URL(sourceUrl);
        baseOrigin = `${urlObj.protocol}//${urlObj.host}`;
    } catch (error) {
        console.error(`Failed to parse sourceUrl: ${sourceUrl}`, error);
        return data;
    }

    const resolveUrl = (url: string): string => {
        if (!url) return url;

        // Decode HTML entities first (e.g., &amp; -> &)
        let cleanUrl = url
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");

        // Check if URL has small resize parameters - strip them to get original
        // This converts ?width=213&height=119 resized URLs to original image
        if (cleanUrl.includes('?') && (cleanUrl.includes('width=') || cleanUrl.includes('height='))) {
            const widthMatch = cleanUrl.match(/[?&]width=(\d+)/i);
            const urlWidth = widthMatch ? parseInt(widthMatch[1], 10) : 0;

            // If it's a small thumbnail (width < 500), strip params to get original
            if (urlWidth > 0 && urlWidth < 500) {
                cleanUrl = cleanUrl.split('?')[0];
                console.log(`🔧 Stripped resize params from thumbnail URL (was ${urlWidth}px width)`);
            }
        }

        if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
            return cleanUrl;
        }
        if (cleanUrl.startsWith('/')) {
            return baseOrigin + cleanUrl;
        }
        return cleanUrl;
    };

    if (Array.isArray(data)) {
        return data.map((item) => resolveImageUrls(item, sourceUrl));
    }

    const resolved = { ...data };

    if (resolved.thumbnail) {
        resolved.thumbnail = resolveUrl(resolved.thumbnail);
    }

    if (Array.isArray(resolved.vehicle_model)) {
        resolved.vehicle_model = resolved.vehicle_model.map((model: VehicleModel) => {
            if (model.thumbnail) {
                return {
                    ...model,
                    thumbnail: resolveUrl(model.thumbnail),
                };
            }
            return model;
        });
    }

    return resolved;
}

// ENHANCED VALIDATION WRAPPER WITH FACT-CHECKING
export async function processHtmlWithValidation(
    htmlContent: string,
    sourceUrl: string,
    category: string = 'unknown',
    enableImageAnalysis: boolean = true,
    enableFactChecking: boolean = false,
    pdfExtractedText: string = '' // PDF data to include with each batch
): Promise<EnhancedProcessedResult> {
    const result = await processHtmlWithAI(htmlContent, sourceUrl, category, enableImageAnalysis, enableFactChecking, pdfExtractedText);

    if (!result.success || !result.data?.length) {
        return result;
    }

    // Apply existing validation logic
    if (result.content_type === 'campaigns') {
        const validatedCampaigns = (result.data as CampaignData[])
            .map(validateCampaignData)
            .filter((item): item is NonNullable<ReturnType<typeof validateCampaignData>> => Boolean(item));

        result.data = validatedCampaigns;
        result.campaigns = validatedCampaigns;
    } else {
        const validatedVehicles = (result.data as VehicleData[])
            .map(validateVehicleData)
            .filter((item): item is NonNullable<ReturnType<typeof validateVehicleData>> => Boolean(item));

        result.data = validatedVehicles;
        if (result.content_type === 'cars') {
            result.cars = validatedVehicles;
        } else {
            result.transport_cars = validatedVehicles;
        }
    }

    // Enhanced logging with fact-check information
    if (result.fact_check) {
        const criticalIssues = result.fact_check.results.flatMap(r =>
            r.flagged_issues.filter(i => i.severity === 'critical')
        );

        if (criticalIssues.length > 0) {
            console.warn(`⚠️ ${criticalIssues.length} critical fact-checking issues found - manual review recommended`);
        }

        if (result.fact_check.overall_accuracy < 70) {
            console.error(`❌ Low fact-check accuracy (${result.fact_check.overall_accuracy.toFixed(1)}%) - data quality concerns`);
        }

        // Log token usage for cost tracking
        const totalTokens = (result.token_usage?.total_tokens || 0) + (result.fact_check.token_usage?.total_tokens || 0);
        console.log(`💰 Token Usage - Claude: ${result.token_usage?.total_tokens || 0}, Perplexity: ${result.fact_check.token_usage?.total_tokens || 0}, Total: ${totalTokens}`);
    }

    console.log(`✅ Validated ${result.data.length} items`);
    return result;
}

// Progress callback type for streaming updates
export type ProgressCallback = (step: string, message: string, data?: Record<string, any>) => void;

// SMART FACT-CHECKING WRAPPER - AUTOMATICALLY DECIDES WHEN TO FACT-CHECK
export async function processHtmlWithSmartFactCheck(
    htmlContent: string,
    sourceUrl: string,
    category: string = 'unknown',
    enableImageAnalysis: boolean = true,
    metadata?: {
        brand?: string;
        carType?: string;
        description?: string;
        label?: string;
    },
    scraperPdfLinks?: { url: string; type: string; foundOnPage: string }[],  // PDF links from scraper
    onProgress?: ProgressCallback,  // Optional callback for streaming progress updates
    linkedPageHeroImages?: Map<string, string>  // Hero images extracted from linked pages (model slug -> image URL)
): Promise<EnhancedProcessedResult> {
    // Smart decision logic for enabling fact-checking
    const shouldFactCheck =
        // High-value content indicators
        (sourceUrl.includes('kampanj') || sourceUrl.includes('erbjudand') || sourceUrl.includes('campaign')) ||
        // Large content that justifies the cost
        htmlContent.length > 15000 ||
        // Multiple linked pages suggest comprehensive content
        (htmlContent.match(/<!-- LINKED PAGE/g) || []).length >= 3 ||
        // Priority brand domains
        (sourceUrl.includes('peugeot') || sourceUrl.includes('opel') || sourceUrl.includes('suzuki') || sourceUrl.includes('toyota')) ||
        // Metadata-based brand prioritization
        (metadata?.brand && ['Suzuki', 'Honda', 'Toyota', 'Peugeot', 'Opel'].includes(metadata.brand)) ||
        // Category indicators
        (category === 'campaigns' || category === 'high-value');

    const factCheckReason = shouldFactCheck ?
        (sourceUrl.includes('kampanj') || sourceUrl.includes('erbjudand') ? 'campaign content' :
            htmlContent.length > 15000 ? 'large content' :
                (htmlContent.match(/<!-- LINKED PAGE/g) || []).length >= 3 ? 'multiple pages' :
                    metadata?.brand && ['Suzuki', 'Honda', 'Toyota', 'Peugeot', 'Opel'].includes(metadata.brand) ? 'priority brand (metadata)' :
                        'priority brand') : 'not cost-effective';

    console.log(`🤖 Smart fact-checking: ${shouldFactCheck ? 'ENABLED' : 'DISABLED'} for ${sourceUrl} (reason: ${factCheckReason})`);

    if (metadata) {
        console.log(`📊 Processing with metadata - Brand: ${metadata.brand || 'none'}, Car Type: ${metadata.carType || 'none'}, Label: ${metadata.label || 'none'}`);
    }

    // PDF Processing - Extract and process PDFs found in HTML
    // OPTIMIZED: Use Claude's native PDF vision to extract data directly (no OCR step)
    // This is more cost-effective than Google OCR + Claude text analysis
    // Test mode detection
    const isTestMode = process.env.TEST_MODE === 'true';

    // PDF limits - use test limits if in test mode
    const maxPdfsPerPage = isTestMode
        ? parseInt(process.env.TEST_MAX_PDFS || '2', 10)
        : parseInt(process.env.MAX_PDFS_PER_PAGE || '20', 10);

    // Safety limits to prevent runaway costs
    const maxTotalPdfs = parseInt(process.env.MAX_TOTAL_PDFS || '100', 10);
    const maxAiCostUsd = parseFloat(process.env.MAX_AI_COST_USD || '10.00');
    let pdfExtractedText = '';  // Kept for backward compatibility, but not used in new flow

    if (isTestMode) {
        console.log(`🧪 TEST MODE: Limiting to ${maxPdfsPerPage} PDFs per page`);
    }

    // Track Claude PDF extraction costs (replaces Google OCR costs)
    let claudePdfCosts = {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_usd: 0,
        pdfs_processed: 0
    };

    // Direct PDF extraction results - vehicles extracted directly from PDFs
    let pdfExtractedVehicles: ExtractedVehicle[] = [];

    // Two-tier extraction tracking (declared at outer scope for result attachment)
    let twoTierResults: (TwoTierExtractionResult & { pdfUrl?: string })[] = [];
    let customExtractorData: any = null;

    try {
        // Use scraper-provided PDF links if available (more reliable)
        // Otherwise fall back to extracting from HTML
        let allPdfLinks: string[];

        if (scraperPdfLinks && scraperPdfLinks.length > 0) {
            // Use PDF links from scraper - these are already validated URLs found during scraping
            allPdfLinks = scraperPdfLinks.map(pdf => pdf.url);
            console.log(`📄 Using ${allPdfLinks.length} PDF links from scraper (preferred source):`);
            scraperPdfLinks.forEach((pdf, i) => {
                console.log(`   ${i + 1}. [${pdf.type}] ${pdf.url} (found on: ${pdf.foundOnPage})`);
            });
        } else {
            // Fall back to extracting from HTML content
            allPdfLinks = extractPDFLinksFromHTML(htmlContent, sourceUrl);
            if (allPdfLinks.length > 0) {
                console.log(`📄 Found ${allPdfLinks.length} PDF links in HTML (fallback extraction)`);
            } else {
                console.log(`📄 No PDF links found in HTML content from ${sourceUrl}`);
            }
        }

        // Filter to only pricelists (skip brochures and other PDFs)
        const pdfLinks = filterPricelistPDFs(allPdfLinks);

        if (pdfLinks.length > 0) {
            console.log(`📄 Processing ${pdfLinks.length} pricelist PDFs (up to ${maxPdfsPerPage})...`);

            // Emit PDF extraction start event
            onProgress?.('pdf_extraction_start', `Processing ${Math.min(pdfLinks.length, maxPdfsPerPage)} PDF pricelists...`, {
                totalPdfs: pdfLinks.length,
                maxPdfs: maxPdfsPerPage
            });

            // Process only pricelist PDFs (limited by MAX_PDFS_PER_PAGE)
            // Add delay between PDFs to avoid Claude rate limits (10k tokens/min on free tier)
            const pdfDelayMs = 3000; // 3 seconds between PDFs to stay under rate limit

            // Base brand and model from metadata or source URL (fallback)
            const baseBrand = metadata?.brand || extractBrandFromUrl(sourceUrl) || 'Unknown';
            const baseModelName = metadata?.label || extractModelFromUrl(sourceUrl) || 'Unknown';

            console.log(`🔧 Two-Tier PDF Processing: BaseBrand=${baseBrand}, BaseModel=${baseModelName}`);
            console.log(`   Custom Extractor available: ${isCustomExtractorEnabled()}`);

            for (let i = 0; i < Math.min(pdfLinks.length, maxPdfsPerPage); i++) {
                const pdfUrl = pdfLinks[i];
                const pdfType = categorizePDF(pdfUrl);

                // Extract brand and model from PDF URL itself (more reliable for multi-brand pages)
                const pdfBrand = extractBrandFromUrl(pdfUrl) || baseBrand;
                const pdfModel = extractModelFromUrl(pdfUrl) || baseModelName;

                console.log(`📄 Processing ${pdfType} PDF (${i + 1}/${Math.min(pdfLinks.length, maxPdfsPerPage)}): ${pdfUrl}`);
                console.log(`   PDF Brand: ${pdfBrand}, Model: ${pdfModel}`);

                // Add delay between PDFs (not before the first one)
                if (i > 0) {
                    console.log(`⏳ Waiting ${pdfDelayMs}ms to avoid rate limits...`);
                    await new Promise(resolve => setTimeout(resolve, pdfDelayMs));
                }

                try {
                    // OPTIMIZED: Use Claude's native PDF vision for direct extraction
                    // This is more cost-effective than Google OCR + Claude text analysis
                    // Claude "sees" the PDF visually, reducing token count significantly
                    console.log(`🚀 Using Claude native PDF extraction (cost-optimized)`);

                    const pdfResult = await claudeExtractVehicleDataFromPDF(pdfUrl);

                    if (pdfResult.success && pdfResult.vehicles && pdfResult.vehicles.length > 0) {
                        // Track costs from Claude usage
                        if (pdfResult.usage) {
                            claudePdfCosts.total_input_tokens += pdfResult.usage.inputTokens;
                            claudePdfCosts.total_output_tokens += pdfResult.usage.outputTokens;
                            claudePdfCosts.total_cost_usd += pdfResult.usage.estimatedCostUsd;
                            claudePdfCosts.pdfs_processed += 1;
                        }

                        // Store extracted vehicles for merging with HTML results
                        const vehiclesWithSource = pdfResult.vehicles.map(v => ({
                            ...v,
                            source_url: pdfUrl,
                            sourceUrl: pdfUrl,
                            priceSource: 'pdf' as const
                        }));
                        pdfExtractedVehicles.push(...vehiclesWithSource);

                        const totalVariants = pdfResult.vehicles.reduce((sum, v) => sum + (v.variants?.length || v.vehicleModels?.length || 0), 0);
                        console.log(`✅ Claude PDF extraction: ${pdfResult.vehicles.length} vehicles, ${totalVariants} variants`);
                        console.log(`   Cost: $${pdfResult.usage?.estimatedCostUsd.toFixed(4) || 'N/A'} (${pdfResult.usage?.inputTokens || 0} input + ${pdfResult.usage?.outputTokens || 0} output tokens)`);

                        // Emit progress event
                        onProgress?.('pdf_claude_extraction', `📄 Claude PDF: ${pdfBrand} ${pdfModel} - ${pdfResult.vehicles.length} vehicles, ${totalVariants} variants`, {
                            method: 'claude-native-pdf',
                            brand: pdfBrand,
                            model: pdfModel,
                            vehicles: pdfResult.vehicles.length,
                            variants: totalVariants,
                            cost: pdfResult.usage?.estimatedCostUsd || 0,
                            inputTokens: pdfResult.usage?.inputTokens || 0,
                            outputTokens: pdfResult.usage?.outputTokens || 0
                        });

                        // Safety limit: Check if cost limit exceeded
                        if (claudePdfCosts.total_cost_usd >= maxAiCostUsd) {
                            console.warn(`⚠️ SAFETY LIMIT: AI cost limit reached ($${claudePdfCosts.total_cost_usd.toFixed(2)} >= $${maxAiCostUsd}). Stopping PDF processing.`);
                            break;
                        }
                        // Safety limit: Check if PDF count limit exceeded
                        if (claudePdfCosts.pdfs_processed >= maxTotalPdfs) {
                            console.warn(`⚠️ SAFETY LIMIT: Max PDF limit reached (${claudePdfCosts.pdfs_processed} >= ${maxTotalPdfs}). Stopping PDF processing.`);
                            break;
                        }
                    } else {
                        console.warn(`⚠️ Claude PDF extraction returned no vehicles: ${pdfResult.error || 'Unknown error'}`);

                        // Fallback to Google OCR + text extraction if Claude fails
                        // This is the old approach, kept as fallback
                        if (isCustomExtractorEnabled() && pdfBrand !== 'Unknown') {
                            console.log(`🔧 Fallback: Using Two-Tier PDF Processing for ${pdfBrand} ${pdfModel}`);

                            const twoTierResult = await extractPDFWithTwoTierSystem(
                                pdfUrl,
                                pdfBrand,
                                pdfModel,
                                false
                            );

                            twoTierResults.push({ ...twoTierResult, pdfUrl } as TwoTierExtractionResult & { pdfUrl: string });

                            if (twoTierResult.success && twoTierResult.priceOnlyText) {
                                pdfExtractedText += `\n\n<!-- PDF CONTENT FROM: ${pdfUrl} (${pdfType}) [Fallback OCR] -->\n${twoTierResult.priceOnlyText}\n<!-- END PDF CONTENT -->`;
                            }
                        }
                    }
                } catch (pdfError) {
                    console.warn(`⚠️ Failed to process PDF ${pdfUrl}:`, pdfError);
                }
            }

            // Log extraction summary
            if (pdfExtractedVehicles.length > 0) {
                const totalVariants = pdfExtractedVehicles.reduce((sum, v) => sum + (v.variants?.length || v.vehicleModels?.length || 0), 0);
                console.log(`📊 Claude Native PDF Extraction Summary:`);
                console.log(`   - PDFs processed: ${claudePdfCosts.pdfs_processed}`);
                console.log(`   - Vehicles extracted: ${pdfExtractedVehicles.length}`);
                console.log(`   - Total variants: ${totalVariants}`);
                console.log(`   - Total cost: $${claudePdfCosts.total_cost_usd.toFixed(4)}`);
                console.log(`   - Total tokens: ${claudePdfCosts.total_input_tokens} input + ${claudePdfCosts.total_output_tokens} output`);

                // Emit PDF extraction complete event with summary
                onProgress?.('pdf_extraction_complete', `PDF extraction complete: ${pdfExtractedVehicles.length} vehicles, ${totalVariants} variants (cost: $${claudePdfCosts.total_cost_usd.toFixed(4)})`, {
                    method: 'claude-native-pdf',
                    vehiclesExtracted: pdfExtractedVehicles.length,
                    variantsExtracted: totalVariants,
                    totalCost: claudePdfCosts.total_cost_usd,
                    pdfsProcessed: claudePdfCosts.pdfs_processed,
                    inputTokens: claudePdfCosts.total_input_tokens,
                    outputTokens: claudePdfCosts.total_output_tokens
                });
            }

            // Log fallback OCR results if any
            if (twoTierResults.length > 0) {
                const customCount = twoTierResults.filter(r => r.tier === 'custom').length;
                const standardCount = twoTierResults.filter(r => r.tier === 'standard_ocr').length;
                console.log(`📊 Fallback OCR Summary (used when Claude failed):`);
                console.log(`   - Custom extractor: ${customCount}`);
                console.log(`   - Standard OCR: ${standardCount}`);
            }
        }
    } catch (pdfError) {
        console.warn('⚠️ PDF extraction failed:', pdfError);
    }

    // NEW ARCHITECTURE: PDF vehicles are PRIMARY data source
    // HTML is only used for images/links extraction (lightweight)
    // DO NOT pass pdfExtractedText - that causes re-analysis of raw text

    let result: EnhancedProcessedResult;

    if (pdfExtractedVehicles.length > 0) {
        // PDF-PRIMARY FLOW: Use PDF-extracted vehicles as the main data source
        // Only extract images from HTML, don't re-analyze everything
        console.log(`🚀 PDF-PRIMARY FLOW: Using ${pdfExtractedVehicles.length} PDF-extracted vehicles as primary data`);

        // Extract images from HTML for vehicle matching
        const availableImages = extractImageUrls(htmlContent, sourceUrl);
        console.log(`🖼️ Found ${availableImages.length} images in HTML for matching`);

        // Track used images to avoid assigning the same image to multiple vehicles
        const usedImages = new Set<string>();

        // Convert PDF-extracted vehicles to VehicleData format
        // Pass usedImages set and index to distribute unique images across vehicles
        // Pass linkedPageHeroImages for high-quality hero image matching
        const pdfVehicleData: VehicleData[] = pdfExtractedVehicles.map((v, index) =>
            convertExtractedVehicleToVehicleData(v, sourceUrl, availableImages, usedImages, index, linkedPageHeroImages)
        );

        // Create result with PDF vehicles as primary data
        result = {
            success: true,
            content_type: 'cars',
            source_url: sourceUrl,
            processed_at: new Date().toISOString(),
            raw_analysis: { cars: pdfVehicleData },
            data: pdfVehicleData,
            cars: pdfVehicleData,
            token_usage: createTokenUsage(0, 0, 'claude-sonnet-4-5-20250514', 'claude'),  // No additional tokens used for conversion
        };
        // Track that this result came from PDF-primary flow
        (result as any).data_source = 'pdf-primary';

        console.log(`✅ PDF-PRIMARY: ${pdfVehicleData.length} vehicles ready (no HTML re-analysis needed)`);
    } else {
        // FALLBACK: No PDF data available, use traditional HTML analysis
        console.log(`📄 FALLBACK FLOW: No PDF vehicles found, using HTML analysis`);
        result = await processHtmlWithValidation(
            htmlContent,
            sourceUrl,
            category,
            enableImageAnalysis,
            shouldFactCheck,
            '' // No PDF text - we don't merge raw text anymore
        );
    }

    // Add Claude PDF extraction costs to the result AND token_usage
    if (claudePdfCosts.pdfs_processed > 0) {
        (result as any).claude_pdf_costs = claudePdfCosts;

        // Add PDF tokens to the main token_usage for proper cost tracking
        if (result.token_usage) {
            result.token_usage.prompt_tokens += claudePdfCosts.total_input_tokens;
            result.token_usage.completion_tokens += claudePdfCosts.total_output_tokens;
            result.token_usage.total_tokens += claudePdfCosts.total_input_tokens + claudePdfCosts.total_output_tokens;
            // Add or update estimated cost
            if (result.token_usage.estimated_cost_usd !== undefined) {
                result.token_usage.estimated_cost_usd += claudePdfCosts.total_cost_usd;
            } else {
                result.token_usage.estimated_cost_usd = claudePdfCosts.total_cost_usd;
            }
        }

        // Add to total estimated cost
        if (result.total_estimated_cost_usd !== undefined) {
            result.total_estimated_cost_usd += claudePdfCosts.total_cost_usd;
        } else {
            result.total_estimated_cost_usd = claudePdfCosts.total_cost_usd;
        }

        console.log(`💰 Added PDF extraction costs to token_usage: ${claudePdfCosts.total_input_tokens + claudePdfCosts.total_output_tokens} tokens, $${claudePdfCosts.total_cost_usd.toFixed(4)}`);
    }

    // Store PDF-extracted vehicles for merging (new optimized flow)
    if (pdfExtractedVehicles.length > 0) {
        (result as any).pdf_extracted_vehicles = pdfExtractedVehicles;
        console.log(`📊 PDF-extracted vehicles attached to result: ${pdfExtractedVehicles.length} vehicles`);

        // Run Perplexity fact-checking on PDF-extracted data
        if (PERPLEXITY_API_KEY && result.data && result.data.length > 0) {
            try {
                // Get the primary PDF URL for fact-checking
                const primaryPdfUrl = pdfExtractedVehicles[0]?.source_url || pdfExtractedVehicles[0]?.sourceUrl || sourceUrl;
                console.log(`🔍 Running Perplexity PDF fact-check against: ${primaryPdfUrl}`);

                onProgress?.('pdf_fact_check_start', `Validating extracted data with Perplexity...`, {});

                const pdfFactCheckResult = await factCheckPDFExtraction(result.data as VehicleData[], primaryPdfUrl);

                // Attach fact-check results
                (result as any).pdf_fact_check = pdfFactCheckResult;

                // Log findings to progress
                if (pdfFactCheckResult.success) {
                    const issues: string[] = [];
                    if (pdfFactCheckResult.duplicate_vehicles.found) {
                        issues.push(`${pdfFactCheckResult.duplicate_vehicles.details.length} duplicate vehicles`);
                    }
                    if (pdfFactCheckResult.duplicate_variants.found) {
                        issues.push(`${pdfFactCheckResult.duplicate_variants.details.length} duplicate variants`);
                    }
                    if (pdfFactCheckResult.missing_data.found) {
                        issues.push(`${pdfFactCheckResult.missing_data.details.length} missing data issues`);
                    }

                    const issuesSummary = issues.length > 0 ? issues.join(', ') : 'No issues found';
                    onProgress?.('pdf_fact_check_complete', `✅ Fact-check: ${pdfFactCheckResult.accuracy_score}% accuracy - ${issuesSummary}`, {
                        accuracy: pdfFactCheckResult.accuracy_score,
                        duplicateVehicles: pdfFactCheckResult.duplicate_vehicles.found,
                        duplicateVariants: pdfFactCheckResult.duplicate_variants.found,
                        missingData: pdfFactCheckResult.missing_data.found
                    });
                } else {
                    onProgress?.('pdf_fact_check_failed', `⚠️ Fact-check failed: ${pdfFactCheckResult.summary}`, {});
                }
            } catch (factCheckError) {
                console.error('❌ PDF fact-check error:', factCheckError);
                onProgress?.('pdf_fact_check_error', `⚠️ Fact-check error: ${factCheckError instanceof Error ? factCheckError.message : 'Unknown'}`, {});
            }
        }
    }

    // Store raw PDF text for debugging (truncated to 50KB to save space)
    if (pdfExtractedText) {
        (result as any).raw_pdf_text = pdfExtractedText.length > 50000
            ? pdfExtractedText.substring(0, 50000) + '\n\n... [truncated]'
            : pdfExtractedText;
    }

    // Store custom extractor data for debugging and viewing in UI
    if (customExtractorData) {
        (result as any).custom_extractor_data = customExtractorData;
        console.log(`📊 Custom extractor data attached to result:`, {
            variants: customExtractorData.variants?.length || 0,
            hasEquipment: customExtractorData.variants?.some((v: any) => v.equipment?.length > 0)
        });
    }

    // Store two-tier extraction results summary
    if (twoTierResults.length > 0) {
        (result as any).two_tier_results = twoTierResults.map(r => ({
            tier: r.tier,
            reason: r.reason,
            pdfUrl: r.pdfUrl,
            pageCount: r.pageCount,
            estimatedCost: r.estimatedCost,
            variantsExtracted: r.fullData?.variants?.length || 0,
            hasEquipment: r.fullData?.variants?.some((v: any) => v.equipment?.length > 0) || false
        }));
    }

    return result;
}

// UTILITY FUNCTION FOR STANDALONE FACT-CHECKING
export async function factCheckExistingData(
    data: (VehicleData | CampaignData)[],
    htmlContent: string,
    sourceUrl: string,
    contentType: 'vehicles' | 'campaigns'
): Promise<FactCheckResult[]> {
    if (!PERPLEXITY_API_KEY) {
        console.error('PERPLEXITY_API_KEY not found');
        return [];
    }

    try {
        console.log(`🔍 Fact-checking ${data.length} existing ${contentType}`);

        const results: FactCheckResult[] = [];
        const itemsToCheck = data.slice(0, 5);

        for (let i = 0; i < itemsToCheck.length; i++) {
            const item = itemsToCheck[i];
            console.log(`Fact-checking ${i + 1}/${itemsToCheck.length}: ${item.title}`);

            const result = await factCheckData(
                item,
                htmlContent,
                contentType === 'campaigns' ? 'campaign' : 'vehicle'
            );

            results.push(result);

            // Rate limiting
            if (i < itemsToCheck.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy_score, 0) / results.length;
        const totalIssues = results.reduce((sum, r) => sum + r.flagged_issues.length, 0);

        console.log(`✅ Standalone fact-check complete: ${avgAccuracy.toFixed(1)}% accuracy, ${totalIssues} issues`);

        return results;
    } catch (error) {
        console.error('❌ Standalone fact-checking failed:', error);
        return [];
    }
}

// Export enhanced types and interfaces
export type { EnhancedProcessedResult, FactCheckResult, FactCheckIssue };