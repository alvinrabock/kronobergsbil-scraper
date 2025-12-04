/**
 * API Route: /api/catalog
 *
 * GET - Get all scraped vehicles with their models (deduplicated by default)
 * POST - Push deduplicated catalog to CMS
 *
 * Query parameters (GET):
 * - session_id: If provided, returns EXACT data from that session (no deduplication)
 * - brand: Filter by brand
 * - vehicle_type: Filter by vehicle type (cars, transport_cars)
 * - bransle: Filter by fuel type
 * - dedupe: Set to "false" to skip deduplication (default: true)
 * - format: Set to "json" for clean JSON export format (default: standard API response)
 *
 * POST body:
 * - brand: Optional - filter by brand before pushing
 * - vehicle_type: Optional - filter by vehicle type before pushing
 * - dry_run: If true, only returns what would be pushed without actually pushing
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  transformVehicleDataToCMS,
  getExistingBilmodeller,
  findMatchingBilmodell,
  createBilmodellInCMS,
  updateBilmodellInCMS,
} from '@/lib/cms-api';

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

interface VehicleModel {
  id: string;
  name: string;
  price: number | null;
  old_price: number | null;
  privatleasing: number | null;
  old_privatleasing: number | null;
  company_leasing_price: number | null;
  old_company_leasing_price: number | null;
  loan_price: number | null;
  old_loan_price: number | null;
  biltyp: string | null;
  bransle: string | null;
  vaxellada: string | null;
  thumbnail_url: string | null;
  utrustning: string[] | null;
  created_at: string;
}

interface Vehicle {
  id: string;
  title: string;
  brand: string;
  description: string | null;
  thumbnail_url: string | null;
  vehicle_type: string;
  free_text: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  vehicle_models: VehicleModel[];
}

/**
 * Get EXACT data from a specific scrape session without any deduplication
 * This matches exactly what the scrape page shows at /scrape/{sessionId}
 */
async function getSessionData(
  client: ReturnType<typeof createServerClient>,
  sessionId: string,
  brand: string | null,
  vehicleType: string | null,
  bransle: string | null
) {
  // Get vehicles from the vehicles table for this session
  let vehicleQuery = client
    .from('vehicles')
    .select(`
      id,
      title,
      brand,
      description,
      thumbnail_url,
      vehicle_type,
      free_text,
      source_url,
      created_at,
      updated_at,
      vehicle_models (
        id,
        name,
        price,
        old_price,
        privatleasing,
        old_privatleasing,
        company_leasing_price,
        old_company_leasing_price,
        loan_price,
        old_loan_price,
        biltyp,
        bransle,
        vaxellada,
        thumbnail_url,
        utrustning,
        created_at
      )
    `)
    .eq('session_id', sessionId)
    .order('brand', { ascending: true })
    .order('title', { ascending: true });

  // Apply filters
  if (brand) {
    vehicleQuery = vehicleQuery.eq('brand', brand);
  }
  if (vehicleType) {
    vehicleQuery = vehicleQuery.eq('vehicle_type', vehicleType);
  }

  const { data: vehicles, error: vehicleError } = await vehicleQuery;

  if (vehicleError) {
    console.error('Session vehicles query error:', vehicleError);
    return NextResponse.json(
      { success: false, message: `Failed to fetch session vehicles: ${vehicleError.message}` },
      { status: 500 }
    );
  }

  // Filter by bransle if specified
  let filteredVehicles = vehicles || [];
  if (bransle) {
    filteredVehicles = filteredVehicles.map(v => ({
      ...v,
      vehicle_models: (v.vehicle_models || []).filter((m: { bransle?: string | null }) =>
        m.bransle?.toLowerCase() === bransle.toLowerCase()
      )
    })).filter(v => v.vehicle_models.length > 0);
  }

  // Get unique brands and fuel types for filters
  const allBrands = [...new Set(filteredVehicles.map(v => v.brand).filter(Boolean))].sort();
  const allBransle = [...new Set(
    filteredVehicles.flatMap(v =>
      (v.vehicle_models || []).map((m: { bransle?: string | null }) => m.bransle)
    ).filter(Boolean)
  )].sort() as string[];

  // Calculate stats
  const totalVehicles = filteredVehicles.length;
  const totalVariants = filteredVehicles.reduce((sum, v) => sum + (v.vehicle_models?.length || 0), 0);
  const campaignCount = filteredVehicles.reduce((sum, v) =>
    sum + (v.vehicle_models || []).filter((m: { old_price?: number | null }) => m.old_price && m.old_price > 0).length, 0
  );

  // Get session info
  const { data: session } = await client
    .from('scrape_sessions')
    .select('id, url, status, created_at, completed_at, content_type')
    .eq('id', sessionId)
    .single();

  return NextResponse.json({
    success: true,
    data: filteredVehicles,
    session: session || { id: sessionId },
    filters: {
      brands: allBrands,
      bransle: allBransle,
    },
    stats: {
      totalVehicles,
      totalVariants,
      totalBrands: allBrands.length,
      campaignCount,
    },
    source: 'session',
  });
}

