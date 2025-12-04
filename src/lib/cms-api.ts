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

// Variant structure matching CMS schema
export interface VehicleVariant {
  name?: string;                      // Variant name
  price?: number;                     // Price
  old_price?: string;                 // Previous price (for discounts)
  privatleasing?: string;             // Private leasing price
  old_privatleasing?: string;         // Previous private leasing price
  company_leasing_price?: string;     // Company leasing price
  old_company_leasing_price?: string; // Previous company leasing price
  loan_price?: string;                // Monthly loan price
  old_loan_price?: string;            // Previous loan price
  bransle?: string;                   // Fuel type (El, Bensin, Diesel, Hybrid)
  biltyp?: string;                    // Vehicle type
  vaxellada?: string;                 // Transmission (Automat, Manuell)
  specs?: VariantSpecs;               // Technical specifications
  equipment?: EquipmentItem[];        // Equipment list
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

    const response = await cmsRequest<{ posts: CMSPost[] }>('/posts?post_type_slug=bilmodeller&limit=1000');

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

    const response = await cmsRequest<{ posts: CMSPost[] }>('/posts?post_type_slug=bilmarken&limit=1000');

    console.log(`✅ Found ${response.posts?.length || 0} existing bilmarken`);
    return response.posts || [];
  } catch (error) {
    console.error('❌ Error fetching existing bilmarken:', error);
    return [];
  }
}

// Find or create a bilmarke (brand)
export async function findOrCreateBilmarke(brandName: string): Promise<string | null> {
  if (!brandName || brandName.trim() === '') {
    return null;
  }

  const normalizedName = brandName.trim();
  const normalizedSlug = generateSlug(normalizedName);

  try {
    // First, try to find existing brand
    const existingBrands = await getExistingBilmarken();

    // Try exact title match first
    let existingBrand = existingBrands.find(
      b => b.title.toLowerCase() === normalizedName.toLowerCase()
    );

    // If no title match, try slug match
    if (!existingBrand) {
      existingBrand = existingBrands.find(
        b => b.slug === normalizedSlug ||
             generateSlug(b.title) === normalizedSlug
      );
    }

    // Also try partial slug match (e.g., "Suzuki" matches slug "suzuki-bilar")
    if (!existingBrand) {
      existingBrand = existingBrands.find(
        b => b.slug?.startsWith(normalizedSlug) ||
             b.slug?.includes(normalizedSlug)
      );
    }

    if (existingBrand) {
      console.log(`✅ Found existing brand: ${normalizedName} -> ID: ${existingBrand.id} (slug: ${existingBrand.slug})`);
      return existingBrand.id;
    }

    // Create new brand if not found
    console.log(`🆕 Creating new brand: ${normalizedName}`);

    const response = await cmsRequest<CMSResponse>('/posts', {
      method: 'POST',
      body: JSON.stringify({
        post_type_slug: 'bilmarken',
        title: normalizedName,
        slug: generateSlug(normalizedName),
        status: 'published',
        content: {
          beskrivning: ''
        }
      })
    });

    console.log(`✅ Created new brand: ${normalizedName} -> ID: ${response.post.id}`);
    return response.post.id;

  } catch (error) {
    console.error(`❌ Error handling brand ${normalizedName}:`, error);
    return null;
  }
}

// Helper: Convert equipment strings to CMS object format
function transformEquipmentToCMS(equipment: string[] | any[]): EquipmentItem[] {
  if (!equipment || !Array.isArray(equipment) || equipment.length === 0) {
    return [];
  }

  return equipment.map((item, index) => {
    // If already an object with name, use it
    if (typeof item === 'object' && item !== null) {
      return {
        item: item.item || item.id || `equip_${index}`,
        name: item.name || item.item || String(item),
        category: item.category || undefined,
        description: item.description || undefined
      };
    }
    // Convert string to object format
    return {
      item: `equip_${index}`,
      name: String(item),
      category: undefined,
      description: undefined
    };
  });
}

