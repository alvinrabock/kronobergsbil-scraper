/**
 * API Route: /api/master/prices
 *
 * POST - Update prices for existing master variants (daily scraping)
 * GET - Get current prices for variants
 */

import { NextRequest, NextResponse } from 'next/server';
import { updatePricesFromScrape, getVehicleCatalog } from '@/lib/master-vehicle-service';

interface PriceUpdateRequest {
  brand: string;
  vehicle: string;
  variant: string;
  motor_type: string;
  prices: {
    pris?: number | null;
    old_pris?: number | null;
    privatleasing?: number | null;
    old_privatleasing?: number | null;
    foretagsleasing?: number | null;
    old_foretagsleasing?: number | null;
    billan_per_man?: number | null;
    old_billan_per_man?: number | null;
    leasing_months?: number | null;
    leasing_km_per_year?: number | null;
    leasing_deposit?: number | null;
    is_campaign?: boolean;
    campaign_name?: string | null;
    campaign_end?: string | null;
    source_url?: string | null;
  };
}

interface BatchPriceUpdateRequest {
  updates: PriceUpdateRequest[];
}

/**
 * POST /api/master/prices
 * Update prices for one or more variants
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if batch or single update
    if (body.updates && Array.isArray(body.updates)) {
      // Batch update
      const batchRequest = body as BatchPriceUpdateRequest;
      const results = [];
      let successCount = 0;
      let updatedCount = 0;
      let errorCount = 0;

      for (const update of batchRequest.updates) {
        const result = await updatePricesFromScrape(
          update.brand,
          update.vehicle,
          update.variant,
          update.motor_type,
          update.prices
        );

        results.push({
          brand: update.brand,
          vehicle: update.vehicle,
          variant: update.variant,
          motor_type: update.motor_type,
          ...result,
        });

        if (result.success) {
          successCount++;
          if (result.updated) updatedCount++;
        } else {
          errorCount++;
        }
      }

      return NextResponse.json({
        success: errorCount === 0,
        message: `Processed ${batchRequest.updates.length} price updates`,
        summary: {
          total: batchRequest.updates.length,
          success: successCount,
          updated: updatedCount,
          unchanged: successCount - updatedCount,
          errors: errorCount,
        },
        results,
      });
    } else {
      // Single update
      const update = body as PriceUpdateRequest;

      // Validate required fields
      if (!update.brand || !update.vehicle || !update.variant || !update.motor_type) {
        return NextResponse.json(
          {
            success: false,
            message: 'Missing required fields: brand, vehicle, variant, motor_type',
          },
          { status: 400 }
        );
      }

      const result = await updatePricesFromScrape(
        update.brand,
        update.vehicle,
        update.variant,
        update.motor_type,
        update.prices || {}
      );

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: result.updated ? 'Price updated' : 'Price unchanged (no changes detected)',
          updated: result.updated,
        });
      } else {
        return NextResponse.json(
          {
            success: false,
            message: 'Price update failed',
            error: result.error,
          },
          { status: 404 }
        );
      }
    }
  } catch (error) {
    console.error('Price update error:', error);
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

/**
 * GET /api/master/prices
 * Get current prices from catalog
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const filters = {
      brand: searchParams.get('brand') || undefined,
      vehicleType: (searchParams.get('vehicle_type') as 'cars' | 'transport_cars') || undefined,
      motorType: searchParams.get('motor_type') || undefined,
      isCampaign: searchParams.get('is_campaign')
        ? searchParams.get('is_campaign') === 'true'
        : undefined,
    };

    const catalog = await getVehicleCatalog(filters);

    return NextResponse.json({
      success: true,
      count: catalog?.length || 0,
      filters: Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined)
      ),
      data: catalog,
    });
  } catch (error) {
    console.error('Get prices error:', error);
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
