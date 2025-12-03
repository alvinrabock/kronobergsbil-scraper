import { NextRequest } from 'next/server'
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

          // Log session created
          await scrapeService.logInfo(sessionId, `Session started for URL: ${url}`, 'init', { depth, category })

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

          await scrapeService.logInfo(sessionId, `Starting web scrape with depth ${depth || 1}`, 'scraping')

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
            await scrapeService.logError(sessionId, `Scraping failed: ${scrapeResult.error}`, 'scraping', { error: scrapeResult.error })
            sendUpdateSafely({
              step: 'error',
              message: `Scraping failed: ${scrapeResult.error}`,
              progress: 100,
              error: scrapeResult.error
            })
            closeController()
            return
          }

          // Log scraping success
          await scrapeService.logInfo(sessionId, `Scraped ${scrapeResult.pageInfo.contentLength.toLocaleString()} characters in ${(scrapeTime / 1000).toFixed(1)}s`, 'scraping', {
            contentLength: scrapeResult.pageInfo.contentLength,
            linksFound: scrapeResult.pageInfo.linksFound,
            linksFetched: scrapeResult.pageInfo.linksFetched,
            scrapeTimeMs: scrapeTime
          })

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
          
          // ============================================================
          // 🚫 AI ANALYSIS DISABLED FOR TESTING PDF DETECTION
          // ============================================================
          // To re-enable AI analysis, set SKIP_AI_ANALYSIS=false in .env
          // or remove this entire block and uncomment the AI processing below
          // ============================================================

          const skipAIAnalysis = process.env.SKIP_AI_ANALYSIS !== 'false' // Default: skip AI

          let totalItems = 0
          let successItems = 0
          let aiResult: any = null
          let aiResultId: string | null = null

          if (skipAIAnalysis) {
            // Show PDF detection results instead of AI analysis
            const pdfLinks = scrapeResult.pdfLinks || []
            const pricelists = pdfLinks.filter(p => p.type === 'pricelist')
            const brochures = pdfLinks.filter(p => p.type === 'brochure')

            await scrapeService.logWarn(sessionId, 'AI analysis SKIPPED (testing mode)', 'ai_processing')

            sendUpdateSafely({
              step: 'ai_skipped',
              message: `⚠️ AI analysis SKIPPED (testing mode)`,
              progress: 75
            })

            // Log PDF detection results
            await scrapeService.logInfo(sessionId, `Found ${pdfLinks.length} PDFs: ${pricelists.length} pricelists, ${brochures.length} brochures`, 'pdf_detection', {
              totalPDFs: pdfLinks.length,
              pricelists: pricelists.map(p => ({ url: p.url, type: p.type })),
              brochures: brochures.map(p => ({ url: p.url, type: p.type }))
            })

            sendUpdateSafely({
              step: 'pdf_detection',
              message: `📄 Found ${pdfLinks.length} PDFs: ${pricelists.length} pricelists, ${brochures.length} brochures`,
              progress: 80,
              data: {
                totalPDFs: pdfLinks.length,
                pricelists: pricelists.map(p => p.url),
                brochures: brochures.map(p => p.url),
                allPDFs: pdfLinks
              }
            })

            // Log detailed PDF info to console
            console.log('📄 ============ PDF DETECTION RESULTS ============')
            console.log(`   Total PDFs found: ${pdfLinks.length}`)
            console.log(`   Pricelists: ${pricelists.length}`)
            pricelists.forEach((p, i) => console.log(`     ${i + 1}. ${p.url}`))
            console.log(`   Brochures: ${brochures.length}`)
            brochures.forEach((p, i) => console.log(`     ${i + 1}. ${p.url}`))
            console.log('📄 ================================================')

            sendUpdateSafely({
              step: 'ai_processing_complete',
              message: `Scraping complete (AI analysis disabled for testing)`,
              progress: 85
            })

            // Create a mock AI result for session completion
            aiResult = {
              success: true,
              content_type: 'test_mode',
              data: { pdfLinks }
            }
          } else {
            // Original AI processing code
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
              message: 'Processing content batches with Claude AI...',
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

            // Format content to include linked pages (which may contain PDF links)
            const formattedContent = await formatScrapedContent(scrapeResult)
            console.log(`📄 Formatted content includes ${scrapeResult.linkedContent?.length || 0} linked pages`)

            await scrapeService.logInfo(sessionId, 'Starting AI processing with Claude', 'ai_processing', {
              contentLength: formattedContent.length,
              category: category || 'auto-detect',
              hasMetadata: !!metadata
            })

            aiResult = await processHtmlWithSmartFactCheck(
              formattedContent,
              scrapeResult.url,
              category || 'auto-detect',
              true, // enableImageAnalysis
              metadata,
              scrapeResult.pdfLinks // Pass PDF links from scraper for reliable extraction
            )
            const aiProcessingTime = Date.now() - aiStartTime

            // Log AI processing result
            await scrapeService.logInfo(sessionId, `AI processing completed: ${aiResult.content_type}`, 'ai_processing', {
              contentType: aiResult.content_type,
              success: aiResult.success,
              processingTimeMs: aiProcessingTime,
              itemsFound: aiResult.cars?.length || aiResult.campaigns?.length || aiResult.transport_cars?.length || 0
            })

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
              await scrapeService.logInfo(sessionId, 'Fact-checking completed with Perplexity AI', 'fact_checking')
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

            aiResultId = await scrapeService.saveAIProcessedResult(
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
          }

          // Step 8: Complete session
          await scrapeService.completeScrapeSession(
            sessionId,
            aiResult?.content_type || 'unknown',
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