// Helper: Transform specs to CMS format
function transformSpecsToCMS(specs: any): VariantSpecs | undefined {
  if (!specs || typeof specs !== 'object') {
    return undefined;
  }

  const cmsSpecs: VariantSpecs = {};

  // Map all numeric/string fields
  const numericFields = [
    'power_kw', 'power_hp', 'torque_nm', 'top_speed_kmh', 'acceleration_0_100',
    'fuel_consumption_l_100km', 'consumption_kwh_100km', 'co2_g_km',
    'range_km_wltp', 'battery_kwh', 'curb_weight_kg', 'gross_weight_kg',
    'max_payload_kg', 'max_towing_kg', 'turning_circle_m', 'onboard_charger_kw',
    'engine_cc', 'cylinders', 'battery_voltage'
  ];

  const stringFields = [
    'battery_type', 'emission_class', 'charging_time_home',
    'charging_time_wallbox', 'charging_time_fast', 'tire_dimension'
  ];

  for (const field of numericFields) {
    if (specs[field] !== null && specs[field] !== undefined) {
      cmsSpecs[field] = specs[field];
    }
  }

  for (const field of stringFields) {
    if (specs[field]) {
      cmsSpecs[field] = specs[field];
    }
  }

  // Only return if we have at least one field
  return Object.keys(cmsSpecs).length > 0 ? cmsSpecs : undefined;
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

      // Handle company leasing (new schema uses company_leasing, old uses company_leasing_price)
      const companyLeasing = model.company_leasing ||
                            model.company_leasing_price ||
                            model.foretagsleasingpris ||
                            model.financing_options?.company_leasing?.[0]?.monthly_price;
      if (companyLeasing && companyLeasing > 0) {
        variant.company_leasing_price = companyLeasing;
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
        variant.old_company_leasing_price = oldCompanyLeasing;
      }
      if (model.old_loan_price && model.old_loan_price > 0) {
        variant.old_loan_price = model.old_loan_price;
      }

      // Add fuel type if available (new schema uses fuel_type, old uses bransle)
      const fuelType = model.fuel_type || model.bransle;
      if (fuelType) {
        variant.bransle = fuelType;
      }

      // Add car type if available
      const carType = model.car_type || model.biltyp;
      if (carType) {
        variant.biltyp = carType;
      }

      // Add transmission if available (new schema uses transmission, old uses vaxellada)
      const transmission = model.transmission || model.vaxellada;
      if (transmission) {
        variant.vaxellada = transmission;
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

  // Convert to CMS format (strings for price fields, objects for equipment)
  const varianter: VehicleVariant[] = deduplicatedVariants.map(v => {
    const cmsVariant: VehicleVariant = {
      name: v.name,
      price: v.price || undefined,
      old_price: v.old_price ? String(v.old_price) : undefined,
      privatleasing: v.privatleasing ? String(v.privatleasing) : undefined,
      old_privatleasing: v.old_privatleasing ? String(v.old_privatleasing) : undefined,
      company_leasing_price: v.company_leasing_price ? String(v.company_leasing_price) : undefined,
      old_company_leasing_price: v.old_company_leasing_price ? String(v.old_company_leasing_price) : undefined,
      loan_price: v.loan_price ? String(v.loan_price) : undefined,
      old_loan_price: v.old_loan_price ? String(v.old_loan_price) : undefined,
      bransle: v.bransle || undefined,
      biltyp: v.biltyp || undefined,
      vaxellada: v.vaxellada || undefined,
    };

    // Add specs if available
    const specs = transformSpecsToCMS(v.specs);
    if (specs) {
      cmsVariant.specs = specs;
    }

    // Add equipment (convert strings to objects for CMS)
    const equipment = v.equipment || v.utrustning;
    if (equipment && equipment.length > 0) {
      cmsVariant.equipment = transformEquipmentToCMS(equipment);
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

  // Build the request object
  const result: CreateBilmodellRequest = {
    post_type_slug: 'bilmodeller',
    title: vehicleData.title.trim(),
    slug: generateSlug(vehicleData.title),
    status: 'published',
    content: {
      namn: vehicleData.title.trim(),
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
