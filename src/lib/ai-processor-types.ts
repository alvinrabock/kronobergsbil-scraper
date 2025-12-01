// lib/ai-processor-types.ts
// Types and utility functions (client-safe)

// Campaign Data Structure
export interface CampaignVehicleModel {
  name: string;
  price: number;
  old_price?: number;
  privatleasing: number;
  company_leasing_price: number;
  loan_price?: number;
  thumbnail?: string;
}

export interface CampaignIncluded {
  name: string;
  description: string;
}

export interface CampaignData {
  title: string;
  description: string; // max 160 characters for meta description
  content: string;
  thumbnail: string;
  brand: string;
  vehicle_model: CampaignVehicleModel[];
  campaign_start: string; // ISO date string
  campaign_end: string; // ISO date string
  whats_included: CampaignIncluded[];
  free_text: string; // conditions and legal text
}

// Financing interfaces (shared between campaigns and vehicles)
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

// Vehicle Data Structure (Cars & Transport Cars)
export interface VehicleModel {
  name: string;
  variant?: string; // e.g., GS, Ultimate Tech, Electric
  price: number;
  old_price?: number;
  engine_type?: string; // Bensin/Hybrid/El
  transmission?: string; // e.g., 8-växlad automat
  privatleasing: number;
  company_leasing_price: number;
  loan_price?: number;
  thumbnail?: string;
  financing_options?: FinancingOptions; // Keep for backward compatibility
}

// Technical specifications interfaces
export interface EngineSpecs {
  type?: string;
  fuel_type?: string;
  power_kw?: number;
  power_hp?: number;
  torque_nm?: number;
  cylinders?: number;
  displacement_cc?: number;
  transmission?: string;
}

export interface PerformanceSpecs {
  top_speed_kmh?: number;
  acceleration_0_100?: number;
  driving_range_km?: number;
  electric_range_km?: number;
}

export interface ConsumptionSpecs {
  fuel_consumption_combined_l100km?: number;
  fuel_consumption_city_l100km?: number;
  fuel_consumption_highway_l100km?: number;
  electricity_consumption_kwhper100km?: number;
  co2_emissions_gkm?: number;
  emission_standard?: string;
  fuel_tank_capacity_l?: number;
  battery_capacity_kwh?: number;
  charging_time_ac_0_100?: string;
  charging_time_dc_20_80?: string;
}

export interface TechnicalSpecs {
  engine?: EngineSpecs;
  performance?: PerformanceSpecs;
  consumption?: ConsumptionSpecs;
}

export interface Dimensions {
  length_mm?: number;
  width_mm?: number;
  width_with_mirrors_mm?: number;
  height_mm?: number;
  wheelbase_mm?: number;
  ground_clearance_mm?: number;
  turning_circle_m?: number;
  trunk_volume_l?: number;
  trunk_volume_max_l?: number;
  seating_capacity?: number;
  doors?: number;
  weight_kg?: number;
  max_weight_kg?: number;
  max_roof_load_kg?: number;
  max_towing_weight_kg?: number;
}

export interface StandardEquipment {
  safety?: string[];
  comfort?: string[];
  technology?: string[];
  exterior?: string[];
  interior?: string[];
}

export interface EquipmentPackage {
  name: string;
  code?: string;
  price?: number;
  included_features?: string[];
}

export interface Equipment {
  standard?: StandardEquipment;
  packages?: EquipmentPackage[];
}

export interface ColorOption {
  name: string;
  code?: string;
  type?: string; // solid/metallic/pearl
  price?: number;
}

export interface WheelOption {
  size?: string;
  type?: string;
  price?: number;
  standard_on?: string[];
}

export interface Warranty {
  vehicle_warranty_years?: number;
  vehicle_warranty_km?: number;
  paint_warranty_years?: number;
  rust_warranty_years?: number;
  battery_warranty_years?: number;
  battery_warranty_km?: number;
  roadside_assistance_years?: number;
}

export interface VehicleData {
  title: string;
  brand: string;
  description: string; // max 160 characters for meta description
  thumbnail: string;
  vehicle_model: VehicleModel[];
  technical_specs?: TechnicalSpecs;
  dimensions?: Dimensions;
  equipment?: Equipment;
  available_colors?: ColorOption[];
  wheel_options?: WheelOption[];
  warranty?: Warranty;
  free_text: string; // conditions and legal text
  pdf_source_url?: string; // URL of the PDF where data was extracted from
}

// Enhanced token usage tracking
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  model_used: string;
  api_provider: 'openai' | 'perplexity';
}

