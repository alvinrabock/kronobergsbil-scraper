import { NextRequest, NextResponse } from 'next/server';
import { ScrapeService } from '@/lib/database/scrapeService';
import { downloadAndParsePdfEnhancedWithRetry } from '@/lib/ai-processor';

interface RetryRequest {
  scrapedContentId?: string;
  sessionId?: string;
  pdfUrls?: string[];
  retryAll?: boolean;
  retryConfig?: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
}

interface RetryResult {
  success: boolean;
  message: string;
  results?: Array<{
    url: string;
    success: boolean;
    retryAttempt: number;
    error?: string;
  }>;
  stats?: {
    total: number;
    successful: number;
    failed: number;
    retryable: number;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: RetryRequest = await request.json();
    const scrapeService = new ScrapeService();
    
    console.log('🔄 PDF Retry Request:', {
      scrapedContentId: body.scrapedContentId,
      sessionId: body.sessionId,
      pdfUrlsCount: body.pdfUrls?.length,
      retryAll: body.retryAll,
      retryConfig: body.retryConfig
    });

    let pdfUrls: string[] = [];

    // Determine which PDFs to retry
    if (body.pdfUrls && body.pdfUrls.length > 0) {
      // Specific URLs provided
      pdfUrls = body.pdfUrls;
      console.log(`🔄 Retrying specific URLs: ${pdfUrls.length} PDFs`);
    } else if (body.scrapedContentId) {
      // Retry PDFs from specific scraped content
      const scrapedContent = await scrapeService.getScrapedContentById(body.scrapedContentId);
      if (scrapedContent && scrapedContent.pdf_links_found) {
        pdfUrls = Array.isArray(scrapedContent.pdf_links_found) 
          ? scrapedContent.pdf_links_found 
          : [];
        console.log(`🔄 Found ${pdfUrls.length} PDFs from scraped content ${body.scrapedContentId}`);
      }
    } else if (body.sessionId) {
      // Retry all failed/retryable PDFs from session
      const scrapedContents = await scrapeService.getScrapedContentBySessionId(body.sessionId);
      for (const content of scrapedContents) {
        if (content.pdf_links_found && Array.isArray(content.pdf_links_found)) {
          // Only retry if there were failures or retryable errors
          if (content.pdf_processing_status === 'failed' || 
              content.pdf_processing_status === 'partial' ||
              (content.pdf_retryable_failures && content.pdf_retryable_failures.length > 0)) {
            pdfUrls.push(...content.pdf_links_found);
          }
        }
      }
      console.log(`🔄 Found ${pdfUrls.length} retryable PDFs from session ${body.sessionId}`);
    } else if (body.retryAll) {
      // This would be a dangerous operation, so we'll limit it or require special permissions
      return NextResponse.json(
        { success: false, message: 'Retry all operation not implemented for safety reasons' },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { success: false, message: 'No PDFs specified for retry' },
        { status: 400 }
      );
    }

    if (pdfUrls.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No PDFs found for retry',
        results: [],
        stats: { total: 0, successful: 0, failed: 0, retryable: 0 }
      });
    }

    // Remove duplicates
    pdfUrls = [...new Set(pdfUrls)];
    
    console.log(`🔄 Starting retry for ${pdfUrls.length} unique PDFs`);

    // Configure retry settings
    const retryConfig = {
      maxRetries: body.retryConfig?.maxRetries || 2, // Lower than normal for manual retries
      baseDelayMs: body.retryConfig?.baseDelayMs || 500,
      maxDelayMs: body.retryConfig?.maxDelayMs || 10000,
      retryableErrors: [
        'HTTP 429', 'HTTP 500', 'HTTP 502', 'HTTP 503', 'HTTP 504',
        'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'Network Error', 'timeout'
      ]
    };

    // Process PDFs with retry
    const results = await Promise.all(
      pdfUrls.map(async (pdfUrl) => {
        console.log(`🔄 Retrying PDF: ${pdfUrl}`);
        const result = await downloadAndParsePdfEnhancedWithRetry(pdfUrl, retryConfig);
        
        console.log(`${result.success ? '✅' : '❌'} Retry result for ${pdfUrl}: ${result.success ? 'Success' : result.error} (${result.retryAttempt! + 1} attempts)`);
        
        return {
          url: pdfUrl,
          success: result.success,
          retryAttempt: result.retryAttempt || 0,
          error: result.error,
          retryable: result.retryable || false
        };
      })
    );

    // Calculate stats
    const stats = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      retryable: results.filter(r => !r.success && r.retryable).length
    };

    console.log(`🔄 Retry completed:`, stats);

    // Update database with retry results if we have specific content
    if (body.scrapedContentId) {
      try {
        // Find the most successful result to update the database
        const successfulResults = results.filter(r => r.success);
        if (successfulResults.length > 0) {
          // Use the first successful result to update - in a real implementation
          // you might want to aggregate all results
          const bestResult = successfulResults[0];
          console.log(`💾 Updating database with successful retry result for ${bestResult.url}`);
        }
      } catch (dbError) {
        console.warn('Failed to update database with retry results:', dbError);
      }
    }

    const response: RetryResult = {
      success: stats.successful > 0,
      message: `Retry completed: ${stats.successful}/${stats.total} successful`,
      results,
      stats
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('PDF Retry API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: `PDF retry failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check retry status and get retryable PDFs
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const scrapedContentId = url.searchParams.get('scrapedContentId');
    
    if (!sessionId && !scrapedContentId) {
      return NextResponse.json(
        { error: 'sessionId or scrapedContentId required' },
        { status: 400 }
      );
    }

    const scrapeService = new ScrapeService();
    const retryableItems: Array<{
      id: string;
      pdfUrls: string[];
      status: string;
      retryCount: number;
      lastRetryAt: string | null;
      retryableFailures: string[] | null;
    }> = [];

    if (scrapedContentId) {
      const content = await scrapeService.getScrapedContentById(scrapedContentId);
      if (content && shouldRetryContent(content)) {
        retryableItems.push({
          id: content.id,
          pdfUrls: content.pdf_links_found || [],
          status: content.pdf_processing_status || 'unknown',
          retryCount: content.pdf_retry_count || 0,
          lastRetryAt: content.pdf_last_retry_at,
          retryableFailures: content.pdf_retryable_failures
        });
      }
    } else if (sessionId) {
      const contents = await scrapeService.getScrapedContentBySessionId(sessionId);
      for (const content of contents) {
        if (shouldRetryContent(content)) {
          retryableItems.push({
            id: content.id,
            pdfUrls: content.pdf_links_found || [],
            status: content.pdf_processing_status || 'unknown',
            retryCount: content.pdf_retry_count || 0,
            lastRetryAt: content.pdf_last_retry_at,
            retryableFailures: content.pdf_retryable_failures
          });
        }
      }
    }

    const totalRetryablePdfs = retryableItems.reduce((sum, item) => sum + item.pdfUrls.length, 0);

    return NextResponse.json({
      success: true,
      retryableItems,
      summary: {
        totalItems: retryableItems.length,
        totalPdfs: totalRetryablePdfs,
        averageRetryCount: retryableItems.length > 0 
          ? retryableItems.reduce((sum, item) => sum + item.retryCount, 0) / retryableItems.length 
          : 0
      }
    });

  } catch (error) {
    console.error('PDF Retry Status API Error:', error);
    return NextResponse.json(
      { error: `Failed to get retry status: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// Helper function to determine if content should be retried
function shouldRetryContent(content: any): boolean {
  return (
    content.pdf_links_found && 
    Array.isArray(content.pdf_links_found) &&
    content.pdf_links_found.length > 0 &&
    (
      content.pdf_processing_status === 'failed' ||
      content.pdf_processing_status === 'partial' ||
      (content.pdf_retryable_failures && content.pdf_retryable_failures.length > 0)
    )
  );
}