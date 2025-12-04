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

  // Find the last complete vehicle entry by looking for patterns
  // If truncated mid-utrustning array, try to close it properly

  // Check if we're truncated inside an array (common for utrustning)
  const truncatedInArray = repaired.match(/("utrustning"\s*:\s*\[[\s\S]*?)("[^"]*$)/);
  if (truncatedInArray) {
    // We're truncated inside a string in an array - remove the incomplete string
    const lastCompleteQuote = repaired.lastIndexOf('",');
    if (lastCompleteQuote > repaired.lastIndexOf('"utrustning"')) {
      // Cut at the last complete string in the array
      repaired = repaired.substring(0, lastCompleteQuote + 1);
      console.log(`⚠️ JSON repair: Truncated incomplete string in utrustning array`);
    }
  }

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
    // Check if we're inside an array - if so, just remove the incomplete string
    const lastComma = repaired.lastIndexOf(',');
    const lastBracket = repaired.lastIndexOf('[');
    if (lastComma > lastBracket) {
      // Remove the incomplete entry after the last comma
      repaired = repaired.substring(0, lastComma);
      console.log(`⚠️ JSON repair: Removed incomplete string after last comma`);
      // Recalculate counts
      braceCount = 0;
      bracketCount = 0;
      inString = false;
      escapeNext = false;
      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (escapeNext) { escapeNext = false; continue; }
        if (char === '\\') { escapeNext = true; continue; }
        if (char === '"' && !escapeNext) { inString = !inString; continue; }
        if (!inString) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
          if (char === '[') bracketCount++;
          if (char === ']') bracketCount--;
        }
      }
    } else {
      repaired += '"';
      console.log(`⚠️ JSON repair: Added closing quote for unclosed string`);
    }
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

// Variant specs from PDF extraction
export interface ExtractedVariantSpecs {
  power_kw?: number | null;
  power_hp?: number | null;
  torque_nm?: number | null;
  top_speed_kmh?: number | null;
  acceleration_0_100?: number | null;
  fuel_consumption_l_100km?: number | null;
  consumption_kwh_100km?: number | null;
  co2_g_km?: number | null;
  range_km_wltp?: number | null;
  battery_kwh?: number | null;
  curb_weight_kg?: number | null;
  max_towing_kg?: number | null;
}

// New schema variant (trim level)
export interface ExtractedVariant {
  name: string;
  price?: number | null;
  old_price?: number | null;
  privatleasing?: number | null;
  old_privatleasing?: number | null;
  company_leasing?: number | null;
  old_company_leasing?: number | null;
  loan_price?: number | null;
  old_loan_price?: number | null;
  fuel_type?: 'Bensin' | 'Diesel' | 'Hybrid' | 'El' | null;
  transmission?: 'Manuell' | 'Automat' | 'e-CVT' | null;
  thumbnail?: string | null;
  specs?: ExtractedVariantSpecs | null;
  equipment?: string[];
}

// New schema vehicle (extracted from PDF)
export interface ExtractedVehicle {
  brand: string;
  title: string;
  description?: string | null;
  thumbnail?: string | null;
  vehicle_type?: 'cars' | 'motorcycles' | 'trucks';
  body_type?: 'suv' | 'hatchback' | 'sedan' | 'wagon' | 'coupe' | 'convertible' | 'pickup' | 'van' | null;
  source_url?: string | null;

  // New schema: variants array
  variants: ExtractedVariant[];
  variant_count?: number;

  // Additional extracted data
  dimensions?: {
    length_mm?: number | null;
    width_mm?: number | null;
    height_mm?: number | null;
    wheelbase_mm?: number | null;
    ground_clearance_mm?: number | null;
    interior?: {
      cargo_volume_l?: number | null;
    } | null;
  } | null;

  colors?: Array<{
    name: string;
    type?: 'solid' | 'metallic' | 'pearl' | null;
    price: number;
    available_for?: string[];
  }>;

  interiors?: Array<{
    name: string;
    material?: 'tyg' | 'konstläder' | 'läder' | 'alcantara' | null;
    price: number;
    available_for?: string[];
  }>;

  options?: Array<{
    name: string;
    description?: string | null;
    price: number;
    available_for?: string[];
  }>;

  accessories?: Array<{
    name: string;
    description?: string | null;
    price: number;
    price_includes_installation?: boolean;
    available_for?: string[];
  }>;

  services?: Array<{
    name: string;
    description?: string | null;
    duration_years?: number | null;
    max_mileage_km?: number | null;
  }>;

  connected_services?: {
    name?: string | null;
    price_monthly?: number | null;
    free_period_years?: number | null;
  } | null;

  financing?: {
    provider?: string | null;
    leasing_terms?: {
      duration_months?: number | null;
      mileage_per_year_km?: number | null;
      service_included?: boolean | null;
    } | null;
    loan_terms?: {
      interest_rate_percent?: number | null;
      downpayment_percent?: number | null;
      duration_months?: number | null;
    } | null;
  } | null;

