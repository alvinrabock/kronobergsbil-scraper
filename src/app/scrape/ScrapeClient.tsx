// Main ScrapeClient.tsx - Updated with fact-checking integration
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ScrapeResult } from '@/lib/scraper';
import { ResultsState } from '@/components/Scrape/ResultsState';
import { ArchiveState } from '@/components/Scrape/ArchiveState';
import { ScrapeFormState } from '@/components/Scrape/ScrapeFormState';
import { AIExplanationBox } from '@/components/Scrape/AIExplanationBox';

interface UrlData {
  url: string;
  category: string;
  contentType: string;
  label?: string;
  brand?: string;
}

interface CategorizedResult extends ScrapeResult {
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


type AppState = 'form' | 'processing' | 'results' | 'archive';

export default function ScrapeClient() {
  // Use actual auth instead of mock
  const { user, loading } = useAuth();
  const router = useRouter();
  const [archive, setArchive] = useState<ArchiveEntry[]>([]);
  const [currentEntry, setCurrentEntry] = useState<ArchiveEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentState, setCurrentState] = useState<AppState>('form');
  const [scrapeInProgress, setScrapeInProgress] = useState(false);


  // Type guard for checking if error is known error type
  const isKnownError = (error: unknown): error is Error => {
    return error instanceof Error;
  };

  // Helper to safely extract error message
  const getErrorMessage = (error: unknown): string => {
    if (isKnownError(error)) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'An unexpected error occurred';
  };

  const handleScrapeMultiple = async (urls: UrlData[], options?: { autoPushToCMS?: boolean }): Promise<void> => {
    if (urls.length === 0) return;

    // Prevent concurrent scrapes
    if (scrapeInProgress) {
      console.log('🚫 Scrape already in progress, ignoring request')
      return;
    }

    try {
      setScrapeInProgress(true);

      // Take the first URL for now (we'll handle multiple URLs later)
      const urlData = urls[0];

      console.log('🚀 Starting scrape process for:', urlData.url);
      console.log('📤 Auto-push to CMS:', options?.autoPushToCMS ? 'Enabled' : 'Disabled');

      // Generate a temporary ID and create entry in localStorage
      const tempId = Date.now().toString(36) + Math.random().toString(36).substr(2);

      const newEntry: ArchiveEntry = {
        id: tempId,
        timestamp: new Date(),
        urls: [urlData],
        scrapeResults: [],
        aiResults: [],
        status: 'processing'
      };

      // Store the entry with scraping parameters
      localStorage.setItem(`scrape_${tempId}`, JSON.stringify({
        ...newEntry,
        scrapingParams: {
          url: urlData.url,
          category: urlData.category,
          brand: urlData.brand,
          depth: 1,
          autoPushToCMS: options?.autoPushToCMS || false
        }
      }));

      console.log('📱 Navigating to processing page:', tempId);

      // Navigate immediately to show the process
      router.push(`/scrape/${tempId}`);

      // Reset the scrape flag after navigation (allow new scrape after 3 seconds)
      setTimeout(() => {
        setScrapeInProgress(false);
      }, 3000);

    } catch (error) {
      console.error('❌ Navigation error:', error);
      setError(getErrorMessage(error));
      setScrapeInProgress(false);
    }
  };

  // AI processing is now handled by the API, no longer needed here

  const handleNewSearch = (): void => {
    setCurrentState('form');
    setCurrentEntry(null);
    setError(null);
  };

  const handleViewArchiveEntry = (entry: ArchiveEntry): void => {
    // Store the entry in localStorage and navigate to the specific route
    localStorage.setItem(`scrape_${entry.id}`, JSON.stringify(entry));
    router.push(`/scrape/${entry.id}`);
  };

  const handleDeleteArchiveEntry = (entryId: string): void => {
    setArchive(prev => prev.filter(entry => entry.id !== entryId));
    if (currentEntry?.id === entryId) {
      setCurrentState('archive');
      setCurrentEntry(null);
    }
  };

  const handleViewArchive = (): void => {
    setCurrentState('archive');
    setCurrentEntry(null);
  };

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h2>
          <p className="text-gray-600 mb-4">Please log in to access the scraper.</p>
          <a
            href="/login"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header Navigation */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">Web Scraper</h1>
            {/* Add fact-checking indicator */}
            {process.env.NEXT_PUBLIC_PERPLEXITY_API_KEY && (
              <div className="flex items-center space-x-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                <span>🔍</span>
                <span>Fact-checking enabled</span>
              </div>
            )}
          </div>

          {currentState === 'results' && currentEntry && (
            <div className="flex items-center space-x-3">
              <button
                onClick={handleNewSearch}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                <span>🔄</span>
                <span>Ny skrapning</span>
              </button>
              <button
                onClick={handleViewArchive}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
              >
                <span>📚</span>
                <span>Visa arkiv</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {currentState === 'form' && (
          <div className='flex flex-col gap-10'>
            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <span className="text-red-500 text-lg mr-2">❌</span>
                  <div>
                    <h4 className="font-medium text-red-900">Scraping Error</h4>
                    <p className="text-red-700 text-sm mt-1">{error}</p>
                  </div>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="mt-3 text-red-600 hover:text-red-800 text-sm underline"
                >
                  Dismiss
                </button>
              </div>
            )}
            
            <ScrapeFormState
              onScrapeMultiple={handleScrapeMultiple}
              isPending={scrapeInProgress}
              archive={archive}
              onViewArchive={handleViewArchive}
              onViewArchiveEntry={handleViewArchiveEntry}
              onDeleteArchiveEntry={handleDeleteArchiveEntry}
            />

            <AIExplanationBox />
          </div>
        )}

        {currentState === 'processing' && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
              <p className="mt-2 text-gray-600">Processing...</p>
            </div>
          </div>
        )}

        {currentState === 'results' && currentEntry && (
          <ResultsState
            currentEntry={currentEntry}
            error={error}
            isAiProcessing={false}
            onNewSearch={handleNewSearch}
            onViewArchive={handleViewArchive}
            onProcessWithAI={async () => {}}
          />
        )}

        {currentState === 'archive' && (
          <ArchiveState
            archive={archive}
            onNewSearch={handleNewSearch}
            onViewArchiveEntry={handleViewArchiveEntry}
            onDeleteArchiveEntry={handleDeleteArchiveEntry}
            setArchive={setArchive}
          />
        )}
      </div>
    </div>
  );
}