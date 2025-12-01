import { useState } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface PayloadCMSDisplayProps {
  aiResults: any[];
}

interface ImportResult {
  title: string;
  success: boolean;
  action: 'created' | 'updated' | 'error';
  id?: string;
  error?: string;
  matchScore?: number;
  matchReason?: string;
}

interface ImportSummary {
  created: number;
  updated: number;
  failed: number;
  total: number;
  results: ImportResult[];
}

export function PayloadCMSDisplay({ aiResults }: PayloadCMSDisplayProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get all vehicle data from AI results
  const getAllVehicleData = () => {
    const vehicles: any[] = [];
    
    aiResults.forEach(result => {
      if (result.success) {
        // Add cars
        if (result.cars && Array.isArray(result.cars)) {
          vehicles.push(...result.cars);
        }
        
        // Add transport cars
        if (result.transport_cars && Array.isArray(result.transport_cars)) {
          vehicles.push(...result.transport_cars);
        }
        
        // Add campaigns (though these aren't vehicles, they might have vehicle models)
        if (result.campaigns && Array.isArray(result.campaigns)) {
          result.campaigns.forEach((campaign: any) => {
            if (campaign.vehicle_model && Array.isArray(campaign.vehicle_model)) {
              // Create vehicle entries from campaign vehicle models
              campaign.vehicle_model.forEach((model: any) => {
                vehicles.push({
                  title: model.name,
                  brand: campaign.brand,
                  description: campaign.description || '',
                  thumbnail: model.thumbnail || campaign.thumbnail,
                  vehicle_model: [model],
                  free_text: campaign.free_text || ''
                });
              });
            }
          });
        }
      }
    });

    return vehicles;
  };

  const handleImportToPayload = async () => {
    setIsImporting(true);
    setError(null);
    setImportResults(null);

    try {
      const vehicles = getAllVehicleData();
      
      if (vehicles.length === 0) {
        throw new Error('Inga fordon att importera hittades i AI-resultaten');
      }

      console.log(`🚀 Importing ${vehicles.length} vehicles to Payload CMS...`);
      
      const response = await fetch('/api/import/fordon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'fordon',
          items: vehicles
        })
      });

      const result = await response.json();

      if (result.success !== false) {
        setImportResults(result);
        console.log('✅ Import completed:', result);
      } else {
        throw new Error(result.error || 'Import failed');
      }

    } catch (err) {
      console.error('❌ Import error:', err);
      setError(err instanceof Error ? err.message : 'Ett okänt fel uppstod');
    } finally {
      setIsImporting(false);
    }
  };

  const vehicles = getAllVehicleData();

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center">
            <span className="mr-2">🚀</span>
            Payload CMS Import
          </h3>
          <p className="text-gray-600">
            Importera skrapade fordon till Payload CMS med avduplicering och märkeshantering.
          </p>
        </div>

        {/* Vehicle Preview */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">
            📊 Fordon att importera: {vehicles.length}
          </h4>
          
          {vehicles.length > 0 ? (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {vehicles.slice(0, 10).map((vehicle, index) => (
                <div key={index} className="flex items-center space-x-3 text-sm">
                  <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {vehicle.title}
                    </p>
                    {vehicle.brand && (
                      <p className="text-gray-500 text-xs">
                        Märke: {vehicle.brand}
                      </p>
                    )}
                  </div>
                  {vehicle.vehicle_model && vehicle.vehicle_model.length > 0 && (
                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
                      {vehicle.vehicle_model.length} modell{vehicle.vehicle_model.length !== 1 ? 'er' : ''}
                    </span>
                  )}
                </div>
              ))}
              
              {vehicles.length > 10 && (
                <div className="text-center text-sm text-gray-500 py-2">
                  ... och {vehicles.length - 10} fler fordon
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">
              Inga fordon hittades i AI-resultaten. Kontrollera att AI-analysen lyckades.
            </p>
          )}
        </div>

        {/* Import Button */}
        {vehicles.length > 0 && !importResults && (
          <div className="flex justify-center">
            <button
              onClick={handleImportToPayload}
              disabled={isImporting}
              className={`flex items-center space-x-3 px-6 py-3 rounded-lg font-medium transition-all ${
                isImporting
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              {isImporting ? (
                <>
                  <LoadingSpinner size="sm" className="border-gray-400 border-t-gray-600" />
                  <span>Importerar...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>Importera till Payload CMS</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="font-medium text-red-900 mb-2">Import misslyckades</h4>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Import Results */}
        {importResults && (
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="mr-2">📊</span>
              Import-resultat
            </h4>
            
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="text-center p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{importResults.created}</div>
                <div className="text-sm text-green-700">Skapade</div>
              </div>
              <div className="text-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{importResults.updated}</div>
                <div className="text-sm text-blue-700">Uppdaterade</div>
              </div>
              <div className="text-center p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{importResults.failed}</div>
                <div className="text-sm text-red-700">Misslyckades</div>
              </div>
              <div className="text-center p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="text-2xl font-bold text-gray-600">{importResults.total}</div>
                <div className="text-sm text-gray-700">Totalt</div>
              </div>
            </div>

            {/* Success Rate */}
            {importResults.total > 0 && (
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Framgångsprocent</span>
                  <span className="text-sm font-medium text-gray-700">
                    {Math.round(((importResults.created + importResults.updated) / importResults.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full" 
                    style={{ 
                      width: `${((importResults.created + importResults.updated) / importResults.total) * 100}%` 
                    }}
                  ></div>
                </div>
              </div>
            )}

            {/* Detailed Results */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <h5 className="font-medium text-gray-900 mb-2">Detaljerade resultat:</h5>
              {importResults.results.map((result, index) => (
                <div key={index} className={`p-3 rounded border text-sm ${
                  result.success 
                    ? result.action === 'created' 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-blue-50 border-blue-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span>
                        {result.success 
                          ? result.action === 'created' ? '✅' : '🔄'
                          : '❌'
                        }
                      </span>
                      <span className="font-medium">{result.title}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        result.success
                          ? result.action === 'created'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {result.action === 'created' ? 'Skapad' : 
                         result.action === 'updated' ? 'Uppdaterad' : 
                         'Fel'}
                      </span>
                      {result.matchScore && result.matchScore > 0 && (
                        <span className="text-xs text-gray-500">
                          {(result.matchScore * 100).toFixed(1)}% match
                        </span>
                      )}
                    </div>
                  </div>
                  {result.error && (
                    <p className="text-red-600 text-xs mt-1">{result.error}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Retry Button */}
            {importResults.failed > 0 && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={handleImportToPayload}
                  disabled={isImporting}
                  className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors"
                >
                  <span>🔄</span>
                  <span>Försök igen</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}