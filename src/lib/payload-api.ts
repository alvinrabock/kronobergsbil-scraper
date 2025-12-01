"use server"
import axios from 'axios';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

export interface PayloadVehicleModel {
    name: string;
    price?: number;
    old_price?: number;
    apiThumbnail?: string; // Changed from thumbnail to apiThumbnail
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
    apiThumbnail?: string; // Changed from thumbnail to apiThumbnail
    bilmarken?: string; // This should be the relationship ID
    vehicle_model?: PayloadVehicleModel[];
    free_text?: string;
    publishedAt: string;
    _status: 'draft' | 'published';
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
        matchInfo?: {
            score: number;
            reason: string;
            originalTitle: string;
        };
    }>;
    summary: {
        created: number;
        updated: number;
        failed: number;
        duplicatesFound: number;
        newItemsCreated: number;
    };
}

// Helper function to find or create bilmarken by name using API
async function findOrCreateBilmarken(brandName: string): Promise<string | null> {
    if (!brandName || brandName.trim() === '') {
        return null;
    }

    try {
        // First, try to find existing brand
        const searchResponse = await axios.get(`${SERVER_URL}/api/bilmarken`, {
            params: {
                where: JSON.stringify({
                    title: {
                        equals: brandName.trim()
                    }
                }),
                limit: 1
            }
        });

        if (searchResponse.data.docs && searchResponse.data.docs.length > 0) {
            console.log(`✅ Found existing brand: ${brandName} -> ID: ${searchResponse.data.docs[0].id}`);
            return searchResponse.data.docs[0].id as string;
        }

        // If not found, create new brand
        const createResponse = await axios.post(`${SERVER_URL}/api/bilmarken`, {
            title: brandName.trim(),
            _status: 'published'
        });

        console.log(`✅ Created new brand: ${brandName} -> ID: ${createResponse.data.doc.id}`);
        return createResponse.data.doc.id as string;

    } catch (error) {
        console.error(`❌ Error handling brand ${brandName}:`, error);
        return null;
    }
}
// Updated transform function to handle relationships properly
export async function transformVehicleDataToPayload(vehicleData: any): Promise<PayloadFordonData> {
    console.log('🔄 TRANSFORM INPUT:', JSON.stringify(vehicleData, null, 2));

    if (!vehicleData) {
        console.error('❌ vehicleData is null/undefined');
        throw new Error('Vehicle data is required');
    }

    if (!vehicleData.title) {
        console.error('❌ vehicleData.title is missing:', vehicleData);
        console.error('❌ Available keys:', Object.keys(vehicleData));
        throw new Error('Vehicle title is required');
    }

    // Handle bilmarken relationship
    let bilmarkenId: string | undefined = undefined;
    if (vehicleData.brand || vehicleData.bilmarken) {
        const brandName = vehicleData.brand || vehicleData.bilmarken;
        const brandId = await findOrCreateBilmarken(brandName);
        if (brandId) {
            bilmarkenId = brandId;
        }
    }

    const result: PayloadFordonData = {
        title: vehicleData.title.trim(),
        description: vehicleData.description || '',
        // Handle main thumbnail using camelCase
        apiThumbnail: vehicleData.thumbnail || vehicleData.apiThumbnail || undefined,
        bilmarken: bilmarkenId,
        vehicle_model: vehicleData.vehicle_model?.map((model: any) => {
            console.log(`🔄 Processing model: ${model.name}`, JSON.stringify(model.financing_options, null, 2));
            
            const processedModel: any = {
                name: model.name,
                price: model.price,
                old_price: model.old_price,
                apiThumbnail: model.thumbnail || model.apiThumbnail || undefined,
            };

            // Handle financing options with proper validation
            if (model.financing_options) {
                processedModel.financing_options = {};

                // Process privatleasing
                if (model.financing_options.privatleasing && Array.isArray(model.financing_options.privatleasing)) {
                    processedModel.financing_options.privatleasing = model.financing_options.privatleasing
                        .filter((option: any) => {
                            // Ensure required fields are present and valid
                            const hasValidMonthlyPrice = typeof option.monthly_price === 'number' && option.monthly_price > 0;
                            const hasValidPeriodMonths = typeof option.period_months === 'number' && option.period_months > 0;
                            
                            console.log(`🔍 Privatleasing option validation:`, {
                                monthly_price: option.monthly_price,
                                period_months: option.period_months,
                                hasValidMonthlyPrice,
                                hasValidPeriodMonths
                            });
                            
                            return hasValidMonthlyPrice && hasValidPeriodMonths;
                        })
                        .map((option: any) => ({
                            monthly_price: option.monthly_price,
                            period_months: option.period_months,
                            annual_mileage: option.annual_mileage || undefined,
                            down_payment: option.down_payment || undefined,
                            conditions: option.conditions || undefined
                        }));
                    
                    console.log(`✅ Processed ${processedModel.financing_options.privatleasing.length} privatleasing options`);
                } else {
                    processedModel.financing_options.privatleasing = [];
                }

                // Process company_leasing
                if (model.financing_options.company_leasing && Array.isArray(model.financing_options.company_leasing)) {
                    processedModel.financing_options.company_leasing = model.financing_options.company_leasing
                        .filter((option: any) => {
                            const hasValidMonthlyPrice = typeof option.monthly_price === 'number' && option.monthly_price > 0;
                            const hasValidPeriodMonths = typeof option.period_months === 'number' && option.period_months > 0;
                            return hasValidMonthlyPrice && hasValidPeriodMonths;
                        })
                        .map((option: any) => ({
                            monthly_price: option.monthly_price,
                            period_months: option.period_months,
                            annual_mileage: option.annual_mileage || undefined,
                            down_payment: option.down_payment || undefined,
                            benefit_value: option.benefit_value || undefined,
                            conditions: option.conditions || undefined
                        }));
                    
                    console.log(`✅ Processed ${processedModel.financing_options.company_leasing.length} company_leasing options`);
                } else {
                    processedModel.financing_options.company_leasing = [];
                }

                // Process loan
                if (model.financing_options.loan && Array.isArray(model.financing_options.loan)) {
                    processedModel.financing_options.loan = model.financing_options.loan
                        .map((option: any) => ({
                            monthly_price: option.monthly_price || undefined,
                            period_months: option.period_months || undefined,
                            interest_rate: option.interest_rate || undefined,
                            down_payment_percent: option.down_payment_percent || undefined,
                            total_amount: option.total_amount || undefined,
                            conditions: option.conditions || undefined
                        }));
                    
                    console.log(`✅ Processed ${processedModel.financing_options.loan.length} loan options`);
                } else {
                    processedModel.financing_options.loan = [];
                }
            } else {
                // Create empty financing options if none exist
                processedModel.financing_options = {
                    privatleasing: [],
                    company_leasing: [],
                    loan: []
                };
            }

            console.log(`🔄 Final processed model:`, JSON.stringify(processedModel, null, 2));
            return processedModel;
        }) || [],
        free_text: vehicleData.free_text || '',
        publishedAt: new Date().toISOString(),
        _status: 'draft' as const
    };

    console.log('🔄 TRANSFORM OUTPUT:', JSON.stringify(result, null, 2));
    return result;
}

