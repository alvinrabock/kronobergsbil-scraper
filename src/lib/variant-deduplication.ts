/**
 * Variant Deduplication Utility
 *
 * Handles deduplication of vehicle model variants that are essentially the same
 * but have slightly different names (e.g., "Edition PureTech 100 hk Manuell" vs "PureTech 100 hk Manuell 6-steg")
 */

export interface VariantData {
  id?: string | null;
  name: string;
  price?: number | null;
  old_price?: number | null;
  privatleasing?: number | null;
  old_privatleasing?: number | null;
  company_leasing_price?: number | null;
  old_company_leasing_price?: number | null;
  company_leasing?: number | null;  // Alternative naming
  old_company_leasing?: number | null;
  loan_price?: number | null;
  old_loan_price?: number | null;
  bransle?: string | null;
  biltyp?: string | null;
  body_type?: string | null;         // Maps to vehicle_type in CMS
  vaxellada?: string | null;
  thumbnail?: string | null;
  thumbnail_url?: string | null;     // Alternative thumbnail field
  bild?: string | null;              // CMS field for variant image
  utrustning?: string[];
  // New schema fields
  fuel_type?: string | null;
  transmission?: string | null;
  equipment?: string[];
  specs?: Record<string, any> | null;
  [key: string]: any;
}

/**
 * Normalize a variant name for comparison
 * Removes common prefixes/suffixes and normalizes spacing
 */
