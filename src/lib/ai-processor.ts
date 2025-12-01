'use server';

import OpenAI from 'openai';
import axios from 'axios';
import {
    ProcessedResult,
    detectContentType,
    validateCampaignData,
    validateVehicleData,
    CampaignData,
    VehicleData,
    truncateDescription,
    CampaignVehicleModel,
    VehicleModel as ExternalVehicleModel,
    TokenUsage as EnhancedTokenUsage,

    createTokenUsage
} from './ai-processor-types';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Perplexity API configuration
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_BASE_URL = 'https://api.perplexity.ai/chat/completions';

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
    financing_options?: FinancingOptions;
    thumbnail?: string;
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
    api_provider?: 'openai' | 'perplexity';
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
    const brand = parentBrand || '';
    const price = vehicle.price || 0;

    // More aggressive normalization
    const normalizedName = name
        .replace(/\s+/g, ' ')
        .replace(/[-_]/g, ' ')
        .replace(/\b(nya|new|2024|2025|hybrid|e:hev|fullhybrid)\b/g, '') // Remove more common variations
        .replace(/\b(elegance|advance|sport|style|plus)\b/g, '') // Remove trim levels for base comparison
        .trim();

    return `${brand}:${normalizedName}`;
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

    // Check for partial matches (e.g., "Honda Jazz" vs "Honda Jazz Hybrid")
    const existingWords = existing.title.toLowerCase().split(/\s+/);
    const duplicateWords = duplicate.title.toLowerCase().split(/\s+/);

    // If one title is contained within another (accounting for common additions)
    const commonWords = existingWords.filter(word =>
        duplicateWords.includes(word) &&
        !['hybrid', 'e:hev', 'nya', 'new', '2024', '2025'].includes(word)
    );

    // If they share significant common words and same brand
    return existing.brand === duplicate.brand && commonWords.length >= 2;
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

    // Vehicle models: Intelligent merging
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

    return merged;
}

