import { NextRequest, NextResponse } from 'next/server';
import { getRecentPDFLogs } from '@/lib/claude-client';

/**
 * GET /api/pdf-logs - Get recent PDF processing logs
 *
 * Returns the last 50 PDF processing operations with details:
 * - URL processed
 * - Success/failure status
 * - Page count
 * - Characters extracted
 * - Processing time
 * - Text preview (first 500 chars)
 * - Any errors
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const logs = getRecentPDFLogs();

    // Calculate summary stats
    const totalProcessed = logs.length;
    const successful = logs.filter(l => l.success).length;
    const failed = logs.filter(l => !l.success).length;
    const avgProcessingTime = logs.length > 0
      ? Math.round(logs.reduce((sum, l) => sum + l.processingTimeMs, 0) / logs.length)
      : 0;
    const totalCharacters = logs.reduce((sum, l) => sum + l.characterCount, 0);
    const totalPages = logs.reduce((sum, l) => sum + (l.pageCount || 0), 0);

    return NextResponse.json({
      summary: {
        totalProcessed,
        successful,
        failed,
        successRate: totalProcessed > 0 ? `${Math.round((successful / totalProcessed) * 100)}%` : 'N/A',
        avgProcessingTimeMs: avgProcessingTime,
        totalCharactersExtracted: totalCharacters,
        totalPagesProcessed: totalPages,
      },
      logs: logs.map(log => ({
        ...log,
        // Truncate preview for API response
        textPreview: log.textPreview ? `${log.textPreview.substring(0, 200)}...` : null
      }))
    });

  } catch (error) {
    console.error('Error fetching PDF logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch PDF logs' },
      { status: 500 }
    );
  }
}
