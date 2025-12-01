// components/ArchiveEntryCard.tsx
import { ScrapeResult } from '@/lib/scraper';
import { ProcessedResult } from '@/lib/ai-processor-types';

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
  aiResults: ProcessedResult[];
  status: 'completed' | 'failed' | 'processing';
  error?: string;
}

interface ArchiveEntryCardProps {
  entry: ArchiveEntry;
  onSelect: () => void;
  onDelete: () => void;
}

type StatusType = 'completed' | 'failed' | 'processing';

export function ArchiveEntryCard({ entry, onSelect, onDelete }: ArchiveEntryCardProps) {
  const formatTimestamp = (date: Date): string => {
    return new Intl.DateTimeFormat('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getStatusColor = (status: StatusType): string => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      case 'processing': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: StatusType): string => {
    switch (status) {
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'processing': return '⏳';
      default: return '📄';
    }
  };

  const getStatusLabel = (status: StatusType): string => {
    switch (status) {
      case 'completed': return 'Slutförd';
      case 'failed': return 'Misslyckad';
      case 'processing': return 'Pågående';
      default: return 'Okänd';
    }
  };

  // Type-safe result calculations
  const totalResults = entry.scrapeResults.filter(r => r.success).length;
  
  const successfulAiResults = entry.aiResults.filter(r => r.success);
  const totalCampaigns = successfulAiResults.flatMap(r => r.campaigns || []).length;
  const totalCars = successfulAiResults.flatMap(r => r.cars || []).length;
  const totalTransportCars = successfulAiResults.flatMap(r => r.transport_cars || []).length;

  // Helper function to build AI results summary
  const buildAiResultsSummary = (): string => {
    const parts: string[] = [];
    
    if (totalCampaigns > 0) {
      parts.push(`${totalCampaigns} kampanjer`);
    }
    if (totalCars > 0) {
      parts.push(`${totalCars} bilar`);
    }
    if (totalTransportCars > 0) {
      parts.push(`${totalTransportCars} transportbilar`);
    }
    
    return parts.join(' ');
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-all duration-300 group">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(entry.status)}`}>
                {getStatusIcon(entry.status)} {getStatusLabel(entry.status)}
              </span>
              <span className="text-sm text-gray-500">
                {formatTimestamp(entry.timestamp)}
              </span>
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Skrapning #{entry.id.slice(-6)}
            </h3>

            <p className="text-sm text-gray-600 mb-3">
              {entry.urls.length} webbsida{entry.urls.length !== 1 ? 'r' : ''} skrapade
            </p>

            {/* URL List */}
            <div className="space-y-1 mb-4">
              {entry.urls.slice(0, 3).map((urlData, idx) => (
                <div key={idx} className="flex items-center space-x-2 text-xs">
                  <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                  <span className="text-gray-700 truncate max-w-md">
                    {urlData.label || (() => {
                      try {
                        return new URL(urlData.url).hostname
                      } catch {
                        return urlData.url || 'Invalid URL'
                      }
                    })()}
                  </span>
                  {urlData.category && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                      {urlData.category}
                    </span>
                  )}
                </div>
              ))}
              {entry.urls.length > 3 && (
                <div className="text-xs text-gray-500 ml-4">
                  +{entry.urls.length - 3} fler webbsidor...
                </div>
              )}
            </div>

            {/* Results Summary */}
            {entry.status === 'completed' && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <div className="text-gray-600">Skrapade sidor:</div>
                  <div className="font-semibold text-gray-900">{totalResults}/{entry.urls.length}</div>
                </div>

                {entry.aiResults.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-gray-600">AI-resultat:</div>
                    <div className="font-semibold text-gray-900">
                      {buildAiResultsSummary() || 'Inga resultat'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {entry.error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{entry.error}</p>
              </div>
            )}
          </div>

          <div className="ml-4 flex flex-col space-y-2">
            <button
              onClick={onSelect}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Visa
            </button>
            <button
              onClick={onDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            >
              Ta bort
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}