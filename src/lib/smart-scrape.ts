/**
 * Smart Scrape Service
 *
 * Optimizes scraping by:
 * 1. Checking for existing vehicles before full AI processing
 * 2. Only extracting prices/variants for known vehicles (cost-saving)
 * 3. Full AI processing only for new vehicles or significant changes
 * 4. Pre-processing HTML to extract source URLs correctly
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Types
export interface ExistingVehicle {
  id: string;
  title: string;
  brand: string;
  source_url: string | null;
  updated_at: string;
  models: ExistingModel[];
}

export interface ExistingModel {
  id: string;
  name: string;
  price: number | null;
  privatleasing: number | null;
  company_leasing_price: number | null;
  loan_price: number | null;
}

export interface ContentSection {
  url: string;
  content: string;
  linkText: string;
  title: string;
}

export interface PriceChange {
  modelName: string;
  field: 'price' | 'privatleasing' | 'company_leasing' | 'loan';
  oldValue: number | null;
  newValue: number | null;
}

export interface SmartScrapeResult {
  mode: 'full' | 'price_only' | 'skip';
  reason: string;
  existingVehicles: ExistingVehicle[];
  contentSections: ContentSection[];
  detectedChanges?: PriceChange[];
  newVariants?: string[];
}

/**
 * Get existing vehicles for a brand from the database
 */
export async function getExistingVehiclesForBrand(brand: string): Promise<ExistingVehicle[]> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('vehicles')
    .select(`
      id,
      title,
      brand,
      source_url,
      updated_at,
      vehicle_models (
        id,
        name,
        price,
        privatleasing,
        company_leasing_price,
        loan_price
      )
    `)
    .ilike('brand', brand)
    .order('title');

  if (error) {
    console.error('Error fetching existing vehicles:', error);
    return [];
  }

  return (data || []).map(v => ({
    id: v.id,
    title: v.title,
    brand: v.brand,
    source_url: v.source_url,
    updated_at: v.updated_at,
    models: (v.vehicle_models || []).map((m: any) => ({
      id: m.id,
      name: m.name,
      price: m.price,
      privatleasing: m.privatleasing,
      company_leasing_price: m.company_leasing_price,
      loan_price: m.loan_price,
    })),
  }));
}

/**
 * Extract content sections from formatted HTML
 * Maps each linked page's content to its source URL
 */
export function extractContentSections(formattedHtml: string, mainUrl: string): ContentSection[] {
  const sections: ContentSection[] = [];

  // Extract main page content
  const mainMatch = formattedHtml.match(/<!-- MAIN PAGE CONTENT START -->([\s\S]*?)<!-- MAIN PAGE CONTENT END -->/);
  if (mainMatch) {
    sections.push({
      url: mainUrl,
      content: mainMatch[1].trim(),
      linkText: 'Main Page',
      title: extractTitle(mainMatch[1]) || 'Main Page',
    });
  }

  // Extract linked pages
  const linkedPagePattern = /<!-- LINKED PAGE \d+ START -->\s*<!-- LINK TEXT: (.*?) -->\s*<!-- URL: (.*?) -->\s*<!-- TITLE: (.*?) -->\s*<!-- CONTENT START -->([\s\S]*?)<!-- CONTENT END -->\s*<!-- LINKED PAGE \d+ END -->/g;

  let match;
  while ((match = linkedPagePattern.exec(formattedHtml)) !== null) {
    sections.push({
      url: match[2].trim(),
      content: match[4].trim(),
      linkText: match[1].trim(),
      title: match[3].trim(),
    });
  }

  return sections;
}

/**
 * Extract title from HTML content
 */
function extractTitle(html: string): string | null {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();

  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();

  return null;
}

/**
 * Extract vehicle names from HTML content using simple patterns
 * Used to detect if page contains known vehicles
 */
