/**
 * CMS API Client
 * Handles communication with the headless CMS for bilmodeller posts
 *
 * Bilmodell structure:
 * - title: Display title
 * - slug: URL slug
 * - content.namn: Model name
 * - content.varianter: Array of variants
 * - bilmarke: Brand relationship (ID reference)
 */

import { deduplicateVariants, type VariantData } from './variant-deduplication';

const CMS_API_URL = process.env.CMS_API_URL || '';
const CMS_STORE_ID = process.env.CMS_STORE_ID || '';
const CMS_API_KEY = process.env.CMS_API_KEY || '';

// Equipment item structure matching CMS schema
export interface EquipmentItem {
  item: string;                       // Equipment item code/id
  name: string;                       // Display name
  category?: string;                  // Category (e.g., "Säkerhet", "Komfort")
  description?: string;               // Optional description
}

// Specs structure matching CMS schema
export interface VariantSpecs {
  power_kw?: number | null;
  power_hp?: number | null;
  torque_nm?: number | null;
  top_speed_kmh?: number | null;
  acceleration_0_100?: number | null;
  fuel_consumption_l_100km?: number | null;
  consumption_kwh_100km?: number | null;
  co2_g_km?: number | null;
  range_km_wltp?: number | null;
  battery_kwh?: number | null;
  battery_type?: string | null;
  charging_time_home?: string | null;
  charging_time_wallbox?: string | null;
  charging_time_fast?: string | null;
  curb_weight_kg?: number | null;
  gross_weight_kg?: number | null;
  max_towing_kg?: number | null;
  [key: string]: any;
}

// Specs object for CMS repeater - each entry has these text fields
export interface CMSSpecsEntry {
  engine_cc?: string;
  cylinders?: string;
  power_kw?: string;
  power_hp?: string;
  torque_nm?: string;
  top_speed_kmh?: string;
  acceleration_0_100?: string;
  fuel_consumption_l_100km?: string;
  consumption_kwh_100km?: string;
  co2_g_km?: string;
  emission_class?: string;
  range_km_wltp?: string;
  battery_kwh?: string;
  battery_type?: string;
  battery_voltage?: string;
  onboard_charger_kw?: string;
  charging_time_home?: string;
  charging_time_wallbox?: string;
  charging_time_fast?: string;
  drive_modes?: string;
  curb_weight_kg?: string;
  gross_weight_kg?: string;
  max_payload_kg?: string;
  max_towing_kg?: string;
  turning_circle_m?: string;
  tire_dimension?: string;
}

// Equipment item for CMS equipment repeater (slug: equipment)
export interface CMSEquipmentItem {
  item: string;                       // Equipment item name (slug: item)
}

// Variant structure matching CMS schema (exact slugs)
export interface VehicleVariant {
  id?: string;                        // slug: id
  name?: string;                      // slug: name
  vehicle_type?: string;              // slug: vehicle_type (car, suv, kombi, hatchback, sedan, coupe, cabriolet, van, pickup)
  thumbnail?: string;                 // slug: thumbnail (URL)
  price?: number;                     // slug: price (Number)
  old_price?: number;                 // slug: old_price (Number)
  privatleasing?: number;             // slug: privatleasing (Number)
  old_privatleasing?: number;         // slug: old_privatleasing (Number)
  company_leasing?: number;           // slug: company_leasing (Number)
  old_company_leasing?: number;       // slug: old_company_leasing (Number)
  loan_price?: number;                // slug: loan_price (Number)
  old_loan_price?: number;            // slug: old_loan_price (Number)
  fuel_type?: string;                 // slug: fuel_type (Bensin, Diesel, Hybrid, El)
  transmission?: string;              // slug: transmission (Manuell, Automat, e-CVT)
  specs?: CMSSpecsEntry[];            // slug: specs (Repeater with spec fields)
  equipment?: CMSEquipmentItem[];     // slug: equipment (Repeater with item field)
}

// Color option for CMS
export interface CMSColorOption {
  name: string;
  type?: 'solid' | 'metallic' | 'pearl' | null;
  price: number;
  hex_code?: string | null;
}