// Updated batch function with proper async handling
export async function createMultipleFordonInPayload(vehicles: any[]): Promise<BatchCreateResult> {
    console.log('🚗 BATCH INPUT - vehicles array:', vehicles?.length || 0);
    console.log('🚗 FIRST VEHICLE CHECK:', vehicles[0]); // Add this line
    console.log('🚗 ALL VEHICLES CHECK:', vehicles.map(v => ({ title: v?.title, hasData: !!v?.title }))); // Add this line

    if (!vehicles || vehicles.length === 0) {
        console.error('❌ No vehicles provided to batch function');
        throw new Error('No vehicles to process');
    }

    const emptyItems = vehicles.filter((v, i) => !v || !v.title);
    if (emptyItems.length > 0) {
        console.error(`❌ Found ${emptyItems.length} empty items:`, emptyItems);
    }

    // Log first vehicle to check structure
    console.log('🚗 FIRST VEHICLE STRUCTURE:', JSON.stringify(vehicles[0], null, 2));

    try {
        console.log('🔄 Starting transformation of vehicles...');

        // Transform vehicles one by one to handle async bilmarken lookups
        const transformedItems: PayloadFordonData[] = [];
        for (let i = 0; i < vehicles.length; i++) {
            const vehicle = vehicles[i];
            console.log(`🔄 Transforming vehicle ${i + 1}:`, vehicle?.title || 'No title');

            try {
                const transformed = await transformVehicleDataToPayload(vehicle);
                transformedItems.push(transformed);
            } catch (error) {
                console.error(`❌ Failed to transform vehicle ${i + 1}:`, error);
                // Continue with other vehicles, we'll handle this error in the API call
                transformedItems.push({
                    title: vehicle?.title || 'Failed transformation',
                    description: '',
                    free_text: '',
                    publishedAt: new Date().toISOString(),
                    _status: 'draft'
                });
            }
        }

        console.log('🚗 TRANSFORMED ITEMS COUNT:', transformedItems.length);
        console.log('🚗 FIRST TRANSFORMED ITEM:', JSON.stringify(transformedItems[0], null, 2));

        const response = await fetch('/api/import/fordon', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'fordon',
                items: transformedItems
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Batch fordon API failed: ${error}`);
        }

        return await response.json();
    } catch (error) {
        console.error('❌ BATCH FUNCTION ERROR:', error);

        // Return error format that matches BatchCreateResult interface
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
export async function createFordonInPayload(data: any): Promise<any> {
    console.log('createFordonInPayload called (stub)');
    return { success: false, error: 'Function not implemented' };
}

export async function createCampaignInPayload(data: any): Promise<any> {
    console.log('createCampaignInPayload called (stub)');
    return { success: false, error: 'Function not implemented' };
}

export async function createMultipleCampaignsInPayload(data: any[]): Promise<any> {
    console.log('createMultipleCampaignsInPayload called (stub)');
    return { success: false, error: 'Function not implemented' };
}

export async function transformCampaignDataToPayload(data: any): Promise<any> {
    console.log('transformCampaignDataToPayload called (stub)');
    return data;
}

export interface PayloadResponse {
    success: boolean;
    error?: string;
    id?: string;
}

// Helper function to get existing fordon for comparison using API
export async function getExistingFordon() {
    try {
        console.log('🔍 Fetching existing fordon from API...');
        
        const response = await axios.get(`${SERVER_URL}/api/fordon`, {
            params: {
                limit: 1000,
                depth: 1
            }
        });

        const existingVehicles = response.data.docs || [];
        console.log(`✅ Successfully fetched ${existingVehicles.length} existing vehicles`);
        
        return existingVehicles;

    } catch (error) {
        console.error('❌ Error fetching existing fordon:', error);
        console.error('❌ This might be due to API connection issues');

        return [];
    }
}