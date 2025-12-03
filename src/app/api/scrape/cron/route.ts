import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite, formatScrapedContent } from '@/lib/scraper'
import { processHtmlWithSmartFactCheck } from '@/lib/ai-processor'
import { ScrapeService } from '@/lib/database/scrapeService'
import { syncVehiclesToMaster } from '@/lib/master-sync-service'

export async function POST(request: NextRequest) {
  try {
    // Check API key authentication for CRON jobs
    const authHeader = request.headers.get('authorization')
    const apiKey = authHeader?.replace('Bearer ', '')
    
    if (!apiKey || apiKey !== process.env.CRON_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized - Invalid API key' }, { status: 401 })
    }

    const body = await request.json()
    const { url, category, depth, userId } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Use system user ID if no userId provided (for automated jobs)
    const scrapeUserId = userId || 'system'
    
    const scrapeService = new ScrapeService(true) // Use server client

    // Create scrape session
    const sessionId = await scrapeService.createScrapeSession(scrapeUserId, url)
    
    console.log(`🤖 [CRON] Starting scrape session ${sessionId} for ${url}`)

    // Start the scraping process
    console.log(`📡 [CRON] Scraping ${url}...`)
    const scrapeResult = await scrapeWebsite(url, depth || 1)
    
    if (!scrapeResult.success) {
      await scrapeService.completeScrapeSession(
        sessionId,
        'unknown',
        0,
        0,
        1,
        scrapeResult.error
      )
      return NextResponse.json({ 
        success: false, 
        error: scrapeResult.error,
        sessionId 
      }, { status: 500 })
    }

    // Update session with page info
    await scrapeService.updateScrapeSessionWithPageInfo(sessionId, {
      title: scrapeResult.pageInfo.title,
      description: scrapeResult.pageInfo.description,
      contentLength: scrapeResult.pageInfo.contentLength,
      linksFound: scrapeResult.pageInfo.linksFound,
      linksFetched: scrapeResult.pageInfo.linksFetched
    })

    // Save scraped content
    const scrapedContentIds = await scrapeService.saveScrapeResult(sessionId, scrapeResult)
    
    console.log(`🧠 [CRON] Processing with AI...`)
    const startTime = Date.now()

    // Format content to include linked pages (which may contain PDF links)
    const formattedContent = await formatScrapedContent(scrapeResult)
    console.log(`📄 [CRON] Formatted content includes ${scrapeResult.linkedContent?.length || 0} linked pages`)

    // Process with AI
    const aiResult = await processHtmlWithSmartFactCheck(
      formattedContent,
      scrapeResult.url,
      category || 'auto-detect',
      true, // enableImageAnalysis
      undefined, // metadata
      scrapeResult.pdfLinks // Pass PDF links from scraper
    )
    
    const processingTime = Date.now() - startTime

    // Save AI processed results
    const aiResultId = await scrapeService.saveAIProcessedResult(
      sessionId,
      scrapedContentIds[0] || null,
      aiResult,
      processingTime
    )

    let totalItems = 0
    let successItems = 0

    let masterSyncResult = null

    if (aiResult.success && aiResult.data) {
      // Save specific data based on content type
      if (aiResult.content_type === 'campaigns' && aiResult.campaigns) {
        await scrapeService.saveCampaigns(sessionId, aiResultId, aiResult.campaigns)
        totalItems = aiResult.campaigns.length
        successItems = aiResult.campaigns.length
      } else if (aiResult.content_type === 'cars' && aiResult.cars) {
        await scrapeService.saveVehicles(sessionId, aiResultId, aiResult.cars, 'cars')
        totalItems = aiResult.cars.length
        successItems = aiResult.cars.length

        // Sync to master database (update prices for existing master records)
        console.log(`🔄 [CRON] Syncing ${aiResult.cars.length} vehicles to master database...`)
        masterSyncResult = await syncVehiclesToMaster(aiResult.cars, url)
        console.log(`🔄 [CRON] Master sync: ${masterSyncResult.pricesUpdated} prices updated, ${masterSyncResult.notFoundInMaster} not in master`)
      } else if (aiResult.content_type === 'transport_cars' && aiResult.transport_cars) {
        await scrapeService.saveVehicles(sessionId, aiResultId, aiResult.transport_cars, 'transport_cars')
        totalItems = aiResult.transport_cars.length
        successItems = aiResult.transport_cars.length

        // Sync to master database (update prices for existing master records)
        console.log(`🔄 [CRON] Syncing ${aiResult.transport_cars.length} transport vehicles to master database...`)
        masterSyncResult = await syncVehiclesToMaster(aiResult.transport_cars, url)
        console.log(`🔄 [CRON] Master sync: ${masterSyncResult.pricesUpdated} prices updated, ${masterSyncResult.notFoundInMaster} not in master`)
      }
    }

    // Complete the session
    await scrapeService.completeScrapeSession(
      sessionId,
      aiResult.content_type,
      totalItems,
      successItems,
      totalItems - successItems,
      aiResult.success ? undefined : aiResult.error
    )

    console.log(`✅ [CRON] Scrape session ${sessionId} completed successfully`)

    // Return the results
    return NextResponse.json({
      success: true,
      sessionId,
      scrapeResult: {
        success: scrapeResult.success,
        url: scrapeResult.url,
        pageInfo: scrapeResult.pageInfo,
        // Don't return full HTML content for CRON jobs to save bandwidth
        contentLength: scrapeResult.cleanedHtml.length,
        structuredDataCount: scrapeResult.structuredData.length,
        linkedContentCount: scrapeResult.linkedContent.length,
      },
      aiResult: {
        success: aiResult.success,
        content_type: aiResult.content_type,
        // Don't return full processed content for CRON jobs
        hasData: !!aiResult.data,
      },
      stats: {
        totalItems,
        successItems,
        processingTimeMs: processingTime
      },
      // Master database sync results
      masterSync: masterSyncResult ? {
        pricesUpdated: masterSyncResult.pricesUpdated,
        notFoundInMaster: masterSyncResult.notFoundInMaster,
        errors: masterSyncResult.errors.length > 0 ? masterSyncResult.errors : undefined
      } : null
    })

  } catch (error) {
    console.error('[CRON] Scrape API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}