// Interior option for CMS
export interface CMSInteriorOption {
  name: string;
  material?: 'tyg' | 'konstläder' | 'läder' | 'alcantara' | null;
  price: number;
}

// Extra option for CMS
export interface CMSVehicleOption {
  name: string;
  description?: string | null;
  price: number;
}

// Accessory for CMS
export interface CMSAccessory {
  name: string;
  description?: string | null;
  price: number;
}

// Service for CMS
export interface CMSService {
  name: string;
  description?: string | null;
  price?: number | null;
  duration_months?: number | null;
}

// Warranty for CMS
export interface CMSWarranty {
  name: string;
  duration_years?: number | null;
  duration_km?: number | null;
  notes?: string | null;
}

// Financing info for CMS
export interface CMSFinancingInfo {
  provider?: string | null;
  leasing_terms?: {
    duration_months?: number | null;
    mileage_per_year_km?: number | null;
  } | null;
  loan_terms?: {
    interest_rate_percent?: number | null;
    duration_months?: number | null;
  } | null;
}

// Dealer info for CMS
export interface CMSDealerInfo {
  general_agent?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

// Content structure for bilmodell
export interface BilmodellContent {
  namn?: string;                      // Model name
  fordonstyp?: string;                // Vehicle type: personbil, transportbil, mopedbil
  description?: string;               // Description
  fritext?: string;                   // Free text
  varianter?: VehicleVariant[];       // Model variants
  omslagsbild_ai_system?: string;     // Cover image URL from AI system
  colors?: CMSColorOption[];          // Available colors
  interiors?: CMSInteriorOption[];    // Interior options
  options?: CMSVehicleOption[];       // Extra options/packages
  accessories?: CMSAccessory[];       // Accessories
  services?: CMSService[];            // Services
  warranties?: CMSWarranty[];         // Warranties
  financing?: CMSFinancingInfo;       // Financing info
  dealer_info?: CMSDealerInfo;        // Dealer info
  [key: string]: any;                 // Other dynamic fields
}

// Request structure for creating/updating bilmodell
export interface CreateBilmodellRequest {
  post_type_slug: 'bilmodeller';
  title: string;
  slug: string;
  status: 'draft' | 'published';
  content: BilmodellContent;
  bilmarke?: string;               // Brand ID reference (outside content)
}

export interface CMSPost {
  id: string;
  title: string;
  slug: string;
  status: string;
  content: BilmodellContent;
  bilmarke?: {
    id: string;
    title: string;
    slug: string;
  };
  created_at: string;
  updated_at?: string;
}

export interface CMSResponse {
  post: CMSPost;
}

export interface CMSError {
  error: string;
  message?: string;
}

export interface BatchCreateResult {
  success: boolean;
  created: number;
  updated: number;
  failed: number;
  total: number;
  results: Array<{
    title: string;
    success: boolean;
    action: 'created' | 'updated' | 'error';
    id?: string;
    error?: string;
  }>;
  summary: {
    created: number;
    updated: number;
    failed: number;
    duplicatesFound: number;
    newItemsCreated: number;
  };
}

// Generate a URL-safe slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

// Make API request to CMS
async function cmsRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!CMS_API_URL) {
    throw new Error('CMS_API_URL environment variable is not configured');
  }
  if (!CMS_STORE_ID) {
    throw new Error('CMS_STORE_ID environment variable is not configured');
  }
  if (!CMS_API_KEY) {
    throw new Error('CMS_API_KEY environment variable is not configured');
  }

  const url = `${CMS_API_URL}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-store-id': CMS_STORE_ID,
    'Authorization': `Bearer ${CMS_API_KEY}`,
    ...(options.headers as Record<string, string> || {})
  };

  console.log(`🌐 CMS API Request: ${options.method || 'GET'} ${url}`);
  if (options.body) {
    console.log(`📦 Request body:`, options.body);
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ CMS API Error: ${response.status} ${response.statusText}`);
    console.error(`Response: ${errorText}`);
    throw new Error(`CMS API request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

// Get existing bilmodeller posts
export async function getExistingBilmodeller(): Promise<CMSPost[]> {
  try {
    console.log('🔍 Fetching existing bilmodeller from CMS...');

    const response = await cmsRequest<{ posts: CMSPost[] }>('/posts?post_type=bilmodeller&limit=1000');

    console.log(`✅ Found ${response.posts?.length || 0} existing bilmodeller`);
    return response.posts || [];
  } catch (error) {
    console.error('❌ Error fetching existing bilmodeller:', error);
    return [];
  }
}

// Get existing bilmarken (brands)
export async function getExistingBilmarken(): Promise<CMSPost[]> {
  try {
    console.log('🔍 Fetching existing bilmarken from CMS...');

    const response = await cmsRequest<{ posts: CMSPost[] }>('/posts?post_type=bilmarken&limit=1000');

    console.log(`✅ Found ${response.posts?.length || 0} existing bilmarken`);
    return response.posts || [];
  } catch (error) {
    console.error('❌ Error fetching existing bilmarken:', error);
    return [];
  }
}

// Find existing bilmarke (brand) by name or slug - NEVER creates new brands
export async function findOrCreateBilmarke(brandName: string): Promise<string | null> {
  if (!brandName || brandName.trim() === '') {
    return null;
  }

  const normalizedName = brandName.trim();
  const normalizedSlug = generateSlug(normalizedName);

  try {
    // Fetch existing brands from CMS
    const existingBrands = await getExistingBilmarken();

    // 1. Try exact slug match first (most reliable)
    let existingBrand = existingBrands.find(
      b => b.slug === normalizedSlug
    );

    // 2. Try exact title match (case-insensitive)
    if (!existingBrand) {
      existingBrand = existingBrands.find(
        b => b.title.toLowerCase() === normalizedName.toLowerCase()
      );
    }

    // 3. Try matching generated slug from title
    if (!existingBrand) {
      existingBrand = existingBrands.find(
        b => generateSlug(b.title) === normalizedSlug
      );
    }

    // 4. Try partial slug match (e.g., "Suzuki" matches slug "suzuki-bilar")
    if (!existingBrand) {
      existingBrand = existingBrands.find(
        b => b.slug?.startsWith(normalizedSlug) ||
             b.slug?.includes(normalizedSlug)
      );
    }

    // 5. Try if brand slug contains normalized name
    if (!existingBrand) {
      existingBrand = existingBrands.find(
        b => normalizedSlug.includes(b.slug) ||
             b.title.toLowerCase().includes(normalizedName.toLowerCase())
      );
    }

    if (existingBrand) {
      console.log(`✅ Found existing brand: "${normalizedName}" -> ID: ${existingBrand.id} (slug: ${existingBrand.slug})`);
      return existingBrand.id;
    }

    // NEVER create new brands - only use existing ones
    console.warn(`⚠️ Brand not found in CMS: "${normalizedName}" (slug: ${normalizedSlug}). Available brands: ${existingBrands.map(b => b.slug).join(', ')}`);
    console.warn(`⚠️ Please create the brand "${normalizedName}" manually in the CMS before importing.`);
    return null;

  } catch (error) {
    console.error(`❌ Error finding brand ${normalizedName}:`, error);
    return null;
  }
}

// Helper: Convert equipment to CMS equipment repeater format (slug: equipment, item slug: item)
function transformEquipmentToCMS(equipment: string[] | any[]): CMSEquipmentItem[] {
  if (!equipment || !Array.isArray(equipment) || equipment.length === 0) {
    return [];
  }

  return equipment.map((item) => {
    // If already an object, extract the name/item string
    if (typeof item === 'object' && item !== null) {
      return {
        item: item.name || item.item || String(item)
      };
    }
    // String items directly
    return {
      item: String(item)
    };
  });
}

// Helper: Map vehicle category to CMS fordonstyp select (personbil, transportbil, mopedbil)
function mapVehicleCategoryToCMS(vehicleType: string | undefined): string {
  if (!vehicleType) return 'personbil';

  const normalized = vehicleType.toLowerCase().trim();

  // Map to CMS fordonstyp select values: personbil, transportbil, mopedbil
  const mappings: Record<string, string> = {
    'cars': 'personbil',
    'car': 'personbil',
    'personbil': 'personbil',
    'transport_cars': 'transportbil',
    'transport': 'transportbil',
    'transportbil': 'transportbil',
    'moped_cars': 'mopedbil',
    'moped': 'mopedbil',
    'mopedbil': 'mopedbil',
  };

  return mappings[normalized] || 'personbil';
}

// Helper: Map body_type to CMS variant vehicle_type select (suv, sedan, kombi, etc.)
function mapBodyTypeToVehicleType(bodyType: string | undefined): string | undefined {
  if (!bodyType) return undefined;

  const normalized = bodyType.toLowerCase().trim();

  // Direct mappings to CMS variant vehicle_type select values
  const mappings: Record<string, string> = {
    'sedan': 'sedan',
    'suv': 'suv',
    'kombi': 'kombi',
    'halvkombi': 'hatchback',
    'hatchback': 'hatchback',
    'coupe': 'coupe',
    'coupé': 'coupe',
    'cab': 'cabriolet',
    'cabriolet': 'cabriolet',
    'convertible': 'cabriolet',
    'van': 'van',
    'minivan': 'van',
    'mpv': 'van',
    'pickup': 'pickup',
    'truck': 'pickup',
    'crossover': 'suv',
    'stationwagon': 'kombi',
    'station wagon': 'kombi',
    'estate': 'kombi',
  };

  return mappings[normalized] || normalized;
}

// Helper: Map fuel type to CMS fuel_type select options (exact CMS values)
function mapFuelTypeToCMS(fuelType: string | undefined): string | undefined {
  if (!fuelType) return undefined;

  const normalized = fuelType.toLowerCase().trim();

  // Direct mappings to CMS select values (Bensin, Diesel, Hybrid, El)
  const mappings: Record<string, string> = {
    'bensin': 'Bensin',
    'petrol': 'Bensin',
    'gasoline': 'Bensin',
    'diesel': 'Diesel',
    'hybrid': 'Hybrid',
    'plug-in hybrid': 'Hybrid',
    'laddhybrid': 'Hybrid',       // Swedish for plug-in hybrid
    'phev': 'Hybrid',
    'mildhybrid': 'Hybrid',
    'mild hybrid': 'Hybrid',
    'el': 'El',
    'electric': 'El',
    'elektrisk': 'El',            // Swedish for electric
    'ev': 'El',
    'bev': 'El',
  };

  return mappings[normalized] || fuelType; // Return original if no mapping found
}

// Helper: Map transmission to CMS transmission select options (exact CMS values)
function mapTransmissionToCMS(transmission: string | undefined): string | undefined {
  if (!transmission) return undefined;

  const normalized = transmission.toLowerCase().trim();

  // Direct mappings to CMS select values (Manuell, Automat, e-CVT)
  const mappings: Record<string, string> = {
    'manuell': 'Manuell',
    'manual': 'Manuell',
    'automat': 'Automat',
    'automatic': 'Automat',
    'auto': 'Automat',
    'dct': 'Automat',
    'dsg': 'Automat',
    'at': 'Automat',
    'e-cvt': 'e-CVT',
    'ecvt': 'e-CVT',
    'cvt': 'e-CVT',
    'steglös': 'e-CVT',
    'steglos': 'e-CVT',
  };

  return mappings[normalized] || transmission; // Return original if no mapping found
}

// Helper: Transform specs to CMS specs repeater format
// CMS expects an array with one entry containing all spec fields as strings
function transformSpecsToCMS(specs: any): CMSSpecsEntry[] | undefined {
  if (!specs || typeof specs !== 'object') {
    return undefined;
  }

  // Valid spec fields in CMS
  const validFields = [
    'engine_cc', 'cylinders', 'power_kw', 'power_hp', 'torque_nm',
    'top_speed_kmh', 'acceleration_0_100', 'fuel_consumption_l_100km',
    'consumption_kwh_100km', 'co2_g_km', 'emission_class', 'range_km_wltp',
    'battery_kwh', 'battery_type', 'battery_voltage', 'onboard_charger_kw',
    'charging_time_home', 'charging_time_wallbox', 'charging_time_fast',
    'drive_modes', 'curb_weight_kg', 'gross_weight_kg', 'max_payload_kg',
    'max_towing_kg', 'turning_circle_m', 'tire_dimension'
  ];

  const specsEntry: CMSSpecsEntry = {};
  let hasSpecs = false;

  // Convert all non-null values to string fields
  for (const field of validFields) {
    const value = specs[field];
    if (value !== null && value !== undefined && value !== '') {
      specsEntry[field as keyof CMSSpecsEntry] = String(value);
      hasSpecs = true;
    }
  }

  // Return array with single entry if we have specs, otherwise undefined
  return hasSpecs ? [specsEntry] : undefined;
}

// Transform scraped vehicle data to CMS format
export async function transformVehicleDataToCMS(vehicleData: any): Promise<CreateBilmodellRequest> {
  console.log('🔄 Transforming vehicle data to CMS format:', vehicleData.title);

  if (!vehicleData || !vehicleData.title) {
    throw new Error('Vehicle title is required');
  }

  // Handle bilmarke relationship
  let bilmarkeId: string | undefined;
  if (vehicleData.brand || vehicleData.bilmarken) {
    const brandName = vehicleData.brand || vehicleData.bilmarken;
    const foundId = await findOrCreateBilmarke(brandName);
    if (foundId) {
      bilmarkeId = foundId;
    }
  }

  // Transform variants/vehicle_models to varianter format
  const rawVarianter: VariantData[] = [];

  // NEW SCHEMA: Handle 'variants' array (from new AI processor output)
  // Also handle legacy: vehicle_models (database format) and vehicle_model (old format)
  const models = vehicleData.variants || vehicleData.vehicle_models || vehicleData.vehicle_model || [];

  if (Array.isArray(models)) {
    models.forEach((model: any, index: number) => {
      const variant: VariantData = {
        name: model.name || model.namn || `Variant ${index + 1}`,
      };

      // Handle price
      if (model.price && model.price > 0) {
        variant.price = model.price;
      }

      // Handle privatleasing - check multiple possible field names
      const privatleasing = model.privatleasing ||
                           model.leasingpris ||
                           model.financing_options?.privatleasing?.[0]?.monthly_price;
      if (privatleasing && privatleasing > 0) {
        variant.privatleasing = privatleasing;
      }

      // Handle company leasing (CMS slug: company_leasing)
      const companyLeasing = model.company_leasing ||
                            model.company_leasing_price ||
                            model.foretagsleasingpris ||
                            model.financing_options?.company_leasing?.[0]?.monthly_price;
      if (companyLeasing && companyLeasing > 0) {
        variant.company_leasing = companyLeasing;
      }

      // Handle loan price
      const loanPrice = model.loan_price || model.loanprice;
      if (loanPrice && loanPrice > 0) {
        variant.loan_price = loanPrice;
      }

      // Handle old prices (for discounts/campaigns)
      if (model.old_price && model.old_price > 0) {
        variant.old_price = model.old_price;
      }
      if (model.old_privatleasing && model.old_privatleasing > 0) {
        variant.old_privatleasing = model.old_privatleasing;
      }
      const oldCompanyLeasing = model.old_company_leasing || model.old_company_leasing_price;
      if (oldCompanyLeasing && oldCompanyLeasing > 0) {
        variant.old_company_leasing = oldCompanyLeasing;
      }
      if (model.old_loan_price && model.old_loan_price > 0) {
        variant.old_loan_price = model.old_loan_price;
      }

      // Add fuel type (CMS slug: fuel_type)
      const fuelType = model.fuel_type || model.bransle;
      if (fuelType) {
        variant.fuel_type = fuelType;
      }

      // Add body/vehicle type (CMS slug: vehicle_type)
      const bodyType = model.body_type || model.car_type || model.biltyp;
      if (bodyType) {
        variant.body_type = bodyType;
      }

      // Add transmission (CMS slug: transmission)
      const transmission = model.transmission || model.vaxellada;
      if (transmission) {
        variant.transmission = transmission;
      }

      // Add specs if available (NEW SCHEMA)
      if (model.specs && typeof model.specs === 'object') {
        variant.specs = model.specs;
      }

      // Add equipment if available (new schema uses equipment, old uses utrustning)
      const equipment = model.equipment || model.utrustning;
      if (equipment && Array.isArray(equipment)) {
        variant.equipment = equipment;
      }

      rawVarianter.push(variant);
    });
  }

  // Deduplicate similar variants (merges "Edition PureTech 100 hk Manuell" with "PureTech 100 hk Manuell 6-steg" etc.)
  console.log(`🔄 Deduplicating ${rawVarianter.length} variants for "${vehicleData.title}"...`);
  const deduplicatedVariants = deduplicateVariants(rawVarianter, 0.80);

  // Convert to CMS format (Numbers for price fields, repeaters for specs/equipment)
  const varianter: VehicleVariant[] = deduplicatedVariants.map((v, index) => {
    // Get company leasing value from various possible field names
    const companyLeasing = v.company_leasing || v.company_leasing_price;
    const oldCompanyLeasing = v.old_company_leasing || v.old_company_leasing_price;

    // Map fuel type to CMS select values
    const fuelTypeRaw = v.fuel_type || v.bransle;
    const fuelType = fuelTypeRaw ? mapFuelTypeToCMS(fuelTypeRaw) : undefined;

    // Map transmission to CMS select values
    const transmissionRaw = v.transmission || v.vaxellada;
    const transmission = transmissionRaw ? mapTransmissionToCMS(transmissionRaw) : undefined;

    const cmsVariant: VehicleVariant = {
      // Generate unique ID for variant
      id: v.id || `variant_${index + 1}`,
      name: v.name,
      // Map body_type to vehicle_type select field (CMS slug: vehicle_type)
      vehicle_type: mapBodyTypeToVehicleType(v.body_type || v.biltyp),
      // Variant thumbnail URL (CMS slug: thumbnail)
      thumbnail: v.thumbnail || v.thumbnail_url || v.bild || undefined,
      // All prices as Numbers (CMS expects Number type)
      price: v.price && v.price > 0 ? v.price : undefined,
      old_price: v.old_price && v.old_price > 0 ? v.old_price : undefined,
      privatleasing: v.privatleasing && v.privatleasing > 0 ? v.privatleasing : undefined,
      old_privatleasing: v.old_privatleasing && v.old_privatleasing > 0 ? v.old_privatleasing : undefined,
      company_leasing: companyLeasing && companyLeasing > 0 ? companyLeasing : undefined,
      old_company_leasing: oldCompanyLeasing && oldCompanyLeasing > 0 ? oldCompanyLeasing : undefined,
      loan_price: v.loan_price && v.loan_price > 0 ? v.loan_price : undefined,
      old_loan_price: v.old_loan_price && v.old_loan_price > 0 ? v.old_loan_price : undefined,
      fuel_type: fuelType,
      transmission: transmission,
    };

    // Add specs if available (convert to repeater format)
    const specs = transformSpecsToCMS(v.specs);
    if (specs && specs.length > 0) {
      cmsVariant.specs = specs;
      console.log(`  📊 Added specs to "${v.name}"`);
    }

    // Add equipment (CMS slug: equipment)
    const equipmentData = v.equipment || v.utrustning;
    if (equipmentData && equipmentData.length > 0) {
      cmsVariant.equipment = transformEquipmentToCMS(equipmentData);
      console.log(`  📦 Added ${cmsVariant.equipment.length} equipment items to "${v.name}"`);
    }

    return cmsVariant;
  });

  // Get image URL from various possible sources
  const imageUrl = vehicleData.thumbnail_url || vehicleData.thumbnail || vehicleData.image_url || vehicleData.omslagsbild_ai_system;

  // Transform colors to CMS format
  const colors: CMSColorOption[] = [];
  if (Array.isArray(vehicleData.colors)) {
    vehicleData.colors.forEach((c: any) => {
      if (c && c.name) {
        colors.push({
          name: c.name,
          type: c.type || undefined,
          price: c.price || 0,
          hex_code: c.hex_code || undefined
        });
      }
    });
  }

  // Transform interiors to CMS format
  const interiors: CMSInteriorOption[] = [];
  if (Array.isArray(vehicleData.interiors)) {
    vehicleData.interiors.forEach((i: any) => {
      if (i && i.name) {
        interiors.push({
          name: i.name,
          material: i.material || undefined,
          price: i.price || 0
        });
      }
    });
  }

  // Transform options to CMS format
  const options: CMSVehicleOption[] = [];
  if (Array.isArray(vehicleData.options)) {
    vehicleData.options.forEach((o: any) => {
      if (o && o.name) {
        options.push({
          name: o.name,
          description: o.description || undefined,
          price: o.price || 0
        });
      }
    });
  }

  // Transform accessories to CMS format
  const accessories: CMSAccessory[] = [];
  if (Array.isArray(vehicleData.accessories)) {
    vehicleData.accessories.forEach((a: any) => {
      if (a && a.name) {
        accessories.push({
          name: a.name,
          description: a.description || undefined,
          price: a.price || 0
        });
      }
    });
  }

  // Transform services to CMS format
  const services: CMSService[] = [];
  if (Array.isArray(vehicleData.services)) {
    vehicleData.services.forEach((s: any) => {
      if (s && s.name) {
        services.push({
          name: s.name,
          description: s.description || undefined,
          price: s.price || undefined,
          duration_months: s.duration_months || undefined
        });
      }
    });
  }

  // Transform warranties to CMS format
  const warranties: CMSWarranty[] = [];
  if (Array.isArray(vehicleData.warranties)) {
    vehicleData.warranties.forEach((w: any) => {
      if (w && w.name) {
        warranties.push({
          name: w.name,
          duration_years: w.duration_years || undefined,
          duration_km: w.duration_km || undefined,
          notes: w.notes || undefined
        });
      }
    });
  }

  // Transform financing to CMS format
  let financing: CMSFinancingInfo | undefined;
  if (vehicleData.financing && typeof vehicleData.financing === 'object') {
    financing = {
      provider: vehicleData.financing.provider || undefined,
      leasing_terms: vehicleData.financing.leasing_terms || undefined,
      loan_terms: vehicleData.financing.loan_terms || undefined
    };
  }

  // Transform dealer info to CMS format
  let dealerInfo: CMSDealerInfo | undefined;
  if (vehicleData.dealer_info && typeof vehicleData.dealer_info === 'object') {
    dealerInfo = {
      general_agent: vehicleData.dealer_info.general_agent || undefined,
      phone: vehicleData.dealer_info.phone || undefined,
      email: vehicleData.dealer_info.email || undefined,
      website: vehicleData.dealer_info.website || undefined
    };
  }

  // Map vehicle category (cars, transport_cars, moped_cars) to CMS fordonstyp
  const fordonstyp = mapVehicleCategoryToCMS(vehicleData.vehicle_type);

  // Build the request object
  const result: CreateBilmodellRequest = {
    post_type_slug: 'bilmodeller',
    title: vehicleData.title.trim(),
    slug: generateSlug(vehicleData.title),
    status: 'published',
    content: {
      namn: vehicleData.title.trim(),
      fordonstyp: fordonstyp,  // personbil, transportbil, or mopedbil
      description: vehicleData.description || undefined,
      fritext: vehicleData.free_text || undefined,
      varianter: varianter.length > 0 ? varianter : undefined,
      omslagsbild_ai_system: imageUrl || undefined,
      // Add new fields if they have data
      colors: colors.length > 0 ? colors : undefined,
      interiors: interiors.length > 0 ? interiors : undefined,
      options: options.length > 0 ? options : undefined,
      accessories: accessories.length > 0 ? accessories : undefined,
      services: services.length > 0 ? services : undefined,
      warranties: warranties.length > 0 ? warranties : undefined,
      financing: financing || undefined,
      dealer_info: dealerInfo || undefined
    }
  };

  // Add bilmarke as top-level field (not inside content)
  if (bilmarkeId) {
    result.bilmarke = bilmarkeId;
  }

  // Log summary of what's being sent
  console.log('🔄 Transformed result summary:');
  console.log(`  - Title: ${result.title}`);
  console.log(`  - Fordonstyp: ${fordonstyp}`);
  console.log(`  - Varianter: ${varianter.length}`);
  console.log(`  - Colors: ${colors.length}`);
  console.log(`  - Interiors: ${interiors.length}`);
  console.log(`  - Options: ${options.length}`);
  console.log(`  - Accessories: ${accessories.length}`);
  console.log(`  - Services: ${services.length}`);
  console.log(`  - Warranties: ${warranties.length}`);
  console.log(`  - Has financing: ${financing ? 'yes' : 'no'}`);
  console.log(`  - Has dealer info: ${dealerInfo ? 'yes' : 'no'}`);

  return result;
}

// Create a single bilmodell in CMS
export async function createBilmodellInCMS(data: CreateBilmodellRequest): Promise<CMSResponse> {
  console.log(`➕ Creating bilmodell: "${data.title}"`);

  const response = await cmsRequest<CMSResponse>('/posts', {
    method: 'POST',
    body: JSON.stringify(data)
  });

  console.log(`✅ Created successfully: ${response.post.id} - "${response.post.title}"`);
  return response;
}

// Update an existing bilmodell in CMS
export async function updateBilmodellInCMS(id: string, data: Partial<CreateBilmodellRequest>): Promise<CMSResponse> {
  console.log(`🔄 Updating bilmodell: ${id}`);

  const response = await cmsRequest<CMSResponse>(`/posts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });

  console.log(`✅ Updated successfully: ${response.post.id} - "${response.post.title}"`);
  return response;
}

