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
}


export default function ScrapeResultPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [currentEntry, setCurrentEntry] = useState<ArchiveEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamingParams, setStreamingParams] = useState<{url: string, category: string, depth: number} | null>(null);

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
              
              // Transform database data to ArchiveEntry format
              const entry: ArchiveEntry = {
                id: dbData.session.id,
                timestamp: new Date(dbData.session.created_at),
                urls: [{ url: dbData.session.url, category: dbData.session.content_type || 'auto-detect', contentType: 'webpage' }],
                scrapeResults: [], 
                aiResults: dbData.aiResults || [],
                status: dbData.session.status === 'completed' ? 'completed' : 
                       dbData.session.status === 'failed' ? 'failed' : 'processing',
                error: dbData.session.error_message
              };
              
              // Transform the vehicles/campaigns to match the expected format
              if (dbData.vehicles) {
                entry.aiResults = dbData.vehicles.map((vehicle: any) => ({
                  success: true,
                  content_type: vehicle.vehicle_type,
                  cars: vehicle.vehicle_type === 'cars' ? [vehicle] : [],
                  transport_cars: vehicle.vehicle_type === 'transport_cars' ? [vehicle] : [],
                  campaigns: []
                }));
              }
              
              if (dbData.campaigns) {
                entry.aiResults.push({
                  success: true,
                  content_type: 'campaigns',
                  campaigns: dbData.campaigns,
                  cars: [],
                  transport_cars: []
                });
              }
              
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
          <ResultsState
            currentEntry={currentEntry}
            error={error}
            isAiProcessing={false}
            onNewSearch={handleNewSearch}
            onViewArchive={handleViewArchive}
            onProcessWithAI={async () => {}}
          />
        ) : null}
      </div>
    </div>
  );
}
