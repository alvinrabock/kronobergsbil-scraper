/**
 * Claude AI Client for Vehicle Data Extraction
 *
 * Primary AI provider for all data extraction tasks:
 * - PDF analysis (native PDF support in Claude)
 * - Image analysis (vehicle photos, price stickers)
 * - HTML extraction (dealer websites)
 * - Prompt caching for cost optimization (90% discount on cached tokens)
 * - Batch API support for high volume (50% cost savings)
 */

import Anthropic from '@anthropic-ai/sdk';

// Initialize the Claude client
// Supports both CLAUDE_API_KEY and ANTHROPIC_API_KEY for flexibility
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '',
});

// Model configurations
const MODELS = {
  // Fast model for simple extractions - best price-performance
  fast: 'claude-sonnet-4-5-20250929',
  // Haiku for very simple/repetitive tasks - cheapest
  haiku: 'claude-haiku-4-5-20251001',
} as const;

// PDF Processing Log structure
interface PDFProcessingLog {
  timestamp: string;
  pdfUrl: string;
  success: boolean;
  method: string;
  pageCount?: number;
  characterCount: number;
  processingTimeMs: number;
  textPreview?: string;
  error?: string;
}

// Store recent logs for API access
const recentLogs: PDFProcessingLog[] = [];
const MAX_LOGS = 50;

function addPDFLog(log: PDFProcessingLog) {
  recentLogs.unshift(log);
  if (recentLogs.length > MAX_LOGS) {
    recentLogs.pop();
  }

  // Console output with emoji indicators
  const status = log.success ? '✅' : '❌';
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${status} [Claude AI] PDF Processing Log`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📄 URL: ${log.pdfUrl}`);
  console.log(`🔧 Method: ${log.method}`);
  console.log(`📊 Status: ${log.success ? 'SUCCESS' : 'FAILED'}`);
  if (log.pageCount) console.log(`📑 Pages: ${log.pageCount}`);
  console.log(`📝 Characters extracted: ${log.characterCount.toLocaleString()}`);
  console.log(`⏱️  Processing time: ${log.processingTimeMs}ms`);
  if (log.textPreview) {
    console.log(`📖 Text preview (first 500 chars):`);
    console.log(`   "${log.textPreview}"`);
  }
  if (log.error) console.log(`❌ Error: ${log.error}`);
  console.log(`${'='.repeat(60)}\n`);
}

// Export function to get recent logs
export function getRecentPDFLogs(): PDFProcessingLog[] {
  return [...recentLogs];
}

/**
 * Attempt to repair malformed JSON from Claude responses
 * Common issues: truncated responses, unescaped quotes, missing closing brackets
 */
function repairJSON(jsonText: string): string {
  let repaired = jsonText.trim();

  // Count opening and closing brackets to find imbalance
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;
    }
  }

  // If we're in an unclosed string, try to close it
  if (inString) {
    repaired += '"';
    console.log(`⚠️ JSON repair: Added closing quote for unclosed string`);
  }

  // If brackets are unbalanced, add closing ones
  let addedBrackets = 0;
  let addedBraces = 0;
  while (bracketCount > 0) {
    repaired += ']';
    bracketCount--;
    addedBrackets++;
  }
  while (braceCount > 0) {
    repaired += '}';
    braceCount--;
    addedBraces++;
  }

  if (addedBrackets > 0 || addedBraces > 0) {
    console.log(`⚠️ JSON repair: Added ${addedBraces} closing braces and ${addedBrackets} closing brackets`);
  }

  return repaired;
}

/**
 * Safely parse JSON with repair attempts
 */
function safeJSONParse(jsonText: string): { success: boolean; data?: any; error?: string } {
  // First try direct parse
  try {
    const data = JSON.parse(jsonText.trim());
    return { success: true, data };
  } catch (firstError: any) {
    console.log(`⚠️ Initial JSON parse failed: ${firstError.message}`);

    // Try to repair and parse again
    try {
      const repaired = repairJSON(jsonText);
      const data = JSON.parse(repaired);
      console.log(`✅ JSON repair successful`);
      return { success: true, data };
    } catch (repairError: any) {
      // Log the problematic section for debugging
      const errorMatch = firstError.message.match(/position (\d+)/);
      if (errorMatch) {
        const pos = parseInt(errorMatch[1]);
        const start = Math.max(0, pos - 100);
        const end = Math.min(jsonText.length, pos + 100);
        console.log(`❌ JSON error near position ${pos}:`);
        console.log(`   Context: ...${jsonText.substring(start, end).replace(/\n/g, '\\n')}...`);
      }

      return {
        success: false,
        error: `JSON parse failed: ${firstError.message}`
      };
    }
  }
}

// Types
export interface ClaudeResponse {
  success: boolean;
  data?: any;
  error?: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    estimatedCostUsd: number;
  };
}

export interface VehicleExtractionResult {
  success: boolean;
  vehicles?: ExtractedVehicle[];
  error?: string;
  priceSource?: 'pdf' | 'html' | 'image';
  usage?: ClaudeResponse['usage'];
}

export interface ExtractedVehicle {
  name: string;
  brand: string;
  description?: string | null;
  freeText?: string | null;
  thumbnail?: string;
  priceSource?: 'pdf' | 'html';
  source_url?: string | null;  // URL of the page where this vehicle was found
  sourceUrl?: string | null;   // Alias for compatibility
  vehicleModels: ExtractedVehicleModel[];
}

