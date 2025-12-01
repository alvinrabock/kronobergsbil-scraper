// app/api/fordon/route.ts - IMPROVED MATCHING VERSION
import { NextRequest, NextResponse } from 'next/server';
import {
    findMatchingFordon,
    type ExistingRecord,
    type MatchResult
} from '@/lib/payload-deduplication';

// Get the server URL from environment
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000';

// Helper function to make API requests
async function apiRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${SERVER_URL}/api${endpoint}`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options.headers as Record<string, string>
    };
    
    // Add Payload secret for authentication with Payload CMS API
    if (process.env.PAYLOAD_SECRET) {
        headers['Authorization'] = `Bearer ${process.env.PAYLOAD_SECRET}`;
    }
    
    const response = await fetch(url, {
        headers,
        ...options
    });
    
    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
}

// Helper function to find or create bilmarken by name via API
async function findOrCreateBilmarken(brandName: string): Promise<string | null> {
    if (!brandName || brandName.trim() === '') {
        return null;
    }

    try {
        // First, try to find existing brand
        const searchResponse = await apiRequest(`/bilmarken?where[title][equals]=${encodeURIComponent(brandName.trim())}&limit=1`);
        
        if (searchResponse.docs && searchResponse.docs.length > 0) {
            console.log(`✅ Found existing brand: ${brandName} -> ID: ${searchResponse.docs[0].id}`);
            return searchResponse.docs[0].id as string;
        }

        // Create new brand if not found
        console.log(`🆕 Creating new brand: ${brandName}`);
        const newBrand = await apiRequest('/bilmarken', {
            method: 'POST',
            body: JSON.stringify({
                title: brandName.trim(),
                _status: 'published'
            })
        });

        console.log(`✅ Created new brand: ${brandName} -> ID: ${newBrand.doc.id}`);
        return newBrand.doc.id as string;

    } catch (error) {
        console.error(`❌ Error handling brand ${brandName}:`, error);
        return null;
    }
}
// FIXED validation function that handles both flat and nested financing data formats
function validateAndCleanFordonData(data: any) {
    console.log('🆕 VALIDATION STARTING');
    console.log('Input data:', JSON.stringify(data, null, 2));
    
    if (!data.title || typeof data.title !== 'string' || data.title.trim() === '') {
        throw new Error(`Title is required`);
    }

    // Build new object with ONLY safe fields
    const result: any = {
        title: data.title.trim(),
        publishedAt: new Date().toISOString(),
        _status: 'draft'
    };

    // Add description only if it exists
    if (data.description && data.description.trim()) {
        result.description = data.description.trim();
    }

    // Add bilmarken only if it's a valid ObjectId
    if (data.bilmarken && typeof data.bilmarken === 'string' && data.bilmarken.match(/^[0-9a-fA-F]{24}$/)) {
        result.bilmarken = data.bilmarken;
    }

    // Add free_text only if it exists
    if (data.free_text && data.free_text.trim()) {
        result.free_text = data.free_text.trim();
    }

    // Handle main thumbnail URL using camelCase
    if (data.thumbnail && data.thumbnail.trim()) {
        result.apiThumbnail = data.thumbnail.trim();
    }
    if (data.apiThumbnail && data.apiThumbnail.trim()) {
        result.apiThumbnail = data.apiThumbnail.trim();
    }

    // Handle vehicle_model - PRESERVE ALL DATA INCLUDING FINANCING OPTIONS
    if (data.vehicle_model && Array.isArray(data.vehicle_model)) {
        result.vehicle_model = [];
        
        for (const model of data.vehicle_model) {
            console.log(`Processing model: ${model.name}`);
            console.log(`Raw model data:`, JSON.stringify(model, null, 2));
            
            const cleanModel: any = {
                name: model.name || 'Unknown Model'
            };

            // Add price only if valid
            if (typeof model.price === 'number' && model.price > 0) {
                cleanModel.price = model.price;
            }

            // Add old_price only if valid
            if (typeof model.old_price === 'number' && model.old_price > 0) {
                cleanModel.old_price = model.old_price;
            }

            // Add model thumbnail URL using camelCase
            if (model.thumbnail && model.thumbnail.trim()) {
                cleanModel.apiThumbnail = model.thumbnail.trim();
            }
            if (model.apiThumbnail && model.apiThumbnail.trim()) {
                cleanModel.apiThumbnail = model.apiThumbnail.trim();
            }

            // HANDLE FINANCING OPTIONS - SUPPORT BOTH FORMATS
            cleanModel.financing_options = {
                privatleasing: [],
                company_leasing: [],
                loan: []
            };

            // Check if we have nested financing_options (new format)
            if (model.financing_options && typeof model.financing_options === 'object') {
                console.log(`Using nested financing_options format`);
                
                // Process privatleasing array
                if (model.financing_options.privatleasing && Array.isArray(model.financing_options.privatleasing)) {
                    cleanModel.financing_options.privatleasing = model.financing_options.privatleasing
                        .filter((option: any) => {
                            const hasValidMonthlyPrice = typeof option.monthly_price === 'number' && option.monthly_price > 0;
                            return hasValidMonthlyPrice;
                        })
                        .map((option: any) => ({
                            monthly_price: option.monthly_price,
                            period_months: option.period_months || undefined,
                            annual_mileage: option.annual_mileage || undefined,
                            down_payment: option.down_payment || undefined,
                            conditions: option.conditions || undefined
                        }));
                }

                // Process company_leasing array
                if (model.financing_options.company_leasing && Array.isArray(model.financing_options.company_leasing)) {
                    cleanModel.financing_options.company_leasing = model.financing_options.company_leasing
                        .filter((option: any) => {
                            const hasValidMonthlyPrice = typeof option.monthly_price === 'number' && option.monthly_price > 0;
                            return hasValidMonthlyPrice;
                        })
                        .map((option: any) => ({
                            monthly_price: option.monthly_price,
                            period_months: option.period_months || undefined,
                            annual_mileage: option.annual_mileage || undefined,
                            down_payment: option.down_payment || undefined,
                            benefit_value: option.benefit_value || undefined,
                            conditions: option.conditions || undefined
                        }));
                }

                // Process loan array
                if (model.financing_options.loan && Array.isArray(model.financing_options.loan)) {
                    cleanModel.financing_options.loan = model.financing_options.loan
                        .filter((option: any) => {
                            const hasMonthlyPrice = typeof option.monthly_price === 'number' && option.monthly_price > 0;
                            const hasTotalAmount = typeof option.total_amount === 'number' && option.total_amount > 0;
                            const hasInterestRate = typeof option.interest_rate === 'number' && option.interest_rate > 0;
                            return hasMonthlyPrice || hasTotalAmount || hasInterestRate;
                        })
                        .map((option: any) => ({
                            monthly_price: option.monthly_price || undefined,
                            period_months: option.period_months || undefined,
                            interest_rate: option.interest_rate || undefined,
                            down_payment_percent: option.down_payment_percent || undefined,
                            total_amount: option.total_amount || undefined,
                            conditions: option.conditions || undefined
                        }));
                }
            } 
            // Check if we have flat financing properties (old format)
            else if (model.privatleasing || model.company_leasing_price || model.loan_price) {
                console.log(`Using flat financing properties format`);
                
                // Convert flat privatleasing to array format
                if (typeof model.privatleasing === 'number' && model.privatleasing > 0) {
                    cleanModel.financing_options.privatleasing = [{
                        monthly_price: model.privatleasing,
                        period_months: undefined,
                        annual_mileage: undefined,
                        down_payment: undefined,
                        conditions: undefined
                    }];
                    console.log(`✅ Converted privatleasing: ${model.privatleasing} -> array format`);
                }

                // Convert flat company_leasing_price to array format  
                if (typeof model.company_leasing_price === 'number' && model.company_leasing_price > 0) {
                    cleanModel.financing_options.company_leasing = [{
                        monthly_price: model.company_leasing_price,
                        period_months: undefined,
                        annual_mileage: undefined,
                        down_payment: undefined,
                        benefit_value: undefined,
                        conditions: undefined
                    }];
                    console.log(`✅ Converted company_leasing_price: ${model.company_leasing_price} -> array format`);
                }

                // Convert flat loan_price to array format
                if (typeof model.loan_price === 'number' && model.loan_price > 0) {
                    cleanModel.financing_options.loan = [{
                        monthly_price: model.loan_price,
                        period_months: undefined,
                        interest_rate: undefined,
                        down_payment_percent: undefined,
                        total_amount: undefined,
                        conditions: undefined
                    }];
                    console.log(`✅ Converted loan_price: ${model.loan_price} -> array format`);
                }
            }

            console.log(`Final financing_options:`, JSON.stringify(cleanModel.financing_options, null, 2));
            console.log(`Final clean model:`, JSON.stringify(cleanModel, null, 2));
            result.vehicle_model.push(cleanModel);
        }
    }

    console.log('🆕 VALIDATION COMPLETE - Result:', JSON.stringify(result, null, 2));
    return result;
}

// IMPROVED: Get more comprehensive existing vehicle data via API
async function getExistingVehicles() {
    try {
        console.log('📊 Fetching existing vehicles for deduplication...');
        
        const existingVehicles = await apiRequest('/fordon?limit=1000&depth=1');
        
        console.log(`📈 Found ${existingVehicles.docs.length} existing vehicles for matching`);
        
        // Log some sample titles for debugging
        if (existingVehicles.docs.length > 0) {
            console.log('🔍 Sample existing titles:');
            existingVehicles.docs.slice(0, 5).forEach((doc: any, index: number) => {
                console.log(`  ${index + 1}. "${doc.title}" (ID: ${doc.id})`);
            });
        }
        
        return existingVehicles.docs;
    } catch (error) {
        console.warn('⚠️ Error fetching vehicles:', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}

// IMPROVED: Better matching with more detailed logging
async function findBetterMatch(incomingData: any, existingVehicles: any[]): Promise<MatchResult> {
    console.log(`🔍 Looking for matches for: "${incomingData.title}"`);
    console.log(`📊 Searching through ${existingVehicles.length} existing vehicles`);
    
    // Try the existing matching function first
    const matchResult = findMatchingFordon(incomingData, existingVehicles as ExistingRecord[]);
    
    if (matchResult.found && matchResult.matchScore && matchResult.matchScore > 0.7) {
        console.log(`✅ Strong match found via findMatchingFordon: "${matchResult.record?.title}" (${(matchResult.matchScore * 100).toFixed(1)}%)`);
        return matchResult;
    }
    
    // BACKUP MATCHING: Simple title-based matching as fallback
    console.log('🔄 Trying backup title-based matching...');
    
    const incomingTitle = incomingData.title?.toLowerCase().trim();
    if (!incomingTitle) {
        console.log('❌ No title to match against');
        return { found: false, matchScore: 0, matchReason: 'no_title' };
    }
    
    for (const existing of existingVehicles) {
        const existingTitle = existing.title?.toLowerCase().trim();
        if (!existingTitle) continue;
        
        // Exact match
        if (incomingTitle === existingTitle) {
            console.log(`🎯 EXACT TITLE MATCH found: "${existing.title}"`);
            return {
                found: true,
                record: existing,
                matchScore: 1.0,
                matchReason: 'exact_title_match'
            };
        }
        
        // Very similar match (90%+ similarity)
        const similarity = calculateStringSimilarity(incomingTitle, existingTitle);
        if (similarity > 0.9) {
            console.log(`🎯 HIGH SIMILARITY MATCH found: "${existing.title}" (${(similarity * 100).toFixed(1)}% similar)`);
            return {
                found: true,
                record: existing,
                matchScore: similarity,
                matchReason: 'high_title_similarity'
            };
        }
    }
    
    console.log('❌ No suitable matches found');
    return { found: false, matchScore: 0, matchReason: 'no_match_found' };
}

// Helper function to calculate string similarity
function calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}

// Levenshtein distance calculation
function levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
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

async function processSingleFordon(body: any, existingVehicles: any[]) {
    try {
        console.log(`\n🔍 Processing vehicle: "${body.title}"`);

        // Handle brand name conversion
        const processedBody = { ...body };
        if (body.brand) {
            console.log(`🏷️ Converting brand: ${body.brand}`);
            const bilmarkenId = await findOrCreateBilmarken(body.brand);
            if (bilmarkenId) {
                processedBody.bilmarken = bilmarkenId;
                console.log(`✅ Brand converted: ${body.brand} -> ${bilmarkenId}`);
            }
            delete processedBody.brand;
        }

        // VALIDATE AND CLEAN DATA
        const cleanedData = validateAndCleanFordonData(processedBody);

        // IMPROVED MATCHING - Use our better matching function
        const matchResult: MatchResult = await findBetterMatch(processedBody, existingVehicles);
        
        console.log(`🎯 Match result: found=${matchResult.found}, score=${matchResult.matchScore?.toFixed(3)}, reason=${matchResult.matchReason}`);
        
        if (matchResult.found && matchResult.record) {
            console.log(`🔄 UPDATING existing record: "${matchResult.record.title}" (${matchResult.matchScore ? (matchResult.matchScore * 100).toFixed(1) + '%' : 'N/A'} match)`);
            
            try {
                console.log(`🔧 Updating record ${matchResult.record.id} with new data (skipping merge)`);
                console.log(`📋 New data to save:`, JSON.stringify(cleanedData, null, 2));

                // SKIP MERGE - Use only the new data to preserve financing options
                const updatedDoc = await apiRequest(`/fordon/${matchResult.record.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(cleanedData)
                });

                console.log(`✅ Successfully updated: ${updatedDoc.id} - "${updatedDoc.title}"`);
                return {
                    success: true,
                    id: updatedDoc.id,
                    message: `Updated "${cleanedData.title}" (was: "${matchResult.record.title}")`,
                    action: 'updated',
                    matchScore: matchResult.matchScore,
                    matchReason: matchResult.matchReason
                };
            } catch (updateError) {
                console.error(`❌ Error updating record: ${updateError}`);
                console.error('Update error details:', updateError);
                // Fall through to create new record
            }
        }
        
        // Create new record if no match found or update failed
        console.log(`➕ CREATING new record: "${cleanedData.title}"`);
        console.log(`📋 Clean data to create:`, JSON.stringify(cleanedData, null, 2));

        const response = await apiRequest('/fordon', {
            method: 'POST',
            body: JSON.stringify(cleanedData)
        });
        
        const doc = response.doc;
        
        console.log(`✅ Created successfully: ${doc.id} - "${doc.title}"`);
        return {
            success: true,
            id: doc.id,
            message: 'Created successfully',
            action: 'created'
        };

    } catch (error) {
        console.error(`❌ Error processing ${body?.title}:`, error);
        throw error;
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        console.log(`📨 POST received`);

        // IMPROVED: Get existing vehicles with better error handling
        let existingVehicles;
        try {
            existingVehicles = await getExistingVehicles();
        } catch (error) {
            console.error('❌ Failed to fetch existing vehicles:', error);
            existingVehicles = []; // Continue with empty array
        }
        
        console.log(`📊 Found ${existingVehicles.length} existing vehicles`);

        if (body.type === 'fordon' && body.items && Array.isArray(body.items)) {
            console.log(`🚀 Batch processing: ${body.items.length} items`);
            console.log('📋 Incoming titles:');
            body.items.forEach((item: any, index: number) => {
                console.log(`  ${index + 1}. "${item.title}"`);
            });
            
            const results = [];
            let created = 0;
            let updated = 0;
            let failed = 0;

            for (const [index, item] of body.items.entries()) {
                try {
                    console.log(`\n--- Item ${index + 1}/${body.items.length}: "${item.title}" ---`);
                    const result = await processSingleFordon(item, existingVehicles);

                    results.push({
                        title: item.title,
                        success: true,
                        action: result.action,
                        id: result.id,
                        matchScore: result.matchScore,
                        matchReason: result.matchReason
                    });

                    if (result.action === 'created') {
                        created++;
                        console.log(`✅ Item ${index + 1} CREATED - Totals: ${created} created, ${updated} updated, ${failed} failed`);
                    } else {
                        updated++;
                        console.log(`🔄 Item ${index + 1} UPDATED - Totals: ${created} created, ${updated} updated, ${failed} failed`);
                    }

                } catch (error) {
                    console.error(`❌ Item ${index + 1} FAILED:`, error);
                    results.push({
                        title: item.title || 'Unknown',
                        success: false,
                        action: 'error',
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                    failed++;
                    console.log(`❌ Item ${index + 1} ERROR - Totals: ${created} created, ${updated} updated, ${failed} failed`);
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log('\n' + '='.repeat(60));
            console.log('📊 FINAL BATCH RESULTS');
            console.log('='.repeat(60));
            console.log(`✅ Created: ${created}/${body.items.length}`);
            console.log(`🔄 Updated: ${updated}/${body.items.length}`); 
            console.log(`❌ Failed: ${failed}/${body.items.length}`);
            console.log(`📈 Success Rate: ${Math.round(((created + updated) / body.items.length) * 100)}%`);
            console.log('='.repeat(60));

            return NextResponse.json({
                success: failed === 0,
                created,
                updated,
                failed,
                total: body.items.length,
                results,
                summary: {
                    created,
                    updated,
                    failed,
                    duplicatesFound: updated,
                    newItemsCreated: created
                }
            });
        } else {
            console.log(`🚗 Individual processing: ${body.title}`);
            const result = await processSingleFordon(body, existingVehicles);
            return NextResponse.json(result, { status: result.action === 'created' ? 201 : 200 });
        }

    } catch (error) {
        console.error('❌ POST Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, ...updateData } = body;

        if (!id) {
            return NextResponse.json(
                { success: false, error: 'ID required for update' },
                { status: 400 }
            );
        }

        const cleanedData = validateAndCleanFordonData(updateData);

        const response = await apiRequest(`/fordon/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(cleanedData)
        });
        
        const doc = response.doc;

        return NextResponse.json({
            success: true,
            id: doc.id,
            message: 'Updated successfully',
            action: 'updated'
        });

    } catch (error) {
        console.error('PUT Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function GET() {
    try {
        const existingVehicles = await getExistingVehicles();
        
        return NextResponse.json({
            success: true,
            vehicles: existingVehicles,
            count: existingVehicles.length
        });

    } catch (error) {
        console.error('GET Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}