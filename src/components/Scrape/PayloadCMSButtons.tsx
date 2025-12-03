// components/PayloadCMSButtons.tsx - Updated with duplicate detection display
'use client';

import { useState } from 'react';
import {
  transformVehicleDataToPayload,
  transformCampaignDataToPayload,
  type BatchCreateResult
} from '@/lib/payload-api';
import { EnhancedProcessedResult } from '@/lib/ai-processor';
import { LoadingSpinner } from './LoadingSpinner';

interface PayloadCMSButtonsProps {
  aiResults: EnhancedProcessedResult[];
  disabled?: boolean;
}

interface EnhancedPayloadResponse {
  success: boolean;
  id?: string;
  error?: string;
  action?: 'created' | 'updated';
  matchScore?: number;
  matchReason?: string;
}

interface EnhancedBatchResult {
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
      originalTitle?: string;
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

interface CreationResult {
  type: 'individual' | 'batch';
  success: boolean;
  message: string;
  action?: 'created' | 'updated';
  details?: EnhancedBatchResult;
  matchInfo?: {
    score: number;
    reason: string;
    originalTitle?: string;
  };
}

export function PayloadCMSButtons({ aiResults, disabled = false }: PayloadCMSButtonsProps) {
  const [isCreatingFordon, setIsCreatingFordon] = useState(false);
  const [isCreatingCampaigns, setIsCreatingCampaigns] = useState(false);
  const [creationResults, setCreationResults] = useState<CreationResult[]>([]);

  // Get all vehicles from AI results
  const getAllVehicles = () => {
    return aiResults.flatMap(result => [
      ...(result.cars || []),
      ...(result.transport_cars || [])
    ]);
  };

  // Get all campaigns from AI results
  const getAllCampaigns = () => {
    return aiResults.flatMap(result => result.campaigns || []);
  };

  // Enhanced API call for batch operations
  const callBatchAPI = async (type: 'fordon' | 'kampanjer', items: any[]): Promise<EnhancedBatchResult> => {
    // Transform data to the expected format for the API
    const transformedItems = [];
    
    for (const item of items) {
      if (type === 'fordon') {
        // Transform vehicle data to the format expected by the API
        const transformed = {
          title: item.title || `${item.brand}`,
          description: item.description || '',
          brand: item.brand,
          price: item.vehicle_model?.[0]?.price || 0,
          vehicle_model: item.vehicle_model?.map((model: any) => ({
            name: model.name,
            price: model.price,
            old_price: model.old_price,
            apiThumbnail: model.thumbnail,
            financing_options: {
              privatleasing: model.privatleasing ? [{
                monthly_price: model.privatleasing,
                period_months: 36,
                annual_mileage: 1500,
                down_payment: 0,
                conditions: ''
              }] : undefined,
              company_leasing: model.company_leasing_price ? [{
                monthly_price: model.company_leasing_price,
                period_months: 36,
                annual_mileage: 1500,
                down_payment: 0,
                benefit_value: 0,
                conditions: ''
              }] : undefined,
              loan: model.loan_price ? [{
                monthly_price: model.loan_price,
                period_months: 36,
                interest_rate: 5.9,
                down_payment_percent: 0,
                total_amount: model.price,
                conditions: ''
              }] : undefined
            }
          })) || [],
          apiThumbnail: item.thumbnail,
          free_text: item.free_text || ''
        };
        transformedItems.push(transformed);
      } else {
        // For campaigns, pass through as-is for now
        transformedItems.push(item);
      }
    }
    
    const response = await fetch('/api/import/fordon', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transformedItems),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Batch API failed: ${error}`);
    }

    const result = await response.json();
    
    // Transform the API response to match the expected format
    return {
      success: result.success || false,
      created: result.summary?.created || 0,
      updated: result.summary?.updated || 0,
      failed: result.summary?.failed || 0,
      total: result.summary?.total || transformedItems.length,
      results: result.results || [],
      summary: result.summary || {
        created: 0,
        updated: 0,
        failed: 0,
        duplicatesFound: 0,
        newItemsCreated: 0
      }
    };
  };

  // Handle creating individual fordon
  const handleCreateFordon = async (vehicle: any, index: number) => {
    setIsCreatingFordon(true);

    try {
      // Transform and call the API with a single item
      const transformed = {
        title: vehicle.title || `${vehicle.brand}`,
        description: vehicle.description || '',
        brand: vehicle.brand,
        price: vehicle.vehicle_model?.[0]?.price || 0,
        vehicle_model: vehicle.vehicle_model?.map((model: any) => ({
          name: model.name,
          price: model.price,
          old_price: model.old_price,
          apiThumbnail: model.thumbnail,
          financing_options: {
            privatleasing: model.privatleasing ? [{
              monthly_price: model.privatleasing,
              period_months: 36,
              annual_mileage: 1500,
              down_payment: 0,
              conditions: ''
            }] : undefined,
            company_leasing: model.company_leasing_price ? [{
              monthly_price: model.company_leasing_price,
              period_months: 36,
              annual_mileage: 1500,
              down_payment: 0,
              benefit_value: 0,
              conditions: ''
            }] : undefined,
            loan: model.loan_price ? [{
              monthly_price: model.loan_price,
              period_months: 36,
              interest_rate: 5.9,
              down_payment_percent: 0,
              total_amount: model.price,
              conditions: ''
            }] : undefined
          }
        })) || [],
        apiThumbnail: vehicle.thumbnail,
        free_text: vehicle.free_text || ''
      };
      
      const response = await fetch('/api/import/fordon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([transformed]), // Send as array
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const apiResult = await response.json();
      const itemResult = apiResult.results?.[0];
      
      const result: CreationResult = {
        type: 'individual',
        success: itemResult?.success || false,
        action: itemResult?.action,
        message: itemResult?.success
          ? `Fordon "${vehicle.title}" ${itemResult.action === 'updated' ? 'uppdaterades' : 'skapades'} framgångsrikt (ID: ${itemResult.id})`
          : `Fel vid bearbetning av fordon "${vehicle.title}": ${itemResult?.error || 'Okänt fel'}`
      };

      if (itemResult?.matchInfo) {
        result.matchInfo = {
          score: itemResult.matchInfo.score,
          reason: itemResult.matchInfo.reason,
          originalTitle: vehicle.title
        };
      }

      setCreationResults(prev => [result, ...prev]);

    } catch (error) {
      const result: CreationResult = {
        type: 'individual',
        success: false,
        message: `Oväntat fel vid bearbetning av fordon "${vehicle.title}": ${error instanceof Error ? error.message : 'Okänt fel'}`
      };

      setCreationResults(prev => [result, ...prev]);
    } finally {
      setIsCreatingFordon(false);
    }
  };

  // Handle creating individual campaign  
  const handleCreateCampaign = async (campaign: any, index: number) => {
    setIsCreatingCampaigns(true);

    try {
      // For now, campaigns are not supported by the fordon API
      const result: CreationResult = {
        type: 'individual',
        success: false,
        message: `Kampanjbearbetning stöds inte än via fordon-API. Kampanj: "${campaign.title}"`
      };

      setCreationResults(prev => [result, ...prev]);

    } catch (error) {
      const result: CreationResult = {
        type: 'individual',
        success: false,
        message: `Oväntat fel vid bearbetning av kampanj "${campaign.title}": ${error instanceof Error ? error.message : 'Okänt fel'}`
      };

      setCreationResults(prev => [result, ...prev]);
    } finally {
      setIsCreatingCampaigns(false);
    }
  };

  // Handle batch creation of fordon
  const handleBatchCreateFordon = async () => {
    const vehicles = getAllVehicles();
    if (vehicles.length === 0) return;

    setIsCreatingFordon(true);

    try {
      const batchResult: EnhancedBatchResult = await callBatchAPI('fordon', vehicles);

      const result: CreationResult = {
        type: 'batch',
        success: batchResult.success,
        message: `Batch-bearbetning av fordon: ${batchResult.created} skapade, ${batchResult.updated} uppdaterade, ${batchResult.failed} misslyckade`,
        details: batchResult
      };

      setCreationResults(prev => [result, ...prev]);

    } catch (error) {
      const result: CreationResult = {
        type: 'batch',
        success: false,
        message: `Batch-bearbetning misslyckades: ${error instanceof Error ? error.message : 'Okänt fel'}`
      };

      setCreationResults(prev => [result, ...prev]);
    } finally {
      setIsCreatingFordon(false);
    }
  };

  // Handle batch creation of campaigns
  const handleBatchCreateCampaigns = async () => {
    const campaigns = getAllCampaigns();
    if (campaigns.length === 0) return;

    setIsCreatingCampaigns(true);

    try {
      // For now, campaigns are not supported by the fordon API
      const result: CreationResult = {
        type: 'batch',
        success: false,
        message: `Kampanjbearbetning stöds inte än via fordon-API. ${campaigns.length} kampanjer hoppades över.`
      };

      setCreationResults(prev => [result, ...prev]);

    } catch (error) {
      const result: CreationResult = {
        type: 'batch',
        success: false,
        message: `Batch-bearbetning misslyckades: ${error instanceof Error ? error.message : 'Okänt fel'}`
      };

      setCreationResults(prev => [result, ...prev]);
    } finally {
      setIsCreatingCampaigns(false);
    }
  };

  // Clear results
  const clearResults = () => {
    setCreationResults([]);
  };

  // Helper function to get action icon
  const getActionIcon = (action?: 'created' | 'updated' | 'error') => {
    switch (action) {
      case 'created': return '➕';
      case 'updated': return '🔄';
      default: return '❌';
    }
  };

  // Helper function to get action color
  const getActionColor = (action?: 'created' | 'updated', success?: boolean) => {
    if (!success) return 'text-red-800';

    switch (action) {
      case 'created': return 'text-green-800';
      case 'updated': return 'text-blue-800';
      default: return 'text-gray-800';
    }
  };

  const vehicles = getAllVehicles();
  const campaigns = getAllCampaigns();

  if (vehicles.length === 0 && campaigns.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Batch Action Buttons */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <span className="mr-2">🚀</span>
          Skapa/Uppdatera i CMS
        </h3>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-yellow-800 flex items-center">
            <span className="mr-2">💡</span>
            Systemet kontrollerar automatiskt efter dubbletter och uppdaterar befintliga poster när möjligt
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          {vehicles.length > 0 && (
            <button
              onClick={handleBatchCreateFordon}
              disabled={disabled || isCreatingFordon}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${disabled || isCreatingFordon
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700 shadow-lg hover:shadow-xl'
                }`}
            >
              {isCreatingFordon ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Bearbetar fordon...</span>
                </>
              ) : (
                <>
                  <span>🚗</span>
                  <span>Bearbeta alla fordon ({vehicles.length}st)</span>
                </>
              )}
            </button>
          )}

          {campaigns.length > 0 && (
            <button
              onClick={handleBatchCreateCampaigns}
              disabled={disabled || isCreatingCampaigns}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${disabled || isCreatingCampaigns
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg hover:shadow-xl'
                }`}
            >
              {isCreatingCampaigns ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Bearbetar kampanjer...</span>
                </>
              ) : (
                <>
                  <span>🎯</span>
                  <span>Bearbeta alla kampanjer ({campaigns.length}st)</span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="text-sm text-gray-600">
          <p className="mb-1">
            <strong>Fordon:</strong> {vehicles.length} st |
            <strong className="ml-2">Kampanjer:</strong> {campaigns.length} st
          </p>
          <p className="text-xs text-gray-500">
            Nya poster skapas som utkast, befintliga poster uppdateras intelligent med ny information
          </p>
        </div>
      </div>

      {/* Individual Item Actions */}
      <div className="space-y-4">
        {/* Individual Vehicles */}
        {vehicles.length > 0 && (
          <div>
            <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center">
              <span className="mr-2">🚗</span>
              Individuella fordon
            </h4>
            <div className="grid gap-2">
              {vehicles.map((vehicle, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {vehicle.title}
                    </p>
                    <p className="text-xs text-gray-600">
                      {vehicle.vehicle_model?.length || 0} modell(er) • {vehicle.brand}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCreateFordon(vehicle, index)}
                    disabled={disabled || isCreatingFordon}
                    className={`flex items-center space-x-1 px-3 py-1 text-xs rounded font-medium transition-colors ${disabled || isCreatingFordon
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                  >
                    <span>Bearbeta</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Individual Campaigns */}
        {campaigns.length > 0 && (
          <div>
            <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center">
              <span className="mr-2">🎯</span>
              Individuella kampanjer
            </h4>
            <div className="grid gap-2">
              {campaigns.map((campaign, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {campaign.title}
                    </p>
                    <div className="flex items-center space-x-4 text-xs text-gray-600">
                      {campaign.campaign_start && (
                        <span>Start: {campaign.campaign_start}</span>
                      )}
                      {campaign.campaign_end && (
                        <span>Slut: {campaign.campaign_end}</span>
                      )}
                      <span>{campaign.vehicle_model?.length || 0} fordon</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCreateCampaign(campaign, index)}
                    disabled={disabled || isCreatingCampaigns}
                    className={`flex items-center space-x-1 px-3 py-1 text-xs rounded font-medium transition-colors ${disabled || isCreatingCampaigns
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-purple-600 text-white hover:bg-purple-700'
                      }`}
                  >
                    <span>Bearbeta</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results Display */}
      {creationResults.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <span className="mr-2">📊</span>
              Bearbetningsresultat
            </h3>
            <button
              onClick={clearResults}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Rensa resultat
            </button>
          </div>

          <div className="space-y-3 max-h-64 overflow-y-auto">
            {creationResults.map((result, index) => (
              <div key={index} className={`p-3 rounded-lg border ${result.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
                }`}>
                <div className="flex items-start space-x-2">
                  <span className={`text-lg ${getActionColor(result.action, result.success)}`}>
                    {getActionIcon(result.action)}
                  </span>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${getActionColor(result.action, result.success)}`}>
                      {result.message}
                    </p>

                    {/* Show match information for individual updates */}
                    {result.matchInfo && result.action === 'updated' && (
                      <p className="text-xs text-blue-700 mt-1">
                        Match: {(result.matchInfo.score * 100).toFixed(0)}% - {result.matchInfo.reason}
                      </p>
                    )}

                    {/* Show detailed results for batch operations */}
                    {result.type === 'batch' && result.details && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center space-x-4 text-xs text-gray-600">
                          <span className="flex items-center">
                            <span className="text-green-600 mr-1">➕</span>
                            {result.details.created} skapade
                          </span>
                          <span className="flex items-center">
                            <span className="text-blue-600 mr-1">🔄</span>
                            {result.details.updated} uppdaterade
                          </span>
                          {result.details.failed > 0 && (
                            <span className="flex items-center">
                              <span className="text-red-600 mr-1">❌</span>
                              {result.details.failed} misslyckade
                            </span>
                          )}
                        </div>

                        {/* Show individual item results */}
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {result.details.results.map((itemResult, itemIndex) => (
                            <div key={itemIndex} className={`text-xs flex items-center justify-between ${itemResult.success ? 'text-gray-700' : 'text-red-700'
                              }`}>
                              <div className="flex items-center space-x-2">
                                <span>{getActionIcon(itemResult.action)}</span>
                                <span className="truncate">{itemResult.title}</span>
                                {itemResult.matchInfo && (
                                  <span className="text-blue-600">
                                    (uppdaterade: {itemResult.matchInfo.originalTitle})
                                  </span>
                                )}
                              </div>
                              {itemResult.error && (
                                <span className="text-red-600 text-xs ml-2">
                                  {itemResult.error.substring(0, 50)}...
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}