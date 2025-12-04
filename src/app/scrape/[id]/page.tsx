'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ResultsState } from '@/components/Scrape/ResultsState';
import { StreamingProgress } from '@/components/Scrape/StreamingProgress';
import { useAuth } from '@/lib/auth/AuthProvider';
import Header from '@/components/Header';

interface UrlData {
  url: string;
  category: string;
  contentType: string;
  label?: string;
}

interface CategorizedResult {
  success: boolean;
  url: string;
  pageInfo: {
    title: string;
    description: string;
    url: string;
    scrapedAt: string;
    contentLength: number;
    cleanedContentLength: number;
    linksFound: number;
    linksFetched: number;
  };
  cleanedHtml: string;
  structuredData: any[];
  linkedContent: any[];
  error?: string;
  category?: string;
  contentType?: string;
  label?: string;
}

interface ArchiveEntry {
  id: string;
  timestamp: Date;
  urls: UrlData[];
  scrapeResults: CategorizedResult[];
  aiResults: any[];
  status: 'completed' | 'failed' | 'processing';
  error?: string;
  logs?: ScrapeLog[];
}

interface ScrapeLog {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  step: string | null;
  message: string;
  details: Record<string, any> | null;
  created_at: string;
}

/**
 * Transform database vehicle format to new schema format
 * Converts vehicle_models to variants with proper field names
 */
function transformVehicleToNewSchema(vehicle: any): any {
  return {
    id: vehicle.id,
    brand: vehicle.brand,
    title: vehicle.title,
    description: vehicle.description || null,
    thumbnail: vehicle.thumbnail_url || null,
    vehicle_type: vehicle.vehicle_type || 'cars',
    body_type: vehicle.body_type || null,
    source_url: vehicle.source_url || null,
    pdf_source_url: vehicle.pdf_source_url || null,
    updated_at: vehicle.updated_at || null,
    created_at: vehicle.created_at || null,

    // Transform vehicle_models to variants (new schema)
    variants: (vehicle.vehicle_models || []).map((model: any) => ({
      id: model.id,
      name: model.name,
      price: model.price ?? null,
      old_price: model.old_price ?? null,
      privatleasing: model.privatleasing ?? null,
      old_privatleasing: model.old_privatleasing ?? null,
      company_leasing: model.company_leasing_price ?? null,
      old_company_leasing: model.old_company_leasing_price ?? null,
      loan_price: model.loan_price ?? null,
      old_loan_price: model.old_loan_price ?? null,
      fuel_type: model.bransle || null,
      transmission: model.vaxellada || null,
      thumbnail: model.thumbnail_url || null,
      specs: {
        power_kw: null,
        power_hp: null,
        torque_nm: null,
        top_speed_kmh: null,
        acceleration_0_100: null,
        fuel_consumption_l_100km: null,
        consumption_kwh_100km: null,
        co2_g_km: null,
        range_km_wltp: null,
        battery_kwh: null,
        curb_weight_kg: null,
        max_towing_kg: null
      },
      equipment: model.utrustning || []
    })),
    variant_count: (vehicle.vehicle_models || []).length,

    // Additional fields (not stored in DB yet)
    dimensions: null,
    colors: [],
    interiors: [],
    options: [],
    accessories: [],
    services: [],
    connected_services: null,
    financing: null,
    warranties: [],
    dealer_info: null,

    // Legacy fields
    free_text: vehicle.free_text || ''
  };
}


