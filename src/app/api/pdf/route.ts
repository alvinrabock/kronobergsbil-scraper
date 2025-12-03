import { NextRequest, NextResponse } from 'next/server';
import { extractPDFText, extractVehicleDataFromPDF, extractPDFLinksFromHTML, categorizePDF } from '@/lib/pdf-extractor';
import { isClaudeEnabled, testClaudeConnection } from '@/lib/claude-client';

/**
 * POST /api/pdf - Process a PDF and extract vehicle data
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { pdfUrl, modelName, brand, html, baseUrl } = body;

    // If HTML is provided, extract PDF links from it
    if (html && baseUrl) {
      console.log('📄 Extracting PDF links from HTML...');
      const pdfLinks = extractPDFLinksFromHTML(html, baseUrl);

      if (pdfLinks.length === 0) {
        return NextResponse.json({
          success: false,
          message: 'No PDF links found in HTML'
        });
      }

      // Process all found PDFs
      const results = await Promise.all(
        pdfLinks.map(async (url) => {
          const type = categorizePDF(url);
          const result = await extractVehicleDataFromPDF(url, modelName || 'Unknown', brand || 'Unknown');
          return {
            url,
            type,
            ...result
          };
        })
      );

      return NextResponse.json({
        success: true,
        pdfLinks,
        results
      });
    }

    // Single PDF processing
    if (!pdfUrl) {
      return NextResponse.json({
        success: false,
        error: 'pdfUrl is required'
      }, { status: 400 });
    }

    console.log(`📄 Processing PDF: ${pdfUrl}`);

    const result = await extractVehicleDataFromPDF(
      pdfUrl,
      modelName || 'Unknown Model',
      brand || 'Unknown Brand'
    );

    return NextResponse.json({
      success: result.success,
      data: result.data,
      rawText: result.rawText?.substring(0, 5000), // Limit raw text in response
      error: result.error,
      processingTimeMs: result.processingTimeMs
    });

  } catch (error) {
    console.error('PDF API Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET /api/pdf - Test Claude AI connection for PDF processing
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const testUrl = url.searchParams.get('testUrl');

    // Check Claude configuration
    const config = {
      claude: {
        apiKey: (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY) ? '✅ Set' : '❌ Missing',
        enabled: isClaudeEnabled()
      }
    };

    // Test Claude connection if configured
    let connectionTest = null;
    if (isClaudeEnabled()) {
      connectionTest = await testClaudeConnection();
    }

    // Test PDF extraction if URL provided
    let extractionTest = null;
    if (testUrl) {
      console.log(`📄 Testing PDF extraction: ${testUrl}`);
      extractionTest = await extractPDFText(testUrl);
    }

    return NextResponse.json({
      status: 'ok',
      config,
      connectionTest: connectionTest !== null
        ? (connectionTest.success ? '✅ Connected' : `❌ Failed: ${connectionTest.message}`)
        : '⏭️ Skipped (not configured)',
      extractionTest: extractionTest ? {
        success: extractionTest.success,
        method: extractionTest.method,
        textLength: extractionTest.text?.length || 0,
        error: extractionTest.error,
        preview: extractionTest.text?.substring(0, 500)
      } : null
    });

  } catch (error) {
    console.error('PDF API Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
