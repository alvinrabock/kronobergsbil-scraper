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

const CMS_API_URL = process.env.CMS_API_URL || '';
const CMS_STORE_ID = process.env.CMS_STORE_ID || '';
const CMS_API_KEY = process.env.CMS_API_KEY || '';

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
}

// Content structure for bilmodell
export interface BilmodellContent {
  namn?: string;                   // Model name
  varianter?: VehicleVariant[];    // Model variants
  omslagsbild_ai_system?: string;  // Cover image URL from AI system
  [key: string]: any;              // Other dynamic fields
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

  try {
    // First, try to find existing brand
    const existingBrands = await getExistingBilmarken();
    const existingBrand = existingBrands.find(
      b => b.title.toLowerCase() === normalizedName.toLowerCase()
    );

    if (existingBrand) {
      console.log(`✅ Found existing brand: ${normalizedName} -> ID: ${existingBrand.id}`);
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

  // Transform vehicle_models array to varianter format
  const varianter: VehicleVariant[] = [];

  // Handle both vehicle_models (database format) and vehicle_model (legacy format)
  const models = vehicleData.vehicle_models || vehicleData.vehicle_model || [];

  if (Array.isArray(models)) {
    models.forEach((model: any, index: number) => {
      const variant: VehicleVariant = {
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
        variant.privatleasing = String(privatleasing);
      }

      // Handle company leasing
      const companyLeasing = model.company_leasing_price ||
                            model.foretagsleasingpris ||
                            model.financing_options?.company_leasing?.[0]?.monthly_price;
      if (companyLeasing && companyLeasing > 0) {
        variant.company_leasing_price = String(companyLeasing);
      }

      // Handle loan price
      const loanPrice = model.loan_price || model.loanprice;
      if (loanPrice && loanPrice > 0) {
        variant.loan_price = String(loanPrice);
      }

      // Handle old prices (for discounts/campaigns)
      if (model.old_price && model.old_price > 0) {
        variant.old_price = String(model.old_price);
      }
      if (model.old_privatleasing && model.old_privatleasing > 0) {
        variant.old_privatleasing = String(model.old_privatleasing);
      }
      if (model.old_company_leasing_price && model.old_company_leasing_price > 0) {
        variant.old_company_leasing_price = String(model.old_company_leasing_price);
      }
      if (model.old_loan_price && model.old_loan_price > 0) {
        variant.old_loan_price = String(model.old_loan_price);
      }

      // Add fuel type if available
      const fuelType = model.fuel_type || model.bransle;
      if (fuelType) {
        variant.bransle = fuelType;
      }

      // Add car type if available
      const carType = model.car_type || model.biltyp;
      if (carType) {
        variant.biltyp = carType;
      }

      // Add transmission if available
      const transmission = model.transmission || model.vaxellada;
      if (transmission) {
        variant.vaxellada = transmission;
      }

      varianter.push(variant);
    });
  }

  // Get image URL from various possible sources
  const imageUrl = vehicleData.thumbnail_url || vehicleData.thumbnail || vehicleData.image_url || vehicleData.omslagsbild_ai_system;

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
      omslagsbild_ai_system: imageUrl || undefined
    }
  };

  // Add bilmarke as top-level field (not inside content)
  if (bilmarkeId) {
    result.bilmarke = bilmarkeId;
  }

  console.log('🔄 Transformed result:', JSON.stringify(result, null, 2));
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
