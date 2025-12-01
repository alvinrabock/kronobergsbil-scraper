import { NextRequest } from 'next/server'
import { scrapeWebsite } from '@/lib/scraper'
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
    
    return user
  } catch (error) {
    console.error('🚨 Authentication error:', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  const user = await getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { url, category, depth } = await request.json()

  if (!url) {
    return new Response('URL is required', { status: 400 })
  }

  // Set up Server-Sent Events with AbortController for proper cleanup
  const abortController = new AbortController();
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      
      let controllerClosed = false;
      let connectionActive = true;
      
      // Listen for client disconnection
      abortController.signal.addEventListener('abort', () => {
        console.log('🔌 Client disconnected - aborting stream');
        connectionActive = false;
        controllerClosed = true;
        try {
          controller.close();
        } catch (error) {
          console.log('Controller already closed on abort');
        }
      });
      
      const sendUpdate = (data: any) => {
        try {
          // Multiple checks to ensure we don't send to a closed/disconnected stream
          if (!connectionActive || controllerClosed || abortController.signal.aborted) {
            return false;
          }
          
          const sseData = `data: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(sseData))
          return true; // Successfully sent
        } catch (error) {
          console.error('Failed to send SSE update:', error);
          controllerClosed = true;
          connectionActive = false;
          return false; // Failed to send
        }
      }

      const closeController = () => {
        if (!controllerClosed) {
          controllerClosed = true;
          connectionActive = false;
          try {
            controller.close()
          } catch (error) {
            console.log('Controller already closed');
          }
        }
      }

      const sendUpdateSafely = (data: any) => {
        if (!connectionActive || controllerClosed || abortController.signal.aborted) {
          console.log('🔌 Skipping update - connection closed:', data.step);
          return false;
        }
        return sendUpdate(data);
      }

      // Start the scraping process
      const performScraping = async () => {
        const scrapeService = new ScrapeService(true)
        let sessionId: string | null = null

        try {
          // Early exit if client already disconnected
          if (!connectionActive || abortController.signal.aborted) {
            console.log('🔌 Client disconnected before scraping started');
            return;
          }
          // Step 1: Initialize session
          if (!sendUpdateSafely({
            step: 'initializing',
            message: 'Creating scrape session...',
            progress: 10
          })) return; // Exit if client disconnected

          sessionId = await scrapeService.createScrapeSession(user.id, url)
          
          // Check connection before proceeding
          if (!connectionActive || abortController.signal.aborted) {
            console.log('🔌 Client disconnected during session creation');
            return;
          }
          
          if (!sendUpdateSafely({
            step: 'session_created',
            message: `Session created: ${sessionId.slice(-6)}`,
            progress: 20,
            sessionId
          })) return; // Exit if client disconnected

          // Step 2: Start scraping
          if (!sendUpdateSafely({
            step: 'scraping_start',
            message: `Starting to scrape ${new URL(url).hostname}...`,
            progress: 30
          })) return; // Exit if client disconnected

          // Add timing for scraping
          const scrapeStartTime = Date.now()
          const scrapeResult = await scrapeWebsite(url, depth || 1)
          
          // Check connection after potentially long scraping operation
          if (!connectionActive || abortController.signal.aborted) {
            console.log('🔌 Client disconnected during scraping');
            return;
          }
          const scrapeTime = Date.now() - scrapeStartTime

          if (!scrapeResult.success) {
            sendUpdateSafely({
              step: 'error',
              message: `Scraping failed: ${scrapeResult.error}`,
              progress: 100,
              error: scrapeResult.error
            })
            closeController()
            return
          }

          // Step 3: Scraping completed
          sendUpdateSafely({
            step: 'scraping_complete',
            message: `Scraped ${scrapeResult.pageInfo.contentLength.toLocaleString()} characters in ${(scrapeTime / 1000).toFixed(1)}s`,
            progress: 50
          })

          // Step 4: Update session with page info
          await scrapeService.updateScrapeSessionWithPageInfo(sessionId, {
            title: scrapeResult.pageInfo.title,
            description: scrapeResult.pageInfo.description,
            contentLength: scrapeResult.pageInfo.contentLength,
            linksFound: scrapeResult.pageInfo.linksFound,
            linksFetched: scrapeResult.pageInfo.linksFetched
          })

          sendUpdateSafely({
            step: 'saving_content',
            message: 'Saving scraped content to database...',
            progress: 60
          })

          // Step 5: Save scraped content
          const scrapedContentIds = await scrapeService.saveScrapeResult(sessionId, scrapeResult)
          
          sendUpdateSafely({
            step: 'ai_processing_start',
            message: 'Starting AI analysis and fact-checking...',
            progress: 70
          })

          // Step 6: AI processing with detailed progress tracking
          const aiStartTime = Date.now()
          
          // Check connection before AI processing
          if (!connectionActive || abortController.signal.aborted) {
            console.log('🔌 Client disconnected before AI processing');
            return;
          }
          
          // Add a small delay to show this step
          await new Promise(resolve => setTimeout(resolve, 500))
          
          if (!sendUpdateSafely({
            step: 'ai_batch_processing',
            message: 'Processing content batches with OpenAI...',
            progress: 75
          })) return;
          
          // Try to get metadata from saved links
          let metadata = undefined
          try {
            const savedLink = await scrapeService.getSavedLinkByUrl(user.id, url)
            if (savedLink) {
              metadata = {
                brand: savedLink.brand,
                carType: savedLink.car_type,
                description: savedLink.description,
                label: savedLink.label
              }
              console.log('🔗 Using saved link metadata:', metadata)
              
              // Update scrape statistics
              await scrapeService.updateLinkScrapeStats(savedLink.id)
            }
          } catch (metadataError) {
            console.warn('⚠️ Failed to fetch metadata from saved links:', metadataError)
          }

          const aiResult = await processHtmlWithSmartFactCheck(
            scrapeResult.cleanedHtml,
            scrapeResult.url,
            category || 'auto-detect',
            true, // enableImageAnalysis
            metadata
          )
          const aiProcessingTime = Date.now() - aiStartTime

          // Check connection after AI processing
          if (!connectionActive || abortController.signal.aborted) {
            console.log('🔌 Client disconnected after AI processing');
            return;
          }

          // Determine if fact-checking was performed
          const factCheckPerformed = aiResult.fact_check || 
                                   scrapeResult.url.includes('kampanj') || 
                                   scrapeResult.url.includes('campaign') || 
                                   scrapeResult.cleanedHtml.length > 15000

          if (factCheckPerformed) {
            if (!sendUpdateSafely({
              step: 'fact_checking_complete',
              message: 'Fact-checking completed with Perplexity AI',
              progress: 82
            })) return; // Exit if client disconnected
          }

          sendUpdateSafely({
            step: 'ai_processing_complete',
            message: `AI analysis completed: ${aiResult.content_type} (${(aiProcessingTime / 1000).toFixed(1)}s)${factCheckPerformed ? ' with fact-checking' : ''}`,
            progress: 85
          })

          // Step 7: Save AI results
          sendUpdateSafely({
            step: 'saving_ai_results',
            message: 'Saving AI analysis results to database...',
            progress: 87
          })

          let totalItems = 0
          let successItems = 0

          const aiResultId = await scrapeService.saveAIProcessedResult(
            sessionId,
            scrapedContentIds[0] || null,
            aiResult,
            aiProcessingTime
          )

          if (aiResult.success && aiResult.data) {
            if (aiResult.content_type === 'campaigns' && aiResult.campaigns) {
              await scrapeService.saveCampaigns(sessionId, aiResultId, aiResult.campaigns)
              totalItems = aiResult.campaigns.length
              successItems = aiResult.campaigns.length
              
              sendUpdateSafely({
                step: 'data_saved',
                message: `Saved ${totalItems} campaigns to database`,
                progress: 95
              })
            } else if (aiResult.content_type === 'cars' && aiResult.cars) {
              await scrapeService.saveVehicles(sessionId, aiResultId, aiResult.cars, 'cars')
              totalItems = aiResult.cars.length
              successItems = aiResult.cars.length
              
              sendUpdateSafely({
                step: 'data_saved',
                message: `Saved ${totalItems} cars to database`,
                progress: 95
              })
            } else if (aiResult.content_type === 'transport_cars' && aiResult.transport_cars) {
              await scrapeService.saveVehicles(sessionId, aiResultId, aiResult.transport_cars, 'transport_cars')
              totalItems = aiResult.transport_cars.length
              successItems = aiResult.transport_cars.length
              
              sendUpdateSafely({
                step: 'data_saved',
                message: `Saved ${totalItems} transport vehicles to database`,
                progress: 95
              })
            }
          }

          // Step 8: Complete session
          await scrapeService.completeScrapeSession(
            sessionId,
            aiResult.content_type || 'unknown',
            totalItems,
            successItems,
            totalItems - successItems
          )

          // Final success message
          sendUpdateSafely({
            step: 'complete',
            message: 'Scraping completed successfully!',
            progress: 100,
            sessionId,
            success: true
          })

        } catch (error) {
          console.error('Streaming scrape error:', error)
          
          if (sessionId) {
            try {
              await scrapeService.completeScrapeSession(
                sessionId,
                'unknown',
                0, 0, 1,
                error instanceof Error ? error.message : 'Unknown error'
              )
            } catch (completionError) {
              console.error('Failed to complete session after error:', completionError)
            }
          }

          sendUpdateSafely({
            step: 'error',
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            progress: 100,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }

        closeController()
      }

      performScraping()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  })
}