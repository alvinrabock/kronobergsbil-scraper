import { supabase } from '@/lib/supabase/client'
import { getSupabaseServer } from '@/lib/supabase/server'
import { Database } from './types'
import { ScrapeResult, LinkedContent } from '@/lib/scraper'
import { ProcessedResult, CampaignData, VehicleData } from '@/lib/ai-processor-types'

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
  async createScrapeSession(userId: string, url: string): Promise<string> {
    const client = await this.getClient()
    const { data, error } = await client
      .from('scrape_sessions')
      .insert({
        user_id: userId,
        url,
        status: 'pending'
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to create scrape session: ${error.message}`)
    return data.id
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
          thumbnail_url: data.image,
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
        raw_pdf_text: (result as any).raw_pdf_text || null
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
          thumbnail_url: campaign.thumbnail,
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
          thumbnail_url: model.thumbnail
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

  // Save vehicles from AI processing
  async saveVehicles(sessionId: string, aiResultId: string, vehicles: VehicleData[], vehicleType: 'cars' | 'transport_cars'): Promise<void> {
    const client = await this.getClient()
    for (const vehicle of vehicles) {
      // Save vehicle
      const { data: vehicleData, error: vehicleError } = await client
        .from('vehicles')
        .insert({
          ai_result_id: aiResultId,
          session_id: sessionId,
          title: vehicle.title,
          brand: vehicle.brand,
          description: vehicle.description,
          thumbnail_url: vehicle.thumbnail,
          vehicle_type: vehicleType,
          body_type: vehicle.body_type,
          free_text: vehicle.free_text,
          source_url: vehicle.source_url,
          pdf_source_url: vehicle.pdf_source_url
        })
        .select('id')
        .single()

      if (vehicleError) {
        console.error('Failed to save vehicle:', vehicleError)
        continue
      }

      // Save vehicle models
      if (vehicle.vehicle_model?.length > 0) {
        const vehicleModels = vehicle.vehicle_model.map(model => ({
          vehicle_id: vehicleData.id,
          name: model.name,
          price: model.price,
          old_price: model.old_price,
          privatleasing: model.privatleasing,
          old_privatleasing: model.old_privatleasing,
          company_leasing_price: model.company_leasing_price,
          old_company_leasing_price: model.old_company_leasing_price,
          loan_price: model.loan_price,
          old_loan_price: model.old_loan_price,
          thumbnail_url: model.thumbnail,
          // Vehicle specifications
          bransle: model.bransle || model.fuel_type || null,
          biltyp: model.biltyp || model.car_type || null,
          vaxellada: model.vaxellada || model.transmission || null,
          utrustning: model.utrustning || null
        }))

        const { error: modelsError } = await client
          .from('vehicle_models')
          .insert(vehicleModels)

        if (modelsError) {
          console.error('Failed to save vehicle models:', modelsError)
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