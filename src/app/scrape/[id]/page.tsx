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


export default function ScrapeResultPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [currentEntry, setCurrentEntry] = useState<ArchiveEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamingParams, setStreamingParams] = useState<{url: string, category: string, depth: number} | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showPdfText, setShowPdfText] = useState(false);

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
                source_url: dbData.session.url
              };

              // Add vehicles to the consolidated result
              if (dbData.vehicles) {
                dbData.vehicles.forEach((vehicle: any) => {
                  if (vehicle.vehicle_type === 'cars') {
                    consolidatedAiResult.cars.push(vehicle);
                  } else if (vehicle.vehicle_type === 'transport_cars') {
                    consolidatedAiResult.transport_cars.push(vehicle);
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
          </>
        ) : null}
      </div>
    </div>
  );
}