  warranties?: Array<{
    name: string;
    duration_years?: number | null;
    duration_km?: number | null;
  }>;

  dealer_info?: {
    general_agent?: string | null;
    address?: string | null;
    phone?: string | null;
  } | null;

  // Legacy compatibility
  priceSource?: 'pdf' | 'html';

  // Legacy fields (deprecated - use variants instead)
  name?: string;  // Use title
  vehicleModels?: ExtractedVehicleModel[];  // Use variants
  freeText?: string | null;
  sourceUrl?: string | null;
}

// Legacy interface (deprecated - for backward compatibility)
export interface ExtractedVehicleModel {
  name: string;
  price?: number;
  oldPrice?: number;
  privatleasing?: number;
  oldPrivatleasing?: number;
  companyLeasingPrice?: number;
  oldCompanyLeasingPrice?: number;
  loanPrice?: number;
  oldLoanPrice?: number;
  bransle?: 'El' | 'Bensin' | 'Diesel' | 'Hybrid' | 'Laddhybrid';
  biltyp?: 'suv' | 'sedan' | 'kombi' | 'halvkombi' | 'pickup' | 'transportbil' | 'personbil' | 'mopedbil';
  vaxellada?: 'Automat' | 'Manuell';
  thumbnail?: string;
  priceSource?: 'pdf' | 'html';
  utrustning?: string[];
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
5. NEVER copy a price from one field to another - loan_price and privatleasing are DIFFERENT!
6. A dash "-" or empty cell means null - do NOT fill in with other values
7. Each price field must come from its EXACT column in the PDF table

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

PDF EXTRACTION - TABLE FORMAT RULES:
Every row in a price table that has a price = one variant.

SUZUKI PDF FORMAT (CRITICAL - "Cirkaprislista"):
Suzuki PDFs have tables with columns: MODELL | Elförbrukning | Räckvidd | Skatt | Rek.cirkapris | Billån/mån* | PL/mån**
- The variant name is in the MODELL column (e.g., "49 kWh 2WD Base", "61 kWh 4x4 Select")
- PRICE COLUMN MAPPING:
  * "Rek.cirkapris (inkl.moms)" or "Rek.cirkapris" = price (purchase price in SEK)
  * "Billån/mån*" = loan_price (monthly LOAN payment)
  * "PL/mån**" or "PL / mån**" = privatleasing (monthly private LEASING - THIS IS IMPORTANT!)
- Campaign prices with "(ord. pris X kr)" pattern:
  * Main number = current price (e.g., "4.995 kr" → privatleasing=4995)
  * "(ord. pris X kr)" = old price (e.g., "(ord. pris 6.249 kr)" → old_privatleasing=6249)
- Example row: "49 kWh 2WD Base | 389.900 kr | 3.286 kr (ord. pris 3.484 kr) | 4.995 kr (ord. pris 6.249 kr)"
  * price=389900, loan_price=3286, old_loan_price=3484, privatleasing=4995, old_privatleasing=6249

OPEL/STELLANTIS PDF FORMAT (CRITICAL):
Opel PDFs have tables with columns: MODELL | MOTOR | VÄXELLÅDA | RÄCKVIDD WLTP | BILLÅN BY OPEL | PRIVATLEASING
- The MODELL column contains the TRIM LEVEL (e.g., "CORSA" = Edition, "CORSA GS" = GS trim)
- The MOTOR column contains the engine spec (e.g., "PureTech 100 hk", "Elektrisk 115 kW")
- VARIANT NAMING RULES:
  * If MODELL is just the base name (e.g., "CORSA"): variant name = MOTOR only (e.g., "PureTech 100 hk")
  * If MODELL includes trim suffix (e.g., "CORSA GS"): variant name = "GS " + MOTOR (e.g., "GS Elektrisk 115 kW")
  * DO NOT include transmission in the variant name
- COUNT ALL ROWS: Each row in the price table = 1 variant (including both base and GS versions)

PRICE COLUMN MAPPING (DO NOT MIX UP!):
- "BILLÅN BY OPEL" or "Billån/mån" column = loan_price (monthly LOAN payment - NOT leasing!)
- "PRIVATLEASING" or "PL/mån" column = privatleasing (monthly private LEASING price)
- These are TWO DIFFERENT things - NEVER put loan_price value in privatleasing field!
- These PDFs typically do NOT have cash prices (kontantpris) - leave price field as null
- "RÄCKVIDD WLTP" = electric range in km (informational only)

HANDLING DASHES AND EMPTY CELLS (CRITICAL):
- A dash "-" in a price column means NO PRICE AVAILABLE → use null
- An empty cell means NO PRICE AVAILABLE → use null
- "*BEGRÄNSAT ANTAL" or similar notes mean limited availability → use null for that price
- ONLY use actual numeric values like "2 199 kr/mån" or "5 999 kr/mån"
- NEVER hallucinate or copy values between columns!

EXAMPLE - OPEL/STELLANTIS TABLE FORMAT:
| MODELL       | MOTOR           | BILLÅN   | PRIVATLEASING |
|--------------|-----------------|----------|---------------|
| [MODEL]      | [Motor A]       | X kr/mån | -             |
| [MODEL] GS   | [Motor A]       | X kr/mån | Y kr/mån      |
| [MODEL]      | [Motor B]       | X kr/mån | Y kr/mån      |
| [MODEL] GS   | [Motor B]       | X kr/mån | Y kr/mån      |

VARIANT NAMING PATTERN:
- MODELL column = base model name only → variant name = just motor (e.g., "PureTech 100 hk")
- MODELL column = model + trim suffix → variant name = trim + motor (e.g., "GS PureTech 100 hk")
- Same motor in DIFFERENT rows with different MODELL = DIFFERENT variants!
- Count the rows: if 7 rows have prices → extract 7 variants

VARIANT NAME CONSTRUCTION:
- Include trim level prefix (GS, Base, Select, etc.) if NOT the base Edition trim
- Include motor/engine info (PureTech 100 hk, Elektrisk 100kW, Hybrid 110 hk)
- Do NOT include transmission in the variant name (no Manuell, Automat, e-DCT, Steglös)
- Do NOT include the model name (Corsa) in the variant name - it's redundant

VARIANT NAMING EXAMPLES:
- CORSA + PureTech 100 hk → "PureTech 100 hk" (base trim = no prefix)
- CORSA GS + Elektrisk 115 kW → "GS Elektrisk 115 kW" (GS trim = "GS " prefix)
- STYLE section + PureTech → "Style PureTech 100 hk" (Peugeot format)
- ALLURE section + Electric → "Allure Electric" (Peugeot format)

KEY: Same motor in different trims = DIFFERENT variants! Extract ALL of them.

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
- NEVER assign one vehicle's image to another vehicle

DETAILED EXTRACTION INSTRUCTIONS (CRITICAL - DO NOT SKIP):
Extract ALL available data from PDFs, not just prices. Look for these sections:

1. TECHNICAL SPECIFICATIONS (TEKNISK FAKTA / SPECIFIKATIONER):
   - For EACH variant, extract specs: power_hp, power_kw, torque_nm, acceleration_0_100, top_speed_kmh
   - Electric: consumption_kwh_100km, range_km_wltp, battery_kwh
   - Combustion: fuel_consumption_l_100km, co2_g_km
   - Look for spec tables matching each motor/variant type

2. EQUIPMENT (STANDARDUTRUSTNING / UTRUSTNING):
   - Extract COMPLETE equipment lists for each trim level
   - Opel: Match ● (included) vs - (not included) per trim column
   - Look for sections: "SÄKERHET", "EXTERIÖR", "INTERIÖR", "KOMFORT", "INFOTAINMENT"
   - NEVER leave equipment array empty if equipment data exists

3. COLORS (EXTERIÖRFÄRGER / FÄRGER):
   - Look for color tables with prices
   - Extract: name, type (solid/metallic/pearl), price
   - "Utan extra kostnad" or 0 price = standard color
   - Note which colors are available for which variants

4. INTERIORS (INTERIÖRKLÄDSEL / KLÄDSEL):
   - Extract interior options with material type and price
   - material: "tyg", "konstläder", "läder", "alcantara"

5. OPTIONS & ACCESSORIES (TILLVAL / TILLBEHÖR):
   - Extract optional packages and individual options with prices
   - Note which variants each option is available for

6. DIMENSIONS (MÅTT / DIMENSIONER):
   - Look for dimension tables: length_mm, width_mm, height_mm, wheelbase_mm
   - Interior: cargo_volume_l (bagageutrymme)

7. WARRANTIES (GARANTI):
   - Look for warranty information: "Fabriksgaranti", "Rostskyddsgaranti", "Lackgaranti"
   - Extract duration_years and duration_km

8. FINANCING (FINANSIERING):
   - Extract financing terms: provider name, interest rate, lease terms
   - Look for footnotes explaining leasing/loan conditions`;
}

/**
 * Get the JSON schema for vehicle extraction output (NEW SCHEMA 2024)
 */
function getVehicleSchema(): string {
  return `
JSON SCHEMA (NEW FORMAT - USE THIS EXACTLY):
{
  "vehicles": [
    {
      "brand": "string - Car brand (e.g., 'Suzuki', 'Toyota', 'Peugeot', 'Opel')",
      "title": "string - Model name (e.g., 'Swift', 'Vitara', '208', 'Corsa')",
      "description": "string|null - Short marketing description (1-2 sentences)",
      "thumbnail": "string|null - Image URL (null for PDF extraction)",
      "vehicle_type": "'cars'|'motorcycles'|'trucks' - Default 'cars'",
      "body_type": "'suv'|'hatchback'|'sedan'|'wagon'|'coupe'|'convertible'|'pickup'|'van'|null",
      "source_url": "string|null - The URL where this vehicle was found",

      "variants": [
        {
          "name": "string - Variant/trim name (e.g., 'Style PureTech', 'GS Hybrid AUT', 'Allure Electric')",
          "price": "number|null - Cash price in SEK",
          "old_price": "number|null - Previous cash price if discounted",
          "privatleasing": "number|null - Monthly private leasing price in SEK",
          "old_privatleasing": "number|null - Previous private leasing price",
          "company_leasing": "number|null - Monthly company leasing price in SEK",
          "old_company_leasing": "number|null - Previous company leasing price",
          "loan_price": "number|null - Monthly loan payment in SEK",
          "old_loan_price": "number|null - Previous loan price",
          "fuel_type": "'Bensin'|'Diesel'|'Hybrid'|'El'|null - Extract from tech specs or infer from name",
          "transmission": "'Manuell'|'Automat'|'e-CVT'|null - Extract from tech specs or infer from name",
          "thumbnail": "string|null - Variant-specific image if different",
          "specs": {
            "power_kw": "number|null - Power in kW",
            "power_hp": "number|null - Power in horsepower",
            "torque_nm": "number|null - Torque in Nm",
            "top_speed_kmh": "number|null - Top speed",
            "acceleration_0_100": "number|null - 0-100 km/h in seconds",
            "fuel_consumption_l_100km": "number|null - Fuel consumption l/100km",
            "consumption_kwh_100km": "number|null - Electric consumption kWh/100km",
            "co2_g_km": "number|null - CO2 emissions g/km",
            "range_km_wltp": "number|null - Electric range WLTP km",
            "battery_kwh": "number|null - Battery capacity kWh",
            "curb_weight_kg": "number|null - Empty weight kg",
            "max_towing_kg": "number|null - Max towing capacity kg"
          },
          "equipment": ["string array - Equipment list for this trim level"]
        }
      ],

      "dimensions": {
        "length_mm": "number|null",
        "width_mm": "number|null",
        "height_mm": "number|null",
        "wheelbase_mm": "number|null",
        "ground_clearance_mm": "number|null",
        "interior": {
          "cargo_volume_l": "number|null - Trunk capacity in liters"
        }
      },

      "colors": [
        {
          "name": "string - Color name (e.g., 'Midnight Black')",
          "type": "'solid'|'metallic'|'pearl'|null",
          "price": "number - Price for this color (0 if standard)",
          "available_for": ["string array - Variant names this color is available for"]
        }
      ],

      "interiors": [
        {
          "name": "string - Interior name",
          "material": "'tyg'|'konstläder'|'läder'|'alcantara'|null",
          "price": "number",
          "available_for": ["string array - Variant names"]
        }
      ],

      "options": [
        {
          "name": "string - Option/package name",
          "description": "string|null",
          "price": "number",
          "available_for": ["string array - Variant names"]
        }
      ],

      "accessories": [
        {
          "name": "string - Accessory name",
          "description": "string|null",
          "price": "number",
          "price_includes_installation": "boolean",
          "available_for": ["string array - Variant names"]
        }
      ],

      "services": [
        {
          "name": "string - Service name (e.g., 'Service', 'Assistans')",
          "description": "string|null",
          "duration_years": "number|null",
          "max_mileage_km": "number|null"
        }
      ],

      "financing": {
        "provider": "string|null - e.g., 'Santander', 'DNB'",
        "leasing_terms": {
          "duration_months": "number|null - Default lease period",
          "mileage_per_year_km": "number|null - e.g., 15000",
          "service_included": "boolean|null"
        },
        "loan_terms": {
          "interest_rate_percent": "number|null",
          "downpayment_percent": "number|null",
          "duration_months": "number|null"
        }
      },

      "warranties": [
        {
          "name": "string - e.g., 'Nybilsgaranti', 'Rostskyddsgaranti'",
          "duration_years": "number|null",
          "duration_km": "number|null"
        }
      ]
    }
  ]
}

EQUIPMENT (UTRUSTNING) EXTRACTION - CRITICAL:
You MUST extract equipment for each variant. Match equipment lists to variants by trim level name:

1. OPEL PDF EQUIPMENT FORMAT:
   Opel PDFs have a "STANDARDUTRUSTNING" page with two columns: EDITION and GS
   - Bullets (●) mean the feature is INCLUDED
   - Dashes (-) mean the feature is NOT included
   - Look for sections: "SÄKERHET OCH FUNKTION", "EXTERIÖR", "INTERIÖRT"

