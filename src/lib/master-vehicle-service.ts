/**
 * Master Vehicle Service
 *
 * Handles importing PDF data into the master vehicle database
 * and updating prices from daily scraping.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type {
  PDFVehicleData,
  MasterBrand,
  MasterVehicle,
  MasterVariant,
  InsertMasterBrand,
  InsertMasterVehicle,
  InsertMasterVariant,
  InsertMasterMotorSpecs,
  InsertMasterDimensions,
  InsertMasterEquipment,
  InsertMasterColor,
  InsertMasterWheel,
  InsertMasterInterior,
  InsertMasterPackage,
  InsertMasterWarranty,
  InsertVariantPrice,
  VariantPrice,
} from './database/master-types';

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

/**
 * Get Supabase client for server-side operations
 * Uses the same pattern as the rest of the app for proper authentication
 */
async function getSupabaseClient(): Promise<SupabaseClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  // Try to use the server client with cookies for proper auth context
  try {
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
  } catch {
    // Fallback to simple client if cookies not available (e.g., in scripts)
    console.log('Using simple Supabase client (no cookie context)');
    return createClient(supabaseUrl, supabaseKey);
  }
}

// =============================================================================
// BRAND OPERATIONS
// =============================================================================

/**
 * Get or create a brand by name
 */
export async function getOrCreateBrand(name: string): Promise<MasterBrand> {
  const client = await getSupabaseClient();

  // Try to find existing brand
  const { data: existing } = await client
    .from('master_brands')
    .select('*')
    .eq('name', name)
    .single();

  if (existing) {
    return existing as MasterBrand;
  }

  // Create new brand
  const { data: newBrand, error } = await client
    .from('master_brands')
    .insert({ name } as InsertMasterBrand)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create brand: ${error.message}`);
  }

  return newBrand as MasterBrand;
}

// =============================================================================
// VEHICLE OPERATIONS
// =============================================================================

/**
 * Get or create a master vehicle
 */
export async function getOrCreateVehicle(
  brandId: string,
  name: string,
  modelYear?: number
): Promise<MasterVehicle> {
  const client = await getSupabaseClient();

  // Generate slug
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Try to find existing vehicle
  const query = client
    .from('master_vehicles')
    .select('*')
    .eq('brand_id', brandId)
    .eq('name', name);

  if (modelYear) {
    query.eq('model_year', modelYear);
  }

  const { data: existing } = await query.single();

  if (existing) {
    return existing as MasterVehicle;
  }

  // Create new vehicle
  const insertData: InsertMasterVehicle = {
    brand_id: brandId,
    name,
    slug,
    model_year: modelYear || null,
    is_active: true,
  };

  const { data: newVehicle, error } = await client
    .from('master_vehicles')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create vehicle: ${error.message}`);
  }

  return newVehicle as MasterVehicle;
}

// =============================================================================
// PDF IMPORT SERVICE
// =============================================================================

export interface ImportResult {
  success: boolean;
  vehicleId: string | null;
  variantsCreated: number;
  pricesUpdated: number;
  errors: string[];
}

/**
 * Import complete vehicle data from PDF extraction
 */