export interface ExtractedVehicleModel {
  name: string;
  price?: number;
  oldPrice?: number;
  privatleasing?: number;
  oldPrivatleasing?: number;  // Previous leasing price (for campaigns/discounts)
  companyLeasingPrice?: number;
  oldCompanyLeasingPrice?: number;  // Previous company leasing price
  loanPrice?: number;
  oldLoanPrice?: number;  // Previous loan price
  bransle?: 'El' | 'Bensin' | 'Diesel' | 'Hybrid' | 'Laddhybrid';
  biltyp?: 'suv' | 'sedan' | 'kombi' | 'halvkombi' | 'pickup' | 'transportbil' | 'personbil' | 'mopedbil';
  vaxellada?: 'Automat' | 'Manuell';
  thumbnail?: string;
  priceSource?: 'pdf' | 'html';  // Track where the price came from
  utrustning?: string[];  // Equipment list for this variant/trim level
}

export interface ImageSelectionResult {
  success: boolean;
  selectedImageUrl?: string;
  confidence: number;
  reasoning?: string;
  hasEnvironmentalBackground?: boolean;
  error?: string;
}

/**
 * Check if Claude API is configured
 */
export function isClaudeEnabled(): boolean {
  return !!(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/**
 * Get the system prompt for vehicle data extraction
 */
function getVehicleExtractionPrompt(): string {
  return `You are a specialized car data extraction system for Swedish car dealer websites.
Your task is to extract structured vehicle information from documents (PDFs, images, HTML) and return valid JSON.

CRITICAL RULES:
1. ALWAYS return valid JSON matching the provided schema
2. Use null for missing/unclear values - NEVER guess or hallucinate
3. Prices should be in SEK (Swedish kronor)
4. For bransle, biltyp, vaxellada - extract from TECHNICAL SPECIFICATIONS section (do NOT guess from motor names)

FIELD DEFINITIONS:
- bransle (fuel type): "El", "Bensin", "Diesel", "Hybrid", "Laddhybrid" OR null
  EXTRACT FROM TECHNICAL SPECIFICATIONS (Tekniska specifikationer):
  - Look for "Bränsle:" row in technical specs section - this is the authoritative source
  - "Bränsle: Bensin" → "Bensin"
  - "Bränsle: Diesel" → "Diesel"
  - "Bränsle: El" or "Bränsle: Elektricitet" → "El"
  - "Bränsle: Bensin/El" → "Hybrid"
  - Match motor type from pricing table to the correct tech spec section
  - If "Bränsle:" not found, look for "Drivmedel:" or similar
  - null = Only if NO explicit fuel type in technical data

- biltyp (body type): "suv", "sedan", "kombi", "halvkombi", "pickup", "transportbil" OR null
  EXTRACT FROM TECHNICAL SPECIFICATIONS:
  - Look for "Karosstyp:", "Kaross:", or "Typ:" in tech specs
  - "Halvkombi", "Hatchback", "5-dörrars" → "halvkombi"
  - "SUV", "Crossover" → "suv"
  - "Sedan" → "sedan"
  - "Kombi", "Stationsvagn" → "kombi"
  - null = If NOT explicitly stated in technical data

- vaxellada (transmission): "Automat", "Manuell" OR null
  EXTRACT FROM TECHNICAL SPECIFICATIONS:
  - Look for "Växellåda:", "Transmission:", or "Drivlina:" in tech specs
  - "Automatisk", "CVT", "Automat", "8-stegs automat", "steglös" → "Automat"
  - "Manuell", "6-växlad manuell", "5-vxl" → "Manuell"
  - Cross-reference with motor type to get correct transmission for each variant
  - null = If transmission is NOT explicitly stated in technical data

FALLBACK INFERENCE FROM VARIANT NAMES (when no tech specs available):
When processing PDF pricelists without technical specifications, infer from variant/motor names:

1. bransle (fuel type) - infer from variant name:
   - "Hybrid" in name → "Hybrid" (e.g., "1.2 82 hk Hybrid Base")
   - "kWh" or "Electric" or "El" in name → "El" (e.g., "61 kWh 4x4 Inclusive")
   - "Diesel" in name → "Diesel"
   - "PureTech" or "Bensin" in name → "Bensin"
   - No fuel indicator in name → null

2. vaxellada (transmission) - infer from variant name:
   - "CVT" in name → "Automat" (e.g., "Select CVT")
   - "AT" or "AUT" or "Auto" in name → "Automat" (e.g., "Hybrid AUT")
   - "MT" in name → "Manuell"
   - No transmission indicator → null

3. biltyp (body type) - infer from KNOWN MODEL MAPPINGS:
   - Swift → "halvkombi" (compact hatchback)
   - Vitara, eVitara, e-Vitara, e VITARA → "suv"
   - S-Cross, SX4 S-Cross → "suv"
   - Ignis → "halvkombi"
   - Jimny → "suv"
   - Baleno → "halvkombi"
   - Unknown models → null (do NOT guess)

SWEDISH PRICE FORMATS TO HANDLE:
- "199 900 kr" = 199900
- "3 995 kr/mån" = 3995 (monthly)
- "från 2 995:-" = 2995
- "Rek. cirkapris" = recommended price (use this!)

PDF EXTRACTION - SIMPLE RULE:
Every row that has a price = one variant. Use the EXACT text from that row as the variant name.

CRITICAL: Do NOT simplify or interpret variant names - copy them EXACTLY as written:
- "49 kWh 2WD Base" → name: "49 kWh 2WD Base" (NOT just "Base")
- "61 kWh 4x4 Inclusive" → name: "61 kWh 4x4 Inclusive" (NOT just "Inclusive")
- "1.2 82 hk Hybrid Select CVT" → name: "1.2 82 hk Hybrid Select CVT"

Section headers without prices (like "e VITARA BASE", "SWIFT HYBRID SELECT") are NOT variants - skip them.
Only rows with actual price numbers are variants.

EXTRACTION PRIORITY:
1. Model names and trim levels
2. Pricing (purchase price, leasing, financing)
3. Engine specifications (power, fuel type, transmission)
4. Vehicle body type

PDF vs HTML PRICE SOURCE (CRITICAL):
- When content includes "<!-- PDF CONTENT FROM:" sections, those prices come from official PDF pricelists
- PDF prices are MORE RELIABLE than HTML prices - always prefer PDF prices
- Set price_source="pdf" for prices from PDF sections, price_source="html" for webpage prices
- If the same variant appears in both PDF and HTML, use the PDF price

DEDUPLICATION RULES:
- Each variant should appear ONLY ONCE in the output
- If you see the same variant name multiple times, merge them into one entry
- Normalize variant names: "Swift Sport" and "Swift  Sport" are the same
- Combine data from multiple sources for the same variant

CRITICAL IMAGE RULES (for HTML with images):
- Each vehicle MUST have its own correct image
- Match images to vehicles by model name in URL or nearby context
- NEVER use price plates ("skyltar") as thumbnails
- NEVER assign one vehicle's image to another vehicle`;
}

/**
 * Get the JSON schema for vehicle extraction output
 */
function getVehicleSchema(): string {
  return `
JSON SCHEMA:
{
  "vehicles": [
    {
      "name": "string - Model name (e.g., 'Swift', 'Vitara')",
      "brand": "string - Car brand (e.g., 'Suzuki', 'Toyota')",
      "description": "string|null - Short marketing description of the vehicle (1-2 sentences, extracted from content)",
      "free_text": "string|null - Additional info like warranty, service, special offers (extracted from content)",
      "thumbnail": "string|null - Image URL for this model (null for PDF extraction)",
      "price_source": "'pdf' | 'html' - where the main price came from",
      "source_url": "string - The URL of the page where THIS vehicle was found (from <!-- URL: ... --> comment)",
      "vehicle_model": [
        {
          "name": "string - Variant name (e.g., 'Base', 'Select', 'AllGrip')",
          "price": "number|null - Cash price in SEK",
          "old_price": "number|null - Previous cash price if discounted (strikethrough price)",
          "privatleasing": "number|null - Monthly private leasing price",
          "old_privatleasing": "number|null - Previous private leasing price if discounted",
          "company_leasing_price": "number|null - Monthly company leasing price (företagsleasing)",
          "old_company_leasing_price": "number|null - Previous company leasing price if discounted",
          "loan_price": "number|null - Monthly loan price",
          "old_loan_price": "number|null - Previous loan price if discounted",
          "bransle": "'El'|'Bensin'|'Diesel'|'Hybrid'|'Laddhybrid'|null - ONLY if explicitly stated",
          "biltyp": "'suv'|'sedan'|'kombi'|'halvkombi'|'pickup'|'transportbil'|null - ONLY if explicitly stated",
          "vaxellada": "'Automat'|'Manuell'|null - ONLY if explicitly stated",
          "thumbnail": "string|null - Variant-specific image if different",
          "price_source": "'pdf' | 'html' - Set to 'pdf' if price came from PDF, 'html' if from webpage",
          "utrustning": ["string array - Equipment list for this trim level (from HTML <li> items or PDF equipment tables)"]
        }
      ]
    }
  ]
}

EQUIPMENT (UTRUSTNING) EXTRACTION - CRITICAL:
You MUST extract equipment for each variant. Match equipment lists to variants by trim level name:

1. MATCHING EQUIPMENT TO VARIANTS:
   - "Standardutrustning i Basemodellen:" → applies to ALL variants with "Base" in name
   - "Utrustning Select utöver Base:" → applies to ALL variants with "Select" in name
   - "Utrustning Inclusive utöver Select:" → applies to ALL variants with "Inclusive" in name
   - If a variant has CVT, AllGrip, 4x4 etc - still match by trim level (Base/Select/Inclusive)

2. EXAMPLE MATCHING:
   - Variant "1.2 82 hk Hybrid Base" → gets equipment from "Standardutrustning i Basemodellen"
   - Variant "1.2 82 hk Hybrid Select" → gets equipment from "Utrustning Select utöver Base"
   - Variant "1.2 82 hk Hybrid Select CVT" → ALSO gets equipment from "Utrustning Select utöver Base" (CVT is just transmission)
   - Variant "1.2 82 hk Hybrid Select AllGrip Auto 4x4" → ALSO gets "Utrustning Select utöver Base"

3. WHERE TO FIND EQUIPMENT:
   - In HTML: Look for <h3>Standardutrustning...</h3> or <h3>Utrustning X utöver Y:</h3> followed by <ul><li> items
   - In PDFs: Look for "STANDARDUTRUSTNING BASE", "UTRUSTNING SELECT (UTÖVER BASE)", etc.
   - Extract each <li> item as a string in the utrustning array

4. IMPORTANT RULES:
   - For "utöver" (beyond) variants, only include the ADDITIONAL equipment, not the base equipment
   - NEVER leave utrustning empty [] if equipment data exists in the HTML for that trim level
   - Look in the linked pages (<!-- LINKED PAGE X START -->) for equipment - it's often on the "Utforska" page

SOURCE URL EXTRACTION (CRITICAL):
- The HTML content contains <!-- URL: https://... --> comments marking which page each section came from
- Each vehicle MUST have its source_url set to the URL from the <!-- URL: ... --> comment that appears BEFORE that vehicle's data
- Example: If you see "<!-- URL: https://suzukibilar.se/kopa-suzuki/kop-nya-swift -->" followed by Swift data, that Swift vehicle should have source_url: "https://suzukibilar.se/kopa-suzuki/kop-nya-swift"
- This is essential for tracking which page each vehicle was scraped from

EXAMPLE - With equipment (utrustning) from HTML:
{
  "vehicles": [
    {
      "name": "Swift",
      "brand": "Suzuki",
      "description": "Kompakt och prisvärd hybrid med låg förbrukning och modern säkerhetsutrustning.",
      "free_text": "3 års nybilsgaranti, 3 års fri service ingår.",
      "thumbnail": null,
      "price_source": "pdf",
      "source_url": "https://suzukibilar.se/kopa-suzuki/kop-nya-swift",
      "vehicle_model": [
        {
          "name": "1.2 82 hk Hybrid Base",
          "price": 199900,
          "old_price": null,
          "privatleasing": 2895,
          "old_privatleasing": null,
          "company_leasing_price": 2495,
          "old_company_leasing_price": null,
          "loan_price": 1685,
          "old_loan_price": null,
          "bransle": "Hybrid",
          "biltyp": "halvkombi",
          "vaxellada": null,
          "thumbnail": null,
          "price_source": "pdf",
          "utrustning": [
            "9-tums HD pekskärm",
            "Adaptiv farthållare och fartbegränsare",
            "Backkamera",
            "DAB radio, FM/AM radio, USB, rattkontroll, Bluetooth",
            "Elfönsterhissar fram och bak",
            "Helljusassistent",
            "Klimatanläggning manuell (AC)",
            "Navigation",
            "Nyckelfritt lås- och tändningssystem",
            "Uppvärmda ytterbackspeglar"
          ]
        },
        {
          "name": "1.2 82 hk Hybrid Select CVT",
          "price": 259900,
          "old_price": null,
          "privatleasing": 3195,
          "old_privatleasing": null,
          "company_leasing_price": 2795,
          "old_company_leasing_price": null,
          "loan_price": 2322,
          "old_loan_price": null,
          "bransle": "Hybrid",
          "biltyp": "halvkombi",
          "vaxellada": "Automat",
          "thumbnail": null,
          "price_source": "pdf",
          "utrustning": [
            "Förarsäte, höjdjusterbart",
            "Lättmetallfälgar 16\", silver",
            "Mörktonade rutor bak inklusive bakruta",
            "Sportratt i läder med silverinlägg, ställbar i höjd- och längsled",
            "Stolsvärme, förare och passagerare",
            "CVT: steglös automatisk växellåda"
          ]
        }
      ]
    }
  ]
}

EXAMPLE - Electric vehicle (eVitara with kWh = El, biltyp = suv):
{
  "vehicles": [
    {
      "name": "eVitara",
      "brand": "Suzuki",
      "description": "Suzukis första helt elektriska SUV med fyrhjulsdrift och lång räckvidd.",
      "free_text": null,
      "thumbnail": null,
      "price_source": "pdf",
      "source_url": "https://suzukibilar.se/kopa-suzuki/kop-nya-e-vitara",
      "vehicle_model": [
        {
          "name": "61 kWh 4x4 Inclusive",
          "price": 549900,
          "old_price": null,
          "privatleasing": 5995,
          "old_privatleasing": null,
          "company_leasing_price": null,
          "old_company_leasing_price": null,
          "loan_price": null,
          "old_loan_price": null,
          "bransle": "El",
          "biltyp": "suv",
          "vaxellada": null,
          "thumbnail": null,
          "price_source": "pdf"
        }
      ]
    }
  ]
}

EXAMPLE - Matrix/grid PDF (Peugeot 208 - trim rows × motor columns):
{
  "vehicles": [
    {
      "name": "208",
      "brand": "Peugeot",
      "description": null,
      "free_text": "3 års nybilsgaranti, Peugeot Assistance.",
      "thumbnail": null,
      "price_source": "pdf",
      "source_url": "https://example.com/peugeot-208",
      "vehicle_model": [
        {
          "name": "Style PureTech",
          "price": null,
          "old_price": null,
          "privatleasing": 2699,
          "old_privatleasing": null,
          "company_leasing_price": null,
          "old_company_leasing_price": null,
          "loan_price": 1944,
          "old_loan_price": null,
          "bransle": "Bensin",
          "biltyp": "halvkombi",
          "vaxellada": null,
          "thumbnail": null,
          "price_source": "pdf"
        },
        {
          "name": "Style Hybrid AUT",
          "price": null,
          "old_price": null,
          "privatleasing": null,
          "old_privatleasing": null,
          "company_leasing_price": null,
          "old_company_leasing_price": null,
          "loan_price": 2430,
          "old_loan_price": null,
          "bransle": "Hybrid",
          "biltyp": "halvkombi",
          "vaxellada": "Automat",
          "thumbnail": null,
          "price_source": "pdf"
        },
        {
          "name": "Style Electric",
          "price": null,
          "old_price": null,
          "privatleasing": null,
          "old_privatleasing": null,
          "company_leasing_price": null,
          "old_company_leasing_price": null,
          "loan_price": 3322,
          "old_loan_price": null,
          "bransle": "El",
          "biltyp": "halvkombi",
          "vaxellada": "Automat",
          "thumbnail": null,
          "price_source": "pdf"
        },
        {
          "name": "Allure PureTech",
          "price": null,
          "old_price": null,
          "privatleasing": null,
          "old_privatleasing": null,
          "company_leasing_price": null,
          "old_company_leasing_price": null,
          "loan_price": 2268,
          "old_loan_price": null,
          "bransle": "Bensin",
          "biltyp": "halvkombi",
          "vaxellada": null,
          "thumbnail": null,
          "price_source": "pdf"
        },
        {
          "name": "Allure Hybrid AUT",
          "price": null,
          "old_price": null,
          "privatleasing": null,
          "old_privatleasing": null,
          "company_leasing_price": null,
          "old_company_leasing_price": null,
          "loan_price": 2592,
          "old_loan_price": null,
          "bransle": "Hybrid",
          "biltyp": "halvkombi",
          "vaxellada": "Automat",
          "thumbnail": null,
          "price_source": "pdf"
        },
        {
          "name": "Allure Electric",
          "price": null,
          "old_price": null,
          "privatleasing": null,
          "old_privatleasing": null,
          "company_leasing_price": null,
          "old_company_leasing_price": null,
          "loan_price": 3484,
          "old_loan_price": null,
          "bransle": "El",
          "biltyp": "halvkombi",
          "vaxellada": "Automat",
          "thumbnail": null,
          "price_source": "pdf"
        },
        {
          "name": "GT Electric",
          "price": null,
          "old_price": null,
          "privatleasing": null,
          "old_privatleasing": null,
          "company_leasing_price": null,
          "old_company_leasing_price": null,
          "loan_price": 3646,
          "old_loan_price": null,
          "bransle": "El",
          "biltyp": "halvkombi",
          "vaxellada": "Automat",
          "thumbnail": null,
          "price_source": "pdf"
        }
      ]
    }
  ]
}

IMPORTANT NOTES:
- "old_*" fields are for showing discounts (crossed-out/strikethrough prices)
- Look for patterns like "Ord. pris: 4 495 kr" or strikethrough text for old prices
- PDF extraction should always have thumbnail: null (PDFs don't contain usable images)
- HTML extraction should extract actual image URLs from the webpage
- "description": Extract marketing text about the vehicle (features, benefits) - keep it short (1-2 sentences)
- "free_text": Extract additional info like warranty, service packages, campaign terms, special offers
- If no description/free_text found in content, use null - DO NOT invent text`;
}

/**
 * Calculate estimated cost based on Claude pricing
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number = 0,
  cacheCreationTokens: number = 0,
  model: string = 'claude-sonnet-4-5-20250514'
): number {
  // Model-specific pricing (per 1M tokens)
  let inputCostPer1M: number;
  let outputCostPer1M: number;
  let cacheReadCostPer1M: number;
  let cacheCreationCostPer1M: number;

  if (model.includes('haiku')) {
    // Claude Haiku 3.5 pricing
    inputCostPer1M = 0.80;
    outputCostPer1M = 4.0;
    cacheReadCostPer1M = 0.08;
    cacheCreationCostPer1M = 1.0;
  } else {
    // Claude Sonnet 4.5 pricing (default)
    inputCostPer1M = 3.0;
    outputCostPer1M = 15.0;
    cacheReadCostPer1M = 0.30;
    cacheCreationCostPer1M = 3.75;
  }

  // Regular input tokens (excluding cached)
  const regularInputTokens = inputTokens - cacheReadTokens - cacheCreationTokens;

  const inputCost = (regularInputTokens / 1_000_000) * inputCostPer1M;
  const outputCost = (outputTokens / 1_000_000) * outputCostPer1M;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * cacheReadCostPer1M;
  const cacheCreationCost = (cacheCreationTokens / 1_000_000) * cacheCreationCostPer1M;

  return inputCost + outputCost + cacheReadCost + cacheCreationCost;
}

/**
 * Extract vehicle data from PDF using Claude
 * Replaces Google Document AI
 */
export async function extractVehicleDataFromPDF(
  pdfUrl: string,
  options?: {
    useCache?: boolean;
    model?: keyof typeof MODELS;
  }
): Promise<VehicleExtractionResult> {
  if (!isClaudeEnabled()) {
    return {
      success: false,
      error: 'Claude API key not configured. Set ANTHROPIC_API_KEY environment variable.',
    };
  }

  const startTime = Date.now();
  const modelId = MODELS[options?.model || 'fast'];

  try {
    console.log(`📄 [Claude] Extracting vehicle data from PDF: ${pdfUrl}`);

    // Fetch PDF and convert to base64
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }

    const pdfBuffer = await response.arrayBuffer();
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');

    const systemPrompt = getVehicleExtractionPrompt();
    const schema = getVehicleSchema();

    const userContent: Anthropic.MessageCreateParams['messages'][0]['content'] = [
      {
        type: 'text',
        text: `${systemPrompt}\n\nOUTPUT JSON SCHEMA:\n${schema}\n\nExtract all vehicle data from the following PDF price list and return valid JSON:`,
        ...(options?.useCache !== false ? { cache_control: { type: 'ephemeral' as const } } : {}),
      },
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdfBase64,
        },
      },
    ];

    // Retry logic for rate limits
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await anthropic.messages.create({
          model: modelId,
          max_tokens: 16000, // Increased for equipment lists which can be very long
          messages: [
            {
              role: 'user',
              content: userContent,
            },
          ],
        });

        const responseText = result.content[0].type === 'text' ? result.content[0].text : '';

        // Parse JSON from response
        let jsonText = responseText;
        if (jsonText.includes('```json')) {
          jsonText = jsonText.split('```json')[1].split('```')[0];
        } else if (jsonText.includes('```')) {
          jsonText = jsonText.split('```')[1].split('```')[0];
        }

        // Use safe JSON parsing with repair for truncated responses
        const parseResult = safeJSONParse(jsonText);
        if (!parseResult.success) {
          throw new Error(parseResult.error || 'Failed to parse JSON response');
        }
        const parsed = parseResult.data;
        const processingTime = Date.now() - startTime;

        // Log success
        console.log(`✅ [Claude] PDF extraction completed in ${processingTime}ms`);
        console.log(`   Found ${parsed.vehicles?.length || 0} vehicles`);

        const usage = {
          inputTokens: result.usage.input_tokens,
          outputTokens: result.usage.output_tokens,
          totalTokens: result.usage.input_tokens + result.usage.output_tokens,
          cacheReadTokens: (result.usage as any).cache_read_input_tokens || 0,
          cacheCreationTokens: (result.usage as any).cache_creation_input_tokens || 0,
          estimatedCostUsd: calculateCost(
            result.usage.input_tokens,
            result.usage.output_tokens,
            (result.usage as any).cache_read_input_tokens || 0,
            (result.usage as any).cache_creation_input_tokens || 0,
            modelId
          ),
        };

        return {
          success: true,
          vehicles: parsed.vehicles?.map((v: any) => ({
            name: v.name,
            brand: v.brand,
            description: v.description || null,
            freeText: v.free_text || null,
            thumbnail: v.thumbnail,
            priceSource: 'pdf' as const,
            vehicleModels: v.vehicle_model?.map((m: any) => ({
              name: m.name,
              price: m.price,
              oldPrice: m.old_price,
              privatleasing: m.privatleasing,
              oldPrivatleasing: m.old_privatleasing,
              companyLeasingPrice: m.company_leasing_price,
              oldCompanyLeasingPrice: m.old_company_leasing_price,
              loanPrice: m.loan_price,
              oldLoanPrice: m.old_loan_price,
              bransle: m.bransle,
              biltyp: m.biltyp,
              vaxellada: m.vaxellada,
              thumbnail: m.thumbnail,
              priceSource: 'pdf' as const,
              utrustning: m.utrustning || [],  // Equipment list from PDF
            })) || [],
          })) || [],
          priceSource: 'pdf',
          usage,
        };

      } catch (retryError: any) {
        lastError = retryError;

        // Check if it's a rate limit error (429)
        if (retryError.status === 429 || retryError.message?.includes('rate_limit')) {
          const waitTime = Math.pow(2, attempt) * 5000; // Exponential backoff: 10s, 20s, 40s
          console.log(`⚠️ [Claude] Rate limit hit (attempt ${attempt}/${maxRetries}), waiting ${waitTime / 1000}s...`);

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }

        // For non-rate-limit errors, don't retry
        break;
      }
    }

    // If all retries failed, throw the last error
    throw lastError || new Error('PDF extraction failed after retries');

  } catch (error) {
    console.error('[Claude] PDF extraction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extract vehicle data from HTML content using Claude
 */
export async function extractVehicleDataFromHTML(
  html: string,
  sourceUrl: string,
  options?: {
    useCache?: boolean;
    model?: keyof typeof MODELS;
    includePdfContent?: string; // Extracted PDF text to merge
  }
): Promise<VehicleExtractionResult> {
  if (!isClaudeEnabled()) {
    return {
      success: false,
      error: 'Claude API key not configured. Set ANTHROPIC_API_KEY environment variable.',
    };
  }

  const startTime = Date.now();
  const modelId = MODELS[options?.model || 'fast'];

  try {
    console.log(`🌐 [Claude] Extracting vehicle data from HTML: ${sourceUrl}`);

    const systemPrompt = getVehicleExtractionPrompt();
    const schema = getVehicleSchema();

    // Build the content with optional PDF data
    let contentText = `Source URL: ${sourceUrl}\n\n`;

    if (options?.includePdfContent) {
      contentText += `⚠️ PDF DATA (PRIMARY SOURCE FOR PRICES):\n${options.includePdfContent}\n\n---\n\n`;
    }

    contentText += `HTML Content:\n${html}`;

    const userContent: Anthropic.MessageCreateParams['messages'][0]['content'] = [
      {
        type: 'text',
        text: `${systemPrompt}\n\nOUTPUT JSON SCHEMA:\n${schema}\n\nExtract all vehicle data from the following content and return valid JSON:`,
        ...(options?.useCache !== false ? { cache_control: { type: 'ephemeral' as const } } : {}),
      },
      {
        type: 'text',
        text: contentText,
      },
    ];

    // Retry logic for rate limits
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await anthropic.messages.create({
          model: modelId,
          max_tokens: 16000, // Increased for equipment lists which can be very long
          messages: [
            {
              role: 'user',
              content: userContent,
            },
          ],
        });

        const responseText = result.content[0].type === 'text' ? result.content[0].text : '';

        // Parse JSON from response
        let jsonText = responseText;
        if (jsonText.includes('```json')) {
          jsonText = jsonText.split('```json')[1].split('```')[0];
        } else if (jsonText.includes('```')) {
          jsonText = jsonText.split('```')[1].split('```')[0];
        }

        // Use safe JSON parsing with repair for truncated responses
        const parseResult = safeJSONParse(jsonText);
        if (!parseResult.success) {
          throw new Error(parseResult.error || 'Failed to parse JSON response');
        }
        const parsed = parseResult.data;
        const processingTime = Date.now() - startTime;

        console.log(`✅ [Claude] HTML extraction completed in ${processingTime}ms`);
        console.log(`   Found ${parsed.vehicles?.length || 0} vehicles`);

        const usage = {
          inputTokens: result.usage.input_tokens,
          outputTokens: result.usage.output_tokens,
          totalTokens: result.usage.input_tokens + result.usage.output_tokens,
          cacheReadTokens: (result.usage as any).cache_read_input_tokens || 0,
          cacheCreationTokens: (result.usage as any).cache_creation_input_tokens || 0,
          estimatedCostUsd: calculateCost(
            result.usage.input_tokens,
            result.usage.output_tokens,
            (result.usage as any).cache_read_input_tokens || 0,
            (result.usage as any).cache_creation_input_tokens || 0,
            modelId
          ),
        };

        return {
          success: true,
          vehicles: parsed.vehicles?.map((v: any) => ({
            name: v.name,
            brand: v.brand,
            description: v.description || null,
            freeText: v.free_text || null,
            thumbnail: v.thumbnail,
            priceSource: v.price_source || 'html',
            source_url: v.source_url || null,  // URL of the page where this vehicle was found
            sourceUrl: v.source_url || null,   // Alias for compatibility
            vehicleModels: v.vehicle_model?.map((m: any) => ({
              name: m.name,
              price: m.price,
              oldPrice: m.old_price,
              privatleasing: m.privatleasing,
              oldPrivatleasing: m.old_privatleasing,
              companyLeasingPrice: m.company_leasing_price,
              oldCompanyLeasingPrice: m.old_company_leasing_price,
              loanPrice: m.loan_price,
              oldLoanPrice: m.old_loan_price,
              bransle: m.bransle,
              biltyp: m.biltyp,
              vaxellada: m.vaxellada,
              thumbnail: m.thumbnail,
              priceSource: m.price_source || (options?.includePdfContent ? 'pdf' : 'html'),
              utrustning: m.utrustning || [],  // Equipment list for this trim level
            })) || [],
          })) || [],
          priceSource: options?.includePdfContent ? 'pdf' : 'html',
          usage,
        };

      } catch (retryError: any) {
        lastError = retryError;

        // Check if it's a rate limit error (429)
        if (retryError.status === 429 || retryError.message?.includes('rate_limit')) {
          const waitTime = Math.pow(2, attempt) * 10000; // Exponential backoff: 20s, 40s, 80s
          console.log(`⚠️ [Claude] Rate limit hit on HTML extraction (attempt ${attempt}/${maxRetries}), waiting ${waitTime / 1000}s...`);

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }

        // For non-rate-limit errors, don't retry
        break;
      }
    }

    // If all retries failed, throw the last error
    throw lastError || new Error('HTML extraction failed after retries');

  } catch (error) {
    console.error('[Claude] HTML extraction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Select the best image for a vehicle using Claude
 * PRIORITIZES: Environmental backgrounds over plain studio/white backgrounds
 */
export async function selectBestImageWithClaude(
  vehicleName: string,
  vehicleBrand: string,
  imageUrls: string[],
  options?: {
    model?: keyof typeof MODELS;
  }
): Promise<ImageSelectionResult> {
  if (!isClaudeEnabled()) {
    return {
      success: false,
      confidence: 0,
      error: 'Claude API key not configured. Set ANTHROPIC_API_KEY environment variable.',
    };
  }

  if (imageUrls.length === 0) {
    return {
      success: false,
      confidence: 0,
      error: 'No image URLs provided',
    };
  }

  // If only one image, return it
  if (imageUrls.length === 1) {
    return {
      success: true,
      selectedImageUrl: imageUrls[0],
      confidence: 1.0,
      reasoning: 'Only one image available',
    };
  }

  const modelId = MODELS[options?.model || 'fast'];

  try {
    const prompt = `You are an expert at selecting the best thumbnail image for a car model listing.

TASK: Select the BEST image URL for this vehicle: "${vehicleBrand} ${vehicleName}"

IMAGE PREFERENCE ORDER (MOST IMPORTANT):
1. BEST: Car with ENVIRONMENTAL BACKGROUND - nature scenery, mountains, roads, city streets, coastal views, forests
2. GOOD: Car in lifestyle setting - parked outside buildings, in parking lots, driveways
3. ACCEPTABLE: Car with simple colored background (gray, blue gradient)
4. AVOID: Plain white/studio background - these look boring and generic

CRITICAL RULES - MUST FOLLOW:
1. The image MUST show the actual car model "${vehicleName}" - verify the model name matches!
2. NEVER select Swedish price plates ("skyltar") - images showing "från X kr/mån" or price text
3. NEVER select interior shots, engine photos, or detail close-ups
4. NEVER select images of DIFFERENT car models even if same brand
5. Prefer exterior shots showing the full car from front-3/4 angle or side view
6. Higher resolution images are preferred

IMAGE URL ANALYSIS:
- URLs containing the model name (e.g., "swift", "vitara") are more likely to be correct
- URLs with "outdoor", "lifestyle", "hero", "campaign" often have nice backgrounds
- URLs containing "prislista", "price", "skylt", "banner" are price plates - AVOID
- URLs containing "studio", "white", "cutout" might be plain backgrounds

Available image URLs:
${imageUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')}

Respond in JSON format:
{
  "selected_index": <number 1-based>,
  "selected_url": "<full URL>",
  "confidence": <0.0-1.0>,
  "has_environmental_background": <true/false>,
  "reasoning": "<brief explanation including background type>"
}`;

    const result = await anthropic.messages.create({
      model: modelId,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = result.content[0].type === 'text' ? result.content[0].text : '';

    // Parse JSON from response
    let jsonText = responseText;
    if (jsonText.includes('```json')) {
      jsonText = jsonText.split('```json')[1].split('```')[0];
    } else if (jsonText.includes('```')) {
      jsonText = jsonText.split('```')[1].split('```')[0];
    }

    const parsed = JSON.parse(jsonText.trim());

    return {
      success: true,
      selectedImageUrl: parsed.selected_url || imageUrls[parsed.selected_index - 1],
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning,
      hasEnvironmentalBackground: parsed.has_environmental_background,
    };

  } catch (error) {
    console.error('[Claude] Image selection error:', error);
    return {
      success: false,
      confidence: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Analyze an image to extract vehicle data
 */
export async function analyzeVehicleImage(
  imageUrl: string,
  options?: {
    model?: keyof typeof MODELS;
  }
): Promise<VehicleExtractionResult> {
  if (!isClaudeEnabled()) {
    return {
      success: false,
      error: 'Claude API key not configured. Set ANTHROPIC_API_KEY environment variable.',
    };
  }

  const modelId = MODELS[options?.model || 'fast'];

  try {
    console.log(`🖼️ [Claude] Analyzing vehicle image: ${imageUrl}`);

    // Fetch image and convert to base64
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const imageBuffer = await response.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');

    // Determine media type
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const mediaType = contentType.startsWith('image/') ? contentType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' : 'image/jpeg';

    const systemPrompt = getVehicleExtractionPrompt();
    const schema = getVehicleSchema();

    const result = await anthropic.messages.create({
      model: modelId,
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${systemPrompt}\n\nOUTPUT JSON SCHEMA:\n${schema}\n\nAnalyze this vehicle image and extract any visible pricing, model, or specification data. Return valid JSON:`,
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
    });

    const responseText = result.content[0].type === 'text' ? result.content[0].text : '';

    // Parse JSON from response
    let jsonText = responseText;
    if (jsonText.includes('```json')) {
      jsonText = jsonText.split('```json')[1].split('```')[0];
    } else if (jsonText.includes('```')) {
      jsonText = jsonText.split('```')[1].split('```')[0];
    }

    const parsed = JSON.parse(jsonText.trim());

    const usage = {
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      totalTokens: result.usage.input_tokens + result.usage.output_tokens,
      estimatedCostUsd: calculateCost(
        result.usage.input_tokens,
        result.usage.output_tokens,
        0,
        0,
        modelId
      ),
    };

    return {
      success: true,
      vehicles: parsed.vehicles?.map((v: any) => ({
        name: v.name,
        brand: v.brand,
        description: v.description || null,
        freeText: v.free_text || null,
        thumbnail: imageUrl,
        priceSource: 'image' as const,
        vehicleModels: v.vehicle_model?.map((m: any) => ({
          name: m.name,
          price: m.price,
          oldPrice: m.old_price,
          privatleasing: m.privatleasing,
          oldPrivatleasing: m.old_privatleasing,
          companyLeasingPrice: m.company_leasing_price,
          oldCompanyLeasingPrice: m.old_company_leasing_price,
          loanPrice: m.loan_price,
          oldLoanPrice: m.old_loan_price,
          bransle: m.bransle,
          biltyp: m.biltyp,
          vaxellada: m.vaxellada,
        })) || [],
      })) || [],
      priceSource: 'image',
      usage,
    };

  } catch (error) {
    console.error('[Claude] Image analysis error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test Claude connection
 */
export async function testClaudeConnection(): Promise<{ success: boolean; message: string }> {
  if (!isClaudeEnabled()) {
    return {
      success: false,
      message: 'Claude API key not configured. Set ANTHROPIC_API_KEY environment variable.',
    };
  }

  try {
    const result = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: 'Say "Claude is working!" in exactly those words.',
        },
      ],
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';

    return {
      success: text.toLowerCase().includes('working'),
      message: `Claude responded: ${text}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Claude connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Extract text from PDF using Claude (for simple text extraction)
 * Can be used as fallback or for pre-processing
 */
export async function extractTextFromPDF(
  pdfUrl: string
): Promise<{ success: boolean; text?: string; error?: string }> {
  const startTime = Date.now();

  if (!isClaudeEnabled()) {
    addPDFLog({
      timestamp: new Date().toISOString(),
      pdfUrl,
      success: false,
      method: 'Claude AI',
      characterCount: 0,
      processingTimeMs: Date.now() - startTime,
      error: 'Claude API key not configured.',
    });
    return {
      success: false,
      error: 'Claude API key not configured.',
    };
  }

  try {
    // Fetch PDF with timeout (60 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    console.log(`📥 Downloading PDF: ${pdfUrl}`);
    const response = await fetch(pdfUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status}`);
    }

    const pdfBuffer = await response.arrayBuffer();
    const pdfSizeMB = pdfBuffer.byteLength / 1024 / 1024;
    console.log(`📄 PDF downloaded: ${pdfSizeMB.toFixed(2)} MB`);
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');

    // For large PDFs (>1MB), use a longer timeout
    const apiTimeoutMs = pdfSizeMB > 1 ? 120000 : 60000;
    console.log(`⏱️ Using ${apiTimeoutMs / 1000}s timeout for Claude API call`);

    // Retry logic for API calls
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Claude API attempt ${attempt}/${maxRetries}...`);

        // Create a promise that rejects after timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Claude API timeout after ${apiTimeoutMs / 1000}s`)), apiTimeoutMs);
        });

        const apiPromise = anthropic.messages.create({
          model: MODELS.fast,
          max_tokens: 16000,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Extract all text content from this PDF document.

CRITICAL - PRESERVE TABLE STRUCTURE:
- If the PDF contains tables or grids, preserve them as structured data
- For price tables with rows (trim levels) and columns (motor types), output like:
  [TABLE: MODELLER & PRISER]
  | Trim Level | Motor 1 | Motor 2 | Motor 3 |
  | Row1 | value | value | value |
  | Row2 | value | value | value |

- For Peugeot-style matrix grids (trim × motor):
  Convert "STYLE: PureTech 2699kr, Hybrid 2430kr, Electric 3322kr" format
  Into: "Style PureTech: 2699 kr | Style Hybrid AUT: 2430 kr | Style Electric: 3322 kr"

- Identify and label sections: "STYLE", "ALLURE", "GT" as trim levels
- Identify column headers: "PureTech", "Hybrid AUT", "Electric" as motor types
- Extract EVERY price cell from the grid - each trim+motor combination is a variant

Return only the extracted text with preserved structure, no additional commentary.`,
                },
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: pdfBase64,
                  },
                },
              ],
            },
          ],
        });

        // Race between API call and timeout
        const result = await Promise.race([apiPromise, timeoutPromise]);

        const text = result.content[0].type === 'text' ? result.content[0].text : '';
        const processingTime = Date.now() - startTime;

        // Add success log
        addPDFLog({
          timestamp: new Date().toISOString(),
          pdfUrl,
          success: true,
          method: 'Claude AI',
          characterCount: text.length,
          processingTimeMs: processingTime,
          textPreview: text.substring(0, 500).replace(/\n/g, ' '),
        });

        return {
          success: true,
          text,
        };

      } catch (retryError: any) {
        lastError = retryError;
        const isTimeout = retryError.message?.includes('timeout');
        const isRateLimit = retryError.status === 429 || retryError.message?.includes('rate_limit');

        console.warn(`⚠️ Claude API attempt ${attempt} failed: ${retryError.message}`);

        if (isRateLimit && attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 5000;
          console.log(`⏳ Rate limit hit, waiting ${waitTime / 1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        if (isTimeout && attempt < maxRetries) {
          console.log(`⏳ Timeout, retrying with fresh connection...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        // Don't retry for other errors
        break;
      }
    }

    // All retries failed
    throw lastError || new Error('PDF extraction failed after retries');

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Add error log
    addPDFLog({
      timestamp: new Date().toISOString(),
      pdfUrl,
      success: false,
      method: 'Claude AI',
      characterCount: 0,
      processingTimeMs: processingTime,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

export { MODELS };