// Find matching bilmodell by title
export function findMatchingBilmodell(
  incomingTitle: string,
  existingPosts: CMSPost[]
): CMSPost | null {
  const normalizedIncoming = incomingTitle.toLowerCase().trim();

  // Exact match
  const exactMatch = existingPosts.find(
    post => post.title.toLowerCase().trim() === normalizedIncoming
  );
  if (exactMatch) {
    console.log(`🎯 Exact match found: "${exactMatch.title}"`);
    return exactMatch;
  }

  // Slug match
  const incomingSlug = generateSlug(incomingTitle);
  const slugMatch = existingPosts.find(post => post.slug === incomingSlug);
  if (slugMatch) {
    console.log(`🎯 Slug match found: "${slugMatch.title}"`);
    return slugMatch;
  }

  return null;
}

// Batch create/update bilmodeller
export async function createMultipleBilmodellerInCMS(vehicles: any[]): Promise<BatchCreateResult> {
  console.log(`🚗 Processing ${vehicles.length} vehicles for CMS...`);

  if (!vehicles || vehicles.length === 0) {
    throw new Error('No vehicles to process');
  }

  // Get existing posts for deduplication
  const existingPosts = await getExistingBilmodeller();
  console.log(`📊 Found ${existingPosts.length} existing bilmodeller`);

  const results: BatchCreateResult['results'] = [];
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const [index, vehicle] of vehicles.entries()) {
    try {
      console.log(`\n--- Processing ${index + 1}/${vehicles.length}: "${vehicle.title}" ---`);

      // Transform to CMS format
      const cmsData = await transformVehicleDataToCMS(vehicle);

      // Check for existing post
      const existingPost = findMatchingBilmodell(vehicle.title, existingPosts);

      if (existingPost) {
        // Update existing
        console.log(`🔄 Updating existing post: ${existingPost.id}`);
        const response = await updateBilmodellInCMS(existingPost.id, cmsData);

        results.push({
          title: vehicle.title,
          success: true,
          action: 'updated',
          id: response.post.id
        });
        updated++;
      } else {
        // Create new
        const response = await createBilmodellInCMS(cmsData);

        results.push({
          title: vehicle.title,
          success: true,
          action: 'created',
          id: response.post.id
        });
        created++;

        // Add to existing posts to prevent duplicates in same batch
        existingPosts.push(response.post);
      }

    } catch (error) {
      console.error(`❌ Failed to process "${vehicle.title}":`, error);
      results.push({
        title: vehicle.title || 'Unknown',
        success: false,
        action: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      failed++;
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 BATCH RESULTS');
  console.log('='.repeat(60));
  console.log(`✅ Created: ${created}`);
  console.log(`🔄 Updated: ${updated}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('='.repeat(60));

  return {
    success: failed === 0,
    created,
    updated,
    failed,
    total: vehicles.length,
    results,
    summary: {
      created,
      updated,
      failed,
      duplicatesFound: updated,
      newItemsCreated: created
    }
  };
}