export async function importPDFVehicleData(data: PDFVehicleData): Promise<ImportResult> {
  const client = await getSupabaseClient();
  const errors: string[] = [];
  let variantsCreated = 0;
  let pricesUpdated = 0;

  try {
    // 1. Get or create brand
    const brand = await getOrCreateBrand(data.meta.brand);

    // 2. Get or create vehicle
    const vehicle = await getOrCreateVehicle(
      brand.id,
      data.meta.model,
      data.meta.model_year
    );

    // Update vehicle with PDF metadata
    await client
      .from('master_vehicles')
      .update({
        pdf_source_url: data.meta.pdf_url || null,
        pdf_extracted_at: new Date().toISOString(),
        pdf_type: data.meta.pdf_type,
        description: data.meta.model,
      })
      .eq('id', vehicle.id);

    // 3. Import dimensions (if present)
    if (data.dimensioner) {
      await importDimensions(client, vehicle.id, data.dimensioner);
    }

    // 4. Import motor specs (if present)
    if (data.motor_specs) {
      await importMotorSpecs(client, vehicle.id, data.motor_specs);
    }

    // 5. Import equipment (if present)
    if (data.utrustning && data.utrustning.length > 0) {
      await importEquipment(client, vehicle.id, data.utrustning);
    }

    // 6. Import packages (if present)
    if (data.tillval_paket && data.tillval_paket.length > 0) {
      await importPackages(client, vehicle.id, data.tillval_paket);
    }

    // 7. Import colors (if present)
    if (data.tillval_farger && data.tillval_farger.length > 0) {
      await importColors(client, vehicle.id, data.tillval_farger);
    }

    // 8. Import wheels (if present)
    if (data.tillval_falgar && data.tillval_falgar.length > 0) {
      await importWheels(client, vehicle.id, data.tillval_falgar);
    }

    // 9. Import interiors (if present)
    if (data.tillval_interior && data.tillval_interior.length > 0) {
      await importInteriors(client, vehicle.id, data.tillval_interior);
    }

    // 10. Import warranty (if present)
    if (data.garanti) {
      await importWarranty(client, vehicle.id, data.garanti);
    }

    // 11. Import variants and prices
    for (const variant of data.variants) {
      try {
        const variantRecord = await importVariant(client, vehicle.id, variant);
        variantsCreated++;

        // Import/update prices for this variant
        const priceResult = await updateVariantPrice(client, variantRecord.id, {
          pris: variant.pris,
          old_pris: variant.old_pris,
          privatleasing: variant.privatleasing,
          old_privatleasing: variant.old_privatleasing,
          foretagsleasing: variant.foretagsleasing,
          old_foretagsleasing: variant.old_foretagsleasing,
          billan_per_man: variant.billan_per_man,
          old_billan_per_man: variant.old_billan_per_man,
          leasing_months: variant.leasing_months,
          leasing_km_per_year: variant.leasing_km_per_year,
          leasing_deposit: variant.leasing_deposit,
          is_campaign: !!(variant.old_pris && variant.old_pris > 0),
          source_url: data.meta.pdf_url,
        });

        if (priceResult) {
          pricesUpdated++;
        }
      } catch (err) {
        errors.push(`Failed to import variant ${variant.name}: ${err}`);
      }
    }

    return {
      success: true,
      vehicleId: vehicle.id,
      variantsCreated,
      pricesUpdated,
      errors,
    };
  } catch (err) {
    return {
      success: false,
      vehicleId: null,
      variantsCreated,
      pricesUpdated,
      errors: [...errors, `Import failed: ${err}`],
    };
  }
}

// =============================================================================
// IMPORT HELPERS
// =============================================================================

async function importDimensions(
  client: ReturnType<typeof createClient>,
  vehicleId: string,
  dims: NonNullable<PDFVehicleData['dimensioner']>
) {
  const data: InsertMasterDimensions = {
    vehicle_id: vehicleId,
    langd: dims.langd_mm || null,
    bredd: dims.bredd_mm || null,
    bredd_med_speglar: dims.bredd_med_speglar_mm || null,
    hojd: dims.hojd_mm || null,
    axelavstand: dims.axelavstand_mm || null,
    bagageutrymme_liter: dims.bagageutrymme_liter || null,
    bagageutrymme_max_liter: dims.bagageutrymme_max_liter || null,
    tjanstevikt: dims.tjanstevikt_kg || null,
    max_last: dims.max_last_kg || null,
    totalvikt: dims.totalvikt_kg || null,
    max_slap_bromsat: dims.max_slap_bromsat_kg || null,
    max_slap_obromsat: dims.max_slap_obromsat_kg || null,
    tankvolym_liter: dims.tankvolym_liter || null,
  };

  // Upsert dimensions
  await client
    .from('master_dimensions')
    .upsert(data, { onConflict: 'vehicle_id' });
}

async function importMotorSpecs(
  client: ReturnType<typeof createClient>,
  vehicleId: string,
  specs: NonNullable<PDFVehicleData['motor_specs']>
) {
  for (const [motorKey, spec] of Object.entries(specs)) {
    const data: InsertMasterMotorSpecs = {
      vehicle_id: vehicleId,
      motor_key: motorKey,
      motor_type: spec.motor_type,
      effekt_kw: spec.effekt_kw || null,
      effekt_hk: spec.effekt_hk || null,
      systemeffekt_kw: spec.systemeffekt_kw || null,
      systemeffekt_hk: spec.systemeffekt_hk || null,
      batterikapacitet_kwh: spec.batterikapacitet_kwh || null,
      rackvidd_km: spec.rackvidd_km || null,
      acceleration_0_100: spec.acceleration_0_100 || null,
      toppfart: spec.toppfart || null,
      forbrukning: spec.forbrukning || null,
      co2_utslapp: spec.co2_utslapp || null,
      vaxellada: spec.vaxellada || null,
      antal_vaxlar: spec.antal_vaxlar || null,
    };

    await client
      .from('master_motor_specs')
      .upsert(data, { onConflict: 'vehicle_id,motor_key' });
  }
}

