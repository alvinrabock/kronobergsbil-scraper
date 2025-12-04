// lib/ai-processor-types.ts
// Types and utility functions (client-safe)

// ============================================
// NEW VEHICLE SCHEMA (2024)
// ============================================

// Variant specs (per-variant technical data)
export interface VariantSpecs {
  engine_cc?: number | null;
  cylinders?: number | null;
  power_kw?: number | null;
  power_hp?: number | null;
  torque_nm?: number | null;
  top_speed_kmh?: number | null;
  acceleration_0_100?: number | null;
  fuel_consumption_l_100km?: number | null;
  consumption_kwh_100km?: number | null;
  co2_g_km?: number | null;
  emission_class?: string | null;
  range_km_wltp?: number | null;
  battery_kwh?: number | null;
  battery_type?: string | null;
  battery_voltage?: number | null;
  onboard_charger_kw?: number | null;
  charging_time_home?: string | null;
  charging_time_wallbox?: string | null;
  charging_time_fast?: string | null;
  drive_modes?: string[] | null;
  curb_weight_kg?: number | null;
  gross_weight_kg?: number | null;
  max_payload_kg?: number | null;
  max_towing_kg?: number | null;
  turning_circle_m?: number | null;
  tire_dimension?: string | null;
}

// Vehicle variant (trim level)
export interface VehicleVariant {
  id?: string;
  name: string;
  price?: number | null;
  old_price?: number | null;
  privatleasing?: number | null;
  old_privatleasing?: number | null;
  company_leasing?: number | null;
  old_company_leasing?: number | null;
  loan_price?: number | null;
  old_loan_price?: number | null;
  fuel_type?: 'Bensin' | 'Diesel' | 'Hybrid' | 'El' | null;
  transmission?: 'Manuell' | 'Automat' | 'e-CVT' | null;
  thumbnail?: string | null;
  specs?: VariantSpecs | null;
  equipment?: string[];
}

// Interior dimensions
export interface InteriorDimensions {
  front_headroom_mm?: number | null;
  rear_headroom_mm?: number | null;
  front_shoulder_width_mm?: number | null;
  rear_shoulder_width_mm?: number | null;
  front_legroom_mm?: number | null;
  rear_legroom_mm?: number | null;
  cargo_volume_l?: number | null;
  cargo_width_mm?: number | null;
  cargo_depth_mm?: number | null;
  cargo_height_mm?: number | null;
}

// Vehicle dimensions (shared across variants)
export interface VehicleDimensions {
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  wheelbase_mm?: number | null;
  front_overhang_mm?: number | null;
  rear_overhang_mm?: number | null;
  ground_clearance_mm?: number | null;
  interior?: InteriorDimensions | null;
}

// Color option
export interface ColorOption {
  id?: string;
  name: string;
  type?: 'solid' | 'metallic' | 'pearl' | null;
  price: number;
  hex_code?: string | null;
  available_for?: string[];
}

// Interior option
export interface InteriorOption {
  id?: string;
  name: string;
  material?: 'tyg' | 'konstläder' | 'läder' | 'alcantara' | null;
  price: number;
  available_for?: string[];
  compatible_colors?: string[] | null;
}

// Extra option/package
export interface VehicleOption {
  id?: string;
  name: string;
  description?: string | null;
  price: number;
  available_for?: string[];
}

// Accessory
export interface VehicleAccessory {
  id?: string;
  name: string;
  description?: string | null;
  price: number;
  price_includes_installation?: boolean;
  available_for?: string[];
  items?: string[] | null;
}

// Service
export interface VehicleService {
  id?: string;
  name: string;
  description?: string | null;
  price?: number | null;
  duration_months?: number | null;
  duration_years?: number | null;
  max_mileage_km?: number | null;
  conditions?: Record<string, any> | null;
  phone?: string | null;
  url?: string | null;
}

// Connected services feature
export interface ConnectedServiceFeature {
  category: string;
  items: string[];
}

// Connected services
export interface ConnectedServices {
  name?: string | null;
  price_monthly?: number | null;
  free_period_years?: number | null;
  features?: ConnectedServiceFeature[];
}

// Financing terms
export interface LeasingTerms {
  duration_months?: number | null;
  mileage_per_year_km?: number | null;
  service_included?: boolean | null;
}

export interface LoanTerms {
  interest_rate_percent?: number | null;
  downpayment_percent?: number | null;
  duration_months?: number | null;
  residual_percent?: number | null;
}

export interface FinancingInfo {
  provider?: string | null;
  partner?: string | null;
  features?: string[] | null;
  leasing_terms?: LeasingTerms | null;
  loan_terms?: LoanTerms | null;
}

// Warranty deductible
export interface WarrantyDeductible {
  private?: number | null;
  business?: number | null;
}