   MATCHING RULES FOR OPEL:
   - Variants WITHOUT "GS" in name → use EDITION column equipment
   - Variants WITH "GS" in name → use GS column equipment
   - Example: "PureTech 100 hk Manuell" → EDITION equipment
   - Example: "GS Elektrisk 115 kW" → GS equipment

2. SUZUKI/OTHER PDF EQUIPMENT FORMAT:
   - "Standardutrustning i Basemodellen:" → applies to ALL variants with "Base" in name
   - "Utrustning Select utöver Base:" → applies to ALL variants with "Select" in name
   - "Utrustning Inclusive utöver Select:" → applies to ALL variants with "Inclusive" in name
   - If a variant has CVT, AllGrip, 4x4 etc - still match by trim level (Base/Select/Inclusive)

3. WHERE TO FIND EQUIPMENT:
   - In PDFs: Look for "STANDARDUTRUSTNING" section/page with feature lists
   - In HTML: Look for <h3>Standardutrustning...</h3> followed by <ul><li> items
   - Extract each bullet point/list item as a string in the utrustning array
   - Check "Utforska" or "Tekniska data" pages for more equipment details

4. WHERE TO FIND TECHNICAL DATA:
   - Look for pages/sections named "TEKNISK FAKTA", "Teknisk data", "Specifikationer"
   - Opel PDFs have a "TEKNISK FAKTA" page with columns for each motor type
   - Match columns to variants by motor specification:
     * PURETECH (100 MAN) → PureTech 100 hk Manuell variants
     * PURETECH (130 AUT) → PureTech variants with Automat
     * HYBRID → Hybrid variants
     * EL (100 kW) → Elektrisk 100kW variants
     * EL (115 kW) → Elektrisk 115 kW variants
   - Extract "Bränsle" row for fuel type (bransle)
   - Extract "Karosstyp" or similar for body type (5-door hatchbacks = "halvkombi")

5. IMPORTANT RULES:
   - NEVER leave utrustning empty [] if equipment data exists for that trim level
   - Only include features marked with ● (bullet) not - (dash)
   - Technical data (bransle, biltyp, vaxellada) should be extracted from TEKNISK FAKTA tables

SOURCE URL EXTRACTION (CRITICAL - MUST READ):
- The HTML content is divided into sections, each marked with:
  <!-- ===== CONTENT FROM URL: https://example.com/page ===== -->
  ...content...
  <!-- ===== END CONTENT FROM: https://example.com/page ===== -->

- Each vehicle's source_url MUST be set to the URL from the section where that vehicle's data appears
- Look for the <!-- ===== CONTENT FROM URL: ... ===== --> marker BEFORE the vehicle data
- DO NOT use the main scrape URL for all vehicles - use the SPECIFIC page URL where each vehicle was found
- Example: If Corsa data appears after "<!-- ===== CONTENT FROM URL: https://www.opel.se/bilar/corsa ===== -->",
  then Corsa's source_url must be "https://www.opel.se/bilar/corsa"
- This is ESSENTIAL for tracking which specific page each vehicle was scraped from

EXAMPLE - Peugeot 208 with variants, warranties, and financing:
{
  "vehicles": [
    {
      "brand": "Peugeot",
      "title": "208",
      "description": "Kompakt och stilren halvkombi med moderna motorer.",
      "thumbnail": null,
      "vehicle_type": "cars",
      "body_type": "hatchback",
      "source_url": "https://example.com/peugeot-208",

      "variants": [
        {
          "name": "Style PureTech",
          "price": null,
          "old_price": null,
          "privatleasing": 2699,
          "old_privatleasing": null,
          "company_leasing": null,
          "old_company_leasing": null,
          "loan_price": 1944,
          "old_loan_price": null,
          "fuel_type": "Bensin",
          "transmission": null,
          "thumbnail": null,
          "specs": null,
          "equipment": ["LED-strålkastare", "7\" pekskärm", "Apple CarPlay"]
        },
        {
          "name": "Style Hybrid AUT",
          "price": null,
          "privatleasing": null,
          "company_leasing": null,
          "loan_price": 2430,
          "fuel_type": "Hybrid",
          "transmission": "Automat",
          "equipment": []
        },
        {
          "name": "Style Electric",
          "price": null,
          "privatleasing": null,
          "company_leasing": null,
          "loan_price": 3322,
          "fuel_type": "El",
          "transmission": "Automat",
          "specs": {
            "range_km_wltp": 400,
            "battery_kwh": 50
          },
          "equipment": []
        }
      ],

      "warranties": [
        { "name": "Nybilsgaranti", "duration_years": 3, "duration_km": null },
        { "name": "Peugeot Assistans", "duration_years": 3, "duration_km": null }
      ],

      "financing": {
        "provider": "Santander",
        "leasing_terms": {
          "duration_months": 36,
          "mileage_per_year_km": 15000,
          "service_included": true
        }
      }
    }
  ]
}

EXAMPLE - Electric SUV with specs and colors:
{
  "vehicles": [
    {
      "brand": "Suzuki",
      "title": "eVitara",
      "description": "Suzukis första helt elektriska SUV.",
      "thumbnail": null,
      "vehicle_type": "cars",
      "body_type": "suv",
      "source_url": "https://suzukibilar.se/kopa-suzuki/kop-nya-e-vitara",

      "variants": [
        {
          "name": "49 kWh 2WD Base",
          "price": 389900,
          "privatleasing": 4995,
          "old_privatleasing": 6249,
          "loan_price": 3286,
          "old_loan_price": 3484,
          "fuel_type": "El",
          "transmission": "Automat",
          "specs": {
            "range_km_wltp": 339,
            "battery_kwh": 49,
            "power_kw": 106
          },
          "equipment": ["Adaptiv farthållare", "LED-strålkastare", "10.25\" pekskärm"]
        },
        {
          "name": "61 kWh 4x4 Inclusive",
          "price": 549900,
          "privatleasing": 5995,
          "loan_price": null,
          "fuel_type": "El",
          "transmission": "Automat",
          "specs": {
            "range_km_wltp": 465,
            "battery_kwh": 61,
            "power_kw": 128
          },
          "equipment": ["Panoramatak", "Läderklädsel", "BOSE ljudsystem"]
        }
      ],

      "dimensions": {
        "length_mm": 4275,
        "width_mm": 1800,
        "height_mm": 1635,
        "wheelbase_mm": 2700
      },

      "colors": [
        { "name": "Arctic White", "type": "solid", "price": 0, "available_for": ["49 kWh 2WD Base", "61 kWh 4x4 Inclusive"] },
        { "name": "Celestial Blue", "type": "metallic", "price": 8500, "available_for": ["61 kWh 4x4 Inclusive"] }
      ],

      "warranties": [
        { "name": "Nybilsgaranti", "duration_years": 3, "duration_km": null },
        { "name": "Batterigaranti", "duration_years": 8, "duration_km": 160000 }
      ]
    }
  ]
}

IMPORTANT NOTES:
- "old_*" fields are for discounts (crossed-out prices) - look for "Ord. pris: X kr" patterns
- PDF extraction: thumbnail should be null
- Use body_type: "hatchback" for halvkombi/5-door hatchbacks
- Extract specs, colors, accessories from PDF tables when available
- If no data found, use null or empty array [] - DO NOT invent data`;
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

    // Build comprehensive extraction prompt
    const pdfExtractionPrompt = `${systemPrompt}

OUTPUT JSON SCHEMA:
${schema}

CRITICAL PDF EXTRACTION INSTRUCTIONS:
You are looking at a Swedish car manufacturer PDF price list. Extract ALL data from ALL pages:

1. PAGE BY PAGE EXTRACTION - Look at EVERY page:
   - Page 1: Cover/title (get brand and model name)
   - Page 2+: Trim levels with EQUIPMENT LISTS (bullet points = equipment items)
   - Color pages: FÄRG section with color names, types (metallic/solid), prices, availability
   - Options pages: TILLVAL section with option names, prices, availability
   - Tech spec pages: TEKNISKA SPECIFIKATIONER tables with power, torque, consumption, acceleration
   - Dimensions pages: DIMENSIONER with length, width, height, wheelbase in mm
   - Last page: GARANTI (warranties), DEALER INFO (address, phone, email)

2. EQUIPMENT EXTRACTION (CRITICAL - EQUIPMENT IS SHOWN ONCE PER TRIM LEVEL):
   - PDFs show equipment at TRIM LEVEL (e.g., "Edition", "GS", "Style", "Allure", "GT")
   - ALL variants at that trim level share the SAME equipment list
   - Opel format: Base trim vs GS trim columns with ● (included) or - (not included)
   - Peugeot format: Sections per trim, higher trims say "samt:" (includes lower trim equipment)
   - IMPORTANT: Copy the same equipment list to EVERY variant at that trim level!

3. VARIANT COUNT - COUNT AND EXTRACT EVERY ROW:
   ⚠️ STEP 1: COUNT the rows in the price table FIRST before extracting!
   ⚠️ STEP 2: Extract EXACTLY that many variants - no more, no less!