/**
 * Format vehicles for clean JSON export (NEW SCHEMA 2024)
 * Returns full vehicle structure with variants and all optional fields
 */
function formatVehiclesAsJson(vehicles: Vehicle[]) {
  return vehicles.map(vehicle => ({
    // Core fields
    id: vehicle.id,
    brand: vehicle.brand,
    title: vehicle.title,
    description: vehicle.description || null,
    thumbnail: vehicle.thumbnail_url || null,
    vehicle_type: vehicle.vehicle_type || 'cars',
    body_type: null, // Not stored in current DB schema
    source_url: vehicle.source_url || null,
    updated_at: vehicle.updated_at || null,

    // Variants (trim levels with pricing and specs)
    variants: (vehicle.vehicle_models || []).map(model => ({
      id: model.id,
      name: model.name,
      price: model.price ?? null,
      old_price: model.old_price ?? null,
      privatleasing: model.privatleasing ?? null,
      old_privatleasing: model.old_privatleasing ?? null,
      company_leasing: model.company_leasing_price ?? null,
      old_company_leasing: model.old_company_leasing_price ?? null,
      loan_price: model.loan_price ?? null,
      old_loan_price: model.old_loan_price ?? null,
      fuel_type: model.bransle || null,
      transmission: model.vaxellada || null,
      thumbnail: model.thumbnail_url || null,
      specs: {
        engine_cc: null,
        cylinders: null,
        power_kw: null,
        power_hp: null,
        torque_nm: null,
        top_speed_kmh: null,
        acceleration_0_100: null,
        fuel_consumption_l_100km: null,
        consumption_kwh_100km: null,
        co2_g_km: null,
        emission_class: null,
        range_km_wltp: null,
        battery_kwh: null,
        battery_type: null,
        battery_voltage: null,
        onboard_charger_kw: null,
        charging_time_home: null,
        charging_time_wallbox: null,
        charging_time_fast: null,
        drive_modes: null,
        curb_weight_kg: null,
        gross_weight_kg: null,
        max_payload_kg: null,
        max_towing_kg: null,
        turning_circle_m: null,
        tire_dimension: null
      },
      equipment: model.utrustning || []
    })),
    variant_count: (vehicle.vehicle_models || []).length,

    // Dimensions (shared across variants)
    dimensions: {
      length_mm: null,
      width_mm: null,
      height_mm: null,
      wheelbase_mm: null,
      front_overhang_mm: null,
      rear_overhang_mm: null,
      ground_clearance_mm: null,
      interior: {
        front_headroom_mm: null,
        rear_headroom_mm: null,
        front_shoulder_width_mm: null,
        rear_shoulder_width_mm: null,
        front_legroom_mm: null,
        rear_legroom_mm: null,
        cargo_volume_l: null,
        cargo_width_mm: null,
        cargo_depth_mm: null,
        cargo_height_mm: null
      }
    },

    // Configuration options
    colors: [],
    interiors: [],
    options: [],
    accessories: [],

    // Services
    services: [],
    connected_services: null,

    // Financing
    financing: null,

    // Warranties
    warranties: [],

    // Dealer
    dealer_info: null
  }));
}

/**
 * Normalize vehicle title for comparison
 * Removes brand prefix and common prefixes/suffixes
 */
