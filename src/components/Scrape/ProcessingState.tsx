// components/ProcessingState.tsx
import { LoadingSpinner } from './LoadingSpinner';
import { ScrapeResult } from '@/lib/scraper';
import { EnhancedProcessedResult } from '@/lib/ai-processor';

interface UrlData {
  url: string;
  category: string;
  contentType: string;
  label?: string;
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
  aiResults: EnhancedProcessedResult[];
  status: 'completed' | 'failed' | 'processing';
  error?: string;
}

interface ScrapingProgress {
  current: number;
  total: number;
}

interface AIProcessingProgress {
  current: number;
  total: number;
  currentItem: string;
  factCheckingEnabled: boolean;
}

interface ProcessingStateProps {
  scrapingProgress: ScrapingProgress | null;
  currentlyScrapingUrl: string;
  currentEntry: ArchiveEntry | null;
  aiProcessingProgress?: AIProcessingProgress | null;
  isAiProcessing?: boolean;
}

export function ProcessingState({ 
  scrapingProgress, 
  currentlyScrapingUrl, 
  currentEntry,
  aiProcessingProgress,
  isAiProcessing = false
}: ProcessingStateProps) {
  
  // Helper function to determine the status color and background for each URL
  const getUrlStatus = (index: number, currentIndex: number) => {
    if (index < currentIndex) {
      return {
        containerClass: 'bg-green-50 border-green-200',
        indicatorClass: 'bg-green-500'
      };
    } else if (index === currentIndex) {
      return {
        containerClass: 'bg-blue-50 border-blue-200',
        indicatorClass: 'bg-blue-500'
      };
    } else {
      return {
        containerClass: 'bg-gray-50 border-gray-200',
        indicatorClass: 'bg-gray-300'
      };
    }
  };

  // Calculate progress percentage for scraping
  const scrapingProgressPercentage = scrapingProgress 
    ? (scrapingProgress.current / scrapingProgress.total) * 100 
    : 0;

  // Calculate progress percentage for AI processing
  const aiProgressPercentage = aiProcessingProgress 
    ? (aiProcessingProgress.current / aiProcessingProgress.total) * 100 
    : 0;

  // Determine current phase
  const isScrapingPhase = scrapingProgress && !isAiProcessing;
  const isAiPhase = isAiProcessing;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Header Section */}
        <div className={`px-8 py-6 ${
          isAiPhase 
            ? 'bg-gradient-to-r from-purple-600 to-purple-700' 
            : 'bg-gradient-to-r from-blue-600 to-blue-700'
        }`}>
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center space-x-4">
              <LoadingSpinner 
                size="md" 
                className={`border-white ${
                  isAiPhase ? 'border-t-purple-200' : 'border-t-blue-200'
                }`} 
              />
              <div>
                {isAiPhase ? (
                  <>
                    <h2 className="text-xl font-bold">AI-bearbetning pågår</h2>
                    <p className="text-purple-100">
                      {aiProcessingProgress
                        ? `Analyserar ${aiProcessingProgress.current}/${aiProcessingProgress.total} sidor med AI`
                        : 'Förbereder AI-analys...'}
                    </p>
                    {aiProcessingProgress?.factCheckingEnabled && (
                      <p className="text-xs text-purple-200 mt-1">
                        🔍 Faktakontroll aktiverad för denna sida
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold">Skrapning pågår</h2>
                    <p className="text-blue-100">
                      {scrapingProgress
                        ? `Bearbetar ${scrapingProgress.current}/${scrapingProgress.total} webbsidor`
                        : 'Förbereder skrapning...'}
                    </p>
                  </>
                )}
              </div>
            </div>
            <span className="font-mono text-lg">
              {isAiPhase && aiProcessingProgress 
                ? `${aiProcessingProgress.current}/${aiProcessingProgress.total}`
                : scrapingProgress && `${scrapingProgress.current}/${scrapingProgress.total}`
              }
            </span>
          </div>
        </div>

        <div className="p-8">
          {/* Progress Bars */}
          <div className="space-y-4 mb-6">
            {/* Scraping Progress */}
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Skrapning</span>
                <span>{scrapingProgressPercentage.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${scrapingProgressPercentage}%` }}
                ></div>
              </div>
            </div>

            {/* AI Processing Progress */}
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>AI-analys</span>
                <span>{aiProgressPercentage.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ease-out ${
                    isAiPhase 
                      ? 'bg-gradient-to-r from-purple-500 to-purple-600' 
                      : 'bg-gray-300'
                  }`}
                  style={{ width: `${aiProgressPercentage}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Current Processing Info */}
          {isAiPhase && aiProcessingProgress ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-900">Analyserar med AI:</p>
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-700 font-medium">
                    {aiProcessingProgress.currentItem}
                  </p>
                  {aiProcessingProgress.factCheckingEnabled && (
                    <div className="flex items-center space-x-2 px-3 py-1 bg-purple-100 rounded-full">
                      <span className="text-xs">🔍</span>
                      <span className="text-xs text-purple-800 font-medium">
                        Faktakontroll
                      </span>
                    </div>
                  )}
                </div>
                {aiProcessingProgress.factCheckingEnabled && (
                  <p className="text-xs text-purple-600 mt-2">
                    Verifierar extraherad data mot originalinnehåll...
                  </p>
                )}
              </div>
            </div>
          ) : currentlyScrapingUrl ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-900">Aktuell webbsida:</p>
              <div className="p-4 bg-gray-50 rounded-lg border">
                <p className="text-sm text-gray-700 break-all">
                  {currentlyScrapingUrl}
                </p>
              </div>
            </div>
          ) : null}

          {/* URL List */}
          {currentEntry && currentEntry.urls.length > 1 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Alla webbsidor i denna skrapning:
              </h3>
              <div className="space-y-2">
                {currentEntry.urls.map((urlData, idx) => {
                  const currentScrapingIndex = (scrapingProgress?.current || 1) - 1;
                  const currentAiIndex = (aiProcessingProgress?.current || 1) - 1;
                  
                  let status;
                  let statusText = '';
                  
                  if (isAiPhase) {
                    if (idx < currentAiIndex) {
                      status = { containerClass: 'bg-purple-50 border-purple-200', indicatorClass: 'bg-purple-500' };
                      statusText = 'AI-analyserad';
                    } else if (idx === currentAiIndex) {
                      status = { containerClass: 'bg-purple-100 border-purple-300', indicatorClass: 'bg-purple-600' };
                      statusText = 'AI-analyseras...';
                    } else if (idx <= currentScrapingIndex) {
                      status = { containerClass: 'bg-green-50 border-green-200', indicatorClass: 'bg-green-500' };
                      statusText = 'Skrapad, väntar på AI';
                    } else {
                      status = { containerClass: 'bg-gray-50 border-gray-200', indicatorClass: 'bg-gray-300' };
                      statusText = 'Väntar';
                    }
                  } else {
                    status = getUrlStatus(idx, currentScrapingIndex);
                    if (idx < currentScrapingIndex) {
                      statusText = 'Skrapad';
                    } else if (idx === currentScrapingIndex) {
                      statusText = 'Skrapas...';
                    } else {
                      statusText = 'Väntar';
                    }
                  }
                  
                  return (
                    <div 
                      key={idx} 
                      className={`p-3 rounded-lg border ${status.containerClass}`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className={`w-3 h-3 rounded-full ${status.indicatorClass}`}></span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {urlData.label || `Webbsida ${idx + 1}`}
                          </p>
                          <p className="text-xs text-gray-600 truncate">
                            {urlData.url}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          {urlData.category && (
                            <span className="px-2 py-1 bg-white border rounded text-xs text-gray-600">
                              {urlData.category}
                            </span>
                          )}
                          <span className="text-xs text-gray-500 font-medium">
                            {statusText}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Processing Statistics */}
          {(scrapingProgress || aiProcessingProgress) && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Bearbetningsstatistik:</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Totalt sidor:</span>
                  <span className="font-medium ml-2">{currentEntry?.urls.length || 0}</span>
                </div>
                <div>
                  <span className="text-gray-600">Skrapade:</span>
                  <span className="font-medium ml-2">{scrapingProgress?.current || 0}</span>
                </div>
                <div>
                  <span className="text-gray-600">AI-analyserade:</span>
                  <span className="font-medium ml-2">{aiProcessingProgress?.current || 0}</span>
                </div>
                <div>
                  <span className="text-gray-600">Kvar:</span>
                  <span className="font-medium ml-2">
                    {Math.max(0, (currentEntry?.urls.length || 0) - (aiProcessingProgress?.current || 0))}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}