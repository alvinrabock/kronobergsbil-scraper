import { useState } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { ProcessedResult } from '@/lib/ai-processor-types';
import VehicleCard from '@/app/scrape/VehicleCard';
import CampaignItem from '@/app//scrape/CampaignItem';

interface AIResultsDisplayProps {
  results: ProcessedResult[];
  isProcessing: boolean;
}

// Define the tab types explicitly
type TabType = 'campaigns' | 'cars' | 'transport_cars' | 'json' | 'debug';

interface TabConfig {
  id: TabType;
  label: string;
  icon: string;
}

export function AIResultsDisplay({ results, isProcessing }: AIResultsDisplayProps) {
  const [activeTab, setActiveTab] = useState<TabType>('campaigns');
  const [selectedResult, setSelectedResult] = useState<number>(0);

  // Helper function to format cost in both USD and SEK
  const formatCost = (costUsd: number) => {
    if (costUsd === 0) return '$0.000 (0 kr)';
    
    // Current USD to SEK exchange rate (approximately 10.8 as of 2024)
    const usdToSek = 10.8; // Update this periodically
    const costSek = costUsd * usdToSek;
    
    if (costUsd < 0.001) {
      return `$${(costUsd * 1000).toFixed(3)}k (${(costSek * 1000).toFixed(2)}ö)`; // Show in thousandths/öre
    }
    
    if (costSek < 1) {
      return `$${costUsd.toFixed(4)} (${(costSek * 100).toFixed(0)}ö)`; // Show in öre
    }
    
    return `$${costUsd.toFixed(4)} (${costSek.toFixed(2)} kr)`;
  };

  // Helper function to calculate detailed token summary
  const getDetailedTokenSummary = () => {
    let totalTokens = 0;
    let totalCost = 0;
    let totalProcessingTime = 0;
    let claudeCost = 0;
    let perplexityCost = 0;
    let googleOcrCost = 0;
    let googleOcrPages = 0;
    let totalApiCalls = 0;

    results.forEach(result => {
      // Get tokens from token_usage
      if (result.token_usage) {
        totalTokens += result.token_usage.total_tokens || 0;
      }

      // FALLBACK: Also check claude_pdf_costs for tokens (older sessions before fix)
      if (result.claude_pdf_costs && (!result.token_usage || result.token_usage.total_tokens === 0)) {
        totalTokens += (result.claude_pdf_costs.total_input_tokens || 0) + (result.claude_pdf_costs.total_output_tokens || 0);
      }

      // Track Google OCR costs separately (page-based, not token-based)
      if (result.google_ocr_costs) {
        googleOcrCost += result.google_ocr_costs.total_cost_usd || 0;
        googleOcrPages += result.google_ocr_costs.total_pages || 0;
      }

      // Use total_estimated_cost_usd as the primary cost source (from database)
      // This already includes Google OCR costs added during processing
      if (result.total_estimated_cost_usd && result.total_estimated_cost_usd > 0) {
        totalCost += result.total_estimated_cost_usd;
        // Subtract OCR cost to get Claude-only cost
        const ocrCostInResult = result.google_ocr_costs?.total_cost_usd || 0;
        claudeCost += result.total_estimated_cost_usd - ocrCostInResult;
      } else if (result.claude_pdf_costs?.total_cost_usd) {
        // Fallback to claude_pdf_costs for older sessions
        const cost = result.claude_pdf_costs.total_cost_usd;
        totalCost += cost;
        claudeCost += cost;
      } else if (result.token_usage?.estimated_cost_usd) {
        // Fallback to token_usage cost if total not available
        const cost = result.token_usage.estimated_cost_usd;
        totalCost += cost;

        if (result.token_usage.api_provider === 'perplexity') {
          perplexityCost += cost;
        } else {
          claudeCost += cost;
        }
      }

      // Add processing time
      if (result.processing_time_ms) {
        totalProcessingTime += result.processing_time_ms;
      }

      // Count API calls (but don't double-count their costs)
      if (result.api_calls) {
        totalApiCalls += result.api_calls.length;
      }
    });

    return {
      totalTokens,
      totalCost,
      totalProcessingTime,
      claudeCost,
      perplexityCost,
      googleOcrCost,
      googleOcrPages,
      totalApiCalls
    };
  };

  console.log('🔍 AIResultsDisplay - Raw results data:', results);
  
  // Debug the detailed token summary
  const debugTokenSummary = getDetailedTokenSummary();
  console.log('🔍 AIResultsDisplay - Token summary:', debugTokenSummary);

  if (isProcessing) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <LoadingSpinner size="lg" className="mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">AI analyserar innehåll</h3>
          <p className="text-gray-600">Detta kan ta en stund...</p>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500 max-w-md">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Ingen AI-analys tillgänglig</h3>
          <p>Skrapa innehåll och klicka på &quot;Analysera med AI&quot; för att se strukturerad data här.</p>
        </div>
      </div>
    );
  }

  const currentResult = results[selectedResult];
  const allCampaigns = results.filter(r => r.success).flatMap(r => r.campaigns || []);
  const allCars = results.filter(r => r.success).flatMap(r => r.cars || []);
  const allTransportCars = results.filter(r => r.success).flatMap(r => r.transport_cars || []);

  // Only show tabs that have data (debug tab always shown)
  const availableTabs: TabConfig[] = [
    ...(allCampaigns.length > 0 ? [{ id: 'campaigns' as const, label: `Kampanjer (${allCampaigns.length})`, icon: '🎯' }] : []),
    ...(allCars.length > 0 ? [{ id: 'cars' as const, label: `Personbilar (${allCars.length})`, icon: '🚗' }] : []),
    ...(allTransportCars.length > 0 ? [{ id: 'transport_cars' as const, label: `Transportbilar (${allTransportCars.length})`, icon: '🚛' }] : []),
    { id: 'json' as const, label: 'JSON Data', icon: '📄' },
    { id: 'debug' as const, label: 'PDF Debug', icon: '🔍' }
  ];

  // Set default active tab to first available tab with data
  if (availableTabs.length > 0 && !availableTabs.find(tab => tab.id === activeTab)) {
    setActiveTab(availableTabs[0].id);
  }

  // Helper function to safely copy JSON to clipboard
  // Always use the converted data (with new schema - variants instead of vehicle_models)
  const handleCopyJson = async (): Promise<void> => {
    try {
      const jsonData = JSON.stringify({
        campaigns: allCampaigns,
        cars: allCars,
        transport_cars: allTransportCars
      }, null, 2);

      await navigator.clipboard.writeText(jsonData);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback: could show a toast notification here
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Enhanced Tab Navigation */}
      <div className="border-b border-gray-200 px-6 py-3 flex-shrink-0 bg-white">
        <div className="flex items-center justify-between">
          <nav className="flex space-x-1">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {results.length > 1 && (
            <select
              value={selectedResult}
              onChange={(e) => setSelectedResult(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {results.map((result, index) => {
                const getHostname = (url: string) => {
                  try {
                    return new URL(url).hostname
                  } catch {
                    return url || 'Unknown'
                  }
                }
                
                return (
                  <option key={index} value={index}>
                    {result.success ? `${result.content_type}` : 'Fel'} - {getHostname(result.source_url)}
                  </option>
                )
              })}
            </select>
          )}
        </div>

        {/* Enhanced Stats Bar with Token Usage */}
        {(() => {
          const tokenSummary = getDetailedTokenSummary();
          return (
            <div className="mt-2">
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center space-x-1">
                  <span>🔢</span>
                  <span>{tokenSummary.totalTokens.toLocaleString()} tokens</span>
                </span>
                {tokenSummary.totalCost > 0 && (
                  <span className="flex items-center space-x-1">
                    <span>💰</span>
                    <span className="font-medium text-green-600">{formatCost(tokenSummary.totalCost)}</span>
                  </span>
                )}
                {tokenSummary.totalApiCalls > 0 && (
                  <span className="flex items-center space-x-1">
                    <span>📡</span>
                    <span>{tokenSummary.totalApiCalls} API calls</span>
                  </span>
                )}
                {tokenSummary.totalProcessingTime > 0 && (
                  <span className="flex items-center space-x-1">
                    <span>⏱️</span>
                    <span>
                      {tokenSummary.totalProcessingTime < 1000 
                        ? `${tokenSummary.totalProcessingTime}ms`
                        : `${(tokenSummary.totalProcessingTime / 1000).toFixed(1)}s`
                      }
                    </span>
                  </span>
                )}
                <button
                  onClick={handleCopyJson}
                  className="flex items-center space-x-1 px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                  <span>📋</span>
                  <span>Kopiera JSON</span>
                </button>
              </div>
              
              {/* Provider Cost Breakdown - show when any provider has costs */}
              {(tokenSummary.claudeCost > 0 || tokenSummary.perplexityCost > 0 || tokenSummary.googleOcrCost > 0) && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {tokenSummary.claudeCost > 0 && (
                    <span className="inline-flex items-center px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
                      <span className="mr-1">🧠</span>
                      Claude: {formatCost(tokenSummary.claudeCost)}
                    </span>
                  )}
                  {tokenSummary.perplexityCost > 0 && (
                    <span className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                      <span className="mr-1">🔍</span>
                      Perplexity: {formatCost(tokenSummary.perplexityCost)}
                    </span>
                  )}
                  {tokenSummary.googleOcrCost > 0 && (
                    <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                      <span className="mr-1">📄</span>
                      Google OCR: {formatCost(tokenSummary.googleOcrCost)} ({tokenSummary.googleOcrPages} pages)
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Enhanced Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'campaigns' && (
          <div className="p-6 h-full overflow-y-auto">
            {allCampaigns.length > 0 ? (
              <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
                {allCampaigns.map((campaign, index) => (
                  <CampaignItem key={index} campaign={campaign} />
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-12">
                <span className="text-6xl mb-4 block">🎯</span>
                <h3 className="text-lg font-medium mb-2">Inga kampanjer hittades</h3>
                <p>Den analyserade datan innehöll inga kampanjdata.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'cars' && (
          <div className="p-6 h-full overflow-y-auto">
            {allCars.length > 0 ? (
              <div className="grid gap-6 lg:grid-cols-3">
                {allCars.map((car, index) => {
                  // Debug logging for PDF information
                  console.log(`🔍 [Car ${index}] Original car data:`, car);
                  console.log(`🔍 [Car ${index}] Has pdf_source_url:`, !!car.pdf_source_url, car.pdf_source_url);
                  console.log(`🔍 [Car ${index}] currentResult.pdf_processing:`, currentResult?.pdf_processing);
                  
                  if (currentResult?.pdf_processing) {
                    console.log(`🔍 [Car ${index}] PDF Processing Details:`, {
                      enabled: currentResult.pdf_processing.enabled,
                      overall_status: currentResult.pdf_processing.overall_status,
                      total_pdfs_found: currentResult.pdf_processing.total_pdfs_found,
                      total_pdfs_processed: currentResult.pdf_processing.total_pdfs_processed,
                      results_count: currentResult.pdf_processing.results?.length || 0,
                      results: currentResult.pdf_processing.results
                    });
                  }
                  
                  // Add PDF debug information from processing results
                  const enhancedCar = {
                    ...car,
                    pdf_debug: (() => {
                      if (!currentResult?.pdf_processing) {
                        return { status: 'not_found' as const };
                      }

                      const pdfProcessing = currentResult.pdf_processing;
                      
                      // If the vehicle has its own pdf_source_url, find the specific PDF
                      if (car.pdf_source_url) {
                        const matchingPdf = pdfProcessing.results?.find(r => r.url === car.pdf_source_url);
                        if (matchingPdf) {
                          return {
                            status: 'success' as const,
                            extractedLength: matchingPdf.extractedText?.length || 0,
                            processingTime: matchingPdf.processingTimeMs,
                            filename: matchingPdf.filename,
                            error: matchingPdf.error
                          };
                        }
                      }
                      
                      // Fall back to general PDF processing info
                      const hasProcessedPdfs = pdfProcessing.total_pdfs_processed > 0;
                      
                      return {
                        status: hasProcessedPdfs ? 'success' as const : 'not_found' as const,
                        extractedLength: pdfProcessing.results?.reduce((sum, r) => sum + (r.extractedText?.length || 0), 0) || 0,
                        processingTime: pdfProcessing.results?.reduce((sum, r) => sum + (r.processingTimeMs || 0), 0) || 0,
                        filename: hasProcessedPdfs ? `${pdfProcessing.total_pdfs_processed}-of-${pdfProcessing.total_pdfs_found}-pdfs` : undefined,
                        error: hasProcessedPdfs ? undefined : (pdfProcessing.error || 'No specific PDF linked to this vehicle')
                      };
                    })()
                  };
                  
                  console.log(`🔍 [Car ${index}] Enhanced car pdf_debug:`, enhancedCar.pdf_debug);
                  
                  return (
                    <VehicleCard key={index} vehicle={enhancedCar} />
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-12">
                <span className="text-6xl mb-4 block">🚗</span>
                <h3 className="text-lg font-medium mb-2">Inga personbilar hittades</h3>
                <p>Den analyserade datan innehöll inga personbilsdata.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'transport_cars' && (
          <div className="p-6 h-full overflow-y-auto">
            {allTransportCars.length > 0 ? (
              <div className="grid gap-6 lg:grid-cols-3">
                {allTransportCars.map((car, index) => {
                  // Debug logging for PDF information
                  console.log(`🔍 [Transport ${index}] Original car data:`, car);
                  console.log(`🔍 [Transport ${index}] Has pdf_source_url:`, !!car.pdf_source_url, car.pdf_source_url);
                  
                  // Add PDF debug information from processing results
                  const enhancedCar = {
                    ...car,
                    pdf_debug: (() => {
                      if (!currentResult?.pdf_processing) {
                        return { status: 'not_found' as const };
                      }

                      const pdfProcessing = currentResult.pdf_processing;
                      
                      // If the vehicle has its own pdf_source_url, find the specific PDF
                      if (car.pdf_source_url) {
                        const matchingPdf = pdfProcessing.results?.find(r => r.url === car.pdf_source_url);
                        if (matchingPdf) {
                          return {
                            status: 'success' as const,
                            extractedLength: matchingPdf.extractedText?.length || 0,
                            processingTime: matchingPdf.processingTimeMs,
                            filename: matchingPdf.filename,
                            error: matchingPdf.error
                          };
                        }
                      }
                      
                      // Fall back to general PDF processing info
                      const hasProcessedPdfs = pdfProcessing.total_pdfs_processed > 0;
                      
                      return {
                        status: hasProcessedPdfs ? 'success' as const : 'not_found' as const,
                        extractedLength: pdfProcessing.results?.reduce((sum, r) => sum + (r.extractedText?.length || 0), 0) || 0,
                        processingTime: pdfProcessing.results?.reduce((sum, r) => sum + (r.processingTimeMs || 0), 0) || 0,
                        filename: hasProcessedPdfs ? `${pdfProcessing.total_pdfs_processed}-of-${pdfProcessing.total_pdfs_found}-pdfs` : undefined,
                        error: hasProcessedPdfs ? undefined : (pdfProcessing.error || 'No specific PDF linked to this vehicle')
                      };
                    })()
                  };
                  
                  return (
                    <VehicleCard key={index} vehicle={enhancedCar} />
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-12">
                <span className="text-6xl mb-4 block">🚛</span>
                <h3 className="text-lg font-medium mb-2">Inga transportbilar hittades</h3>
                <p>Den analyserade datan innehöll inga transportbilsdata.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'json' && (
          <div className="p-6 h-full overflow-y-auto">
            <div className="bg-white rounded-lg border border-gray-200 h-full">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="font-medium text-gray-900">JSON Data (new schema with variants)</h3>
              </div>
              <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap h-full overflow-auto text-gray-700">
                {JSON.stringify({
                  campaigns: allCampaigns,
                  cars: allCars,
                  transport_cars: allTransportCars
                }, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'debug' && (
          <div className="p-6 h-full overflow-y-auto">
            <div className="bg-white rounded-lg border border-gray-200 h-full">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="font-medium text-gray-900">PDF Processing Debug Information</h3>
                <p className="text-sm text-gray-600 mt-1">Detailed debugging info for PDF processing and data flow</p>
              </div>
              <div className="p-4 space-y-6">
                {(() => {
                  const debugInfo = (currentResult as any)?.debug_info;
                  console.log('🔍 [UI DEBUG] currentResult:', currentResult);
                  console.log('🔍 [UI DEBUG] debugInfo:', debugInfo);
                  
                  if (!debugInfo) {
                    return (
                      <div className="text-center py-8 text-gray-500">
                        <p>No debug information available</p>
                        <p className="text-sm mt-2">Run the scraper to see detailed PDF processing debug info</p>
                        <div className="mt-4 text-xs text-left bg-gray-100 p-3 rounded">
                          <strong>Debug:</strong> currentResult exists: {!!currentResult}<br/>
                          <strong>Keys in result:</strong> {currentResult ? Object.keys(currentResult).join(', ') : 'none'}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-6">
                      {/* Overview Stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-blue-50 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-blue-600">{debugInfo.total_batches_processed}</div>
                          <div className="text-sm text-gray-600">Batches Processed</div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-green-600">{debugInfo.total_vehicles_extracted}</div>
                          <div className="text-sm text-gray-600">Vehicles Found</div>
                        </div>
                        <div className="bg-orange-50 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-orange-600">{debugInfo.total_pdf_results_collected}</div>
                          <div className="text-sm text-gray-600">PDFs Processed</div>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-4 text-center">
                          <div className="text-2xl font-bold text-purple-600">{debugInfo.vehicles_with_enhanced_content.length}</div>
                          <div className="text-sm text-gray-600">Enhanced Vehicles</div>
                        </div>
                      </div>

                      {/* PDF Processing Breakdown */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">PDF Processing Results by Batch</h4>
                        <div className="bg-gray-50 rounded-lg p-4">
                          {debugInfo.pdf_results_breakdown.length > 0 ? (
                            <div className="space-y-2">
                              {debugInfo.pdf_results_breakdown.map((pdf: any, index: number) => (
                                <div key={index} className="flex items-center justify-between py-2 px-3 bg-white rounded border">
                                  <div className="flex items-center space-x-3">
                                    <span className="text-sm font-medium">Batch {pdf.batch}</span>
                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                      pdf.status === 'SUCCESS' 
                                        ? 'bg-green-100 text-green-800' 
                                        : 'bg-red-100 text-red-800'
                                    }`}>
                                      {pdf.status}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-medium">{pdf.chars.toLocaleString()} chars</div>
                                    {pdf.filename && (
                                      <div className="text-xs text-gray-500">{pdf.filename}</div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 text-center py-4">No PDF processing results available</p>
                          )}
                        </div>
                      </div>

                      {/* Enhanced Content Analysis */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">Vehicles with Enhanced Content (PDF Data)</h4>
                        <div className="bg-gray-50 rounded-lg p-4">
                          {debugInfo.vehicles_with_enhanced_content.length > 0 ? (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {debugInfo.vehicles_with_enhanced_content.map((vehicle: any, index: number) => (
                                <div key={index} className="flex items-center justify-between py-2 px-3 bg-white rounded border">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900 truncate">{vehicle.title}</div>
                                  </div>
                                  <div className="text-sm text-gray-500 ml-3">
                                    {vehicle.description_length.toLocaleString()} chars
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 text-center py-4">No vehicles with enhanced content found</p>
                          )}
                        </div>
                      </div>

                      {/* Fact-checking Impact */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">Processing Pipeline Impact</h4>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="text-center">
                              <div className="text-lg font-bold text-blue-600">{debugInfo.fact_check_before_count}</div>
                              <div className="text-sm text-gray-600">Enhanced Before Processing</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-green-600">{debugInfo.fact_check_after_count}</div>
                              <div className="text-sm text-gray-600">Enhanced After Processing</div>
                            </div>
                          </div>
                          {debugInfo.fact_check_before_count !== debugInfo.fact_check_after_count && (
                            <div className="mt-3 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                              <p className="text-sm text-yellow-800">
                                ⚠️ Discrepancy detected: {debugInfo.fact_check_before_count - debugInfo.fact_check_after_count} vehicles lost enhanced content during processing
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}