function normalizeVehicleTitle(title: string, brand: string): string {
  return title
    .toLowerCase()
    .trim()
    // Remove brand prefix (e.g., "Opel Corsa" -> "Corsa")
    .replace(new RegExp(`^${brand.toLowerCase()}\\s+`, 'i'), '')
    // Remove common prefixes
    .replace(/^köp\s+/i, '')
    .replace(/^nya\s+/i, '')
    .replace(/^new\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a vehicle title indicates an electric vehicle
 * e.g., "e VITARA", "e-208", "ID.4"
 */
function isElectricVehicleTitle(title: string): boolean {
  const normalized = title.toLowerCase().trim();
  const electricPrefixes = ['e ', 'e-', 'i-', 'id.', 'id ', 'eq ', 'ev '];
  return electricPrefixes.some(p => normalized.startsWith(p));
}

/**
 * Filter variants to match the vehicle's powertrain type
 * e.g., "e VITARA" should only have electric variants, not hybrid
 */
function filterMismatchedVariants(models: VehicleModel[], vehicleTitle: string): VehicleModel[] {
  if (!models || models.length === 0) return [];

  const isElectricVehicle = isElectricVehicleTitle(vehicleTitle);

  if (!isElectricVehicle) {
    // Non-electric vehicle: keep all variants (hybrid, petrol, diesel, etc.)
    return models;
  }

  // Electric vehicle: filter out non-electric variants
  const filtered = models.filter(model => {
    const fuelType = (model.bransle || '').toLowerCase();
    const variantName = (model.name || '').toLowerCase();

    // Keep if fuel type is electric
    if (fuelType === 'el' || fuelType === 'electric' || fuelType === 'elektrisk') {
      return true;
    }

    // Keep if variant name indicates electric (kWh battery)
    if (variantName.includes('kwh')) {
      return true;
    }

    // Filter out hybrid variants from electric vehicles
    if (fuelType === 'hybrid' || variantName.includes('hybrid') || variantName.includes('1.4t') || variantName.includes('hev')) {
      console.log(`🔧 Filtering out mismatched variant "${model.name}" from electric vehicle "${vehicleTitle}"`);
      return false;
    }

    // Keep "Base" variants only if they don't have a fuel type set (might be electric)
    if (variantName === 'base' && !fuelType) {
      return true;
    }

    return true;
  });

  if (filtered.length !== models.length) {
    console.log(`🔧 Filtered ${models.length - filtered.length} mismatched variants from "${vehicleTitle}"`);
  }

  return filtered;
}

/**
 * Deduplicate vehicle model names using similarity matching
 * Handles cases like "Style PureTech" vs "Style PureTech 100 hk"
 */
function deduplicateVehicleModels(models: VehicleModel[], vehicleTitle: string = ''): VehicleModel[] {
  if (!models || models.length === 0) return [];

  // First, filter out mismatched variants (e.g., hybrid variants in electric vehicles)
  const filteredModels = filterMismatchedVariants(models, vehicleTitle);

  const modelMap = new Map<string, VehicleModel>();

  // Sort by updated date (most recent first) to prefer newer data
  const sorted = [...filteredModels].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  for (const model of sorted) {
    // Normalize model name for deduplication
    const normalizedName = model.name
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/(\d+)\s*(hk|hp)/gi, '$1hk')
      .replace(/\b(automat|aut|cvt|at)\b/gi, 'automat')
      .replace(/\b(manuell|man|mt)\b/gi, 'manuell')
      .replace(/\bsteglös\s*automat\b/gi, 'automat')
      .replace(/\b\d+-?(steg|växlar?)\b/gi, '')
      .trim();

    // Check for existing similar model
    let foundMatch = false;
    for (const [existingKey, existingModel] of modelMap.entries()) {
      const existingNorm = existingKey;

      // Check if one contains the other or they're very similar
      if (existingNorm === normalizedName ||
        existingNorm.includes(normalizedName) ||
        normalizedName.includes(existingNorm)) {
        // Merge: prefer non-zero prices from either
        const merged = { ...existingModel };

        // Update prices if the new model has better data
        if (model.price && model.price > 0 && (!merged.price || merged.price === 0)) {
          merged.price = model.price;
        }
        if (model.privatleasing && model.privatleasing > 0 && (!merged.privatleasing || merged.privatleasing === 0)) {
          merged.privatleasing = model.privatleasing;
        }
        if (model.loan_price && model.loan_price > 0 && (!merged.loan_price || merged.loan_price === 0)) {
          merged.loan_price = model.loan_price;
        }
        if (model.company_leasing_price && model.company_leasing_price > 0 && (!merged.company_leasing_price || merged.company_leasing_price === 0)) {
          merged.company_leasing_price = model.company_leasing_price;
        }

        // Update other fields if missing
        if (model.bransle && !merged.bransle) merged.bransle = model.bransle;
        if (model.biltyp && !merged.biltyp) merged.biltyp = model.biltyp;
        if (model.vaxellada && !merged.vaxellada) merged.vaxellada = model.vaxellada;
        if (model.thumbnail_url && !merged.thumbnail_url) merged.thumbnail_url = model.thumbnail_url;

        // Use longer name (usually more descriptive)
        if (model.name.length > merged.name.length) {
          merged.name = model.name;
        }

        modelMap.set(existingKey, merged);
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      modelMap.set(normalizedName, model);
    }
  }

  return Array.from(modelMap.values());
}

/**
 * Enhanced deduplication: merges vehicles with same brand but different title formats
 * e.g., "Corsa" and "Opel Corsa" both with brand="Opel" will be merged
 */
function simpleDeduplication(vehicles: Vehicle[]): Vehicle[] {
  const vehicleMap = new Map<string, Vehicle>();

  // Sort by updated_at descending so most recent is processed first
  const sorted = [...vehicles].sort((a, b) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  for (const vehicle of sorted) {
    // Create normalized key from brand + normalized title
    const brandKey = (vehicle.brand || '').toLowerCase().trim();
    const titleKey = normalizeVehicleTitle(vehicle.title, vehicle.brand || '');

    const key = `${brandKey}-${titleKey}`;

    const cleanTitle = vehicle.title.replace(/^köp\s+/i, '').replace(/^nya\s+/i, '').trim() || vehicle.title;

    if (!vehicleMap.has(key)) {
      // First occurrence: just add it
      vehicleMap.set(key, {
        ...vehicle,
        title: cleanTitle,
        vehicle_models: deduplicateVehicleModels(vehicle.vehicle_models || [], cleanTitle)
      });
    } else {
      // Merge with existing vehicle
      const existing = vehicleMap.get(key)!;
      const mergedTitle = existing.title.length >= cleanTitle.length ? existing.title : cleanTitle;

      // Prefer longer/more descriptive content
      const merged: Vehicle = {
        ...existing,
        // Prefer title without brand prefix if both are valid
        title: mergedTitle,
        description: (vehicle.description?.length || 0) > (existing.description?.length || 0)
          ? vehicle.description
          : existing.description,
        thumbnail_url: existing.thumbnail_url || vehicle.thumbnail_url,
        source_url: existing.source_url || vehicle.source_url,
        // Merge and deduplicate vehicle models (pass title for filtering mismatched variants)
        vehicle_models: deduplicateVehicleModels([
          ...(existing.vehicle_models || []),
          ...(vehicle.vehicle_models || [])
        ], mergedTitle)
      };

      vehicleMap.set(key, merged);
    }
  }

  return Array.from(vehicleMap.values());
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get('brand');
    const vehicleType = searchParams.get('vehicle_type');
    const bransle = searchParams.get('bransle');
    const sessionId = searchParams.get('session_id');
    const skipDedupe = searchParams.get('dedupe') === 'false';
    const format = searchParams.get('format');

    const client = await getSupabaseClient();

    // If session_id is provided, return EXACT data from that session without deduplication
    if (sessionId) {
      return await getSessionData(client, sessionId, brand, vehicleType, bransle);
    }

    // Get all vehicles with their models
    let query = client
      .from('vehicles')
      .select(`
        id,
        title,
        brand,
        description,
        thumbnail_url,
        vehicle_type,
        free_text,
        source_url,
        created_at,
        updated_at,
        vehicle_models (
          id,
          name,
          price,
          old_price,
          privatleasing,
          old_privatleasing,
          company_leasing_price,
          old_company_leasing_price,
          loan_price,
          old_loan_price,
          biltyp,
          bransle,
          vaxellada,
          thumbnail_url,
          utrustning,
          created_at
        )
      `)
      .order('brand', { ascending: true })
      .order('title', { ascending: true });

    // Apply filters
    if (brand) {
      query = query.eq('brand', brand);
    }
    if (vehicleType) {
      query = query.eq('vehicle_type', vehicleType);
    }

    const { data: vehicles, error } = await query;

    if (error) {
      console.error('Catalog query error:', error);
      return NextResponse.json(
        { success: false, message: `Failed to fetch catalog: ${error.message}` },
        { status: 500 }
      );
    }

    // Apply simple deduplication unless explicitly disabled
    let processedVehicles = (vehicles || []) as Vehicle[];
    if (!skipDedupe) {
      processedVehicles = simpleDeduplication(processedVehicles);
    }

    // Filter by bransle if specified (needs to be done post-query since it's in nested data)
    if (bransle) {
      processedVehicles = processedVehicles.map(v => ({
        ...v,
        vehicle_models: (v.vehicle_models || []).filter(m =>
          m.bransle?.toLowerCase() === bransle.toLowerCase()
        )
      })).filter(v => v.vehicle_models.length > 0);
    }

    // Sort by brand then title
    processedVehicles.sort((a, b) => {
      const brandCompare = (a.brand || '').localeCompare(b.brand || '');
      if (brandCompare !== 0) return brandCompare;
      return (a.title || '').localeCompare(b.title || '');
    });

    // Get unique brands and fuel types for filters
    const allBrands = [...new Set(processedVehicles.map(v => v.brand).filter(Boolean))].sort();
    const allBransle = [...new Set(
      processedVehicles.flatMap(v =>
        (v.vehicle_models || []).map(m => m.bransle)
      ).filter(Boolean)
    )].sort() as string[];

    // Calculate stats
    const totalVehicles = processedVehicles.length;
    const totalVariants = processedVehicles.reduce((sum, v) => sum + (v.vehicle_models?.length || 0), 0);
    const campaignCount = processedVehicles.reduce((sum, v) =>
      sum + (v.vehicle_models || []).filter(m => m.old_price && m.old_price > 0).length, 0
    );

    // Return clean JSON format if requested
    if (format === 'json') {
      const jsonData = formatVehiclesAsJson(processedVehicles);
      return NextResponse.json({
        vehicles: jsonData,
        meta: {
          total_vehicles: totalVehicles,
          total_variants: totalVariants,
          total_brands: allBrands.length,
          campaigns_count: campaignCount,
          generated_at: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: processedVehicles,
      filters: {
        brands: allBrands,
        bransle: allBransle,
      },
      stats: {
        totalVehicles,
        totalVariants,
        totalBrands: allBrands.length,
        campaignCount,
      },
      source: skipDedupe ? 'raw' : 'deduplicated',
    });
  } catch (error) {
    console.error('Catalog error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

/**
 * Helper to get deduplicated vehicles for CMS push
 */
async function getDeduplicatedVehicles(
  brand?: string,
  vehicleType?: string
): Promise<Vehicle[]> {
  const client = await getSupabaseClient();

  let query = client
    .from('vehicles')
    .select(`
      id,
      title,
      brand,
      description,
      thumbnail_url,
      vehicle_type,
      free_text,
      source_url,
      created_at,
      updated_at,
      vehicle_models (
        id,
        name,
        price,
        old_price,
        privatleasing,
        old_privatleasing,
        company_leasing_price,
        old_company_leasing_price,
        loan_price,
        old_loan_price,
        biltyp,
        bransle,
        vaxellada,
        thumbnail_url,
        utrustning,
        created_at
      )
    `)
    .order('brand', { ascending: true })
    .order('title', { ascending: true });

  if (brand) {
    query = query.eq('brand', brand);
  }
  if (vehicleType) {
    query = query.eq('vehicle_type', vehicleType);
  }

  const { data: vehicles, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch vehicles: ${error.message}`);
  }

  // Apply deduplication
  return simpleDeduplication((vehicles || []) as Vehicle[]);
}

/**
 * Transform a catalog vehicle to the format expected by CMS API
 */
function transformCatalogVehicleToCMSFormat(vehicle: Vehicle): any {
  return {
    title: vehicle.title,
    brand: vehicle.brand,
    description: vehicle.description,
    thumbnail: vehicle.thumbnail_url,
    source_url: vehicle.source_url,
    vehicle_type: vehicle.vehicle_type,
    varianter: (vehicle.vehicle_models || []).map(model => ({
      name: model.name,
      price: model.price || 0,
      old_price: model.old_price || 0,
      privatleasing: model.privatleasing || 0,
      old_privatleasing: model.old_privatleasing || 0,
      company_leasing_price: model.company_leasing_price || 0,
      old_company_leasing_price: model.old_company_leasing_price || 0,
      loan_price: model.loan_price || 0,
      old_loan_price: model.old_loan_price || 0,
      bransle: model.bransle,
      biltyp: model.biltyp,
      vaxellada: model.vaxellada,
      thumbnail: model.thumbnail_url,
      utrustning: model.utrustning || [],
    })),
  };
}

/**
 * POST /api/catalog - Push deduplicated catalog to CMS
 *
 * Body:
 * - brand: Optional filter by brand
 * - vehicle_type: Optional filter by vehicle type
 * - dry_run: If true, returns preview without pushing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brand, vehicle_type, dry_run } = body;

    console.log('📤 POST /api/catalog - Push to CMS');
    console.log(`   Brand filter: ${brand || 'all'}`);
    console.log(`   Vehicle type: ${vehicle_type || 'all'}`);
    console.log(`   Dry run: ${dry_run ? 'yes' : 'no'}`);

    // Get deduplicated vehicles from the database
    const vehicles = await getDeduplicatedVehicles(brand, vehicle_type);

    console.log(`📊 Found ${vehicles.length} deduplicated vehicles to push`);

    // Dry run - just return what would be pushed
    if (dry_run) {
      const preview = vehicles.map(v => ({
        title: v.title,
        brand: v.brand,
        variants_count: v.vehicle_models?.length || 0,
        variants: (v.vehicle_models || []).map(m => m.name),
      }));

      return NextResponse.json({
        success: true,
        dry_run: true,
        vehicles_count: vehicles.length,
        variants_count: vehicles.reduce((sum, v) => sum + (v.vehicle_models?.length || 0), 0),
        preview,
      });
    }

    // Get existing posts in CMS for matching
    let existingPosts;
    try {
      existingPosts = await getExistingBilmodeller();
    } catch (error) {
      console.error('Failed to fetch existing CMS posts:', error);
      existingPosts = [];
    }

    console.log(`📋 Found ${existingPosts.length} existing posts in CMS`);

    // Process each vehicle
    const results: Array<{
      title: string;
      brand: string;
      success: boolean;
      action: 'created' | 'updated' | 'error';
      variants_count: number;
      error?: string;
    }> = [];

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const vehicle of vehicles) {
      try {
        // Transform to CMS format
        const vehicleData = transformCatalogVehicleToCMSFormat(vehicle);
        const cmsData = await transformVehicleDataToCMS(vehicleData);

        // Check for existing post
        const existingPost = findMatchingBilmodell(vehicle.title, existingPosts);

        if (existingPost) {
          // Update existing
          console.log(`🔄 Updating: "${vehicle.title}" (${vehicle.vehicle_models?.length || 0} variants)`);
          await updateBilmodellInCMS(existingPost.id, cmsData);
          updated++;
          results.push({
            title: vehicle.title,
            brand: vehicle.brand,
            success: true,
            action: 'updated',
            variants_count: vehicle.vehicle_models?.length || 0,
          });
        } else {
          // Create new
          console.log(`➕ Creating: "${vehicle.title}" (${vehicle.vehicle_models?.length || 0} variants)`);
          const response = await createBilmodellInCMS(cmsData);
          created++;
          results.push({
            title: vehicle.title,
            brand: vehicle.brand,
            success: true,
            action: 'created',
            variants_count: vehicle.vehicle_models?.length || 0,
          });

          // Add to existing posts to prevent duplicates
          existingPosts.push({ id: response.post.id, title: vehicle.title, slug: '' });
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Failed to push "${vehicle.title}":`, error);
        failed++;
        results.push({
          title: vehicle.title,
          brand: vehicle.brand,
          success: false,
          action: 'error',
          variants_count: vehicle.vehicle_models?.length || 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 CMS PUSH RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Created: ${created}`);
    console.log(`🔄 Updated: ${updated}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${vehicles.length > 0 ? Math.round(((created + updated) / vehicles.length) * 100) : 0}%`);
    console.log('='.repeat(60));

    return NextResponse.json({
      success: failed === 0,
      summary: {
        total: vehicles.length,
        created,
        updated,
        failed,
        variants_total: vehicles.reduce((sum, v) => sum + (v.vehicle_models?.length || 0), 0),
      },
      results,
    });

  } catch (error) {
    console.error('POST /api/catalog error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/catalog - Clear catalog data from database
 *
 * Query parameters:
 * - brand: Optional - only delete vehicles for this brand
 * - confirm: Required - must be "yes" to proceed (safety check)
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const brand = searchParams.get('brand');
    const confirm = searchParams.get('confirm');

    // Safety check
    if (confirm !== 'yes') {
      return NextResponse.json(
        {
          success: false,
          error: 'Safety check failed. Add ?confirm=yes to proceed.',
          warning: brand
            ? `This will delete all vehicles for brand "${brand}" and their variants.`
            : 'This will delete ALL vehicles and their variants from the database.'
        },
        { status: 400 }
      );
    }

    const client = await getSupabaseClient();

    console.log('🗑️ DELETE /api/catalog - Clearing catalog');
    console.log(`   Brand filter: ${brand || 'ALL (no filter)'}`);

    // First, get the vehicles to delete (to count them)
    let countQuery = client
      .from('vehicles')
      .select('id, title, brand, vehicle_models(id)', { count: 'exact' });

    if (brand) {
      countQuery = countQuery.ilike('brand', brand);
    }

    const { data: vehiclesToDelete, count: vehicleCount, error: countError } = await countQuery;

    if (countError) {
      throw new Error(`Failed to count vehicles: ${countError.message}`);
    }

    const variantCount = vehiclesToDelete?.reduce(
      (sum, v) => sum + ((v.vehicle_models as any[])?.length || 0),
      0
    ) || 0;

    console.log(`📊 Found ${vehicleCount} vehicles with ${variantCount} variants to delete`);

    if (vehicleCount === 0) {
      return NextResponse.json({
        success: true,
        message: 'No vehicles to delete',
        deleted: { vehicles: 0, variants: 0 }
      });
    }

    // Get vehicle IDs for deletion
    const vehicleIds = vehiclesToDelete?.map(v => v.id) || [];

    // Delete vehicle_models first (foreign key constraint)
    const { error: modelsError } = await client
      .from('vehicle_models')
      .delete()
      .in('vehicle_id', vehicleIds);

    if (modelsError) {
      throw new Error(`Failed to delete vehicle models: ${modelsError.message}`);
    }

    console.log(`✅ Deleted ${variantCount} vehicle models`);

    // Now delete the vehicles
    let deleteQuery = client
      .from('vehicles')
      .delete();

    if (brand) {
      deleteQuery = deleteQuery.ilike('brand', brand);
    } else {
      // Delete all - need a condition, use id not null
      deleteQuery = deleteQuery.not('id', 'is', null);
    }

    const { error: vehiclesError } = await deleteQuery;

    if (vehiclesError) {
      throw new Error(`Failed to delete vehicles: ${vehiclesError.message}`);
    }

    console.log(`✅ Deleted ${vehicleCount} vehicles`);

    console.log('\n' + '='.repeat(60));
    console.log('🗑️ CATALOG CLEARED');
    console.log('='.repeat(60));
    console.log(`   Vehicles deleted: ${vehicleCount}`);
    console.log(`   Variants deleted: ${variantCount}`);
    if (brand) {
      console.log(`   Brand: ${brand}`);
    }
    console.log('='.repeat(60));

    return NextResponse.json({
      success: true,
      message: brand
        ? `Cleared all vehicles for brand "${brand}"`
        : 'Cleared entire catalog',
      deleted: {
        vehicles: vehicleCount,
        variants: variantCount
      }
    });

  } catch (error) {
    console.error('DELETE /api/catalog error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