export default function ScrapeResultPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [currentEntry, setCurrentEntry] = useState<ArchiveEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamingParams, setStreamingParams] = useState<{url: string, category: string, depth: number, brand?: string, autoPushToCMS?: boolean} | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showPdfText, setShowPdfText] = useState(false);
  const [showCustomExtractor, setShowCustomExtractor] = useState(false);
  const [showTwoTierResults, setShowTwoTierResults] = useState(false);

  const scrapeId = params?.id as string;

  // Auth check - MUST be before any conditional returns
  useEffect(() => {
    if (!authLoading && !user) {
      console.log('🔄 Scrape [id] page: No user, redirecting to login');
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Data loading and scraping effect - MUST be before any conditional returns
  useEffect(() => {
    if (!scrapeId) {
      setError('Ingen scrape-ID tillhandahölls');
      setIsLoading(false);
      return;
    }

    const loadOrStartScraping = async () => {
      try {
        // First check localStorage to see if this is a new scraping request
        const storageKey = `scrape_${scrapeId}`;
        const storedData = localStorage.getItem(storageKey);
        
        if (storedData) {
          const parsedData = JSON.parse(storedData);
          
          // Check if this has scraping parameters (meaning it's a new request)
          if (parsedData.scrapingParams && parsedData.status === 'processing') {
            console.log('🚀 Found new scraping request, starting streaming scrape...');
            
            // Set initial state
            const entry: ArchiveEntry = {
              id: parsedData.id,
              timestamp: new Date(parsedData.timestamp),
              urls: parsedData.urls,
              scrapeResults: [],
              aiResults: [],
              status: 'processing'
            };
            setCurrentEntry(entry);
            setStreamingParams(parsedData.scrapingParams);
            setIsLoading(false);
            return;
          }
        }

        // If not a new request, try to load from database
        try {
          console.log(`🔍 Loading scrape session ${scrapeId} from database...`);
          const response = await fetch(`/api/scrape/${scrapeId}`);
          
          if (response.ok) {
            const dbData = await response.json();
            
            if (dbData.success && dbData.session) {
              console.log('📊 Loaded session from database:', dbData.session);
              console.log('📊 Scraped content from database:', dbData.scrapedContent);

              // Transform scraped content from database to scrapeResults format
              const scrapeResults: CategorizedResult[] = [];

              // Add main page content from scrapedContent
              if (dbData.scrapedContent && dbData.scrapedContent.length > 0) {
                dbData.scrapedContent.forEach((content: any) => {
                  scrapeResults.push({
                    success: true,
                    url: content.url || dbData.session.url,
                    pageInfo: {
                      title: content.title || dbData.session.page_title || '',
                      description: dbData.session.page_description || '',
                      url: content.url || dbData.session.url,
                      scrapedAt: content.created_at || dbData.session.created_at,
                      contentLength: dbData.session.content_length || 0,
                      cleanedContentLength: content.cleaned_html?.length || 0,
                      linksFound: dbData.session.links_found || 0,
                      linksFetched: dbData.session.links_fetched || 0
                    },
                    cleanedHtml: content.cleaned_html || '',
                    structuredData: [],
                    linkedContent: [],
                    category: dbData.session.content_type || 'auto-detect',
                    contentType: 'webpage'
                  });
                });
              } else {
                // Fallback: create a single result from session data
                scrapeResults.push({
                  success: true,
                  url: dbData.session.url,
                  pageInfo: {
                    title: dbData.session.page_title || '',
                    description: dbData.session.page_description || '',
                    url: dbData.session.url,
                    scrapedAt: dbData.session.created_at,
                    contentLength: dbData.session.content_length || 0,
                    cleanedContentLength: 0,
                    linksFound: dbData.session.links_found || 0,
                    linksFetched: dbData.session.links_fetched || 0
                  },
                  cleanedHtml: '<!-- No HTML content saved for this session -->',
                  structuredData: [],
                  linkedContent: [],
                  category: dbData.session.content_type || 'auto-detect',
                  contentType: 'webpage'
                });
              }

              // Get the original AI result which contains token usage and processing info
              const originalAiResult = dbData.aiResults?.[0] || {};

              // Transform database data to ArchiveEntry format
              const entry: ArchiveEntry = {
                id: dbData.session.id,
                timestamp: new Date(dbData.session.created_at),
                urls: [{ url: dbData.session.url, category: dbData.session.content_type || 'auto-detect', contentType: 'webpage' }],
                scrapeResults: scrapeResults,
                aiResults: [],
                status: dbData.session.status === 'completed' ? 'completed' :
                       dbData.session.status === 'failed' ? 'failed' : 'processing',
                error: dbData.session.error_message,
                logs: dbData.logs || []
              };

              // Create a single consolidated AI result that includes token usage
              const consolidatedAiResult: any = {
                success: true,
                content_type: dbData.session.content_type || 'cars',
                cars: [],
                transport_cars: [],
                campaigns: [],
                // Preserve token usage and cost data from original AI result
                token_usage: originalAiResult.token_usage || null,
                total_estimated_cost_usd: originalAiResult.total_estimated_cost_usd || 0,
                processing_time_ms: originalAiResult.processing_time_ms || 0,
                model_used: originalAiResult.model_used || 'claude-sonnet-4-5',
                pdf_processing: originalAiResult.pdf_processing || null,
                debug_info: originalAiResult.debug_info || null,
                google_ocr_costs: originalAiResult.google_ocr_costs || null,
                raw_pdf_text: originalAiResult.raw_pdf_text || null,
                // Two-tier PDF extraction data
                custom_extractor_data: originalAiResult.custom_extractor_data || null,
                two_tier_results: originalAiResult.two_tier_results || null,
                source_url: dbData.session.url
              };

              // Add vehicles to the consolidated result (transformed to new schema)
              if (dbData.vehicles) {
                dbData.vehicles.forEach((vehicle: any) => {
                  const transformedVehicle = transformVehicleToNewSchema(vehicle);
                  if (vehicle.vehicle_type === 'cars') {
                    consolidatedAiResult.cars.push(transformedVehicle);
                  } else if (vehicle.vehicle_type === 'transport_cars') {
                    consolidatedAiResult.transport_cars.push(transformedVehicle);
                  }
                });
              }

              // Add campaigns to the consolidated result
              if (dbData.campaigns) {
                consolidatedAiResult.campaigns = dbData.campaigns;
              }

              entry.aiResults = [consolidatedAiResult];

              setCurrentEntry(entry);
              setIsLoading(false);
              return;
            }
          }
        } catch (dbError) {
          console.warn('⚠️ Database error:', dbError);
        }

        // Fallback to localStorage for completed entries
        if (storedData) {
          try {
            const entry: ArchiveEntry = JSON.parse(storedData);
            entry.timestamp = new Date(entry.timestamp);
            setCurrentEntry(entry);
            setIsLoading(false);
            return;
          } catch (parseError) {
            console.error('Parse error:', parseError);
          }
        }
        
        // If nothing found
        setError('Scrape-session hittades inte. Sessionen kan ha gått ut.');
        setIsLoading(false);
        
      } catch (err) {
        console.error('Error in loadOrStartScraping:', err);
        setError('Ett fel uppstod när scrape-data skulle laddas');
        setIsLoading(false);
      }
    };

    loadOrStartScraping();
  }, [scrapeId, router]);

  // ALL HOOKS MUST BE ABOVE THIS POINT
  
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Redirecting to login
  }

  // Helper function to safely extract error message
  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'An unexpected error occurred';
  };


  const handleNewSearch = () => {
    router.push('/scrape');
  };

  const handleViewArchive = () => {
    router.push('/scrape');
  };

  const handleStreamingComplete = (sessionId: string) => {
    console.log('✅ Streaming complete, redirecting to:', sessionId);
    // Clean up localStorage and redirect to the real session
    localStorage.removeItem(`scrape_${scrapeId}`);
    router.replace(`/scrape/${sessionId}`);
  };

  const handleStreamingError = (error: string) => {
    console.error('❌ Streaming error:', error);
    setError(error);
    setStreamingParams(null);
    
    // Update the current entry to show error state
    if (currentEntry) {
      const errorEntry = {
        ...currentEntry,
        status: 'failed' as const,
        error
      };
      setCurrentEntry(errorEntry);
      localStorage.setItem(`scrape_${scrapeId}`, JSON.stringify(errorEntry));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Fel</h2>
          <p className="text-gray-600 mb-4">{error || 'Scrape-data kunde inte laddas'}</p>
          <button
            onClick={handleNewSearch}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            Tillbaka till scraping
          </button>
        </div>
      </div>
    );
  }

  const getLogLevelStyles = (level: string) => {
    switch (level) {
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warn':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'debug':
        return 'bg-gray-50 border-gray-200 text-gray-600';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  const getLogLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return '❌';
      case 'warn':
        return '⚠️';
      case 'debug':
        return '🔍';
      default:
        return 'ℹ️';
    }
  };

  const formatLogTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="min-h-screen">
      <Header
        title={`Scrape Results - ${scrapeId?.slice(-6)}`}
        showBackButton
        backHref="/scrape"
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {streamingParams ? (
          <StreamingProgress
            scrapingParams={streamingParams}
            onComplete={handleStreamingComplete}
            onError={handleStreamingError}
          />
        ) : currentEntry?.status === 'processing' ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="mt-2 text-gray-600">Processing scrape session...</p>
            </div>
          </div>
        ) : currentEntry ? (
          <>
            <ResultsState
              currentEntry={currentEntry}
              error={error}
              isAiProcessing={false}
              onNewSearch={handleNewSearch}
              onViewArchive={handleViewArchive}
              onProcessWithAI={async () => {}}
            />

            {/* Server Logs Section */}
            {currentEntry.logs && currentEntry.logs.length > 0 && (
              <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden">
                <button
                  onClick={() => setShowLogs(!showLogs)}
                  className="w-full px-6 py-4 bg-gray-50 border-b flex items-center justify-between hover:bg-gray-100 transition-colors"
                >
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    📋 Server Logs ({currentEntry.logs.length})
                    {currentEntry.logs.some(l => l.level === 'error') && (
                      <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">
                        {currentEntry.logs.filter(l => l.level === 'error').length} errors
                      </span>
                    )}
                    {currentEntry.logs.some(l => l.level === 'warn') && (
                      <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full">
                        {currentEntry.logs.filter(l => l.level === 'warn').length} warnings
                      </span>
                    )}
                  </h2>
                  <svg
                    className={`h-5 w-5 text-gray-500 transform transition-transform ${showLogs ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showLogs && (
                  <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                    {currentEntry.logs.map((log) => (
                      <div
                        key={log.id}
                        className={`px-4 py-3 border-l-4 ${getLogLevelStyles(log.level)}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span>{getLogLevelIcon(log.level)}</span>
                              <span className="text-xs font-medium uppercase">{log.level}</span>
                              {log.step && (
                                <span className="text-xs bg-white bg-opacity-50 px-2 py-0.5 rounded">
                                  {log.step}
                                </span>
                              )}
                            </div>
                            <p className="text-sm">{log.message}</p>
                            {log.details && Object.keys(log.details).length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs cursor-pointer hover:underline">
                                  View details
                                </summary>
                                <pre className="mt-1 text-xs bg-white bg-opacity-50 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                          <span className="text-xs whitespace-nowrap opacity-75">
                            {formatLogTime(log.created_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Raw PDF Text Section - for debugging OCR output */}
            {currentEntry.aiResults?.[0]?.raw_pdf_text && (
              <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden">
                <button
                  onClick={() => setShowPdfText(!showPdfText)}
                  className="w-full px-6 py-4 bg-blue-50 border-b flex items-center justify-between hover:bg-blue-100 transition-colors"
                >
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    📄 Raw PDF OCR Text
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                      {(currentEntry.aiResults[0].raw_pdf_text as string).length.toLocaleString()} chars
                    </span>
                  </h2>
                  <svg
                    className={`h-5 w-5 text-gray-500 transform transition-transform ${showPdfText ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showPdfText && (
                  <div className="p-4 max-h-[600px] overflow-y-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-gray-50 p-4 rounded border">
                      {currentEntry.aiResults[0].raw_pdf_text}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Two-Tier Results Section - shows which tier was used for each PDF */}
            {currentEntry.aiResults?.[0]?.two_tier_results && (
              <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden">
                <button
                  onClick={() => setShowTwoTierResults(!showTwoTierResults)}
                  className="w-full px-6 py-4 bg-purple-50 border-b flex items-center justify-between hover:bg-purple-100 transition-colors"
                >
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    🔬 Two-Tier PDF Extraction Results
                    <span className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full">
                      {(currentEntry.aiResults[0].two_tier_results as any[]).length} PDFs
                    </span>
                  </h2>
                  <svg
                    className={`h-5 w-5 text-gray-500 transform transition-transform ${showTwoTierResults ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showTwoTierResults && (
                  <div className="p-4 space-y-4">
                    {(currentEntry.aiResults[0].two_tier_results as any[]).map((result: any, idx: number) => (
                      <div key={idx} className={`p-4 rounded-lg border ${result.tier === 'custom' ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-sm font-medium px-2 py-1 rounded ${result.tier === 'custom' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                            {result.tier === 'custom' ? '🔬 Custom Extractor' : '📝 Standard OCR'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {result.pageCount} pages • ${result.estimatedCost?.toFixed(4) || '0.0000'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mb-1 font-mono truncate">{result.pdfUrl}</p>
                        <p className="text-xs text-gray-500">Reason: {result.reason}</p>
                        {result.tier === 'custom' && (
                          <p className="text-xs mt-1">
                            <span className="text-green-600 font-medium">
                              ✅ {result.variantsExtracted} variants extracted
                            </span>
                            {result.hasEquipment && (
                              <span className="ml-2 text-blue-600">• Has equipment data</span>
                            )}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Custom Extractor Data Section - shows raw Document AI output */}
            {currentEntry.aiResults?.[0]?.custom_extractor_data && (
              <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden">
                <button
                  onClick={() => setShowCustomExtractor(!showCustomExtractor)}
                  className="w-full px-6 py-4 bg-green-50 border-b flex items-center justify-between hover:bg-green-100 transition-colors"
                >
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    🧠 Custom Document AI Extractor Output
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">
                      {(currentEntry.aiResults[0].custom_extractor_data as any).variants?.length || 0} variants
                    </span>
                  </h2>
                  <svg
                    className={`h-5 w-5 text-gray-500 transform transition-transform ${showCustomExtractor ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showCustomExtractor && (
                  <div className="p-4 max-h-[800px] overflow-y-auto">
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <h3 className="font-medium text-blue-800 mb-2">📊 Extraction Summary</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>Variants: <span className="font-mono">{(currentEntry.aiResults[0].custom_extractor_data as any).variants?.length || 0}</span></div>
                        <div>Has Equipment: <span className="font-mono">{(currentEntry.aiResults[0].custom_extractor_data as any).equipment ? 'Yes' : 'No'}</span></div>
                        <div>Raw Entities: <span className="font-mono">{(currentEntry.aiResults[0].custom_extractor_data as any).rawEntities?.length || 0}</span></div>
                      </div>
                    </div>

                    {/* Show raw entities grouped by type */}
                    {(currentEntry.aiResults[0].custom_extractor_data as any).rawEntities && (
                      <div className="mb-4">
                        <h3 className="font-medium text-gray-800 mb-2">📋 Raw Entities by Type</h3>
                        <div className="space-y-2">
                          {Object.entries(
                            ((currentEntry.aiResults[0].custom_extractor_data as any).rawEntities as any[]).reduce((acc: Record<string, any[]>, entity: any) => {
                              if (!acc[entity.type]) acc[entity.type] = [];
                              acc[entity.type].push(entity);
                              return acc;
                            }, {})
                          ).map(([type, entities]: [string, any]) => (
                            <details key={type} className="border rounded-lg">
                              <summary className="px-3 py-2 bg-gray-100 cursor-pointer hover:bg-gray-200 font-medium text-sm flex items-center justify-between">
                                <span>{type}</span>
                                <span className="bg-gray-300 text-gray-700 text-xs px-2 py-0.5 rounded-full">{(entities as any[]).length}</span>
                              </summary>
                              <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
                                {(entities as any[]).map((entity: any, idx: number) => (
                                  <div key={idx} className="p-2 bg-gray-50 rounded text-xs border">
                                    <div className="font-mono text-gray-800">
                                      {entity.mentionText || entity.normalizedValue?.text || '-'}
                                    </div>
                                    {entity.confidence && (
                                      <div className="text-gray-500 mt-1">Confidence: {(entity.confidence * 100).toFixed(1)}%</div>
                                    )}
                                    {entity.properties && entity.properties.length > 0 && (
                                      <div className="mt-1 pl-2 border-l-2 border-blue-200">
                                        <span className="text-gray-500">Properties:</span>
                                        {entity.properties.map((prop: any, pIdx: number) => (
                                          <div key={pIdx} className="text-blue-700">
                                            {prop.type}: {prop.mentionText || prop.normalizedValue?.text || '-'}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </details>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Show parsed variants */}
                    {(currentEntry.aiResults[0].custom_extractor_data as any).variants?.length > 0 && (
                      <>
                        <h3 className="font-medium text-gray-800 mb-2 mt-4">🚗 Parsed Variants</h3>
                        <div className="space-y-4">
                          {(currentEntry.aiResults[0].custom_extractor_data as any).variants?.map((variant: any, idx: number) => (
                            <div key={idx} className="p-4 bg-gray-50 rounded-lg border">
                              <h4 className="font-medium text-gray-900 mb-2">{variant.name || variant.Modell || `Variant ${idx + 1}`}</h4>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs mb-3">
                                {variant.price && <div>💰 Price: <span className="font-mono">{variant.price}</span></div>}
                                {variant.privatleasing && <div>📋 Privatleasing: <span className="font-mono">{variant.privatleasing}</span></div>}
                                {variant.companyLeasing && <div>🏢 Företagsleasing: <span className="font-mono">{variant.companyLeasing}</span></div>}
                                {variant.loanPrice && <div>💳 Loan: <span className="font-mono">{variant.loanPrice}</span></div>}
                              </div>

                              {variant.equipment && variant.equipment.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-gray-200">
                                  <h5 className="text-xs font-medium text-gray-700 mb-1">🛠️ Equipment ({variant.equipment.length} items):</h5>
                                  <div className="flex flex-wrap gap-1">
                                    {variant.equipment.map((eq: string, eqIdx: number) => (
                                      <span key={eqIdx} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                        {eq}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Show equipment if present at top level */}
                    {(currentEntry.aiResults[0].custom_extractor_data as any).equipment && (
                      <div className="mt-4">
                        <h3 className="font-medium text-gray-800 mb-2">🛠️ Equipment</h3>
                        {Object.entries((currentEntry.aiResults[0].custom_extractor_data as any).equipment).map(([category, items]: [string, any]) => (
                          <div key={category} className="mb-2">
                            <span className="font-medium text-sm text-gray-700">{category}:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(items as string[]).map((item: string, idx: number) => (
                                <span key={idx} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Show all entity data by type - organized view */}
                    {(currentEntry.aiResults[0].custom_extractor_data as any).entityData && (
                      <div className="mt-6">
                        <h3 className="font-medium text-gray-800 mb-3">📊 All Entity Data by Type</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {Object.entries((currentEntry.aiResults[0].custom_extractor_data as any).entityData)
                            .filter(([, items]) => (items as string[]).length > 0)
                            .sort(([, a], [, b]) => (b as string[]).length - (a as string[]).length)
                            .map(([type, items]: [string, any]) => (
                              <details key={type} className="border rounded-lg bg-white">
                                <summary className="px-3 py-2 bg-gradient-to-r from-indigo-50 to-purple-50 cursor-pointer hover:from-indigo-100 hover:to-purple-100 font-medium text-sm flex items-center justify-between rounded-t-lg">
                                  <span className="text-indigo-800">{type}</span>
                                  <span className="bg-indigo-200 text-indigo-800 text-xs px-2 py-0.5 rounded-full font-bold">
                                    {(items as string[]).length}
                                  </span>
                                </summary>
                                <div className="p-3 max-h-48 overflow-y-auto">
                                  <div className="flex flex-wrap gap-1">
                                    {(items as string[]).map((item: string, idx: number) => (
                                      <span
                                        key={idx}
                                        className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded border border-gray-200 font-mono"
                                      >
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </details>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Raw JSON output */}
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                        📝 View Raw JSON
                      </summary>
                      <pre className="mt-2 text-xs font-mono whitespace-pre-wrap bg-gray-900 text-green-400 p-4 rounded border overflow-x-auto">
                        {JSON.stringify(currentEntry.aiResults[0].custom_extractor_data, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