   CRITICAL RULE: Each row in the price table = ONE variant to extract.
   - If you count 7 rows → you MUST return 7 variants
   - If you count 5 rows → you MUST return 5 variants
   - Same motor appearing in multiple rows with different trims = MULTIPLE variants!

   IMPORTANT: The MODELL column tells you the trim level for EACH row.
   Read it carefully - don't assume rows with similar motors are duplicates!

4. VARIANT NAMING - COMBINE TRIM + MOTOR:
   Format: "[Trim] [Motor]" - the trim level MUST be part of the variant name!

   DETECTING TRIM LEVELS:
   - Opel/Stellantis: MODELL column shows trim (e.g., "CORSA" vs "CORSA GS")
     * Base model name only → no prefix (e.g., "CORSA" → "Elektrisk 100kW")
     * Model + suffix → prefix with suffix (e.g., "CORSA GS" → "GS Elektrisk 100kW")
   - Peugeot/Stellantis: Separate SECTIONS per trim (STYLE, ALLURE, GT headers)
     * Each section header = trim level prefix for all variants in that section
     * "STYLE" section + "PureTech" row → "Style PureTech 100 hk"
     * "ALLURE" section + "Electric" row → "Allure Electric"
   - Suzuki: Variant name includes trim (e.g., "49 kWh 2WD Base", "61 kWh 4x4 Select")