function intelligentMergeVehicleModels(existing: VehicleModel, duplicate: VehicleModel): VehicleModel {
    const merged: VehicleModel = { ...existing };

    // Prefer longer, more descriptive names
    if (duplicate.name && duplicate.name.length > existing.name.length) {
        merged.name = duplicate.name;
    }

    // Prefer actual prices over null/0
    if (duplicate.price && duplicate.price > 0 && (!existing.price || existing.price === 0)) {
        merged.price = duplicate.price;
    }

    if (duplicate.old_price && duplicate.old_price > 0 && (!existing.old_price || existing.old_price === 0)) {
        merged.old_price = duplicate.old_price;
    }

    // Prefer non-generic thumbnails
    if (duplicate.thumbnail &&
        (!existing.thumbnail ||
            existing.thumbnail.includes('generic/flyout') ||
            duplicate.thumbnail.length > existing.thumbnail.length)) {
        merged.thumbnail = duplicate.thumbnail;
    }

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
async function analyzeImages(imageUrls: string[]): Promise<string | null> {
    if (!imageUrls || imageUrls.length === 0) {
        console.log(`No images provided for analysis`);
        return null;
    }

    try {
        // Minimal filtering - only remove obviously broken/invalid URLs
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

        console.log(`📡 Making OpenAI API call...`);

        const completion = await openai.chat.completions.create({
            model: 'gpt-5',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert at analyzing automotive images. Your task is to select the single best image from a list to be used as a car listing thumbnail.

SELECTION CRITERIA (in order of importance):
1.  **Must show the exterior of an actual car or vehicle.**
2.  **The car must be the primary subject.** The image should not be focused on a tiny detail like a wheel, a badge, or a headlight.
3.  **The car should be clearly visible.** Do not select images that are blurry, heavily obscured, or where the vehicle is too small to be a good thumbnail.
4.  **Acceptable views include the full side, front, or three-quarter angles.**
5.  **Professional product shots, including those with plain backgrounds, are ideal.**
6.  Avoid images that are primarily text, logos, or graphics without a visible car.

IMPORTANT: Return **ONLY** the complete URL of the single best image. If no images contain a clearly visible car exterior, return "none".

Example rejection response: none`
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Select the image that shows a car most clearly and prominently. Return the COMPLETE URL exactly as provided in the list above.`
                        },
                        ...processedUrls.map(url => ({
                            type: 'image_url' as const,
                            image_url: { url, detail: 'low' as const }
                        }))
                    ]
                }
            ],
        });

        console.log(`📡 OpenAI API call completed`);

        // Track token usage and cost
        const usage = completion.usage;
        if (usage) {
            const tokenUsage = createTokenUsage(
                usage.prompt_tokens,
                usage.completion_tokens,
                'gpt-5',
                'openai'
            );
            console.log(`💰 Token usage - Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens}, Cost: $${tokenUsage.estimated_cost_usd.toFixed(6)}`);
        }

        const rawResponse = completion.choices[0]?.message?.content;
        console.log(`🤖 Raw AI response: "${rawResponse}"`);

        if (!rawResponse) {
            console.log(`❌ No response content from OpenAI`);
            return null;
        }

        const selectedUrl = rawResponse.trim();
        console.log(`🤖 AI selected URL: "${selectedUrl}"`);
        console.log(`🔍 Checking if URL is in processed list...`);

        // Debug: show which URLs we're checking against
        processedUrls.forEach((url, index) => {
            const matches = url === selectedUrl;
            console.log(`  ${index + 1}. ${matches ? '✅' : '❌'} ${url}`);
        });

        if (selectedUrl && selectedUrl !== 'none' && processedUrls.includes(selectedUrl)) {
            const filename = selectedUrl.substring(selectedUrl.lastIndexOf('/') + 1);
            console.log(`✅ AI successfully selected: ${filename}`);
            return selectedUrl;
        } else if (selectedUrl === 'none') {
            console.log(`🚫 AI explicitly rejected all images (returned "none")`);
            return null;
        } else {
            console.log(`⚠️ AI response not found in URL list. Response was: "${selectedUrl}"`);
            console.log(`🔍 Available URLs were:`);
            processedUrls.forEach((url, i) => console.log(`  ${i + 1}. ${url}`));

            // Try to find a partial match in case of URL encoding issues
            const partialMatch = processedUrls.find(url =>
                url.includes(selectedUrl) || selectedUrl.includes(url.substring(url.lastIndexOf('/') + 1))
            );

            if (partialMatch) {
                console.log(`🔧 Found partial match: ${partialMatch}`);
                return partialMatch;
            }

            return null;
        }

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



        // Enhance vehicle models with best images (but don't override if they already have good ones)
        if (item.vehicle_model && Array.isArray(item.vehicle_model)) {
            for (const [index, model] of item.vehicle_model.entries()) {
                // Only replace thumbnails that are generic or missing
                const needsNewThumbnail = !model.thumbnail ||
                    model.thumbnail.includes('generic/flyout') ||
                    model.thumbnail.includes('placeholder');

                if (needsNewThumbnail && availableImages.length > 0) {
                    // For vehicle models, try to use the same image as the main item
                    // or analyze again if we have many images
                    const modelImage = item.thumbnail || await analyzeImages(availableImages);
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

        if (srcMatch && !imageUrls.includes(srcMatch[1])) {
            imageUrls.push(srcMatch[1]);
            console.log('📸 Found regular img src:', srcMatch[1]);
        }
        if (dataSrcMatch && !imageUrls.includes(dataSrcMatch[1])) {
            imageUrls.push(dataSrcMatch[1]);
            console.log('📸 Found img data-src:', dataSrcMatch[1]);
        }
    });

    // Extract from CSS background-image
    const bgImageRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi;
    let bgMatch;
    while ((bgMatch = bgImageRegex.exec(htmlContent)) !== null) {
        if (!imageUrls.includes(bgMatch[1])) {
            imageUrls.push(bgMatch[1]);
            console.log('📸 Found background image:', bgMatch[1]);
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
    const prioritizedUrls = uniqueUrls.sort((a, b) => {
        const aScore = getImagePriorityScore(a);
        const bScore = getImagePriorityScore(b);
        return bScore - aScore; // Higher score first
    });

    console.log(`📸 Extracted ${prioritizedUrls.length} unique images, prioritized by car content likelihood`);
    prioritizedUrls.forEach((url, index) => {
        console.log(`  ${index + 1}. ${url.substring(url.lastIndexOf('/') + 1)} (${getImagePriorityScore(url)} points)`);
    });

    return prioritizedUrls;
}

// Score images based on likelihood of containing car content
function getImagePriorityScore(url: string): number {
    const urlLower = url.toLowerCase();
    const filename = urlLower.substring(urlLower.lastIndexOf('/') + 1);
    let score = 0;

    // High priority indicators (likely car photos)
    if (filename.includes('vitara') || filename.includes('swift') || filename.includes('ignis') ||
        filename.includes('sx4') || filename.includes('jimny') || filename.includes('across')) score += 50;
    if (filename.includes('exterior') || filename.includes('front') || filename.includes('side')) score += 40;
    if (filename.includes('hero') || filename.includes('main') || filename.includes('primary')) score += 30;
    if (filename.includes('gallery') || filename.includes('photo')) score += 25;
    if (urlLower.includes('vehicle') || urlLower.includes('car') || urlLower.includes('auto')) score += 20;

    // Medium priority (could be car-related)
    if (filename.includes('model') || filename.includes('range')) score += 15;
    if (filename.includes('banner') && !filename.includes('pris')) score += 10;

    // Low priority/likely not car photos
    if (filename.includes('pris') || filename.includes('price') || filename.includes('kampanj')) score -= 30;
    if (filename.includes('platta') || filename.includes('plate') || filename.includes('badge')) score -= 40;
    if (filename.includes('logo') || filename.includes('icon')) score -= 50;
    if (filename.includes('text') || filename.includes('info')) score -= 20;

    // Prefer higher resolution images
    if (url.includes('w=3840') || url.includes('1920') || url.includes('2048')) score += 15;
    if (url.includes('w=1200') || url.includes('1080')) score += 10;
    if (url.includes('w=640') || url.includes('w=750')) score += 5;

    // Prefer certain file types
    if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) score += 5;
    if (filename.endsWith('.webp')) score += 3;
    if (filename.endsWith('.png') && !filename.includes('logo')) score += 2;

    return Math.max(0, score); // Don't go below 0
}


function getOptimizedPrompt(contentType: string): { system: string; user: string } {
    const isCampaign = contentType === 'campaigns';

    const commonInstructions = `
ESSENTIAL RULES:
- Return ONLY valid JSON, no explanations
- Convert Swedish prices (kr) to numbers: "319.900:-" → 319900
- Extract images from img tags, src attributes, data-src attributes
- Keep descriptions under 160 characters
- For financing options, extract ALL available terms (12, 24, 36, 48 months etc.)
- Look for different prices based on contract length/terms
- Extract mileage limits (1000 mil/år, 1500 mil/år etc.) 
- Extract down payments and interest rates when mentioned
- If only one financing option per type, still put it in an array
- Use null for missing values, empty arrays [] for missing financing types
- AVOID DUPLICATES: If you see similar vehicles/campaigns with the same name, combine their information instead of creating separate entries
- For vehicle models with the same name but different variants, create ONE vehicle with multiple financing options or specifications

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
          "name": "string (exact model name)",
          "price": number,
          "old_price": number,
          "financing_options": {
            "privatleasing": [
              {
                "monthly_price": number,
                "period_months": number,
                "annual_mileage": number,
                "down_payment": number,
                "conditions": "string (any special conditions)"
              }
            ],
            "company_leasing": [
              {
                "monthly_price": number,
                "period_months": number,
                "annual_mileage": number,
                "down_payment": number,
                "benefit_value": number,
                "conditions": "string (any special conditions)"
              }
            ],
            "loan": [
              {
                "monthly_price": number,
                "period_months": number,
                "interest_rate": number,
                "down_payment_percent": number,
                "total_amount": number,
                "conditions": "string (any special conditions)"
              }
            ]
          },
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

JSON STRUCTURE - Return an array of vehicles:
{
  "${contentType}": [{
    "title": "string",
    "brand": "string", 
    "description": "string (max 160)",
    "thumbnail": "string",
    "vehicle_model": [{
      "name": "string", 
      "price": number, 
      "old_price": number, 
      "financing_options": {
        "privatleasing": [
          {
            "monthly_price": number,
            "period_months": number,
            "annual_mileage": number,
            "down_payment": number,
            "conditions": "string"
          }
        ],
        "company_leasing": [
          {
            "monthly_price": number,
            "period_months": number,
            "annual_mileage": number,
            "down_payment": number,
            "benefit_value": number,
            "conditions": "string"
          }
        ],
        "loan": [
          {
            "monthly_price": number,
            "period_months": number,
            "interest_rate": number,
            "down_payment_percent": number,
            "total_amount": number,
            "conditions": "string"
          }
        ]
      },
      "thumbnail": "string"
    }],
    "free_text": "string"
  }]
}`;

    const user = `Analyze the following HTML content and extract all relevant information based on the instructions in the system prompt. Avoid creating duplicate entries for the same vehicles or campaigns. Return the data as a single JSON object.`;

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

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: prompts.system },
            { role: 'user', content: `${prompts.user}\n\nHTML CONTENT:\n${processedHtml}` },
        ],
    });

    // Track token usage and cost
    const usage = completion.usage;
    let tokenUsage: TokenUsage | undefined;
    if (usage) {
        tokenUsage = {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
            estimated_cost_usd: createTokenUsage(usage.prompt_tokens, usage.completion_tokens, 'gpt-4o-mini', 'openai').estimated_cost_usd,
            model_used: 'gpt-4o-mini',
            api_provider: 'openai'
        };
        console.log(`💰 Batch processing token usage - Prompt: ${usage.prompt_tokens}, Completion: ${usage.completion_tokens}, Cost: $${tokenUsage.estimated_cost_usd?.toFixed(6)}`);
    }

    const response = completion.choices[0]?.message?.content;
    if (!response) {
        throw new Error('No response from OpenAI API');
    }

    let parsedData: Record<string, (Vehicle | Campaign)[]>;
    try {
        const cleaned = response.replace(/```(?:json)?\n?|\n?```/g, '').trim();
        parsedData = JSON.parse(cleaned);
    } catch (parseError) {
        console.error('JSON parse error in batch:', parseError);
        throw new Error(`Invalid JSON response from batch: ${parseError}`);
    }

    const extractedData = parsedData[contentType] || (Array.isArray(parsedData) ? parsedData : [parsedData]);

    if (enableImageAnalysis) {
        for (const item of extractedData) {
            await enhanceWithImageAnalysis(item, htmlSnippet, sourceUrl);
        }
    }

    return {
        data: extractedData,
        token_usage: tokenUsage || {
            prompt_tokens: completion.usage?.prompt_tokens || 0,
            completion_tokens: completion.usage?.completion_tokens || 0,
            total_tokens: completion.usage?.total_tokens || 0,
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
        privatleasing: extractFinancingPrice(model.financing_options?.privatleasing),
        company_leasing_price: extractFinancingPrice(model.financing_options?.company_leasing),
        loan_price: extractFinancingPrice(model.financing_options?.loan),
        thumbnail: model.thumbnail || ''
    };
}