export function detectVehicleNamesInContent(content: string): string[] {
  const vehicleNames: string[] = [];

  // Common car model patterns
  const patterns = [
    // Swedish brand pages often have model names in headers or links
    /<h[1-3][^>]*>([^<]*(?:Corsa|Mokka|Grandland|Astra|Crossland|Combo|Vivaro|Zafira)[^<]*)<\/h[1-3]>/gi,
    /<h[1-3][^>]*>([^<]*(?:Swift|Vitara|S-Cross|Ignis|Jimny|Swace|Across)[^<]*)<\/h[1-3]>/gi,
    /<h[1-3][^>]*>([^<]*(?:CX-30|CX-5|CX-60|CX-80|Mazda3|Mazda2|MX-30|MX-5)[^<]*)<\/h[1-3]>/gi,
    /<h[1-3][^>]*>([^<]*(?:Civic|HR-V|ZR-V|CR-V|Jazz|e:Ny1)[^<]*)<\/h[1-3]>/gi,
    /<h[1-3][^>]*>([^<]*(?:MG4|MG5|ZS|HS|Marvel R)[^<]*)<\/h[1-3]>/gi,
    /<h[1-3][^>]*>([^<]*(?:Outback|Forester|Solterra|Crosstrek|Impreza|XV)[^<]*)<\/h[1-3]>/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1].trim();
      if (name && !vehicleNames.includes(name)) {
        vehicleNames.push(name);
      }
    }
  }

  return vehicleNames;
}

/**
 * Extract prices from HTML using regex patterns
 * For price-only mode to avoid AI costs
 */
export function extractPricesFromContent(content: string): Map<string, {
  price?: number;
  privatleasing?: number;
  companyLeasing?: number;
  loan?: number;
}> {
  const prices = new Map<string, any>();

  // Common Swedish price patterns
  const pricePatterns = [
    // "från X kr" or "från X SEK"
    /från\s+([\d\s]+)\s*(?:kr|sek|:-)/gi,
    // "X kr/mån" for leasing
    /([\d\s]+)\s*kr\/mån/gi,
    // "Pris: X kr"
    /pris[:\s]+([\d\s]+)\s*(?:kr|sek)/gi,
    // Numeric with space separators like "299 900"
    /\b(\d{2,3}\s?\d{3})\s*(?:kr|sek|:-)/gi,
  ];

  // This is a simplified version - the AI does this better
  // but this can be used for change detection

  return prices;
}

/**
 * Determine the optimal scrape mode based on existing data
 */
export async function determineScrapeMode(
  brand: string,
  formattedHtml: string,
  mainUrl: string
): Promise<SmartScrapeResult> {
  console.log(`🔍 [SmartScrape] Analyzing content for brand: ${brand}`);

  // Get existing vehicles for this brand
  const existingVehicles = await getExistingVehiclesForBrand(brand);
  console.log(`📊 [SmartScrape] Found ${existingVehicles.length} existing vehicles for ${brand}`);

  // Extract content sections with proper URL mapping
  const contentSections = extractContentSections(formattedHtml, mainUrl);
  console.log(`📄 [SmartScrape] Extracted ${contentSections.length} content sections`);

  // Detect vehicle names in the content
  const detectedNames = detectVehicleNamesInContent(formattedHtml);
  console.log(`🚗 [SmartScrape] Detected vehicle names: ${detectedNames.join(', ')}`);

  // Check if all detected vehicles already exist
  const existingTitles = existingVehicles.map(v => v.title.toLowerCase());
  const newVehicles = detectedNames.filter(name =>
    !existingTitles.some(title => title.includes(name.toLowerCase()) || name.toLowerCase().includes(title))
  );

  if (existingVehicles.length === 0) {
    // No existing data - full scrape needed
    return {
      mode: 'full',
      reason: 'No existing vehicles found for this brand - full AI analysis required',
      existingVehicles,
      contentSections,
    };
  }

  if (newVehicles.length > 0) {
    // New vehicles detected - full scrape needed
    return {
      mode: 'full',
      reason: `New vehicles detected: ${newVehicles.join(', ')} - full AI analysis required`,
      existingVehicles,
      contentSections,
      newVariants: newVehicles,
    };
  }

  // All vehicles exist - can use price-only mode
  return {
    mode: 'price_only',
    reason: `All ${detectedNames.length} vehicles already exist - using price-only extraction mode`,
    existingVehicles,
    contentSections,
  };
}