export function normalizeVariantName(name: string): string {
  if (!name || typeof name !== 'string') return '';

  return name
    .toLowerCase()
    // Remove common trim level prefixes that don't affect matching
    .replace(/^(nya|new|edition)\s+/gi, '')
    // Normalize Swedish characters
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    // Remove "Steglös" (CVT description) - it's just transmission detail
    .replace(/\bsteglos\b/gi, '')
    // Normalize gear/transmission descriptions
    .replace(/\b(manuell|man|mt)\s*\d*-?(steg|vaxlar?)?\b/gi, 'manuell')
    .replace(/\b(automat|aut|at|cvt|e-dct|dct)\s*\d*-?(steg|vaxlar?)?\b/gi, 'automat')
    // Normalize power notations
    .replace(/(\d+)\s*(hk|hp|hastkrafter|hastar)/gi, '$1hk')
    .replace(/(\d+)\s*(kw)/gi, '$1kw')
    // Normalize battery/kWh notations
    .replace(/(\d+)\s*(kwh)/gi, '$1kwh')
    // Remove extra whitespace (multiple spaces become one)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract key components from a variant name for matching
 */
export function extractVariantComponents(name: string): {
  engine: string | null;
  power: string | null;
  transmission: string | null;
  trimLevel: string | null;
  fuelType: string | null;
} {
  const normalized = name.toLowerCase();

  // Extract engine/motor (e.g., "PureTech", "1.2", "e-208", "Elektrisk")
  const engineMatch = normalized.match(/\b(puretech|elektrisk|e-\d+|thp|\d+\.\d+)\b/i);

  // Extract power (e.g., "100 hk", "136hk", "100kW", "115 kW")
  const powerMatch = normalized.match(/(\d+)\s*(hk|hp|kw)/i);

  // Extract transmission (including Swedish "Steglös Automat", "e-DCT")
  const transmissionMatch = normalized.match(/\b(manuell|automat|aut|cvt|man|mt|at|steglös|e-dct|dct)\b/i);
  let transmission = transmissionMatch ? transmissionMatch[1].toLowerCase() : null;
  if (transmission && ['aut', 'cvt', 'at', 'steglös', 'e-dct', 'dct'].includes(transmission)) {
    transmission = 'automat';
  } else if (transmission && ['man', 'mt'].includes(transmission)) {
    transmission = 'manuell';
  }

  // Extract trim level (e.g., "Edition", "Active", "Style", "Allure", "GT", "GS")
  const trimMatch = normalized.match(/\b(edition|active|style|allure|gt|elegance|cosmo|essential|ultimate|base|select|inclusive|gs|sport|plus|life|first|business)\b/i);

  // Extract fuel type indicators (including Swedish "Elektrisk")
  const fuelMatch = normalized.match(/\b(electric|elektrisk|el|hybrid|diesel|bensin|phev|bev)\b/i);
  let fuelType = fuelMatch ? fuelMatch[1].toLowerCase() : null;
  if (fuelType === 'elektrisk') {
    fuelType = 'el';
  }

  return {
    engine: engineMatch ? engineMatch[1] : null,
    power: powerMatch ? `${powerMatch[1]}${powerMatch[2].toLowerCase()}` : null,
    transmission,
    trimLevel: trimMatch ? trimMatch[1].toLowerCase() : null,
    fuelType,
  };
}

/**
 * Calculate similarity score between two variant names
 * Returns a value between 0 (completely different) and 1 (identical)
 */
export function calculateVariantSimilarity(name1: string, name2: string): number {
  const norm1 = normalizeVariantName(name1);
  const norm2 = normalizeVariantName(name2);

  // If normalized names are identical, perfect match
  if (norm1 === norm2) return 1.0;

  // Extract components
  const comp1 = extractVariantComponents(name1);
  const comp2 = extractVariantComponents(name2);

  // CRITICAL: If one has a trim level and the other doesn't, they are DIFFERENT variants!
  // E.g., "Elektrisk 100kW" (base) vs "GS Elektrisk 100kW" (GS trim) should NOT merge
  const trimMismatch = (comp1.trimLevel && !comp2.trimLevel) || (!comp1.trimLevel && comp2.trimLevel);
  if (trimMismatch) {
    // Return low similarity to prevent merging
    // Same power + different trim = different variant (max 0.5 to stay below threshold)
    return 0.4;
  }

  // If both have different trim levels, also don't merge
  if (comp1.trimLevel && comp2.trimLevel && comp1.trimLevel !== comp2.trimLevel) {
    return 0.3;
  }

  let matchScore = 0;
  let maxScore = 0;

  // Power match is most important (40% weight)
  maxScore += 40;
  if (comp1.power && comp2.power && comp1.power === comp2.power) {
    matchScore += 40;
  } else if (!comp1.power && !comp2.power) {
    matchScore += 20; // Neither has power, neutral
  }

  // Transmission match (25% weight)
  maxScore += 25;
  if (comp1.transmission && comp2.transmission && comp1.transmission === comp2.transmission) {
    matchScore += 25;
  } else if (!comp1.transmission && !comp2.transmission) {
    matchScore += 12;
  }

  // Trim level match (20% weight) - at this point both have same or no trim
  maxScore += 20;
  if (comp1.trimLevel && comp2.trimLevel && comp1.trimLevel === comp2.trimLevel) {
    matchScore += 20;
  } else if (!comp1.trimLevel && !comp2.trimLevel) {
    matchScore += 10;
  }

  // Fuel type match (15% weight)
  maxScore += 15;
  if (comp1.fuelType && comp2.fuelType && comp1.fuelType === comp2.fuelType) {
    matchScore += 15;
  } else if (!comp1.fuelType && !comp2.fuelType) {
    matchScore += 7;
  }

  // Also check Levenshtein distance for overall similarity
  const levenshteinSim = calculateStringSimilarity(norm1, norm2);

  // Combine component-based score with string similarity
  const componentScore = maxScore > 0 ? matchScore / maxScore : 0;

  // Weight: 60% component-based, 40% string similarity
  return componentScore * 0.6 + levenshteinSim * 0.4;
}

/**
 * Levenshtein distance based string similarity
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 && !str2) return 1;
  if (!str1 || !str2) return 0;

  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Merge two variant records, preferring non-null values and more complete data
 */
export function mergeVariants(existing: VariantData, incoming: VariantData): VariantData {
  const merged: VariantData = { ...existing };

  // Use the longer/more descriptive name (contains more info like "100 hk")
  if (incoming.name && (!existing.name || incoming.name.length > existing.name.length)) {
    merged.name = incoming.name;
  }

  // For prices, prefer the incoming value if it exists and is non-zero
  const priceFields = [
    'price', 'old_price',
    'privatleasing', 'old_privatleasing',
    'company_leasing_price', 'old_company_leasing_price',
    'company_leasing', 'old_company_leasing',
    'loan_price', 'old_loan_price'
  ] as const;

  for (const field of priceFields) {
    if (incoming[field] && incoming[field] !== 0) {
      merged[field] = incoming[field];
    }
  }

  // For technical specs, prefer non-null values
  if (incoming.bransle && !existing.bransle) {
    merged.bransle = incoming.bransle;
  }
  if (incoming.biltyp && !existing.biltyp) {
    merged.biltyp = incoming.biltyp;
  }
  if (incoming.vaxellada && !existing.vaxellada) {
    merged.vaxellada = incoming.vaxellada;
  }

  // NEW SCHEMA: fuel_type and transmission (prefer non-null)
  if (incoming.fuel_type && !existing.fuel_type) {
    merged.fuel_type = incoming.fuel_type;
  }
  if (incoming.transmission && !existing.transmission) {
    merged.transmission = incoming.transmission;
  }

  // For thumbnail, prefer non-null
  if (incoming.thumbnail && !existing.thumbnail) {
    merged.thumbnail = incoming.thumbnail;
  }

  // NEW SCHEMA: Merge specs objects (combine non-null fields)
  if (incoming.specs) {
    if (!existing.specs) {
      merged.specs = incoming.specs;
    } else {
      // Merge specs, preferring non-null values from incoming
      merged.specs = { ...existing.specs };
      for (const [key, value] of Object.entries(incoming.specs)) {
        if (value !== null && value !== undefined) {
          merged.specs[key] = value;
        }
      }
    }
  }

  // Merge equipment lists (legacy utrustning)
  if (incoming.utrustning && incoming.utrustning.length > 0) {
    if (!existing.utrustning || existing.utrustning.length === 0) {
      merged.utrustning = incoming.utrustning;
    } else {
      // Combine and deduplicate equipment
      const allEquipment = new Set([...existing.utrustning, ...incoming.utrustning]);
      merged.utrustning = Array.from(allEquipment);
    }
  }

  // NEW SCHEMA: Merge equipment lists (new schema)
  if (incoming.equipment && incoming.equipment.length > 0) {
    if (!existing.equipment || existing.equipment.length === 0) {
      merged.equipment = incoming.equipment;
    } else {
      // Combine and deduplicate equipment
      const allEquipment = new Set([...existing.equipment, ...incoming.equipment]);
      merged.equipment = Array.from(allEquipment);
    }
  }

  return merged;
}

/**
 * Deduplicate an array of variants, merging similar ones
 * @param variants Array of variant objects
 * @param similarityThreshold Minimum similarity score to consider variants as duplicates (default: 0.75)
 * @returns Deduplicated array of variants
 */
export function deduplicateVariants(
  variants: VariantData[],
  similarityThreshold: number = 0.75
): VariantData[] {
  if (!variants || variants.length === 0) return [];
  if (variants.length === 1) return variants;

  console.log(`🔄 [Dedup] Processing ${variants.length} variants with threshold ${similarityThreshold}`);

  const result: VariantData[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < variants.length; i++) {
    if (processed.has(i)) continue;

    let current = { ...variants[i] };
    processed.add(i);

    // Find all similar variants
    for (let j = i + 1; j < variants.length; j++) {
      if (processed.has(j)) continue;

      const similarity = calculateVariantSimilarity(current.name, variants[j].name);

      if (similarity >= similarityThreshold) {
        console.log(`  🔗 Merging "${variants[j].name}" into "${current.name}" (similarity: ${(similarity * 100).toFixed(0)}%)`);
        current = mergeVariants(current, variants[j]);
        processed.add(j);
      }
    }

    result.push(current);
  }

  console.log(`🔄 [Dedup] Reduced from ${variants.length} to ${result.length} variants`);

  return result;
}

/**
 * Clean up variant names by standardizing format
 */
export function cleanVariantName(name: string): string {
  if (!name) return '';

  return name
    // Remove duplicate spaces
    .replace(/\s+/g, ' ')
    // Standardize "hk" format
    .replace(/(\d+)\s*(hk|hp)/gi, '$1 hk')
    // Standardize "kWh" format
    .replace(/(\d+)\s*(kwh)/gi, '$1 kWh')
    // Capitalize first letter of each word for trim levels
    .replace(/\b(edition|active|style|allure|gt|elegance|cosmo|essential|ultimate|base|select|inclusive|gs|sport|plus|life|first|business)\b/gi,
      (match) => match.charAt(0).toUpperCase() + match.slice(1).toLowerCase())
    .trim();
}
