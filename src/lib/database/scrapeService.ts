import { supabase } from '@/lib/supabase/client'
import { getSupabaseServer } from '@/lib/supabase/server'
import { Database } from './types'
import { ScrapeResult, LinkedContent } from '@/lib/scraper'
import { ProcessedResult, CampaignData, VehicleData } from '@/lib/ai-processor-types'
import { deduplicateVariants, VariantData } from '@/lib/variant-deduplication'

/**
 * Clean thumbnail URL by:
 * 1. Decoding HTML entities (&amp; -> &)
 * 2. Stripping small resize parameters to get original image
 */
function cleanThumbnailUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Decode HTML entities
  let cleanUrl = url
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Strip small resize parameters to get original image
  if (cleanUrl.includes('?') && (cleanUrl.includes('width=') || cleanUrl.includes('height='))) {
    const widthMatch = cleanUrl.match(/[?&]width=(\d+)/i);
    const urlWidth = widthMatch ? parseInt(widthMatch[1], 10) : 0;

    // If it's a small thumbnail (width < 500), strip params to get original
    if (urlWidth > 0 && urlWidth < 500) {
      cleanUrl = cleanUrl.split('?')[0];
    }
  }

  return cleanUrl;
}

type Tables = Database['public']['Tables']
type ScrapeSession = Tables['scrape_sessions']['Row']
type ScrapedContent = Tables['scraped_content']['Row']
type AIProcessedResult = Tables['ai_processed_results']['Row']

export class ScrapeService {
  private supabase: any
  private useServerClient: boolean

  constructor(useServerClient = false) {
    this.useServerClient = useServerClient
    if (!useServerClient) {
      this.supabase = supabase
    }
  }

  private async getClient() {
    if (this.useServerClient) {
      return await getSupabaseServer()
    }
    return this.supabase
  }