/**
 * Prepare HTML with explicit URL markers for each section
 * This helps Claude correctly assign source_url to each vehicle
 */
export function prepareHtmlWithUrlMarkers(contentSections: ContentSection[]): string {
  let preparedHtml = '';

  for (const section of contentSections) {
    preparedHtml += `\n<!-- ===== CONTENT FROM URL: ${section.url} ===== -->\n`;
    preparedHtml += `<!-- Page Title: ${section.title} -->\n`;
    preparedHtml += `<!-- Link Text: ${section.linkText} -->\n`;
    preparedHtml += section.content;
    preparedHtml += `\n<!-- ===== END CONTENT FROM: ${section.url} ===== -->\n\n`;
  }

  return preparedHtml;
}

/**
 * Create a price-only extraction prompt
 * Much smaller token count than full vehicle extraction
 */
export function createPriceOnlyPrompt(existingVehicles: ExistingVehicle[], brand: string): string {
  const vehicleList = existingVehicles.map(v => ({
    title: v.title,
    models: v.models.map(m => m.name),
  }));

  return `You are extracting ONLY price updates for known vehicles.

BRAND: ${brand}

EXISTING VEHICLES AND THEIR VARIANTS:
${JSON.stringify(vehicleList, null, 2)}

TASK: Extract ONLY the following for each variant:
- price (kontantpris/cash price in SEK)
- privatleasing (monthly private leasing in SEK)
- company_leasing_price (monthly company leasing in SEK)
- loan_price (monthly loan payment in SEK)
- old_price, old_privatleasing, old_company_leasing_price, old_loan_price (if discounted)

Also detect any NEW variants not in the list above.

Return JSON:
{
  "price_updates": [
    {
      "vehicle_title": "Corsa",
      "source_url": "URL where this was found",
      "variants": [
        {
          "name": "1.2 75hk Essential",
          "price": 229900,
          "old_price": null,
          "privatleasing": 2495,
          "old_privatleasing": null,
          "company_leasing_price": 1995,
          "old_company_leasing_price": null,
          "loan_price": 1850,
          "old_loan_price": null
        }
      ]
    }
  ],
  "new_variants": [
    {
      "vehicle_title": "Corsa",
      "variant_name": "1.2 100hk GS NEW",
      "source_url": "URL where found"
    }
  ]
}

IMPORTANT:
- Match variant names to existing ones (slight formatting differences are OK)
- Report ALL prices found, not just changes
- Include source_url from the <!-- URL: ... --> comment`;
}

/**
 * Compare extracted prices with existing data to find changes
 */
export function detectPriceChanges(
  existingVehicles: ExistingVehicle[],
  extractedPrices: any[]
): PriceChange[] {
  const changes: PriceChange[] = [];

  for (const update of extractedPrices) {
    const existingVehicle = existingVehicles.find(
      v => v.title.toLowerCase() === update.vehicle_title?.toLowerCase()
    );

    if (!existingVehicle) continue;

    for (const variant of update.variants || []) {
      const existingModel = existingVehicle.models.find(
        m => m.name.toLowerCase().includes(variant.name?.toLowerCase()) ||
             variant.name?.toLowerCase().includes(m.name.toLowerCase())
      );

      if (!existingModel) {
        // New variant detected
        changes.push({
          modelName: variant.name,
          field: 'price',
          oldValue: null,
          newValue: variant.price,
        });
        continue;
      }

      // Check each price field
      const fields: Array<{ key: 'price' | 'privatleasing' | 'company_leasing' | 'loan', extractKey: string }> = [
        { key: 'price', extractKey: 'price' },
        { key: 'privatleasing', extractKey: 'privatleasing' },
        { key: 'company_leasing', extractKey: 'company_leasing_price' },
        { key: 'loan', extractKey: 'loan_price' },
      ];

      for (const field of fields) {
        const oldValue = existingModel[field.key === 'company_leasing' ? 'company_leasing_price' : field.key] as number | null;
        const newValue = variant[field.extractKey];

        if (newValue && oldValue !== newValue) {
          changes.push({
            modelName: variant.name,
            field: field.key,
            oldValue,
            newValue,
          });
        }
      }
    }
  }

  return changes;
}
