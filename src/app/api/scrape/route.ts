import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite, formatScrapedContent } from '@/lib/scraper'
import { processHtmlWithSmartFactCheck } from '@/lib/ai-processor'
import { ScrapeService } from '@/lib/database/scrapeService'
import { getSupabaseServer } from '@/lib/supabase/server'

async function getUser() {
  try {
    const supabase = await getSupabaseServer()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) {
      console.log('🚨 Supabase auth error:', error.message)
      return null
    }
    
    console.log('👤 User authenticated:', user?.email || 'unknown')
    return user
  } catch (error) {
    console.error('🚨 Authentication error:', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Starting scraping with database storage')

    const body = await request.json()
    const { url, category, depth } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Get authenticated user
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Initialize database service
    const scrapeService = new ScrapeService(true)
    let sessionId: string | null = null

    try {
      // Create a new scrape session
      sessionId = await scrapeService.createScrapeSession(user.id, url)
      console.log(`📊 Created scrape session: ${sessionId}`)

      // Start the scraping process
      console.log(`📡 Scraping ${url}...`)
      const scrapeResult = await scrapeWebsite(url, depth || 1)
      
      if (!scrapeResult.success) {
        // Complete session with error
        if (sessionId) {
          await scrapeService.completeScrapeSession(
            sessionId,
            'unknown',
            0, 0, 1,
            scrapeResult.error
          )
        }
        return NextResponse.json({ 
          success: false, 
          error: scrapeResult.error
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
      console.log(`📋 Saved scraped content: ${scrapedContentIds.length} items`)

      console.log(`🧠 Processing with AI...`)
      const startTime = Date.now()

      // Format content to include linked pages (which may contain PDF links)
      const formattedContent = await formatScrapedContent(scrapeResult)
      console.log(`📄 Formatted content includes ${scrapeResult.linkedContent?.length || 0} linked pages`)

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

      let totalItems = 0
      let successItems = 0

      // Save AI processed results
      const aiResultId = await scrapeService.saveAIProcessedResult(
        sessionId,
        scrapedContentIds[0] || null,
        aiResult,
        processingTime
      )
      console.log(`🤖 Saved AI result: ${aiResultId}`)

      // Update PDF tracking data if available
      if (aiResult.pdf_processing && scrapedContentIds.length > 0) {
        try {
          const pdfSummary = aiResult.pdf_processing
          // We'll use the first scraped content ID for PDF tracking
          // In a more complex scenario, you might want to track PDFs per scraped content item
          await scrapeService.updateScrapedContentPdfTracking(
            scrapedContentIds[0],
            {
              url: scrapeResult.pageInfo.url,
              filename: 'combined-pdfs',
              success: pdfSummary.overall_status === 'success' || pdfSummary.overall_status === 'partial',
              extractedText: pdfSummary.results.map(r => r.extractedText || '').join('\n'),
              processingTimeMs: pdfSummary.total_processing_time_ms
            },
            pdfSummary.results.map(r => r.url),
            pdfSummary.total_pdfs_found,
            pdfSummary.total_pdfs_processed
          )
          console.log(`📄 Updated PDF tracking: ${pdfSummary.overall_status} (${pdfSummary.total_pdfs_processed}/${pdfSummary.total_pdfs_found} PDFs)`)
        } catch (error) {
          console.error('Failed to update PDF tracking:', error)
          // Don't fail the entire request if PDF tracking fails
        }
      }

      if (aiResult.success && aiResult.data) {
        // Save specific content types and count items
        if (aiResult.content_type === 'campaigns' && aiResult.campaigns) {
          await scrapeService.saveCampaigns(sessionId, aiResultId, aiResult.campaigns)
          totalItems = aiResult.campaigns.length
          successItems = aiResult.campaigns.length
        } else if (aiResult.content_type === 'cars' && aiResult.cars) {
          await scrapeService.saveVehicles(sessionId, aiResultId, aiResult.cars, 'cars')
          totalItems = aiResult.cars.length
          successItems = aiResult.cars.length
        } else if (aiResult.content_type === 'transport_cars' && aiResult.transport_cars) {
          await scrapeService.saveVehicles(sessionId, aiResultId, aiResult.transport_cars, 'transport_cars')
          totalItems = aiResult.transport_cars.length
          successItems = aiResult.transport_cars.length
        }
      }

      // Complete the session
      await scrapeService.completeScrapeSession(
        sessionId,
        aiResult.content_type || 'unknown',
        totalItems,
        successItems,
        totalItems - successItems
      )

      console.log(`✅ Scraping completed successfully`)

      // Return the results with session info
      return NextResponse.json({
        success: true,
        sessionId,
        scrapeResult,
        aiResult,
        stats: {
          totalItems,
          successItems,
          processingTimeMs: processingTime
        }
      })

    } catch (dbError) {
      console.error('📊 Database error during scraping:', dbError)
      // If database operations fail, complete the session with an error
      if (sessionId) {
        try {
          await scrapeService.completeScrapeSession(
            sessionId,
            'unknown',
            0, 0, 1,
            `Database error: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
          )
        } catch (completionError) {
          console.error('Failed to complete session after database error:', completionError)
        }
      }
      throw dbError // Re-throw to be caught by outer catch
    }

  } catch (error) {
    console.error('Scrape API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Get user's scrape sessions
export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const scrapeService = new ScrapeService(true)
    const sessions = await scrapeService.getUserScrapeSessions(user.id)

    return NextResponse.json({
      success: true,
      sessions
    })

  } catch (error) {
    console.error('Get sessions error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}