  // Create a new scraping session
  async createScrapeSession(userId: string, url: string, brand?: string): Promise<string> {
    const client = await this.getClient()
    const { data, error } = await client
      .from('scrape_sessions')
      .insert({
        user_id: userId,
        url,
        brand: brand || null,
        status: 'pending'
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to create scrape session: ${error.message}`)
    return data.id
  }

  // Save URL-brand mapping to registry (updated for new schema)
  async saveUrlBrandMapping(
    url: string,
    brand: string,
    contentType: 'campaigns' | 'cars' | 'transport_cars' | 'model_page',
    options?: {
      label?: string;
      modelName?: string;
      pdfPricelistId?: string;
      userId?: string;
    }
  ): Promise<string> {
    const client = await this.getClient()

    // Upsert to handle duplicates
    const { data, error } = await client
      .from('url_brand_registry')
      .upsert({
        url,
        brand,
        content_type: contentType,
        label: options?.label || null,
        model_name: options?.modelName || null,
        pdf_pricelist_id: options?.pdfPricelistId || null,
        created_by: options?.userId || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'url,brand'
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to save URL-brand mapping: ${error.message}`)
    return data.id
  }

  // Get all URL-brand mappings for a brand
  async getUrlsForBrand(brand: string): Promise<any[]> {
    const client = await this.getClient()
    const { data, error } = await client
      .from('url_brand_registry')
      .select('*')
      .eq('brand', brand)
      .eq('is_active', true)
      .order('content_type')

    if (error) throw new Error(`Failed to get URLs for brand: ${error.message}`)
    return data || []
  }

  // Get all registered URLs
  async getAllRegisteredUrls(): Promise<any[]> {
    const client = await this.getClient()
    const { data, error } = await client
      .from('url_brand_registry')
      .select('*')
      .eq('is_active', true)
      .order('brand')
      .order('content_type')

    if (error) throw new Error(`Failed to get registered URLs: ${error.message}`)
    return data || []
  }

  // ============================================
  // PDF Pricelists methods (new table)
  // ============================================

  // Create or update a PDF pricelist entry
  async upsertPdfPricelist(
    pdfUrl: string,
    brand: string,
    options?: {
      modelName?: string;
      sourceType?: 'product_page' | 'pdf_hub' | 'direct_link' | 'manual';
      sourceUrl?: string;
      label?: string;
      validFrom?: Date;
      validTo?: Date;
      contentHash?: string;
      fileSizeBytes?: number;
      extractedPrices?: any;
    }
  ): Promise<string> {
    const client = await this.getClient()

    const { data, error } = await client
      .from('pdf_pricelists')
      .upsert({
        pdf_url: pdfUrl,
        brand,
        model_name: options?.modelName || null,
        source_type: options?.sourceType || 'manual',
        source_url: options?.sourceUrl || null,
        label: options?.label || null,
        valid_from: options?.validFrom?.toISOString().split('T')[0] || null,
        valid_to: options?.validTo?.toISOString().split('T')[0] || null,
        content_hash: options?.contentHash || null,
        file_size_bytes: options?.fileSizeBytes || null,
        extracted_prices: options?.extractedPrices || null,
        last_checked_at: new Date().toISOString(),
        parse_status: options?.extractedPrices ? 'success' : 'pending',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'pdf_url,brand'
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to upsert PDF pricelist: ${error.message}`)
    return data.id
  }

  // Update PDF hash for change detection (now in pdf_pricelists table)
  async updatePdfHash(pdfPricelistId: string, contentHash: string, fileSizeBytes?: number): Promise<void> {
    const client = await this.getClient()
    const { error } = await client
      .from('pdf_pricelists')
      .update({
        content_hash: contentHash,
        file_size_bytes: fileSizeBytes || null,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', pdfPricelistId)

    if (error) throw new Error(`Failed to update PDF hash: ${error.message}`)
  }

  // Get PDF pricelists for a brand
  async getPdfPricelistsForBrand(brand: string): Promise<any[]> {
    const client = await this.getClient()
    const { data, error } = await client
      .from('pdf_pricelists')
      .select('*')
      .eq('brand', brand)
      .eq('is_active', true)
      .order('model_name')

    if (error) throw new Error(`Failed to get PDF pricelists: ${error.message}`)
    return data || []
  }

  // Get PDF pricelists that need checking
  async getPdfPricelistsToCheck(): Promise<any[]> {
    const client = await this.getClient()

    // Get pricelists where last_checked_at + check_frequency_hours < now
    const { data, error } = await client
      .from('pdf_pricelists')
      .select('*')
      .eq('is_active', true)
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .limit(20)

    if (error) throw new Error(`Failed to get PDF pricelists to check: ${error.message}`)
    return data || []
  }

  // Update extracted prices from PDF
  async updateExtractedPrices(pdfPricelistId: string, prices: any): Promise<void> {
    const client = await this.getClient()
    const { error } = await client
      .from('pdf_pricelists')
      .update({
        extracted_prices: {
          extracted_at: new Date().toISOString(),
          ...prices
        },
        parse_status: 'success',
        parse_error: null,
        last_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', pdfPricelistId)

    if (error) throw new Error(`Failed to update extracted prices: ${error.message}`)
  }

  // Mark PDF parsing as failed
  async markPdfParseFailed(pdfPricelistId: string, errorMessage: string): Promise<void> {
    const client = await this.getClient()
    const { error } = await client
      .from('pdf_pricelists')
      .update({
        parse_status: 'failed',
        parse_error: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq('id', pdfPricelistId)

    if (error) throw new Error(`Failed to mark PDF parse failed: ${error.message}`)
  }

  // ============================================
  // Brand Sources methods (new table)
  // ============================================

  // Get brand source configuration
  async getBrandSource(brand: string): Promise<any | null> {
    const client = await this.getClient()
    const { data, error } = await client
      .from('brand_sources')
      .select('*')
      .eq('brand', brand)
      .eq('is_active', true)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get brand source: ${error.message}`)
    }
    return data || null
  }

  // Get all active brand sources
  async getAllBrandSources(): Promise<any[]> {
    const client = await this.getClient()
    const { data, error } = await client
      .from('brand_sources')
      .select('*')
      .eq('is_active', true)
      .order('display_order')

    if (error) throw new Error(`Failed to get brand sources: ${error.message}`)
    return data || []
  }

  // Update brand source configuration
  async updateBrandSource(
    brand: string,
    updates: {
      pdfHubUrl?: string;
      modelsPageUrl?: string;
      campaignsPageUrl?: string;
      pdfParserConfig?: any;
      logoUrl?: string;
    }
  ): Promise<void> {
    const client = await this.getClient()
    const { error } = await client
      .from('brand_sources')
      .update({
        pdf_hub_url: updates.pdfHubUrl,
        models_page_url: updates.modelsPageUrl,
        campaigns_page_url: updates.campaignsPageUrl,
        pdf_parser_config: updates.pdfParserConfig,
        logo_url: updates.logoUrl,
        updated_at: new Date().toISOString()
      })
      .eq('brand', brand)

    if (error) throw new Error(`Failed to update brand source: ${error.message}`)
  }

  // Update scrape session with page info
  async updateScrapeSessionWithPageInfo(
    sessionId: string,
    pageInfo: {
      title: string
      description: string
      contentLength: number
      linksFound: number
      linksFetched: number
    }
  ): Promise<void> {
    const client = await this.getClient()
    const { error } = await client
      .from('scrape_sessions')
      .update({
        page_title: pageInfo.title,
        page_description: pageInfo.description,
        content_length: pageInfo.contentLength,
        links_found: pageInfo.linksFound,
        links_fetched: pageInfo.linksFetched,
        status: 'processing'
      })
      .eq('id', sessionId)

    if (error) throw new Error(`Failed to update scrape session: ${error.message}`)
  }

  // Save scraped content
  async saveScrapeResult(sessionId: string, result: ScrapeResult): Promise<string[]> {
    const contentIds: string[] = []

    // Save main scraped data
    for (const data of result.structuredData) {
      const client = await this.getClient()
      const { data: scraped, error } = await client
        .from('scraped_content')
        .insert({
          session_id: sessionId,
          url: result.url,
          title: data.title,
          cleaned_html: result.cleanedHtml,
          raw_html: data.rawHtml,
          thumbnail_url: cleanThumbnailUrl(data.image),
          price: data.price,
          year: data.year,
          mileage: data.mileage,
          content: data.content
        })
        .select('id')
        .single()

      if (error) {
        console.error('Failed to save scraped content:', error)
        continue
      }
      contentIds.push(scraped.id)
    }

    // Save linked content
    if (result.linkedContent) {
      await this.saveLinkedContent(sessionId, result.linkedContent)
    }

    return contentIds
  }

  // Save linked content
  async saveLinkedContent(sessionId: string, linkedContent: LinkedContent[]): Promise<void> {
    const linkedItems = linkedContent.map(item => ({
      session_id: sessionId,
      url: item.url,
      title: item.title,
      content: item.content,
      cleaned_html: item.cleanedHtml,
      link_text: item.linkText,
      success: item.success,
      error_message: item.error
    }))

    const client = await this.getClient()
    const { error } = await client
      .from('linked_content')
      .insert(linkedItems)

    if (error) {
      console.error('Failed to save linked content:', error)
    }
  }

  // Save AI processed results
  async saveAIProcessedResult(
    sessionId: string,
    scrapedContentId: string | null,
    result: ProcessedResult,
    processingTimeMs?: number,
    factCheckData?: {
      score: number
      confidence: 'high' | 'medium' | 'low'
      issues: any[]
      verifiedFields: string[]
    }
  ): Promise<string> {
    const client = await this.getClient()
    // Calculate total cost from all API calls
    let totalCost = 0;
    const apiCallDetails = [];
    
    if (result.api_calls) {
      for (const call of result.api_calls) {
        totalCost += call.token_usage.estimated_cost_usd;
        apiCallDetails.push(call);
      }
    } else if (result.token_usage?.estimated_cost_usd) {
      totalCost = result.token_usage.estimated_cost_usd;
    } else if (result.token_usage) {
      // Fallback: calculate cost if not provided
      const inputTokens = result.token_usage.prompt_tokens || result.token_usage.inputTokens || 0;
      const outputTokens = result.token_usage.completion_tokens || result.token_usage.outputTokens || 0;
      const model = result.token_usage.model_used || 'claude-sonnet-4-5';

      // Calculate cost based on model
      if (model.includes('claude-sonnet-4') || model.includes('claude-sonnet')) {
        // Claude Sonnet 4.5 pricing
        totalCost = (inputTokens * 3.0 / 1000000) + (outputTokens * 15.0 / 1000000);
      } else if (model.includes('claude-haiku')) {
        // Claude Haiku 3.5 pricing
        totalCost = (inputTokens * 0.8 / 1000000) + (outputTokens * 4.0 / 1000000);
      } else if (model.includes('claude-opus')) {
        // Claude Opus 4 pricing
        totalCost = (inputTokens * 15.0 / 1000000) + (outputTokens * 75.0 / 1000000);
      } else if (model.includes('gpt-4o-mini')) {
        totalCost = (inputTokens * 0.15 / 1000000) + (outputTokens * 0.6 / 1000000);
      } else if (model.includes('gpt-4o')) {
        totalCost = (inputTokens * 2.5 / 1000000) + (outputTokens * 10.0 / 1000000);
      } else if (model.includes('gpt-4')) {
        totalCost = (inputTokens * 30.0 / 1000000) + (outputTokens * 60.0 / 1000000);
      } else if (model.includes('sonar')) {
        // Perplexity Sonar pricing (approximate)
        totalCost = (inputTokens * 1.0 / 1000000) + (outputTokens * 1.0 / 1000000);
      }

      console.log(`💰 Calculated missing cost for ${model}: $${totalCost.toFixed(6)} (${inputTokens}+${outputTokens} tokens)`);
    }

    // Add Google OCR costs to total if present
    const googleOcrCosts = (result as any).google_ocr_costs;
    if (googleOcrCosts?.total_cost_usd) {
      totalCost += googleOcrCosts.total_cost_usd;
      console.log(`💰 Added Google OCR cost: $${googleOcrCosts.total_cost_usd.toFixed(6)} (${googleOcrCosts.total_pages} pages)`);
    }

    const { data, error } = await client
      .from('ai_processed_results')
      .insert({
        session_id: sessionId,
        scraped_content_id: scrapedContentId,
        content_type: result.content_type,
        success: result.success,
        token_usage: result.token_usage || null,
        processing_time_ms: processingTimeMs,
        model_used: result.token_usage?.model_used || 'claude-sonnet-4-5',
        fact_check_score: factCheckData?.score,
        fact_check_confidence: factCheckData?.confidence,
        fact_check_issues: factCheckData?.issues || null,
        verified_fields: factCheckData?.verifiedFields,
        pdf_processing: (result as any).pdf_processing || null,
        debug_info: (result as any).debug_info || null,
        error_message: result.error,
        total_estimated_cost_usd: totalCost > 0 ? totalCost : null,
        api_calls: apiCallDetails.length > 0 ? apiCallDetails : null,
        google_ocr_costs: googleOcrCosts || null,
        raw_pdf_text: (result as any).raw_pdf_text || null,
        custom_extractor_data: (result as any).custom_extractor_data || null,
        two_tier_results: (result as any).two_tier_results || null
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to save AI processed result: ${error.message}`)
    
    // Log cost information
    if (totalCost > 0) {
      console.log(`💰 Stored AI result with total cost: $${totalCost.toFixed(6)}`);
    }
    
    return data.id
  }

  // Update scraped content with PDF tracking data
  async updateScrapedContentPdfTracking(
    scrapedContentId: string, 
    pdfProcessingResult: {
      url: string;
      filename: string;
      success: boolean;
      extractedText?: string;
      processingTimeMs: number;
      metadata?: any;
      structuredContent?: any;
      enhancedContent?: string;
      error?: string;
    },
    pdfLinks?: string[],
    totalCount?: number,
    successCount?: number,
    allMetadata?: any[],
    fileHashes?: string[]
  ): Promise<void> {
    const client = await this.getClient()
    
    // Determine status based on success and counts
    let status: 'not_found' | 'pending' | 'success' | 'failed' | 'partial';
    if (!pdfLinks || pdfLinks.length === 0) {
      status = 'not_found';
    } else if (!successCount || successCount === 0) {
      status = 'failed';
    } else if (successCount === totalCount) {
      status = 'success';
    } else {
      status = 'partial';
    }
    
    const { error } = await client
      .from('scraped_content')
      .update({
        pdf_links_found: pdfLinks || [],
        pdf_processing_status: status,
        pdf_success_count: successCount || 0,
        pdf_total_count: totalCount || 0,
        pdf_extracted_content: pdfProcessingResult.extractedText || '',
        pdf_processing_errors: pdfProcessingResult.error ? [pdfProcessingResult.error] : [],
        pdf_processing_time_ms: pdfProcessingResult.processingTimeMs,
        pdf_last_attempted: new Date().toISOString(),
        pdf_metadata: allMetadata || (pdfProcessingResult.metadata ? [pdfProcessingResult.metadata] : null),
        pdf_file_hashes: fileHashes || [],
        pdf_retry_count: (pdfProcessingResult as any).retryAttempt || 0,
        pdf_last_retry_at: (pdfProcessingResult as any).retryAttempt && (pdfProcessingResult as any).retryAttempt > 0 ? new Date().toISOString() : null,
        pdf_retryable_failures: (pdfProcessingResult as any).retryable && pdfProcessingResult.error ? [pdfProcessingResult.error] : null
      })
      .eq('id', scrapedContentId)

    if (error) {
      console.error('Failed to update PDF tracking data:', error)
      throw new Error(`Failed to update PDF tracking data: ${error.message}`)
    }

    console.log(`📄 Updated PDF tracking for scraped content ${scrapedContentId}: ${status} (${successCount || 0}/${totalCount || 0})`)
  }

  // Get scraped content by ID
  async getScrapedContentById(id: string): Promise<any | null> {
    const client = await this.getClient()
    
    const { data, error } = await client
      .from('scraped_content')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error(`Failed to get scraped content ${id}:`, error)
      return null
    }

    return data
  }

  // Get scraped content by session ID
  async getScrapedContentBySessionId(sessionId: string): Promise<any[]> {
    const client = await this.getClient()
    
    const { data, error } = await client
      .from('scraped_content')
      .select('*')
      .eq('session_id', sessionId)

    if (error) {
      console.error(`Failed to get scraped content for session ${sessionId}:`, error)
      return []
    }

    return data || []
  }

  // Update saved link cost tracking
  async updateSavedLinkCostTracking(linkId: string, scrapeCost: number): Promise<void> {
    const client = await this.getClient()
    
    // Use the database function to update cost tracking
    const { error } = await client.rpc('update_saved_link_cost', {
      link_id: linkId,
      scrape_cost: scrapeCost
    })
    
    if (error) {
      console.error('Failed to update saved link cost tracking:', error)
    } else {
      console.log(`💰 Updated cost tracking for link ${linkId}: $${scrapeCost.toFixed(6)}`)
    }
  }

  // Save campaigns from AI processing
  async saveCampaigns(sessionId: string, aiResultId: string, campaigns: CampaignData[]): Promise<void> {
    const client = await this.getClient()
    for (const campaign of campaigns) {
      // Save campaign
      const { data: campaignData, error: campaignError } = await client
        .from('campaigns')
        .insert({
          ai_result_id: aiResultId,
          session_id: sessionId,
          title: campaign.title,
          description: campaign.description,
          content: campaign.content,
          thumbnail_url: cleanThumbnailUrl(campaign.thumbnail),
          brand: campaign.brand,
          campaign_start: campaign.campaign_start,
          campaign_end: campaign.campaign_end,
          free_text: campaign.free_text
        })
        .select('id')
        .single()

      if (campaignError) {
        console.error('Failed to save campaign:', campaignError)
        continue
      }

      // Save campaign vehicle models
      if (campaign.vehicle_model?.length > 0) {
        const vehicleModels = campaign.vehicle_model.map(model => ({
          campaign_id: campaignData.id,
          name: model.name,
          price: model.price,
          old_price: model.old_price,
          privatleasing: model.privatleasing,
          old_privatleasing: model.old_privatleasing,
          company_leasing_price: model.company_leasing_price,
          old_company_leasing_price: model.old_company_leasing_price,
          loan_price: model.loan_price,
          old_loan_price: model.old_loan_price,
          thumbnail_url: cleanThumbnailUrl(model.thumbnail)
        }))

        const { error: modelsError } = await client
          .from('campaign_vehicle_models')
          .insert(vehicleModels)

        if (modelsError) {
          console.error('Failed to save campaign vehicle models:', modelsError)
        }
      }

      // Save campaign included items
      if (campaign.whats_included?.length > 0) {
        const includedItems = campaign.whats_included.map(item => ({
          campaign_id: campaignData.id,
          name: item.name,
          description: item.description
        }))

        const { error: includedError } = await client
          .from('campaign_included_items')
          .insert(includedItems)

        if (includedError) {
          console.error('Failed to save campaign included items:', includedError)
        }
      }
    }
  }

  /**
   * Normalize vehicle title for comparison
   * Handles electric variant naming (e-208 → 208, e-Corsa → Corsa)
   */
  private normalizeVehicleTitle(title: string): string {
    if (!title) return ''
    return title
      // Remove "e-" prefix from electric variants (e-208 → 208, e-Corsa → Corsa)
      .replace(/^e-/i, '')
      // Remove "Electric" suffix
      .replace(/\s*Electric$/i, '')
      // Remove "EV" suffix
      .replace(/\s*EV$/i, '')
      .trim()
  }

  /**
   * Pre-process vehicles to merge duplicates before saving
   * Merges vehicles with same normalized title (e.g., e-208 into 208)
   */
  private mergeVehicleDuplicates(vehicles: VehicleData[]): VehicleData[] {
    const vehicleMap = new Map<string, VehicleData>()

    for (const vehicle of vehicles) {
      const normalizedTitle = this.normalizeVehicleTitle(vehicle.title)
      const key = `${(vehicle.brand || '').toLowerCase()}::${normalizedTitle.toLowerCase()}`

      if (vehicleMap.has(key)) {
        const existing = vehicleMap.get(key)!
        console.log(`🔄 Merging "${vehicle.title}" into "${existing.title}"`)

        // Prefer the shorter/base title (208 over e-208)
        if (vehicle.title.length < existing.title.length) {
          existing.title = vehicle.title
        }

        // Merge variants
        const existingVariants = existing.variants || existing.vehicle_model || []
        const incomingVariants = vehicle.variants || vehicle.vehicle_model || []

        // Add incoming variants that don't exist in existing
        for (const incoming of incomingVariants) {
          const exists = existingVariants.some(v =>
            v.name.toLowerCase() === incoming.name.toLowerCase()
          )
          if (!exists) {
            existingVariants.push(incoming)
          } else {
            // Merge equipment if existing variant has empty equipment
            const existingVariant = existingVariants.find(v =>
              v.name.toLowerCase() === incoming.name.toLowerCase()
            )
            if (existingVariant && (!existingVariant.equipment || existingVariant.equipment.length === 0)) {
              if (incoming.equipment && incoming.equipment.length > 0) {
                existingVariant.equipment = incoming.equipment
              }
            }
          }
        }

        existing.variants = existingVariants
        existing.vehicle_model = existingVariants

        // Merge other fields if existing is empty
        if (!existing.description && vehicle.description) existing.description = vehicle.description
        if (!existing.thumbnail && vehicle.thumbnail) existing.thumbnail = cleanThumbnailUrl(vehicle.thumbnail)
        if (!existing.body_type && vehicle.body_type) existing.body_type = vehicle.body_type

      } else {
        vehicleMap.set(key, { ...vehicle })
      }
    }

    const merged = Array.from(vehicleMap.values())
    if (merged.length < vehicles.length) {
      console.log(`🔄 Merged ${vehicles.length} vehicles into ${merged.length}`)
    }
    return merged
  }

  // Save vehicles from AI processing - uses UPSERT to prevent duplicates
  async saveVehicles(sessionId: string, aiResultId: string, vehicles: VehicleData[], vehicleType: 'cars' | 'transport_cars'): Promise<void> {
    const client = await this.getClient()

    // Pre-process: merge duplicate vehicles (e.g., e-208 into 208)
    const mergedVehicles = this.mergeVehicleDuplicates(vehicles)

    for (const vehicle of mergedVehicles) {
      let vehicleId: string

      // Normalize title for comparison
      const normalizedTitle = this.normalizeVehicleTitle(vehicle.title)

      // First, try to find existing vehicle by brand + title (exact or normalized)
      // Try exact title first
      let existingVehicle: { id: string; title: string } | null = null

      const { data: exactMatch } = await client
        .from('vehicles')
        .select('id, title')
        .ilike('brand', vehicle.brand || '')
        .ilike('title', vehicle.title)
        .single()

      if (exactMatch) {
        existingVehicle = exactMatch
      } else {
        // Try normalized title (handles e-208 matching 208)
        const { data: normalizedMatch } = await client
          .from('vehicles')
          .select('id, title')
          .ilike('brand', vehicle.brand || '')
          .ilike('title', normalizedTitle)
          .single()

        if (normalizedMatch) {
          existingVehicle = normalizedMatch
          console.log(`🔗 Found existing vehicle "${normalizedMatch.title}" for "${vehicle.title}"`)
        } else {
          // Try matching with e- prefix (if current is "208", find "e-208")
          const { data: electricMatch } = await client
            .from('vehicles')
            .select('id, title')
            .ilike('brand', vehicle.brand || '')
            .ilike('title', `e-${normalizedTitle}`)
            .single()

          if (electricMatch) {
            existingVehicle = electricMatch
            console.log(`🔗 Found electric variant "${electricMatch.title}" for "${vehicle.title}", will merge`)
          }
        }
      }

      // Prepare new schema fields for vehicle
      const vehicleNewSchemaFields = {
        dimensions: vehicle.dimensions || null,
        colors: vehicle.colors || [],
        interiors: vehicle.interiors || [],
        options: vehicle.options || [],
        accessories: vehicle.accessories || [],
        services: vehicle.services || [],
        connected_services: vehicle.connected_services || null,
        financing: vehicle.financing || null,
        warranties: vehicle.warranties || [],
        dealer_info: vehicle.dealer_info || null,
        variant_count: vehicle.variant_count || vehicle.variants?.length || vehicle.vehicle_model?.length || 0
      }

      if (existingVehicle) {
        // Update existing vehicle
        vehicleId = existingVehicle.id

        // Prefer the base title (208) over electric variant (e-208)
        const baseTitle = normalizedTitle.length < existingVehicle.title.length
          ? normalizedTitle
          : (vehicle.title.length < existingVehicle.title.length ? vehicle.title : existingVehicle.title)

        const { error: updateError } = await client
          .from('vehicles')
          .update({
            ai_result_id: aiResultId,
            session_id: sessionId,
            title: baseTitle, // Update to base title if shorter
            description: vehicle.description || undefined,
            thumbnail_url: cleanThumbnailUrl(vehicle.thumbnail) || undefined,
            vehicle_type: vehicleType,
            body_type: vehicle.body_type || undefined,
            free_text: vehicle.free_text || undefined,
            source_url: vehicle.source_url || undefined,
            pdf_source_url: vehicle.pdf_source_url || undefined,
            updated_at: new Date().toISOString(),
            // NEW SCHEMA: Add rich extracted data
            ...vehicleNewSchemaFields
          })
          .eq('id', vehicleId)

        if (updateError) {
          console.error('Failed to update vehicle:', updateError)
          continue
        }
        console.log(`📝 Updated existing vehicle: ${vehicle.brand} ${baseTitle} (${vehicleNewSchemaFields.variant_count} variants, ${vehicleNewSchemaFields.colors?.length || 0} colors, ${vehicleNewSchemaFields.warranties?.length || 0} warranties)`)
      } else {
        // Insert new vehicle with normalized title (208 instead of e-208)
        const titleToInsert = normalizedTitle.length > 0 ? normalizedTitle : vehicle.title

        const { data: vehicleData, error: vehicleError } = await client
          .from('vehicles')
          .insert({
            ai_result_id: aiResultId,
            session_id: sessionId,
            title: titleToInsert,
            brand: vehicle.brand,
            description: vehicle.description,
            thumbnail_url: cleanThumbnailUrl(vehicle.thumbnail),
            vehicle_type: vehicleType,
            body_type: vehicle.body_type,
            free_text: vehicle.free_text,
            source_url: vehicle.source_url,
            pdf_source_url: vehicle.pdf_source_url,
            // NEW SCHEMA: Add rich extracted data
            ...vehicleNewSchemaFields
          })
          .select('id')
          .single()

        if (vehicleError) {
          console.error('Failed to save vehicle:', vehicleError)
          continue
        }
        vehicleId = vehicleData.id
        console.log(`✅ Created new vehicle: ${vehicle.brand} ${titleToInsert} (${vehicleNewSchemaFields.variant_count} variants, ${vehicleNewSchemaFields.colors?.length || 0} colors, ${vehicleNewSchemaFields.warranties?.length || 0} warranties)`)
      }

      // Save/update vehicle models - support both variants (new) and vehicle_model (legacy)
      const rawModels = vehicle.variants || vehicle.vehicle_model || []

      // Deduplicate variants before saving (handles "Elektrisk 100kW" vs "Elektrisk 100kW Steglös Automat")
      const modelsToSave = rawModels.length > 0
        ? deduplicateVariants(rawModels as VariantData[], 0.80) // Higher threshold - only merge near-identical variants
        : []

      if (modelsToSave.length > 0) {
        // CLEAN SLATE: Delete ALL existing variants for this vehicle before re-saving
        // This prevents duplicate accumulation from multiple scrapes
        const { data: existingModels } = await client
          .from('vehicle_models')
          .select('id, name')
          .eq('vehicle_id', vehicleId)

        const existingModelsList = existingModels || []

        if (existingModelsList.length > 0) {
          console.log(`   🧹 Deleting ${existingModelsList.length} existing variants for clean re-save`)
          const { error: deleteError } = await client
            .from('vehicle_models')
            .delete()
            .eq('vehicle_id', vehicleId)

          if (deleteError) {
            console.error(`   ❌ Failed to delete existing variants:`, deleteError.message)
          }
        }

        // Now insert all new variants fresh (no matching needed - clean slate)
        console.log(`   📥 Inserting ${modelsToSave.length} variants`)

        for (const model of modelsToSave) {
          // Map from both new variants format and legacy vehicle_model format
          const modelData = {
            vehicle_id: vehicleId,
            name: model.name,
            price: model.price ?? null,
            old_price: model.old_price ?? null,
            privatleasing: model.privatleasing ?? null,
            old_privatleasing: model.old_privatleasing ?? null,
            company_leasing_price: model.company_leasing ?? model.company_leasing_price ?? null,
            old_company_leasing_price: model.old_company_leasing ?? model.old_company_leasing_price ?? null,
            loan_price: model.loan_price ?? null,
            old_loan_price: model.old_loan_price ?? null,
            thumbnail_url: cleanThumbnailUrl(model.thumbnail) ?? null,
            // Legacy fields (still supported)
            bransle: model.bransle ?? model.fuel_type ?? null,
            biltyp: model.biltyp ?? model.car_type ?? null,
            vaxellada: model.vaxellada ?? model.transmission ?? null,
            utrustning: model.utrustning ?? model.equipment ?? null,
            // NEW SCHEMA: Additional fields
            specs: model.specs ?? null,
            fuel_type: model.fuel_type ?? model.bransle ?? null,
            transmission: model.transmission ?? model.vaxellada ?? null,
            equipment: model.equipment ?? model.utrustning ?? []
          }

          const { error: insertError } = await client
            .from('vehicle_models')
            .insert(modelData)

          if (insertError) {
            console.error('Failed to save vehicle model:', insertError)
          } else {
            console.log(`   ✅ Created model: ${model.name} (equipment: ${(model.equipment?.length || model.utrustning?.length || 0)} items)`)
          }
        }
      }
    }
  }

  // Complete a scrape session
  async completeScrapeSession(
    sessionId: string,
    contentType: string,
    totalItems: number,
    successItems: number,
    failedItems: number,
    error?: string
  ): Promise<void> {
    const client = await this.getClient()
    
    // Validate content_type against database constraints
    const validContentTypes = ['campaigns', 'cars', 'transport_cars'];
    const validatedContentType = validContentTypes.includes(contentType) ? contentType : null;
    
    if (!validatedContentType) {
      console.warn(`Invalid content_type '${contentType}', setting to null. Valid types: ${validContentTypes.join(', ')}`);
    }
    
    const { error: updateError } = await client
      .from('scrape_sessions')
      .update({
        status: error ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        content_type: validatedContentType,
        total_items: totalItems,
        success_items: successItems,
        failed_items: failedItems,
        error_message: error
      })
      .eq('id', sessionId)

    if (updateError) {
      console.error('Failed to complete scrape session:', updateError)
    }
  }

  // Get user's scrape sessions with log counts
  async getUserScrapeSessions(userId: string, limit = 50): Promise<(ScrapeSession & { log_counts?: { info: number; warn: number; error: number; debug: number } })[]> {
    const client = await this.getClient()
    const { data: sessions, error } = await client
      .from('scrape_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw new Error(`Failed to get scrape sessions: ${error.message}`)

    // Fetch log counts for each session
    const sessionIds = sessions.map((s: ScrapeSession) => s.id)

    if (sessionIds.length > 0) {
      const { data: logs } = await client
        .from('scrape_logs')
        .select('session_id, level')
        .in('session_id', sessionIds)

      // Group logs by session and level
      const logCounts: Record<string, { info: number; warn: number; error: number; debug: number }> = {}

      if (logs) {
        for (const log of logs) {
          if (!logCounts[log.session_id]) {
            logCounts[log.session_id] = { info: 0, warn: 0, error: 0, debug: 0 }
          }
          logCounts[log.session_id][log.level as keyof typeof logCounts[string]]++
        }
      }

      // Attach log counts to sessions
      return sessions.map((session: ScrapeSession) => ({
        ...session,
        log_counts: logCounts[session.id] || { info: 0, warn: 0, error: 0, debug: 0 }
      }))
    }

    return sessions
  }

  // Get session details with all related data
  async getSessionDetails(sessionId: string) {
    const client = await this.getClient()
    const [session, scrapedContent, aiResults, campaigns, vehicles] = await Promise.all([
      client.from('scrape_sessions').select('*').eq('id', sessionId).single(),
      client.from('scraped_content').select('*').eq('session_id', sessionId),
      client.from('ai_processed_results').select('*').eq('session_id', sessionId),
      client.from('campaigns').select(`
        *,
        campaign_vehicle_models(*),
        campaign_included_items(*)
      `).eq('session_id', sessionId),
      client.from('vehicles').select(`
        *,
        vehicle_models(*)
      `).eq('session_id', sessionId)
    ])

    return {
      session: session.data,
      scrapedContent: scrapedContent.data,
      aiResults: aiResults.data,
      campaigns: campaigns.data,
      vehicles: vehicles.data
    }
  }

  // SAVED LINKS METHODS

  // Save a new link
  async saveLinkWithMetadata(
    userId: string,
    url: string,
    label: string,
    contentType: 'campaigns' | 'cars' | 'transport_cars',
    brand?: string,
    carType?: string,
    description?: string
  ): Promise<string> {
    const client = await this.getClient()
    const { data, error } = await client
      .from('saved_links')
      .insert({
        user_id: userId,
        url,
        label,
        content_type: contentType,
        brand,
        car_type: carType,
        description,
        is_active: true,
        scrape_count: 0
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to save link: ${error.message}`)
    return data.id
  }

  // Get user's saved links
  async getUserSavedLinks(userId: string): Promise<any[]> {
    const client = await this.getClient()
    const { data, error } = await client
      .from('saved_links')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })

    if (error) throw new Error(`Failed to get saved links: ${error.message}`)
    return data
  }

