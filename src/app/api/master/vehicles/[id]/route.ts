/**
 * API Route: GET /api/master/vehicles/[id]
 *
 * Get complete vehicle details including specs, equipment, colors, prices
 */

import { NextRequest, NextResponse } from 'next/server';
import { getVehicleDetails, getVehicleEquipment, getPriceHistory } from '@/lib/master-vehicle-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Vehicle ID is required' },
        { status: 400 }
      );
    }

    // Get complete vehicle details
    const details = await getVehicleDetails(id);

    if (!details.vehicle) {
      return NextResponse.json(
        { success: false, message: 'Vehicle not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: details,
    });
  } catch (error) {
    console.error('Get vehicle details error:', error);
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
