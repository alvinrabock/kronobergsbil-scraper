// components/ArchiveState.tsx
import { ArchiveEntryCard } from './ArchiveEntryCard';
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

interface ArchiveStateProps {
  archive: ArchiveEntry[];
  onNewSearch: () => void;
  onViewArchiveEntry: (entry: ArchiveEntry) => void;
  onDeleteArchiveEntry: (entryId: string) => void;
  setArchive: (fn: (prev: ArchiveEntry[]) => ArchiveEntry[]) => void;
}

export function ArchiveState({ 
  archive, 
  onNewSearch, 
  onViewArchiveEntry, 
  onDeleteArchiveEntry, 
  setArchive 
}: ArchiveStateProps) {
  
  // Helper function to calculate successful scrape results
  const getSuccessfulScrapeResults = (entry: ArchiveEntry): CategorizedResult[] => {
    return entry.scrapeResults.filter(r => r.success);
  };

  // Helper function to get successful AI results
  const getSuccessfulAiResults = (entry: ArchiveEntry): ProcessedResult[] => {
    return entry.aiResults.filter(r => r.success);
  };

  // Calculate total scraped pages across all entries
  const totalScrapedPages = archive.reduce((sum, entry) => {
    return sum + getSuccessfulScrapeResults(entry).length;
  }, 0);

  // Calculate total AI-extracted objects across all entries
  const totalAiObjects = archive.reduce((sum, entry) => {
    const successfulAiResults = getSuccessfulAiResults(entry);
    
    const campaigns = successfulAiResults.flatMap(r => r.campaigns || []).length;
    const cars = successfulAiResults.flatMap(r => r.cars || []).length;
    const transportCars = successfulAiResults.flatMap(r => r.transport_cars || []).length;
    
    return sum + campaigns + cars + transportCars;
  }, 0);

  // Handle clear archive with proper confirmation
  const handleClearArchive = (): void => {
    if (confirm('Är du säker på att du vill rensa hela arkivet? Detta kan inte ångras.')) {
      setArchive(() => []);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Skrapningsarkiv</h2>
            <p className="text-gray-600">
              Visa och hantera alla dina tidigare skrapningar
            </p>
          </div>
          <div className="text-sm text-gray-500">
            {archive.length} {archive.length === 1 ? 'skrapning' : 'skrapningar'} totalt
          </div>
        </div>

        {archive.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-8xl mb-6">📚</div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Inget arkiv än</h3>
            <p className="text-gray-600 text-lg mb-6">
              Dina skrapningar kommer att sparas här automatiskt
            </p>
            <button
              onClick={onNewSearch}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Starta din första skrapning
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Filter/Sort Options */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="all">Alla status</option>
                  <option value="completed">Slutförda</option>
                  <option value="failed">Misslyckade</option>
                  <option value="processing">Pågående</option>
                </select>
                <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="newest">Nyast först</option>
                  <option value="oldest">Äldst först</option>
                </select>
              </div>

              <button
                onClick={handleClearArchive}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Rensa arkiv
              </button>
            </div>

            {/* Archive Grid */}
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
              {archive.map((entry) => (
                <ArchiveEntryCard
                  key={entry.id}
                  entry={entry}
                  onSelect={() => onViewArchiveEntry(entry)}
                  onDelete={() => onDeleteArchiveEntry(entry.id)}
                />
              ))}
            </div>

            {/* Archive Stats */}
            <div className="mt-8 pt-8 border-t border-gray-200">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {archive.filter(e => e.status === 'completed').length}
                  </div>
                  <div className="text-sm text-gray-600">Slutförda</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {archive.filter(e => e.status === 'failed').length}
                  </div>
                  <div className="text-sm text-gray-600">Misslyckade</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {totalScrapedPages}
                  </div>
                  <div className="text-sm text-gray-600">Skrapade sidor</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {totalAiObjects}
                  </div>
                  <div className="text-sm text-gray-600">AI-extraherade objekt</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}