async function importEquipment(
  client: ReturnType<typeof createClient>,
  vehicleId: string,
  equipment: NonNullable<PDFVehicleData['utrustning']>
) {
  for (const item of equipment) {
    const data: InsertMasterEquipment = {
      vehicle_id: vehicleId,
      name: item.name,
      category: item.category || null,
      description: item.description || null,
      standard_for: item.standard_for || null,
      tillval_for: item.tillval_for || null,
      tillval_via_paket: item.tillval_via_paket || null,
      tillval_pris: item.tillval_pris || null,
    };

    await client
      .from('master_equipment')
      .upsert(data, { onConflict: 'vehicle_id,name' });
  }
}

async function importPackages(
  client: ReturnType<typeof createClient>,
  vehicleId: string,
  packages: NonNullable<PDFVehicleData['tillval_paket']>
) {
  for (const pkg of packages) {
    const data: InsertMasterPackage = {
      vehicle_id: vehicleId,
      name: pkg.name,
      description: pkg.description || null,
      pris: pkg.pris || null,
      available_for_trims: pkg.available_for_trims || null,
      included_items: pkg.innehall || null,
    };

    await client
      .from('master_packages')
      .upsert(data, { onConflict: 'vehicle_id,name' });
  }
}

async function importColors(
  client: ReturnType<typeof createClient>,
  vehicleId: string,
  colors: NonNullable<PDFVehicleData['tillval_farger']>
) {
  for (const color of colors) {
    const data: InsertMasterColor = {
      vehicle_id: vehicleId,
      name: color.name,
      color_code: color.color_code || null,
      color_type: color.color_type || null,
      pris: color.pris || null,
      is_standard: color.is_standard || false,
      available_for_trims: color.available_for_trims || null,
    };

    await client
      .from('master_colors')
      .upsert(data, { onConflict: 'vehicle_id,name' });
  }
}

async function importWheels(
  client: ReturnType<typeof createClient>,
  vehicleId: string,
  wheels: NonNullable<PDFVehicleData['tillval_falgar']>
) {
  for (const wheel of wheels) {
    const data: InsertMasterWheel = {
      vehicle_id: vehicleId,
      name: wheel.name,
      size: wheel.size || null,
      style: wheel.style || null,
      pris: wheel.pris || null,
      standard_for: wheel.standard_for || null,
      tillval_for: wheel.tillval_for || null,
    };

    await client
      .from('master_wheels')
      .upsert(data, { onConflict: 'vehicle_id,name' });
  }
}

async function importInteriors(
  client: ReturnType<typeof createClient>,
  vehicleId: string,
  interiors: NonNullable<PDFVehicleData['tillval_interior']>
) {
  for (const interior of interiors) {
    const data: InsertMasterInterior = {
      vehicle_id: vehicleId,
      name: interior.name,
      material: interior.material || null,
      color: interior.color || null,
      pris: interior.pris || null,
      standard_for: interior.standard_for || null,
      tillval_for: interior.tillval_for || null,
    };

    await client
      .from('master_interiors')
      .upsert(data, { onConflict: 'vehicle_id,name' });
  }
}

async function importWarranty(
  client: ReturnType<typeof createClient>,
  vehicleId: string,
  warranty: NonNullable<PDFVehicleData['garanti']>
) {
  const data: InsertMasterWarranty = {
    vehicle_id: vehicleId,
    nybilsgaranti: warranty.nybilsgaranti || null,
    vagassistans: warranty.vagassistans || null,
    rostgaranti: warranty.rostgaranti || null,
    batterigaranti: warranty.batterigaranti || null,
    lackgaranti: warranty.lackgaranti || null,
    service_interval: warranty.service_interval || null,
  };

  await client
    .from('master_warranty')
    .upsert(data, { onConflict: 'vehicle_id' });
}

