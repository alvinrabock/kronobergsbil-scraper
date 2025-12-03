/**
 * API Route: GET /api/master/vehicles
 *
 * List all vehicles in the master database
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(supabaseUrl, supabaseKey);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const client = getSupabaseClient();

    const brand = searchParams.get('brand');
    const vehicleType = searchParams.get('vehicle_type');
    const isActive = searchParams.get('is_active');

    let query = client
      .from('master_vehicles')
      .select(`
        *,
        master_brands (
          id,
          name,
          logo_url
        ),
        master_variants (
          id,
          name,
          trim_level,
          motor_type,
          drivlina
        )
      `)
      .order('name', { ascending: true });

    if (brand) {
      // Get brand ID first
      const { data: brandData } = await client
        .from('master_brands')
        .select('id')
        .eq('name', brand)
        .single();

      if (brandData) {
        query = query.eq('brand_id', brandData.id);
      }
    }

    if (vehicleType) {
      query = query.eq('vehicle_type', vehicleType);
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      data: data || [],
    });
  } catch (error) {
    console.error('List vehicles error:', error);
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