export interface ApiCallDetails {
  api_provider: 'openai' | 'perplexity';
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

// Utility functions (client-safe)
export function detectContentType(htmlContent: string, sourceUrl: string, category: string): 'campaigns' | 'cars' | 'transport_cars' {
  // First check the provided category
  if (category === 'campaigns' || category === 'cars' || category === 'transport_cars') {
    return category as 'campaigns' | 'cars' | 'transport_cars';
  }

  const content = htmlContent.toLowerCase();
  const url = sourceUrl.toLowerCase();
  
  // Check URL patterns
  if (url.includes('erbjudand') || url.includes('kampanj') || url.includes('offer') || url.includes('finansiering')) {
    return 'campaigns';
  }
  if (url.includes('transportbilar') || url.includes('commercial') || url.includes('van')) {
    return 'transport_cars';
  }
  if (url.includes('personbilar') || url.includes('modeller') || url.includes('cars')) {
    return 'cars';
  }
  
  // Check content keywords
  const campaignKeywords = ['kampanj', 'erbjudande', 'rabatt', 'specialpris', 'begränsat', 'sommar', 'vinter', 'finansiering'];
  const transportKeywords = ['transport', 'commercial', 'van', 'lastbil', 'företag'];
  
  const campaignCount = campaignKeywords.filter(word => content.includes(word)).length;
  const transportCount = transportKeywords.filter(word => content.includes(word)).length;
  
  if (campaignCount > 2) return 'campaigns';
  if (transportCount > 1) return 'transport_cars';
  
  return 'cars'; // default
}

// Helper function to truncate description to 160 characters
export function truncateDescription(text: string, maxLength: number = 160): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  
  // Try to break at a word boundary
  const truncated = text.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(' ');
  
  if (lastSpaceIndex > maxLength * 0.8) {
    return truncated.substring(0, lastSpaceIndex) + '...';
  }
  
  return truncated.substring(0, maxLength - 3) + '...';
}

// Validation functions for data integrity
export function validateCampaignData(campaign: any): CampaignData | null {
  try {
    if (!campaign.title || !campaign.brand) {
      console.warn('Campaign missing required fields:', campaign);
      return null;
    }

    // Ensure vehicle_model is an array
    const vehicleModels = Array.isArray(campaign.vehicle_model) ? campaign.vehicle_model : [];
    const validatedModels = vehicleModels.map((model: any) => ({
      name: model.name || '',
      price: parseFloat(model.price) || 0,
      old_price: parseFloat(model.old_price) || 0,
      privatleasing: parseFloat(model.privatleasing) || parseFloat(model.leasing_price) || 0, // fallback to old name
      company_leasing_price: parseFloat(model.company_leasing_price) || 0,
      loan_price: parseFloat(model.loan_price) || 0,
      thumbnail: model.thumbnail || ''
    }));

    // Ensure whats_included is an array
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

export function validateVehicleData(vehicle: any): VehicleData | null {
  try {
    if (!vehicle.title || !vehicle.brand) {
      console.warn('Vehicle missing required fields:', vehicle);
      return null;
    }

    // Ensure vehicle_model is an array
    const vehicleModels = Array.isArray(vehicle.vehicle_model) ? vehicle.vehicle_model : [];
    const validatedModels = vehicleModels.map((model: any) => ({
      name: model.name || '',
      price: parseFloat(model.price) || 0,
      old_price: parseFloat(model.old_price) || 0,
      privatleasing: parseFloat(model.privatleasing) || parseFloat(model.leasing_price) || 0, // fallback to old name
      company_leasing_price: parseFloat(model.company_leasing_price) || 0,
      loan_price: parseFloat(model.loan_price) || 0,
      thumbnail: model.thumbnail || ''
    }));

    return {
      title: vehicle.title,
      brand: vehicle.brand,
      description: truncateDescription(vehicle.description || ''),
      thumbnail: vehicle.thumbnail || '',
      vehicle_model: validatedModels,
      free_text: vehicle.free_text || '',
      pdf_source_url: vehicle.pdf_source_url || null
    };
  } catch (error) {
    console.error('Error validating vehicle data:', error);
    return null;
  }
}

// Utility function to format currency for display
export function formatCurrency(amount: number, currency: string = 'SEK'): string {
  if (!amount || amount === 0) return 'Price on request';
  
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

// Utility function to format dates
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

// API Pricing (as of 2024 - these should be updated regularly)
export const API_PRICING = {
  openai: {
    'gpt-4o': {
      prompt_tokens: 2.5 / 1000000, // $2.50 per 1M tokens
      completion_tokens: 10.0 / 1000000, // $10.00 per 1M tokens
    },
    'gpt-4o-mini': {
      prompt_tokens: 0.15 / 1000000, // $0.15 per 1M tokens
      completion_tokens: 0.6 / 1000000, // $0.60 per 1M tokens
    },
    'gpt-5': {
      prompt_tokens: 3.0 / 1000000, // Estimated pricing
      completion_tokens: 15.0 / 1000000,
    },
  },
  perplexity: {
    'sonar': {
      prompt_tokens: 1.0 / 1000000, // $1.00 per 1M tokens (estimated)
      completion_tokens: 3.0 / 1000000, // $3.00 per 1M tokens (estimated)
    },
  },
} as const;

// Cost calculation utilities
export function calculateTokenCost(
  promptTokens: number,
  completionTokens: number,
  model: string,
  provider: 'openai' | 'perplexity'
): number {
  const providerPricing = API_PRICING[provider];
  if (!providerPricing) {
    console.warn(`Unknown pricing provider: ${provider}`);
    return 0;
  }

  // Type-safe pricing lookup
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
  provider: 'openai' | 'perplexity'
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
    return `$${(costUsd * 1000).toFixed(3)}k`; // Show in thousandths
  }
  return `$${costUsd.toFixed(4)}`;
}