async function importVariant(
  client: ReturnType<typeof createClient>,
  vehicleId: string,
  variant: PDFVehicleData['variants'][0]
): Promise<MasterVariant> {
  // Check if variant exists
  const { data: existing } = await client
    .from('master_variants')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .eq('name', variant.name)
    .eq('motor_type', variant.motor || '')
    .maybeSingle();

  if (existing) {
    return existing as MasterVariant;
  }

  // Find base variant if this is a Plus variant
  let baseVariantId: string | null = null;
  if (variant.is_plus_variant && variant.base_variant) {
    const { data: baseVariant } = await client
      .from('master_variants')
      .select('id')
      .eq('vehicle_id', vehicleId)
      .eq('name', variant.base_variant)
      .single();

    if (baseVariant) {
      baseVariantId = baseVariant.id;
    }
  }

  const data: InsertMasterVariant = {
    vehicle_id: vehicleId,
    name: variant.name,
    trim_level: variant.trim || null,
    motor_type: variant.motor || null,
    motor_key: variant.motor || null,
    drivlina: variant.drivlina || null,
    is_plus_variant: variant.is_plus_variant || false,
    base_variant_id: baseVariantId,
    included_packages: variant.included_packages || null,
  };

  const { data: newVariant, error } = await client
    .from('master_variants')
    .insert(data)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create variant: ${error.message}`);
  }

  return newVariant as MasterVariant;
}

// =============================================================================
// PRICE UPDATE SERVICE
// =============================================================================

interface PriceUpdateData {
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
}

/**
 * Update or create price for a variant
 */
async function updateVariantPrice(
  client: ReturnType<typeof createClient>,
  variantId: string,
  priceData: PriceUpdateData
): Promise<boolean> {
  // Check if there's an existing current price
  const { data: existing } = await client
    .from('variant_prices')
    .select('*')
    .eq('variant_id', variantId)
    .is('valid_until', null)
    .single();

  if (existing) {
    // Check if prices have changed
    const hasChanged =
      existing.pris !== priceData.pris ||
      existing.privatleasing !== priceData.privatleasing ||
      existing.foretagsleasing !== priceData.foretagsleasing ||
      existing.billan_per_man !== priceData.billan_per_man;

    if (!hasChanged) {
      // Just update scraped_at timestamp
      await client
        .from('variant_prices')
        .update({ scraped_at: new Date().toISOString() })
        .eq('id', existing.id);
      return false;
    }

    // Mark old price as expired
    await client
      .from('variant_prices')
      .update({ valid_until: new Date().toISOString() })
      .eq('id', existing.id);
  }

  // Insert new price record
  const insertData: InsertVariantPrice = {
    variant_id: variantId,
    pris: priceData.pris ?? null,
    old_pris: priceData.old_pris ?? null,
    privatleasing: priceData.privatleasing ?? null,
    old_privatleasing: priceData.old_privatleasing ?? null,
    foretagsleasing: priceData.foretagsleasing ?? null,
    old_foretagsleasing: priceData.old_foretagsleasing ?? null,
    billan_per_man: priceData.billan_per_man ?? null,
    old_billan_per_man: priceData.old_billan_per_man ?? null,
    leasing_months: priceData.leasing_months ?? null,
    leasing_km_per_year: priceData.leasing_km_per_year ?? null,
    leasing_deposit: priceData.leasing_deposit ?? null,
    is_campaign: priceData.is_campaign ?? false,
    campaign_name: priceData.campaign_name ?? null,
    campaign_end: priceData.campaign_end ?? null,
    source_url: priceData.source_url ?? null,
  };

  await client.from('variant_prices').insert(insertData);

  return true;
}

/**
 * Update prices from scraped data
 * This is the main function called by daily scraping jobs
 */
export async function updatePricesFromScrape(
  brandName: string,
  vehicleName: string,
  variantName: string,
  motorType: string,
  prices: PriceUpdateData
): Promise<{ success: boolean; updated: boolean; error?: string }> {
  const client = await getSupabaseClient();

  try {
    // Find the brand
    const { data: brand } = await client
      .from('master_brands')
      .select('id')
      .eq('name', brandName)
      .single();

    if (!brand) {
      return { success: false, updated: false, error: `Brand not found: ${brandName}` };
    }

    // Find the vehicle
    const { data: vehicle } = await client
      .from('master_vehicles')
      .select('id')
      .eq('brand_id', brand.id)
      .eq('name', vehicleName)
      .single();

    if (!vehicle) {
      return { success: false, updated: false, error: `Vehicle not found: ${vehicleName}` };
    }

    // Find the variant
    const { data: variant } = await client
      .from('master_variants')
      .select('id')
      .eq('vehicle_id', vehicle.id)
      .eq('name', variantName)
      .eq('motor_type', motorType)
      .single();

    if (!variant) {
      return {
        success: false,
        updated: false,
        error: `Variant not found: ${variantName} (${motorType})`,
      };
    }

    // Update the price
    const updated = await updateVariantPrice(client, variant.id, prices);

    return { success: true, updated };
  } catch (err) {
    return { success: false, updated: false, error: String(err) };
  }
}

// =============================================================================
// QUERY HELPERS
// =============================================================================

/**
 * Get complete vehicle catalog with current prices
 * Uses direct table queries instead of a view for better compatibility
 */
export async function getVehicleCatalog(filters?: {
  brand?: string;
  vehicleType?: 'cars' | 'transport_cars';
  motorType?: string;
  isCampaign?: boolean;
}) {
  const client = await getSupabaseClient();

  try {
    // First, get all variants with their vehicle and brand info
    let variantsQuery = client
      .from('master_variants')
      .select(`
        id,
        name,
        trim_level,
        motor_type,
        motor_key,
        drivlina,
        vaxellada,
        master_vehicles!inner (
          id,
          name,
          slug,
          model_year,
          vehicle_type,
          thumbnail_url,
          master_brands!inner (
            id,
            name
          )
        )
      `);

    // Apply motor type filter at variant level
    if (filters?.motorType) {
      variantsQuery = variantsQuery.eq('motor_type', filters.motorType);
    }

    const { data: variants, error: variantsError } = await variantsQuery;

    if (variantsError) {
      console.error('Variants query error:', variantsError);
      throw new Error(`Failed to fetch variants: ${variantsError.message}`);
    }

    if (!variants || variants.length === 0) {
      return [];
    }

    // Get current prices for all variants
    const variantIds = variants.map((v) => v.id);
    const { data: prices, error: pricesError } = await client
      .from('variant_prices')
      .select('*')
      .in('variant_id', variantIds)
      .is('valid_until', null);

    if (pricesError) {
      console.error('Prices query error:', pricesError);
      // Continue without prices rather than failing completely
    }

    // Get motor specs for enrichment
    const vehicleIds = [...new Set(variants.map((v) => (v.master_vehicles as { id: string }).id))];
    const { data: motorSpecs } = await client
      .from('master_motor_specs')
      .select('*')
      .in('vehicle_id', vehicleIds);

    const { data: dimensions } = await client
      .from('master_dimensions')
      .select('*')
      .in('vehicle_id', vehicleIds);

    // Create lookup maps
    const priceMap = new Map(prices?.map((p) => [p.variant_id, p]) || []);
    const motorSpecsMap = new Map<string, Record<string, unknown>[]>();
    motorSpecs?.forEach((spec) => {
      if (!motorSpecsMap.has(spec.vehicle_id)) {
        motorSpecsMap.set(spec.vehicle_id, []);
      }
      motorSpecsMap.get(spec.vehicle_id)!.push(spec);
    });
    const dimensionsMap = new Map(dimensions?.map((d) => [d.vehicle_id, d]) || []);

    // Build catalog entries
    const catalog = variants.map((variant) => {
      const vehicle = variant.master_vehicles as {
        id: string;
        name: string;
        slug: string;
        model_year: number | null;
        vehicle_type: string;
        thumbnail_url: string | null;
        master_brands: { id: string; name: string };
      };
      const brand = vehicle.master_brands;
      const price = priceMap.get(variant.id);
      const vehicleMotorSpecs = motorSpecsMap.get(vehicle.id) || [];
      const vehicleDimensions = dimensionsMap.get(vehicle.id);

      // Find matching motor spec
      const matchingMotorSpec = vehicleMotorSpecs.find(
        (spec) => spec.motor_key === variant.motor_key || spec.motor_type === variant.motor_type
      );

      return {
        // Brand info
        brand: brand.name,
        brand_id: brand.id,
        // Vehicle info
        vehicle_id: vehicle.id,
        vehicle_name: vehicle.name,
        slug: vehicle.slug,
        model_year: vehicle.model_year,
        vehicle_type: vehicle.vehicle_type,
        thumbnail_url: vehicle.thumbnail_url,
        // Variant info
        variant_id: variant.id,
        variant_name: variant.name,
        trim_level: variant.trim_level,
        motor_type: variant.motor_type,
        drivlina: variant.drivlina,
        vaxellada: variant.vaxellada || (matchingMotorSpec?.vaxellada as string) || null,
        // Motor specs
        effekt_hk: (matchingMotorSpec?.effekt_hk as number) || null,
        rackvidd_km: (matchingMotorSpec?.rackvidd_km as number) || null,
        forbrukning: (matchingMotorSpec?.forbrukning as string) || null,
        // Dimensions
        langd: (vehicleDimensions?.langd as number) || null,
        bagageutrymme_liter: (vehicleDimensions?.bagageutrymme_liter as number) || null,
        // Pricing
        pris: price?.pris || null,
        old_pris: price?.old_pris || null,
        privatleasing: price?.privatleasing || null,
        foretagsleasing: price?.foretagsleasing || null,
        billan_per_man: price?.billan_per_man || null,
        // Campaign info
        is_campaign: price?.is_campaign || false,
        campaign_name: price?.campaign_name || null,
        campaign_end: price?.campaign_end || null,
        price_updated_at: price?.scraped_at || null,
      };
    });

    // Apply remaining filters
    let filteredCatalog = catalog;

    if (filters?.brand) {
      filteredCatalog = filteredCatalog.filter((item) => item.brand === filters.brand);
    }
    if (filters?.vehicleType) {
      filteredCatalog = filteredCatalog.filter((item) => item.vehicle_type === filters.vehicleType);
    }
    if (filters?.isCampaign !== undefined) {
      filteredCatalog = filteredCatalog.filter((item) => item.is_campaign === filters.isCampaign);
    }

    return filteredCatalog;
  } catch (err) {
    console.error('getVehicleCatalog error:', err);
    throw err;
  }
}

/**
 * Get price history for a variant
 */
export async function getPriceHistory(variantId: string, limit = 30) {
  const client = await getSupabaseClient();

  const { data, error } = await client
    .from('price_history')
    .select('*')
    .eq('variant_id', variantId)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch price history: ${error.message}`);
  }

  return data;
}

