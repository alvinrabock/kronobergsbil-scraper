/**
 * CMS API Wrapper
 * This file maintains backwards compatibility while using the new CMS API
 */

import {
  createMultipleBilmodellerInCMS,
  transformVehicleDataToCMS,
  getExistingBilmodeller,
  findOrCreateBilmarke,
  type BatchCreateResult,
  type VehicleVariant
} from './cms-api';

// Re-export types for backwards compatibility
export interface PayloadVehicleModel {
  name: string;
  price?: number;
  old_price?: number;
  apiThumbnail?: string;
  financing_options?: {
    privatleasing?: Array<{
      monthly_price: number;
      period_months: number;
      annual_mileage?: number;
      down_payment?: number;
      conditions?: string;
    }>;
    company_leasing?: Array<{
      monthly_price: number;
      period_months: number;
      annual_mileage?: number;
      down_payment?: number;
      benefit_value?: number;
      conditions?: string;
    }>;
    loan?: Array<{
      monthly_price: number;
      period_months: number;
      interest_rate?: number;
      down_payment_percent?: number;
      total_amount?: number;
      conditions?: string;
    }>;
  };
}

export interface PayloadFordonData {
  title: string;
  description?: string;
  apiThumbnail?: string;
  bilmarken?: string;
  vehicle_model?: PayloadVehicleModel[];
  free_text?: string;
  publishedAt: string;
  _status: 'draft' | 'published';
}

export interface PayloadResponse {
  success: boolean;
  error?: string;
  id?: string;
}

export { BatchCreateResult };

// Transform vehicle data - now uses CMS format internally
export async function transformVehicleDataToPayload(vehicleData: any): Promise<PayloadFordonData> {
  console.log('🔄 TRANSFORM INPUT:', JSON.stringify(vehicleData, null, 2));

  if (!vehicleData) {
    console.error('❌ vehicleData is null/undefined');
    throw new Error('Vehicle data is required');
  }

  if (!vehicleData.title) {
    console.error('❌ vehicleData.title is missing:', vehicleData);
    throw new Error('Vehicle title is required');
  }

  // Handle bilmarken relationship
  let bilmarkenId: string | undefined = undefined;
  if (vehicleData.brand || vehicleData.bilmarken) {
    const brandName = vehicleData.brand || vehicleData.bilmarken;
    const brandId = await findOrCreateBilmarke(brandName);
    if (brandId) {
      bilmarkenId = brandId;
    }
  }

  const result: PayloadFordonData = {
    title: vehicleData.title.trim(),
    description: vehicleData.description || '',
    apiThumbnail: vehicleData.thumbnail || vehicleData.apiThumbnail || undefined,
    bilmarken: bilmarkenId,
    vehicle_model: vehicleData.vehicle_model?.map((model: any) => {
      const processedModel: PayloadVehicleModel = {
        name: model.name,
        price: model.price,
        old_price: model.old_price,
        apiThumbnail: model.thumbnail || model.apiThumbnail || undefined,
      };

      if (model.financing_options) {
        processedModel.financing_options = {
          privatleasing: model.financing_options.privatleasing || [],
          company_leasing: model.financing_options.company_leasing || [],
          loan: model.financing_options.loan || []
        };
      }

      return processedModel;
    }) || [],
    free_text: vehicleData.free_text || '',
    publishedAt: new Date().toISOString(),
    _status: 'published'
  };

  console.log('🔄 TRANSFORM OUTPUT:', JSON.stringify(result, null, 2));
  return result;
}

// Batch create function - uses new CMS API
export async function createMultipleFordonInPayload(vehicles: any[]): Promise<BatchCreateResult> {
  console.log('🚗 BATCH INPUT - vehicles array:', vehicles?.length || 0);

  if (!vehicles || vehicles.length === 0) {
    console.error('❌ No vehicles provided to batch function');
    throw new Error('No vehicles to process');
  }

  try {
    // Use the new CMS API
    const result = await createMultipleBilmodellerInCMS(vehicles);
    return result;
  } catch (error) {
    console.error('❌ BATCH FUNCTION ERROR:', error);

    return {
      success: false,
      created: 0,
      updated: 0,
      failed: vehicles.length,
      total: vehicles.length,
      results: vehicles.map(vehicle => ({
        title: vehicle?.title || 'Unknown vehicle',
        success: false,
        action: 'error' as const,
        error: error instanceof Error ? error.message : 'Unknown error'
      })),
      summary: {
        created: 0,
        updated: 0,
        failed: vehicles.length,
        duplicatesFound: 0,
        newItemsCreated: 0
      }
    };
  }
}

// Stub functions for compatibility
export async function createFordonInPayload(data: any): Promise<PayloadResponse> {
  console.log('createFordonInPayload called - using new CMS API');
  try {
    const result = await createMultipleBilmodellerInCMS([data]);
    return {
      success: result.success,
      id: result.results[0]?.id,
      error: result.results[0]?.error
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function createCampaignInPayload(data: any): Promise<PayloadResponse> {
  console.log('createCampaignInPayload called (not implemented for new CMS)');
  return { success: false, error: 'Campaigns not implemented for new CMS' };
}

export async function createMultipleCampaignsInPayload(data: any[]): Promise<BatchCreateResult> {
  console.log('createMultipleCampaignsInPayload called (not implemented for new CMS)');
  return {
    success: false,
    created: 0,
    updated: 0,
    failed: data.length,
    total: data.length,
    results: [],
    summary: {
      created: 0,
      updated: 0,
      failed: data.length,
      duplicatesFound: 0,
      newItemsCreated: 0
    }
  };
}

export async function transformCampaignDataToPayload(data: any): Promise<any> {
  console.log('transformCampaignDataToPayload called (stub)');
  return data;
}

// Get existing fordon - uses new CMS API
export async function getExistingFordon() {
  try {
    console.log('🔍 Fetching existing vehicles from CMS...');
    const existingVehicles = await getExistingBilmodeller();
    console.log(`✅ Successfully fetched ${existingVehicles.length} existing vehicles`);
    return existingVehicles;
  } catch (error) {
    console.error('❌ Error fetching existing vehicles:', error);
    return [];
  }
}
