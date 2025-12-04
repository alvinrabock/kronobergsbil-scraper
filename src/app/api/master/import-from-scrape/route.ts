/**
 * API Route: POST /api/master/import-from-scrape
 *
 * Import scraped vehicle data into the master database
 * Converts scraped data format to master database format
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Normalize motor type from scraped bransle field
 */
function normalizeMotorType(bransle?: string | null): string {
  if (!bransle) return 'UNKNOWN';

  const normalized = bransle.toUpperCase().trim();
  const mapping: Record<string, string> = {
    'EL': 'EL',
    'ELECTRIC': 'EL',
    'BENSIN': 'BENSIN',
    'DIESEL': 'DIESEL',
    'HYBRID': 'HYBRID',
    'LADDHYBRID': 'PHEV',
    'PLUG-IN HYBRID': 'PHEV',
    'PHEV': 'PHEV',
  };

  return mapping[normalized] || normalized;
}

/**
 * Extract drivetrain from variant name
 */
function extractDrivetrain(name: string): string | null {
  const patterns = ['4X4', '4WD', 'AWD', '2WD', 'FWD', 'RWD', 'ALLGRIP'];
  const upper = name.toUpperCase();

  for (const pattern of patterns) {
    if (upper.includes(pattern)) {
      return pattern === 'ALLGRIP' ? '4WD' : pattern;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, message: 'sessionId is required' },
        { status: 400 }
      );
    }

    const client = await getSupabaseClient();
    const results = {
      brandsCreated: 0,
      vehiclesCreated: 0,
      variantsCreated: 0,
      pricesUpdated: 0,
      errors: [] as string[],
    };

    // Fetch scraped vehicles from the session
    const { data: scrapedVehicles, error: fetchError } = await client
      .from('scraped_vehicles')
      .select(`
        *,
        vehicle_models (*)
      `)
      .eq('session_id', sessionId);

    if (fetchError) {
      return NextResponse.json(
        { success: false, message: `Failed to fetch scraped data: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!scrapedVehicles || scrapedVehicles.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No scraped vehicles found for this session' },
        { status: 404 }
      );
    }

    console.log(`📥 Importing ${scrapedVehicles.length} vehicles from scrape session ${sessionId}`);

    for (const vehicle of scrapedVehicles) {
      try {
        // 1. Get or create brand
        let brandId: string;
        const { data: existingBrand } = await client
          .from('master_brands')
          .select('id')
          .eq('name', vehicle.brand)
          .single();

        if (existingBrand) {
          brandId = existingBrand.id;
        } else {
          const { data: newBrand, error: brandError } = await client
            .from('master_brands')
            .insert({ name: vehicle.brand })
            .select('id')
            .single();

          if (brandError) {
            results.errors.push(`Failed to create brand ${vehicle.brand}: ${brandError.message}`);
            continue;
          }
          brandId = newBrand.id;
          results.brandsCreated++;
          console.log(`✅ Created brand: ${vehicle.brand}`);
        }

        // 2. Get or create vehicle
        let vehicleId: string;
        const vehicleName = vehicle.title;
        const slug = vehicleName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        const { data: existingVehicle } = await client
          .from('master_vehicles')
          .select('id')
          .eq('brand_id', brandId)
          .eq('name', vehicleName)
          .maybeSingle();

        if (existingVehicle) {
          vehicleId = existingVehicle.id;
          // Update vehicle with latest info
          await client
            .from('master_vehicles')
            .update({
              description: vehicle.description,
              thumbnail_url: vehicle.thumbnail_url,
              vehicle_type: vehicle.vehicle_type || 'cars',
              updated_at: new Date().toISOString(),
            })
            .eq('id', vehicleId);
        } else {
          const { data: newVehicle, error: vehicleError } = await client
            .from('master_vehicles')
            .insert({
              brand_id: brandId,
              name: vehicleName,
              slug,
              description: vehicle.description,
              thumbnail_url: vehicle.thumbnail_url,
              vehicle_type: vehicle.vehicle_type || 'cars',
              model_year: new Date().getFullYear(),
              is_active: true,
            })
            .select('id')
            .single();

          if (vehicleError) {
            results.errors.push(`Failed to create vehicle ${vehicleName}: ${vehicleError.message}`);
            continue;
          }
          vehicleId = newVehicle.id;
          results.vehiclesCreated++;
          console.log(`✅ Created vehicle: ${vehicle.brand} ${vehicleName}`);
        }

        // 3. Process each vehicle model (variant)
        const models = vehicle.vehicle_models || [];
        for (const model of models) {
          try {
            const motorType = normalizeMotorType(model.bransle);
            const drivlina = extractDrivetrain(model.name);

            // Get or create variant
            let variantId: string;
            const { data: existingVariant } = await client
              .from('master_variants')
              .select('id')
              .eq('vehicle_id', vehicleId)
              .eq('name', model.name)
              .maybeSingle();

            if (existingVariant) {
              variantId = existingVariant.id;
              // Update variant
              await client
                .from('master_variants')
                .update({
                  motor_type: motorType,
                  drivlina,
                  vaxellada: model.vaxellada,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', variantId);
            } else {
              const { data: newVariant, error: variantError } = await client
                .from('master_variants')
                .insert({
                  vehicle_id: vehicleId,
                  name: model.name,
                  motor_type: motorType,
                  motor_key: motorType,
                  drivlina,
                  vaxellada: model.vaxellada,
                })
                .select('id')
                .single();

              if (variantError) {
                results.errors.push(`Failed to create variant ${model.name}: ${variantError.message}`);
                continue;
              }
              variantId = newVariant.id;
              results.variantsCreated++;
            }

            // 4. Update or create price record
            // Check if there's an existing current price
            const { data: existingPrice } = await client
              .from('variant_prices')
              .select('id, pris, privatleasing')
              .eq('variant_id', variantId)
              .is('valid_until', null)
              .maybeSingle();

            const hasChanged = !existingPrice ||
              existingPrice.pris !== model.price ||
              existingPrice.privatleasing !== model.privatleasing;

            if (hasChanged) {
              // Mark old price as expired if exists
              if (existingPrice) {
                await client
                  .from('variant_prices')
                  .update({ valid_until: new Date().toISOString() })
                  .eq('id', existingPrice.id);
              }

              // Insert new price
              const { error: priceError } = await client
                .from('variant_prices')
                .insert({
                  variant_id: variantId,
                  pris: model.price || null,
                  old_pris: model.old_price || null,
                  privatleasing: model.privatleasing || null,
                  old_privatleasing: model.old_privatleasing || null,
                  foretagsleasing: model.company_leasing_price || null,
                  old_foretagsleasing: model.old_company_leasing_price || null,
                  billan_per_man: model.loan_price || null,
                  old_billan_per_man: model.old_loan_price || null,
                  is_campaign: !!(model.old_price && model.old_price > 0),
                  source_url: vehicle.source_url,
                });

              if (priceError) {
                results.errors.push(`Failed to update price for ${model.name}: ${priceError.message}`);
              } else {
                results.pricesUpdated++;
              }
            }
          } catch (modelErr) {
            results.errors.push(`Error processing model ${model.name}: ${modelErr}`);
          }
        }
      } catch (vehicleErr) {
        results.errors.push(`Error processing vehicle ${vehicle.title}: ${vehicleErr}`);
      }
    }

    return NextResponse.json({
      success: results.errors.length === 0,
      message: `Imported ${scrapedVehicles.length} vehicles`,
      results,
    });
  } catch (error) {
    console.error('Import from scrape error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Import failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/master/import-from-scrape',
    method: 'POST',
    description: 'Import scraped vehicle data into the master database',
    body: {
      sessionId: 'UUID of the scrape session to import',
    },
  });
}
