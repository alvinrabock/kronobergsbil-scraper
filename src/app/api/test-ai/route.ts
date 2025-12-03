import { NextRequest, NextResponse } from 'next/server';
import { isClaudeEnabled, testClaudeConnection } from '@/lib/claude-client';

/**
 * GET /api/test-ai - Test AI service connections
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const results: Record<string, any> = {
      timestamp: new Date().toISOString(),
    };

    // Test Claude (primary AI)
    console.log('🔍 Testing Claude connection...');
    results.claude = {
      configured: isClaudeEnabled(),
      apiKeySet: !!(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY),
    };

    if (isClaudeEnabled()) {
      const claudeTest = await testClaudeConnection();
      results.claude.connectionTest = claudeTest;
    } else {
      results.claude.connectionTest = {
        success: false,
        message: 'CLAUDE_API_KEY or ANTHROPIC_API_KEY not set in environment',
      };
    }

    // Perplexity status (for fact-checking)
    results.perplexity = {
      configured: !!process.env.PERPLEXITY_API_KEY,
      apiKeySet: process.env.PERPLEXITY_API_KEY ? '✅ Set' : '❌ Missing',
      note: 'Used for fact-checking campaign claims',
    };

    // Summary
    const allConfigured = results.claude.configured;
    results.summary = {
      primaryAI: 'Anthropic Claude (Sonnet 4.5)',
      pdfProcessing: 'Claude AI (native PDF support)',
      imageAnalysis: 'Claude AI',
      htmlExtraction: 'Claude AI',
      factChecking: results.perplexity.configured ? 'Perplexity AI' : 'Not configured',
      allServicesReady: allConfigured,
      recommendations: [],
    };

    if (!results.claude.configured) {
      results.summary.recommendations.push('Add CLAUDE_API_KEY for AI processing');
    }
    if (!results.perplexity.configured) {
      results.summary.recommendations.push('Add PERPLEXITY_API_KEY for fact-checking (optional)');
    }

    return NextResponse.json(results);

  } catch (error) {
    console.error('AI Test Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
