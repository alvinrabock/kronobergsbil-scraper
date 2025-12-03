/**
 * Master Sync Service
 *
 * Syncs scraped vehicle data to the master database.
 * This is called after each scrape to update prices in the master database.
 */

import { createClient } from '@supabase/supabase-js';
import { updatePricesFromScrape } from './master-vehicle-service';
import type { Vehicle, VehicleModel } from './ai-processor-types';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(supabaseUrl, supabaseKey);
}

export interface SyncResult {
  success: boolean;
  totalProcessed: number;
  pricesUpdated: number;
  notFoundInMaster: number;
  errors: string[];
}

/**
 * Map motor type from various sources to standardized format
 */
function normalizeMotorType(bransle?: string | null): string {
  if (!bransle) return 'UNKNOWN';

  const normalized = bransle.toUpperCase().trim();

  const mapping: Record<string, string> = {
    'EL': 'EL',
    'ELECTRIC': 'EL',
    'ELMOTOR': 'EL',
    'BENSIN': 'BENSIN',
    'PETROL': 'BENSIN',
    'GASOLINE': 'BENSIN',
    'DIESEL': 'DIESEL',
    'HYBRID': 'HYBRID',
    'MILDHYBRID': 'HYBRID',
    'MILD HYBRID': 'HYBRID',
    'LADDHYBRID': 'LADDHYBRID',
    'PLUG-IN HYBRID': 'LADDHYBRID',
    'PLUGIN HYBRID': 'LADDHYBRID',
    'PHEV': 'PHEV',
  };

  return mapping[normalized] || normalized;
}

/**
 * Parse variant name to extract trim, motor, and drivetrain info
 * Examples:
 *   "eVitara Select 2WD" -> { trim: "Select", drivetrain: "2WD" }
 *   "Mokka GS Electric" -> { trim: "GS", drivetrain: null }
 *   "CX-80 Homura Plus PHEV AWD" -> { trim: "Homura Plus", drivetrain: "AWD" }
 */
function parseVariantName(name: string): {
  cleanName: string;
  trim: string | null;
  drivetrain: string | null;
} {
  const drivetrains = ['2WD', '4WD', 'AWD', 'FWD', 'RWD'];
  let drivetrain: string | null = null;
  let cleanName = name;

  // Extract drivetrain
  for (const dt of drivetrains) {
    if (name.toUpperCase().includes(dt)) {
      drivetrain = dt;
      cleanName = cleanName.replace(new RegExp(`\\s*${dt}\\s*`, 'gi'), ' ').trim();
      break;
    }
  }

  // Common trim levels - try to extract
  const trimPatterns = [
    /\b(Select|Base|Active|Exclusive|GS|GS Line|Takumi|Homura|Homura Plus|Premium|Sport|Comfort|Motion|Hybrid|Edition)\b/gi
  ];

  let trim: string | null = null;
  for (const pattern of trimPatterns) {
    const match = cleanName.match(pattern);
    if (match) {
      trim = match[0];
      break;
    }
  }

  return { cleanName, trim, drivetrain };
}

/**
 * Sync scraped vehicles to master database
 * This updates prices for any matching master variants
 */
