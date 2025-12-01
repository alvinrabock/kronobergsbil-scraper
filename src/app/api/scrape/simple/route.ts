import { NextRequest, NextResponse } from 'next/server'
import { scrapeWebsite } from '@/lib/scraper'
import { processHtmlWithSmartFactCheck } from '@/lib/ai-processor'

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 [SIMPLE] Starting simple scrape without database')

    const body = await request.json()
    const { url, category, depth } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Start the scraping process
    console.log(`📡 [SIMPLE] Scraping ${url}...`)
    const scrapeResult = await scrapeWebsite(url, depth || 1)
    
    if (!scrapeResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: scrapeResult.error
      }, { status: 500 })
    }

    console.log(`🧠 [SIMPLE] Processing with AI...`)
    const startTime = Date.now()
    
    // Process with AI
    const aiResult = await processHtmlWithSmartFactCheck(
      scrapeResult.cleanedHtml,
      scrapeResult.url,
      category || 'auto-detect'
    )
    
    const processingTime = Date.now() - startTime

    console.log(`✅ [SIMPLE] Scraping and AI processing completed successfully`)

    // Return the results (simplified, no database storage)
    return NextResponse.json({
      success: true,
      scrapeResult,
      aiResult,
      stats: {
        processingTimeMs: processingTime,
        contentLength: scrapeResult.cleanedHtml.length,
        structuredDataCount: scrapeResult.structuredData.length,
        linkedContentCount: scrapeResult.linkedContent.length,
      }
    })

  } catch (error) {
    console.error('[SIMPLE] Scrape API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}