  // Update saved link
  async updateSavedLink(
    linkId: string,
    updates: {
      label?: string
      brand?: string
      carType?: string
      description?: string
      contentType?: 'campaigns' | 'cars' | 'transport_cars'
    }
  ): Promise<void> {
    const client = await this.getClient()
    const { error } = await client
      .from('saved_links')
      .update({
        ...updates,
        car_type: updates.carType,
        content_type: updates.contentType,
        updated_at: new Date().toISOString()
      })
      .eq('id', linkId)

    if (error) throw new Error(`Failed to update saved link: ${error.message}`)
  }

  // Delete saved link (soft delete)
  async deleteSavedLink(linkId: string): Promise<void> {
    const client = await this.getClient()
    const { error } = await client
      .from('saved_links')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', linkId)

    if (error) throw new Error(`Failed to delete saved link: ${error.message}`)
  }

  // Update link scrape statistics
  async updateLinkScrapeStats(linkId: string): Promise<void> {
    const client = await this.getClient()
    
    // First get current scrape count
    const { data: currentData, error: getError } = await client
      .from('saved_links')
      .select('scrape_count')
      .eq('id', linkId)
      .single()

    if (getError) throw new Error(`Failed to get current scrape count: ${getError.message}`)
    
    const newScrapeCount = (currentData?.scrape_count || 0) + 1
    
    // Update with incremented count
    const { error } = await client
      .from('saved_links')
      .update({
        last_scraped: new Date().toISOString(),
        scrape_count: newScrapeCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', linkId)

    if (error) throw new Error(`Failed to update link scrape stats: ${error.message}`)
  }

  // Get saved link by URL and user
  async getSavedLinkByUrl(userId: string, url: string): Promise<any | null> {
    const client = await this.getClient()
    const { data, error } = await client
      .from('saved_links')
      .select('*')
      .eq('user_id', userId)
      .eq('url', url)
      .eq('is_active', true)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get saved link by URL: ${error.message}`)
    }
    return data
  }

  // Initialize default links for a new user
  async initializeDefaultLinksForUser(userId: string): Promise<void> {
    const client = await this.getClient()
    
    // Check if user already has saved links
    const { data: existingLinks, error: checkError } = await client
      .from('saved_links')
      .select('id')
      .eq('user_id', userId)
      .limit(1)

    if (checkError) {
      throw new Error(`Failed to check existing links: ${checkError.message}`)
    }

    // If user already has links, don't add defaults
    if (existingLinks && existingLinks.length > 0) {
      return
    }

    // Add default links
    const defaultLinks = [
      // Campaign URLs
      {
        user_id: userId,
        url: 'https://kronobergsbil.bilforetag.se/vaxjo/erbjudanden/',
        label: 'Main Offers',
        content_type: 'campaigns' as const,
        brand: 'Multi-brand',
        car_type: null,
        description: 'Main offers and campaigns page'
      },
      {
        user_id: userId,
        url: 'https://suzukibilar.se/kopa-suzuki/kampanjer-erbjudanden',
        label: 'Suzuki Campaigns',
        content_type: 'campaigns' as const,
        brand: 'Suzuki',
        car_type: null,
        description: 'Suzuki specific campaigns and offers'
      },
      {
        user_id: userId,
        url: 'https://www.honda.se/cars/offers0.html',
        label: 'Honda Campaigns',
        content_type: 'campaigns' as const,
        brand: 'Honda',
        car_type: null,
        description: 'Honda car offers and promotions'
      },
      // Car URLs
      {
        user_id: userId,
        url: 'https://kronobergsbil.bilforetag.se/vaxjo/personbilar/',
        label: 'Personbilar',
        content_type: 'cars' as const,
        brand: 'Multi-brand',
        car_type: 'Passenger Cars',
        description: 'Main passenger car inventory'
      },
      {
        user_id: userId,
        url: 'https://suzukibilar.se/modeller',
        label: 'Suzuki Models',
        content_type: 'cars' as const,
        brand: 'Suzuki',
        car_type: 'Passenger Cars',
        description: 'Suzuki car models and specifications'
      },
      {
        user_id: userId,
        url: 'https://www.honda.se/cars.html',
        label: 'Honda Models',
        content_type: 'cars' as const,
        brand: 'Honda',
        car_type: 'Passenger Cars',
        description: 'Honda car lineup and models'
      },
      // Transport Car URLs
      {
        user_id: userId,
        url: 'https://kronobergsbil.bilforetag.se/vaxjo/transportbilar/',
        label: 'Transportbilar',
        content_type: 'transport_cars' as const,
        brand: 'Multi-brand',
        car_type: 'Commercial Vehicles',
        description: 'Commercial and transport vehicle inventory'
      }
    ]

    const { error: insertError } = await client
      .from('saved_links')
      .insert(defaultLinks)

    if (insertError) {
      throw new Error(`Failed to initialize default links: ${insertError.message}`)
    }
  }

  // ============================================
  // SCRAPE LOGS METHODS
  // ============================================

  /**
   * Add a log entry for a scrape session
   */
  async addLog(
    sessionId: string,
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    step?: string,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      const client = await this.getClient()
      const { error } = await client
        .from('scrape_logs')
        .insert({
          session_id: sessionId,
          level,
          step,
          message,
          details: details || null
        })

      if (error) {
        console.error('Failed to save log:', error.message)
      }
    } catch (err) {
      // Don't throw - logging should never break the main flow
      console.error('Error saving log:', err)
    }
  }

  /**
   * Convenience methods for different log levels
   */
  async logInfo(sessionId: string, message: string, step?: string, details?: Record<string, any>) {
    await this.addLog(sessionId, 'info', message, step, details)
  }

  async logWarn(sessionId: string, message: string, step?: string, details?: Record<string, any>) {
    await this.addLog(sessionId, 'warn', message, step, details)
  }

  async logError(sessionId: string, message: string, step?: string, details?: Record<string, any>) {
    await this.addLog(sessionId, 'error', message, step, details)
  }

  async logDebug(sessionId: string, message: string, step?: string, details?: Record<string, any>) {
    await this.addLog(sessionId, 'debug', message, step, details)
  }

  /**
   * Get logs for a specific session
   */
  async getSessionLogs(sessionId: string): Promise<any[]> {
    const client = await this.getClient()
    const { data, error } = await client
      .from('scrape_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to get session logs:', error.message)
      return []
    }
    return data || []
  }

  /**
   * Get recent logs across all sessions for a user
   */
  async getRecentLogs(userId: string, limit = 100): Promise<any[]> {
    const client = await this.getClient()
    const { data, error } = await client
      .from('scrape_logs')
      .select(`
        *,
        scrape_sessions!inner(user_id, url, page_title)
      `)
      .eq('scrape_sessions.user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Failed to get recent logs:', error.message)
      return []
    }
    return data || []
  }
}