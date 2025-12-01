// components/ScrapeFormState.tsx
import ScrapeForm from '@/components/ScrapeForm/component';
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

interface ScrapeFormStateProps {
  onScrapeMultiple: (urls: UrlData[]) => Promise<void>;
  isPending: boolean;
  archive: ArchiveEntry[];
  onViewArchive: () => void;
  onViewArchiveEntry: (entry: ArchiveEntry) => void;
  onDeleteArchiveEntry: (entryId: string) => void;
}

export function ScrapeFormState({ 
  onScrapeMultiple, 
  isPending, 
  archive, 
  onViewArchive, 
  onViewArchiveEntry, 
  onDeleteArchiveEntry 
}: ScrapeFormStateProps) {
  
  // Helper function to handle archive entry selection
  const handleArchiveEntrySelect = (entry: ArchiveEntry): void => {
    onViewArchiveEntry(entry);
  };

  // Helper function to handle archive entry deletion
  const handleArchiveEntryDelete = (entryId: string): void => {
    onDeleteArchiveEntry(entryId);
  };

  return (
    <div>
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🕷️</div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Starta en ny skrapning</h2>
          <p className="text-gray-600 text-lg">
            Ange webbadresser och kategorier för att skrapa innehåll och analysera med AI
          </p>
        </div>

        <ScrapeForm
          onScrapeMultiple={onScrapeMultiple}
          loading={isPending}
        />


        {archive.length > 0 && (
          <div className="mt-8 pt-8 border-t border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Senaste skrapningar</h3>
              <button
                onClick={onViewArchive}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Visa alla →
              </button>
            </div>
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              {archive.slice(0, 4).map((entry) => (
                <ArchiveEntryCard
                  key={entry.id}
                  entry={entry}
                  onSelect={() => handleArchiveEntrySelect(entry)}
                  onDelete={() => handleArchiveEntryDelete(entry.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}