export async function syncVehiclesToMaster(
  vehicles: Vehicle[],
  sourceUrl: string
): Promise<SyncResult> {
  const errors: string[] = [];
  let totalProcessed = 0;
  let pricesUpdated = 0;
  let notFoundInMaster = 0;

  for (const vehicle of vehicles) {
    const brand = vehicle.brand || 'Unknown';
    const vehicleName = vehicle.title || 'Unknown';

    // Process each model/variant
    for (const model of vehicle.vehicle_model || []) {
      totalProcessed++;

      const variantName = model.name || vehicleName;
      const motorType = normalizeMotorType(model.bransle || model.fuel_type);
      const { drivetrain } = parseVariantName(variantName);

      try {
        // Prepare price data
        const prices = {
          pris: model.price || null,
          old_pris: model.old_price || null,
          privatleasing: model.privatleasing || null,
          old_privatleasing: model.old_privatleasing || null,
          foretagsleasing: model.company_leasing_price || null,
          old_foretagsleasing: model.old_company_leasing_price || null,
          billan_per_man: model.loan_price || null,
          old_billan_per_man: model.old_loan_price || null,
          is_campaign: !!(model.old_price && model.old_price > 0),
          source_url: sourceUrl,
        };

        // Try to update price in master database
        const result = await updatePricesFromScrape(
          brand,
          vehicleName,
          variantName,
          motorType,
          prices
        );

        if (result.success) {
          if (result.updated) {
            pricesUpdated++;
            console.log(`✅ [SYNC] Updated price for ${brand} ${vehicleName} ${variantName}`);
          }
        } else {
          // Not found in master - this is expected if vehicle hasn't been imported from PDF yet
          notFoundInMaster++;
          console.log(`ℹ️ [SYNC] No master record for ${brand} ${vehicleName} ${variantName}: ${result.error}`);
        }
      } catch (err) {
        const errorMsg = `Failed to sync ${brand} ${vehicleName} ${variantName}: ${err}`;
        errors.push(errorMsg);
        console.error(`❌ [SYNC] ${errorMsg}`);
      }
    }
  }

  return {
    success: errors.length === 0,
    totalProcessed,
    pricesUpdated,
    notFoundInMaster,
    errors,
  };
}

/**
 * Create or update a link between scraped vehicle and master vehicle
 * This helps track which scraped records map to which master records
 */
export async function createVehicleMasterLink(
  scrapedVehicleId: string,
  scrapedModelId: string | null,
  masterVehicleId: string,
  masterVariantId: string,
  matchConfidence: number,
  matchMethod: 'exact' | 'fuzzy' | 'manual'
): Promise<boolean> {
  const client = getSupabaseClient();

  try {
    const { error } = await client.from('vehicle_master_links').upsert({
      scraped_vehicle_id: scrapedVehicleId,
      scraped_model_id: scrapedModelId,
      master_vehicle_id: masterVehicleId,
      master_variant_id: masterVariantId,
      match_confidence: matchConfidence,
      match_method: matchMethod,
      last_price_update: new Date().toISOString(),
    });

    if (error) {
      console.error('Failed to create vehicle master link:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error creating vehicle master link:', err);
    return false;
  }
}

/**
 * Find potential master vehicle matches for a scraped vehicle
 * Uses fuzzy matching on brand and vehicle name
 */
export async function findMasterVehicleMatches(
  brand: string,
  vehicleName: string
): Promise<Array<{ id: string; name: string; brand: string; confidence: number }>> {
  const client = getSupabaseClient();

  // First try exact brand match
  const { data: brandData } = await client
    .from('master_brands')
    .select('id, name')
    .ilike('name', brand);

  if (!brandData || brandData.length === 0) {
    return [];
  }

  const brandIds = brandData.map((b) => b.id);

  // Search for vehicles with similar names
  const { data: vehicles } = await client
    .from('master_vehicles')
    .select('id, name, brand_id, master_brands(name)')
    .in('brand_id', brandIds);

  if (!vehicles || vehicles.length === 0) {
    return [];
  }

  // Calculate match scores
  const matches = vehicles
    .map((v) => {
      const nameScore = calculateSimilarity(
        vehicleName.toLowerCase(),
        v.name.toLowerCase()
      );
      return {
        id: v.id,
        name: v.name,
        brand: (v.master_brands as { name: string })?.name || brand,
        confidence: nameScore,
      };
    })
    .filter((m) => m.confidence > 0.5) // Only return decent matches
    .sort((a, b) => b.confidence - a.confidence);

  return matches;
}

/**
 * Simple Levenshtein-based similarity score (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;

  // Quick exact match check
  if (str1 === str2) return 1;

  // Check if one contains the other
  if (str1.includes(str2) || str2.includes(str1)) {
    return 0.9;
  }

  // Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);

  return 1 - distance / maxLen;
}
