/**
 * Two-Tier PDF Processing Service
 *
 * Tier 1 (Expensive - Custom Extractor): Full data extraction for new models
 * - Variants, equipment, specifications, all pricing options
 * - Used only when model doesn't have full data yet
 * - Cost: ~$0.10-0.30 per document + OCR
 *
 * Tier 2 (Cheap - Standard OCR): Price-only updates
 * - Only extracts current prices
 * - Used when model already has full data
 * - Cost: $1.50 per 1,000 pages
 *
 * Decision logic:
 * 1. Check if model exists in model_extraction_status table
 * 2. If exists with has_full_data=true → use standard OCR (cheap)
 * 3. If not exists or has_full_data=false → use custom extractor (expensive)
 */

import { getSupabaseServer } from './supabase/server';
import { extractWithCustomExtractor, isCustomExtractorEnabled, ExtractedVehicleData } from './google-custom-extractor';
import { extractTextWithDocumentAI, isDocumentAIEnabled } from './google-document-ai';

export interface ModelExtractionStatus {
  id: string;
  brand: string;
  model_name: string;
  has_full_data: boolean;
  has_variants: boolean;
  has_equipment: boolean;
  has_specifications: boolean;
  has_prices: boolean;
  source_pdf_url?: string;
  full_extraction_at?: string;
  last_price_update_at?: string;
}

export interface TwoTierExtractionResult {
  success: boolean;
  tier: 'custom' | 'standard_ocr' | 'none';
  reason: string;
  fullData?: ExtractedVehicleData;
  priceOnlyText?: string;
  error?: string;
  pageCount?: number;
  estimatedCost?: number;
  processingTimeMs: number;
}

/**
 * Check if a model needs full extraction or just price updates
 */
export async function checkModelExtractionStatus(
  brand: string,
  modelName: string
): Promise<ModelExtractionStatus | null> {
  try {
    const supabase = await getSupabaseServer();

    const { data, error } = await supabase
      .from('model_extraction_status')
      .select('*')
      .eq('brand', brand)
      .eq('model_name', modelName)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error checking model extraction status:', error);
      return null;
    }

    return data as ModelExtractionStatus | null;
  } catch (error) {
    console.error('Error in checkModelExtractionStatus:', error);
    return null;
  }
}

/**
 * Update model extraction status after successful extraction
 */
export async function updateModelExtractionStatus(
  brand: string,
  modelName: string,
  status: Partial<ModelExtractionStatus>,
  pdfUrl?: string
): Promise<void> {
  try {
    const supabase = await getSupabaseServer();

    const { error } = await supabase
      .from('model_extraction_status')
      .upsert({
        brand,
        model_name: modelName,
        ...status,
        source_pdf_url: pdfUrl,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'brand,model_name',
      });

    if (error) {
      console.error('Error updating model extraction status:', error);
    }
  } catch (error) {
    console.error('Error in updateModelExtractionStatus:', error);
  }
}

/**
 * Record price update timestamp
 */
export async function recordPriceUpdate(
  brand: string,
  modelName: string
): Promise<void> {
  try {
    const supabase = await getSupabaseServer();

    await supabase
      .from('model_extraction_status')
      .update({
        last_price_update_at: new Date().toISOString(),
        has_prices: true,
      })
      .eq('brand', brand)
      .eq('model_name', modelName);
  } catch (error) {
    console.error('Error recording price update:', error);
  }
}

/**
 * Main two-tier extraction function
 *
 * NOTE: Custom Extractor is temporarily DISABLED while it's being reconfigured
 * with nested labels in Google Document AI console. Currently only using Standard OCR.
 *
 * Decides which tier to use based on existing model data
 */
export async function extractPDFWithTwoTierSystem(
  pdfUrl: string,
  brand: string,
  modelName: string,
  forceFullExtraction: boolean = false
): Promise<TwoTierExtractionResult> {
  const startTime = Date.now();

  console.log(`📄 [PDF Processing] Processing: ${brand} ${modelName}`);
  console.log(`   PDF: ${pdfUrl}`);

  // CUSTOM EXTRACTOR DISABLED: Being reconfigured with nested labels
  // TODO: Re-enable once Custom Extractor schema is updated in Google Document AI console
  // The custom extractor is being reconfigured to use nested labels (VehicleDocument -> Variant -> prices/specs)
  // to properly correlate data with specific variants instead of flat entity lists
  const CUSTOM_EXTRACTOR_ENABLED = false;

  if (CUSTOM_EXTRACTOR_ENABLED && forceFullExtraction && isCustomExtractorEnabled()) {
    // This block is currently disabled - will be re-enabled after schema update
    console.log(`🔧 Custom Extractor is disabled - using Standard OCR instead`);
  }

  // Use Standard OCR for all PDF processing
  if (isDocumentAIEnabled()) {
    const reason = 'Using Standard OCR (Custom Extractor temporarily disabled for reconfiguration)';

    console.log(`📄 Using STANDARD OCR - ${reason}`);

    const result = await extractTextWithDocumentAI(pdfUrl);

    if (result.success && result.text) {
      // Record price update
      await recordPriceUpdate(brand, modelName);

      return {
        success: true,
        tier: 'standard_ocr',
        reason,
        priceOnlyText: result.text,
        pageCount: result.pageCount,
        estimatedCost: result.pageCount ? (result.pageCount / 1000) * 1.50 : undefined,
        processingTimeMs: Date.now() - startTime,
      };
    } else {
      return {
        success: false,
        tier: 'none',
        reason: 'Both extraction methods failed',
        error: result.error,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  return {
    success: false,
    tier: 'none',
    reason: 'No extraction method available',
    error: 'Neither Custom Extractor nor Standard OCR is configured',
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Batch check for multiple models - useful before scraping
 */
export async function checkMultipleModelsStatus(
  models: Array<{ brand: string; modelName: string }>
): Promise<Map<string, ModelExtractionStatus>> {
  try {
    const supabase = await getSupabaseServer();

    // Build query for all brand/model combinations
    const { data, error } = await supabase
      .from('model_extraction_status')
      .select('*');

    if (error) {
      console.error('Error fetching model statuses:', error);
      return new Map();
    }

    const statusMap = new Map<string, ModelExtractionStatus>();
    for (const status of (data || [])) {
      const key = `${status.brand}:${status.model_name}`;
      statusMap.set(key, status as ModelExtractionStatus);
    }

    return statusMap;
  } catch (error) {
    console.error('Error in checkMultipleModelsStatus:', error);
    return new Map();
  }
}

/**
 * Get extraction cost summary for reporting
 */
export function getExtractionCostSummary(results: TwoTierExtractionResult[]): {
  totalCost: number;
  customExtractions: number;
  standardExtractions: number;
  pageCount: number;
} {
  let totalCost = 0;
  let customExtractions = 0;
  let standardExtractions = 0;
  let pageCount = 0;

  for (const result of results) {
    if (result.estimatedCost) {
      totalCost += result.estimatedCost;
    }
    if (result.pageCount) {
      pageCount += result.pageCount;
    }
    if (result.tier === 'custom') {
      customExtractions++;
    } else if (result.tier === 'standard_ocr') {
      standardExtractions++;
    }
  }

  return {
    totalCost,
    customExtractions,
    standardExtractions,
    pageCount,
  };
}