/**
 * Get all equipment for a vehicle
 */
export async function getVehicleEquipment(vehicleId: string) {
  const client = await getSupabaseClient();

  const { data, error } = await client
    .from('master_equipment')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('category', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch equipment: ${error.message}`);
  }

  return data;
}

/**
 * Get complete vehicle details including all specs
 */
export async function getVehicleDetails(vehicleId: string) {
  const client = await getSupabaseClient();

  // Fetch all related data in parallel
  const [
    vehicleResult,
    variantsResult,
    motorsResult,
    dimensionsResult,
    equipmentResult,
    colorsResult,
    packagesResult,
    warrantyResult,
  ] = await Promise.all([
    client.from('master_vehicles').select('*, master_brands(*)').eq('id', vehicleId).single(),
    client.from('master_variants').select('*').eq('vehicle_id', vehicleId),
    client.from('master_motor_specs').select('*').eq('vehicle_id', vehicleId),
    client.from('master_dimensions').select('*').eq('vehicle_id', vehicleId).single(),
    client.from('master_equipment').select('*').eq('vehicle_id', vehicleId),
    client.from('master_colors').select('*').eq('vehicle_id', vehicleId),
    client.from('master_packages').select('*').eq('vehicle_id', vehicleId),
    client.from('master_warranty').select('*').eq('vehicle_id', vehicleId).single(),
  ]);

  // Get current prices for each variant
  const variantIds = variantsResult.data?.map((v) => v.id) || [];
  const pricesResult = await client
    .from('variant_prices')
    .select('*')
    .in('variant_id', variantIds)
    .is('valid_until', null);

  return {
    vehicle: vehicleResult.data,
    variants: variantsResult.data || [],
    motorSpecs: motorsResult.data || [],
    dimensions: dimensionsResult.data,
    equipment: equipmentResult.data || [],
    colors: colorsResult.data || [],
    packages: packagesResult.data || [],
    warranty: warrantyResult.data,
    currentPrices: pricesResult.data || [],
  };
}