   KEY RULE: If the PDF shows the same motor available in multiple trims,
   extract EACH combination as a separate variant with its own trim prefix!

5. SINGLE VEHICLE - DO NOT CREATE DUPLICATE VEHICLES:
   - "e-208" and "208" are the SAME vehicle - just "208" with electric AND non-electric variants
   - "e-Corsa" and "Corsa" are the SAME vehicle - just "Corsa" with all variants
   - Create ONE vehicle per model name, with ALL variants (electric, hybrid, petrol) under it
   - NEVER create separate vehicles for electric versions (e-208, e-Corsa, etc.)

6. SPECS PER VARIANT - Match tech specs to correct variant:
   - Look for "Motor" columns: PureTech 100 hk, Hybrid 110 hk, Electric/El
   - Extract: power_hp, power_kw, torque_nm, fuel_consumption_l_100km, co2_g_km
   - Electric specs: range_km_wltp, battery_kwh, consumption_kwh_100km

7. COLORS - Extract from FÄRG section:
   - Color name, type (solid/metallic/pearl), price
   - "Samtliga" = available for all variants
   - "Allure & GT" = only for those trim levels

8. RETURN COMPLETE JSON with specs, equipment, colors, dimensions, warranties filled in!
   - Every variant MUST have its equipment list populated (copy from trim level)
   - DO NOT leave equipment arrays empty if equipment was listed for that trim level

⚠️ FINAL CHECK BEFORE RETURNING JSON:
- Count the rows in the price table
- Count the variants in your JSON
- These numbers MUST match!
- If electric motors appear in both base and GS rows, you need BOTH variants (without and with GS prefix)

Extract all vehicle data from this PDF and return valid JSON:`;

    const userContent: Anthropic.MessageCreateParams['messages'][0]['content'] = [
      {
        type: 'text',
        text: pdfExtractionPrompt,
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
        // Use streaming to avoid timeout for large PDF processing
        console.log(`📡 [Claude] Using streaming mode for PDF extraction (attempt ${attempt}/${maxRetries})...`);

        const stream = await anthropic.messages.stream({
          model: modelId,
          max_tokens: 32000, // Increased for complete extraction including equipment lists
          messages: [
            {
              role: 'user',
              content: userContent,
            },
          ],
        });

        // Accumulate the streamed response
        let responseText = '';
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            responseText += event.delta.text;
          }
        }

        // Get final message for usage stats
        const result = await stream.finalMessage();

        // Log raw response for debugging
        console.log(`📝 [Claude] Raw response length: ${responseText.length} chars`);
        if (responseText.length < 500) {
          console.log(`📝 [Claude] Full response: ${responseText}`);
        } else {
          console.log(`📝 [Claude] Response preview: ${responseText.substring(0, 500)}...`);
        }

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

        // Log success with extraction details
        console.log(`✅ [Claude] PDF extraction completed in ${processingTime}ms`);
        console.log(`   Found ${parsed.vehicles?.length || 0} vehicles`);

        // Log extraction details for first vehicle
        if (parsed.vehicles?.[0]) {
          const v = parsed.vehicles[0];
          console.log(`   📊 First vehicle: ${v.brand} ${v.title || v.name}`);
          console.log(`   📊 Variants: ${v.variants?.length || 0}`);
          console.log(`   📊 Colors: ${v.colors?.length || 0}`);
          console.log(`   📊 Dimensions: ${v.dimensions ? 'YES' : 'NO'}`);
          console.log(`   📊 Warranties: ${v.warranties?.length || 0}`);
          if (v.variants?.[0]) {
            console.log(`   📊 First variant equipment: ${v.variants[0].equipment?.length || 0} items`);
            console.log(`   📊 First variant specs: ${v.variants[0].specs ? 'YES' : 'NO'}`);
          }
        }

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

        // Map to new schema format
        return {
          success: true,
          vehicles: parsed.vehicles?.map((v: any) => ({
            // New schema fields
            brand: v.brand,
            title: v.title || v.name,  // Support both old and new field names
            description: v.description || null,
            thumbnail: v.thumbnail || null,
            vehicle_type: v.vehicle_type || 'cars',
            body_type: v.body_type || null,
            source_url: v.source_url || null,

            // Variants (new schema) - map from old vehicle_model if needed
            variants: (v.variants || v.vehicle_model)?.map((m: any) => ({
              name: m.name,
              price: m.price ?? null,
              old_price: m.old_price ?? null,
              privatleasing: m.privatleasing ?? null,
              old_privatleasing: m.old_privatleasing ?? null,
              company_leasing: m.company_leasing ?? m.company_leasing_price ?? null,
              old_company_leasing: m.old_company_leasing ?? m.old_company_leasing_price ?? null,
              loan_price: m.loan_price ?? null,
              old_loan_price: m.old_loan_price ?? null,
              fuel_type: m.fuel_type ?? m.bransle ?? null,
              transmission: m.transmission ?? m.vaxellada ?? null,
              thumbnail: m.thumbnail ?? null,
              specs: m.specs ?? null,
              equipment: m.equipment ?? m.utrustning ?? [],
            })) || [],
            variant_count: (v.variants || v.vehicle_model)?.length || 0,

            // Additional data
            dimensions: v.dimensions ?? null,
            colors: v.colors ?? [],
            interiors: v.interiors ?? [],
            options: v.options ?? [],
            accessories: v.accessories ?? [],
            services: v.services ?? [],
            connected_services: v.connected_services ?? null,
            financing: v.financing ?? null,
            warranties: v.warranties ?? [],
            dealer_info: v.dealer_info ?? null,

            // Legacy compatibility
            priceSource: 'pdf' as const,
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
        // Use streaming for large responses to avoid timeout errors
        let responseText = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheReadTokens = 0;
        let cacheCreationTokens = 0;

        const stream = await anthropic.messages.stream({
          model: modelId,
          max_tokens: 16000, // Reasonable limit for equipment lists
          messages: [
            {
              role: 'user',
              content: userContent,
            },
          ],
        });

        // Collect streamed response
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            responseText += event.delta.text;
          }
        }

        // Get final message for usage stats
        const finalMessage = await stream.finalMessage();
        inputTokens = finalMessage.usage.input_tokens;
        outputTokens = finalMessage.usage.output_tokens;
        cacheReadTokens = (finalMessage.usage as any).cache_read_input_tokens || 0;
        cacheCreationTokens = (finalMessage.usage as any).cache_creation_input_tokens || 0;

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
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
          cacheReadTokens: cacheReadTokens,
          cacheCreationTokens: cacheCreationTokens,
          estimatedCostUsd: calculateCost(
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheCreationTokens,
            modelId
          ),
        };

        return {
          success: true,
          vehicles: parsed.vehicles?.map((v: any) => ({
            // Basic info
            name: v.title || v.name,  // Support both new (title) and legacy (name) formats
            title: v.title || v.name,
            brand: v.brand,
            description: v.description || null,
            freeText: v.free_text || null,
            thumbnail: v.thumbnail,
            priceSource: v.price_source || 'html',
            source_url: v.source_url || null,
            sourceUrl: v.source_url || null,
            vehicle_type: v.vehicle_type || 'cars',
            vehicleType: v.vehicle_type || 'cars',
            body_type: v.body_type || null,
            bodyType: v.body_type || null,

            // NEW SCHEMA: variants array (primary format)
            variants: v.variants?.map((variant: any) => ({
              name: variant.name,
              price: variant.price ?? null,
              old_price: variant.old_price ?? null,
              privatleasing: variant.privatleasing ?? null,
              old_privatleasing: variant.old_privatleasing ?? null,
              company_leasing: variant.company_leasing ?? null,
              old_company_leasing: variant.old_company_leasing ?? null,
              loan_price: variant.loan_price ?? null,
              old_loan_price: variant.old_loan_price ?? null,
              fuel_type: variant.fuel_type ?? null,
              transmission: variant.transmission ?? null,
              thumbnail: variant.thumbnail ?? null,
              specs: variant.specs ?? null,
              equipment: variant.equipment || [],
            })) || [],

            // NEW SCHEMA: Additional extracted data
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

            // LEGACY: vehicleModels for backward compatibility
            vehicleModels: v.variants?.map((m: any) => ({
              name: m.name,
              price: m.price,
              oldPrice: m.old_price,
              privatleasing: m.privatleasing,
              oldPrivatleasing: m.old_privatleasing,
              companyLeasingPrice: m.company_leasing,
              oldCompanyLeasingPrice: m.old_company_leasing,
              loanPrice: m.loan_price,
              oldLoanPrice: m.old_loan_price,
              bransle: m.fuel_type,
              biltyp: v.body_type,
              vaxellada: m.transmission,
              thumbnail: m.thumbnail,
              priceSource: m.price_source || (options?.includePdfContent ? 'pdf' : 'html'),
              utrustning: m.equipment || [],
            })) || v.vehicle_model?.map((m: any) => ({
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
              utrustning: m.utrustning || [],
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