// Warranty
export interface VehicleWarranty {
  id?: string;
  name: string;
  duration_years?: number | null;
  duration_km?: number | null;
  deductible?: WarrantyDeductible | null;
  notes?: string | null;
}

// Dealer info
export interface DealerInfo {
  general_agent?: string | null;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  website?: string | null;
}

// Main Vehicle Data Structure (NEW SCHEMA)
export interface VehicleData {
  id?: string;
  brand: string;
  title: string;
  description?: string | null;
  thumbnail?: string | null;
  vehicle_type?: 'cars' | 'motorcycles' | 'trucks';
  body_type?: 'suv' | 'hatchback' | 'sedan' | 'wagon' | 'coupe' | 'convertible' | 'pickup' | 'van' | null;
  source_url?: string | null;
  updated_at?: string | null;

  // Variants (trim levels with pricing)
  variants: VehicleVariant[];
  variant_count?: number;

  // Shared dimensions
  dimensions?: VehicleDimensions | null;

  // Configuration options
  colors?: ColorOption[];
  interiors?: InteriorOption[];
  options?: VehicleOption[];
  accessories?: VehicleAccessory[];

  // Services and support
  services?: VehicleService[];
  connected_services?: ConnectedServices | null;

  // Financing
  financing?: FinancingInfo | null;

  // Warranties
  warranties?: VehicleWarranty[];

  // Dealer
  dealer_info?: DealerInfo | null;

  // Legacy fields for backward compatibility (will be removed)
  vehicle_model?: any[];  // Deprecated - use variants
  free_text?: string;
  pdf_source_url?: string;
}

// ============================================
// CAMPAIGN DATA (unchanged)
// ============================================

export interface CampaignVehicleModel {
  name: string;
  price: number;
  old_price?: number;
  privatleasing: number;
  old_privatleasing?: number;
  company_leasing_price: number;
  old_company_leasing_price?: number;
  loan_price?: number;
  old_loan_price?: number;
  thumbnail?: string;
}

export interface CampaignIncluded {
  name: string;
  description: string;
}

export interface CampaignData {
  title: string;
  description: string;
  content: string;
  thumbnail: string;
  brand: string;
  vehicle_model: CampaignVehicleModel[];
  campaign_start: string;
  campaign_end: string;
  whats_included: CampaignIncluded[];
  free_text: string;
}

// ============================================
// LEGACY TYPES (for backward compatibility)
// ============================================

export interface FinancingOption {
  monthly_price: number;
  period_months: number;
  annual_mileage?: number;
  down_payment?: number;
  benefit_value?: number;
  interest_rate?: number;
  down_payment_percent?: number;
  total_amount?: number;
  conditions?: string;
}

export interface FinancingOptions {
  privatleasing?: FinancingOption[];
  company_leasing?: FinancingOption[];
  loan?: FinancingOption[];
}

// Legacy VehicleModel (for backward compatibility during transition)
export interface VehicleModel {
  name: string;
  variant?: string;
  price: number;
  old_price?: number;
  engine_type?: string;
  transmission?: string;
  privatleasing: number;
  old_privatleasing?: number;
  company_leasing_price: number;
  old_company_leasing_price?: number;
  loan_price?: number;
  old_loan_price?: number;
  thumbnail?: string;
  financing_options?: FinancingOptions;
  bransle?: string;
  biltyp?: string;
  vaxellada?: string;
  fuel_type?: string;
  car_type?: string;
  utrustning?: string[];
}

// ============================================
// TOKEN USAGE & API TRACKING
// ============================================

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  model_used: string;
  api_provider: 'claude' | 'perplexity';
}

export interface ApiCallDetails {
  api_provider: 'claude' | 'perplexity';
  model_used: string;
  call_type: 'main_processing' | 'image_analysis' | 'fact_checking' | 'batch_processing';
  token_usage: TokenUsage;
  processing_time_ms: number;
  timestamp: string;
}