function convertToCampaignVehicleModel(model: VehicleModel): CampaignVehicleModel {
    return {
        name: model.name,
        price: model.price || 0,
        old_price: model.old_price,
        privatleasing: extractFinancingPrice(model.financing_options?.privatleasing),
        company_leasing_price: extractFinancingPrice(model.financing_options?.company_leasing),
        loan_price: extractFinancingPrice(model.financing_options?.loan),
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

function convertVehicleToVehicleData(vehicle: Vehicle): VehicleData {
    return {
        title: vehicle.title,
        brand: vehicle.brand,
        description: truncateDescription(vehicle.description || ''),
        thumbnail: vehicle.thumbnail || '',
        vehicle_model: (vehicle.vehicle_model || []).map(convertToExternalVehicleModel),
        free_text: vehicle.free_text || ''
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
    enableFactChecking: boolean = false
): Promise<EnhancedProcessedResult> {
    const startTime = Date.now();
    let contentType: ContentType = 'cars';
    let allExtractedData: (Vehicle | Campaign)[] = [];
    const totalTokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    try {
        console.log(`Starting processing for ${sourceUrl} ${enableImageAnalysis ? '(with image analysis)' : '(text only)'} ${enableFactChecking ? '(with fact-checking)' : ''}`);

        contentType = detectContentType(htmlContent, sourceUrl, category) as ContentType;

        // Parse HTML content and extract linked pages
        const linkedContentStartDelimiter = '<!-- LINKED CONTENT START';
        const linkedPageDelimiter = /<!-- LINKED PAGE \d+ START -->/;

        const linkedContentStartIndex = htmlContent.indexOf(linkedContentStartDelimiter);
        let batchesToProcess: string[] = [];

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
            batchesToProcess = linkedPages;
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
                batchesToProcess = linkedPages;
            } else {
                console.log('No linked content found - this means no linked pages were scraped');
                batchesToProcess = [];
            }
        }

        console.log(`Processing ${batchesToProcess.length} batches`);

        if (batchesToProcess.length === 0) {
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

        // Process all batches
        const results = await Promise.all(
            batchesToProcess.map((batchHtml, index) => {
                console.log(`Processing batch ${index + 1}/${batchesToProcess.length} (${batchHtml.length} chars)`);
                return processHtmlBatch(batchHtml, sourceUrl, contentType, enableImageAnalysis);
            })
        );

        results.forEach((batchResult, index) => {
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
        });

        // Apply deduplication
        console.log(`🔍 Pre-deduplication: ${allExtractedData.length} items`);
        console.log('🔍 Pre-deduplication items:', allExtractedData.map(item => item.title));
        allExtractedData = deduplicateExtractedData(allExtractedData, contentType);
        console.log(`✅ Post-deduplication: ${allExtractedData.length} items`);
        console.log('✅ Post-deduplication items:', allExtractedData.map(item => item.title));

        allExtractedData = resolveImageUrls(allExtractedData, sourceUrl);

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
        if (!url || url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        if (url.startsWith('/')) {
            return baseOrigin + url;
        }
        return url;
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
    enableFactChecking: boolean = false
): Promise<EnhancedProcessedResult> {
    const result = await processHtmlWithAI(htmlContent, sourceUrl, category, enableImageAnalysis, enableFactChecking);

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
        console.log(`💰 Token Usage - OpenAI: ${result.token_usage?.total_tokens || 0}, Perplexity: ${result.fact_check.token_usage?.total_tokens || 0}, Total: ${totalTokens}`);
    }

    console.log(`✅ Validated ${result.data.length} items`);
    return result;
}

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
    }
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

    return processHtmlWithValidation(
        htmlContent,
        sourceUrl,
        category,
        enableImageAnalysis,
        shouldFactCheck
    );
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