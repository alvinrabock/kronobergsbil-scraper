/**
 * API Route: GET /api/master/history/[variantId]
 *
 * Get price history for a specific variant
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPriceHistory } from '@/lib/master-vehicle-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const { variantId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '30', 10);

    if (!variantId) {
      return NextResponse.json(
        { success: false, message: 'Variant ID is required' },
        { status: 400 }
      );
    }

    const history = await getPriceHistory(variantId, limit);

    return NextResponse.json({
      success: true,
      variantId,
      count: history?.length || 0,
      data: history || [],
    });
  } catch (error) {
    console.error('Get price history error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