export interface ProcessedResult {
  success: boolean;
  content_type: 'campaigns' | 'cars' | 'transport_cars';
  data?: CampaignData[] | VehicleData[];
  campaigns?: CampaignData[];
  cars?: VehicleData[];
  transport_cars?: VehicleData[];
  error?: string;
  source_url: string;
  processed_at: string;
  raw_analysis?: any;
  token_usage?: TokenUsage;
  api_calls?: ApiCallDetails[];
  total_estimated_cost_usd?: number;
  google_ocr_costs?: {
    total_pages: number;
    total_cost_usd: number;
    pdfs_processed: number;
  };
  pdf_processing?: {
    enabled: boolean;
    results: Array<{
      url: string;
      filename: string;
      success: boolean;
      extractedText?: string;
      processingTimeMs: number;
      error?: string;
    }>;
    overall_status: 'not_found' | 'success' | 'failed' | 'partial';
    total_pdfs_found: number;
    total_pdfs_processed: number;
    total_processing_time_ms: number;
    all_errors: string[];
    error?: string;
  };
  debug_info?: {
    total_batches_processed: number;
    total_vehicles_extracted: number;
    total_pdf_results_collected: number;
    pdf_results_breakdown: Array<{
      batch: number;
      status: 'SUCCESS' | 'FAILED';
      chars: number;
      filename?: string;
    }>;
    vehicles_with_enhanced_content: Array<{
      title: string;
      description_length: number;
    }>;
    fact_check_before_count: number;
    fact_check_after_count: number;
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function detectContentType(htmlContent: string, sourceUrl: string, category: string): 'campaigns' | 'cars' | 'transport_cars' {
  if (category === 'campaigns' || category === 'cars' || category === 'transport_cars') {
    return category as 'campaigns' | 'cars' | 'transport_cars';
  }

  const content = htmlContent.toLowerCase();
  const url = sourceUrl.toLowerCase();

  if (url.includes('erbjudand') || url.includes('kampanj') || url.includes('offer') || url.includes('finansiering')) {
    return 'campaigns';
  }
  if (url.includes('transportbilar') || url.includes('commercial') || url.includes('van')) {
    return 'transport_cars';
  }
  if (url.includes('personbilar') || url.includes('modeller') || url.includes('cars')) {
    return 'cars';
  }

  const campaignKeywords = ['kampanj', 'erbjudande', 'rabatt', 'specialpris', 'begränsat', 'sommar', 'vinter', 'finansiering'];
  const transportKeywords = ['transport', 'commercial', 'van', 'lastbil', 'företag'];

  const campaignCount = campaignKeywords.filter(word => content.includes(word)).length;
  const transportCount = transportKeywords.filter(word => content.includes(word)).length;

  if (campaignCount > 2) return 'campaigns';
  if (transportCount > 1) return 'transport_cars';

  return 'cars';
}

export function truncateDescription(text: string, maxLength: number = 160): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;

  const truncated = text.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(' ');

  if (lastSpaceIndex > maxLength * 0.8) {
    return truncated.substring(0, lastSpaceIndex) + '...';
  }

  return truncated.substring(0, maxLength - 3) + '...';
}

// Validation for campaign data
export function validateCampaignData(campaign: any): CampaignData | null {
  try {
    if (!campaign.title || !campaign.brand) {
      console.warn('Campaign missing required fields:', campaign);
      return null;
    }

    const vehicleModels = Array.isArray(campaign.vehicle_model) ? campaign.vehicle_model : [];
    const validatedModels = vehicleModels.map((model: any) => ({
      name: model.name || '',
      price: parseFloat(model.price) || 0,
      old_price: parseFloat(model.old_price) || 0,
      privatleasing: parseFloat(model.privatleasing) || parseFloat(model.leasing_price) || 0,
      old_privatleasing: parseFloat(model.old_privatleasing) || 0,
      company_leasing_price: parseFloat(model.company_leasing_price) || 0,
      old_company_leasing_price: parseFloat(model.old_company_leasing_price) || 0,
      loan_price: parseFloat(model.loan_price) || 0,
      old_loan_price: parseFloat(model.old_loan_price) || 0,
      thumbnail: model.thumbnail || ''
    }));

    const whatsIncluded = Array.isArray(campaign.whats_included) ? campaign.whats_included : [];
    const validatedIncluded = whatsIncluded.map((item: any) => ({
      name: item.name || '',
      description: item.description || ''
    }));

    return {
      title: campaign.title,
      description: truncateDescription(campaign.description || ''),
      content: campaign.content || '',
      thumbnail: campaign.thumbnail || '',
      brand: campaign.brand,
      vehicle_model: validatedModels,
      campaign_start: campaign.campaign_start || '',
      campaign_end: campaign.campaign_end || '',
      whats_included: validatedIncluded,
      free_text: campaign.free_text || ''
    };
  } catch (error) {
    console.error('Error validating campaign data:', error);
    return null;
  }
}

// Validation for vehicle data (NEW SCHEMA)
export function validateVehicleData(vehicle: any): VehicleData | null {
  try {
    if (!vehicle.title || !vehicle.brand) {
      console.warn('Vehicle missing required fields:', vehicle);
      return null;
    }

    // Handle new variants format
    let variants: VehicleVariant[] = [];

    if (Array.isArray(vehicle.variants)) {
      variants = vehicle.variants.map((v: any) => ({
        id: v.id,
        name: v.name || '',
        price: v.price ?? null,
        old_price: v.old_price ?? null,
        privatleasing: v.privatleasing ?? null,
        old_privatleasing: v.old_privatleasing ?? null,
        company_leasing: v.company_leasing ?? null,
        old_company_leasing: v.old_company_leasing ?? null,
        loan_price: v.loan_price ?? null,
        old_loan_price: v.old_loan_price ?? null,
        fuel_type: v.fuel_type ?? null,
        transmission: v.transmission ?? null,
        thumbnail: v.thumbnail ?? null,
        specs: v.specs ?? null,
        equipment: Array.isArray(v.equipment) ? v.equipment : []
      }));
    }
    // Legacy: convert vehicle_model to variants
    else if (Array.isArray(vehicle.vehicle_model)) {
      variants = vehicle.vehicle_model.map((m: any) => ({
        name: m.name || '',
        price: m.price ?? null,
        old_price: m.old_price ?? null,
        privatleasing: m.privatleasing ?? null,
        old_privatleasing: m.old_privatleasing ?? null,
        company_leasing: m.company_leasing_price ?? null,
        old_company_leasing: m.old_company_leasing_price ?? null,
        loan_price: m.loan_price ?? null,
        old_loan_price: m.old_loan_price ?? null,
        fuel_type: m.bransle ?? m.fuel_type ?? null,
        transmission: m.vaxellada ?? m.transmission ?? null,
        thumbnail: m.thumbnail ?? null,
        equipment: Array.isArray(m.utrustning) ? m.utrustning : []
      }));
    }

    return {
      id: vehicle.id,
      brand: vehicle.brand,
      title: vehicle.title,
      description: truncateDescription(vehicle.description || ''),
      thumbnail: vehicle.thumbnail ?? null,
      vehicle_type: vehicle.vehicle_type ?? 'cars',
      body_type: vehicle.body_type ?? null,
      source_url: vehicle.source_url ?? null,
      updated_at: vehicle.updated_at ?? new Date().toISOString(),
      variants,
      variant_count: variants.length,
      dimensions: vehicle.dimensions ?? null,
      colors: Array.isArray(vehicle.colors) ? vehicle.colors : [],
      interiors: Array.isArray(vehicle.interiors) ? vehicle.interiors : [],
      options: Array.isArray(vehicle.options) ? vehicle.options : [],
      accessories: Array.isArray(vehicle.accessories) ? vehicle.accessories : [],
      services: Array.isArray(vehicle.services) ? vehicle.services : [],
      connected_services: vehicle.connected_services ?? null,
      financing: vehicle.financing ?? null,
      warranties: Array.isArray(vehicle.warranties) ? vehicle.warranties : [],
      dealer_info: vehicle.dealer_info ?? null,
      // Legacy
      free_text: vehicle.free_text || '',
      pdf_source_url: vehicle.pdf_source_url
    };
  } catch (error) {
    console.error('Error validating vehicle data:', error);
    return null;
  }
}

// Currency formatting
export function formatCurrency(amount: number, currency: string = 'SEK'): string {
  if (!amount || amount === 0) return 'Price on request';

  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

// Date formatting
export function formatDate(dateString: string): string {
  if (!dateString) return '';

  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  } catch (error) {
    return dateString;
  }
}

// API Pricing
export const API_PRICING = {
  claude: {
    'claude-sonnet-4-5': {
      prompt_tokens: 3.0 / 1000000,
      completion_tokens: 15.0 / 1000000,
    },
    'claude-haiku-3-5': {
      prompt_tokens: 0.8 / 1000000,
      completion_tokens: 4.0 / 1000000,
    },
    'claude-opus-4': {
      prompt_tokens: 15.0 / 1000000,
      completion_tokens: 75.0 / 1000000,
    },
  },
  perplexity: {
    'sonar': {
      prompt_tokens: 1.0 / 1000000,
      completion_tokens: 3.0 / 1000000,
    },
  },
} as const;

export function calculateTokenCost(
  promptTokens: number,
  completionTokens: number,
  model: string,
  provider: 'claude' | 'perplexity'
): number {
  const providerPricing = API_PRICING[provider];
  if (!providerPricing) {
    console.warn(`Unknown pricing provider: ${provider}`);
    return 0;
  }

  const pricing = (providerPricing as any)[model];
  if (!pricing) {
    console.warn(`Unknown pricing for ${provider}:${model}`);
    return 0;
  }

  return (promptTokens * pricing.prompt_tokens) + (completionTokens * pricing.completion_tokens);
}

export function createTokenUsage(
  promptTokens: number,
  completionTokens: number,
  model: string,
  provider: 'claude' | 'perplexity'
): TokenUsage {
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    estimated_cost_usd: calculateTokenCost(promptTokens, completionTokens, model, provider),
    model_used: model,
    api_provider: provider,
  };
}

export function formatCost(costUsd: number): string {
  if (costUsd < 0.001) {
    return `$${(costUsd * 1000).toFixed(3)}k`;
  }
  return `$${costUsd.toFixed(4)}`;
}
