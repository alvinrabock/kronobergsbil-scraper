'use client';

import { useState } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface VehicleModel {
  id?: string;
  name: string;
  price?: number;
  old_price?: number;
  privatleasing?: number;
  company_leasing_price?: number;
  loan_price?: number;
  thumbnail_url?: string;
}

interface Vehicle {
  id?: string;
  title: string;
  brand?: string;
  description?: string;
  thumbnail_url?: string;
  vehicle_type?: string;
  free_text?: string;
  vehicle_models?: VehicleModel[];
}

interface CMSPushPanelProps {
  aiResults: any[];
}

interface PushResult {
  title: string;
  success: boolean;
  action: 'created' | 'updated' | 'error';
  id?: string;
  error?: string;
}

interface PushSummary {
  success: boolean;
  created: number;
  updated: number;
  failed: number;
  total: number;
  results: PushResult[];
}

export function CMSPushPanel({ aiResults }: CMSPushPanelProps) {
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set());
  const [isPushing, setIsPushing] = useState(false);
  const [pushResults, setPushResults] = useState<PushSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Extract all vehicles from AI results
  const getAllVehicles = (): Vehicle[] => {
    const vehicles: Vehicle[] = [];

    aiResults.forEach(result => {
      if (result.success || result.cars || result.transport_cars) {
        // Add cars
        if (result.cars && Array.isArray(result.cars)) {
          result.cars.forEach((car: Vehicle) => {
            vehicles.push({
              ...car,
              vehicle_type: 'cars'
            });
          });
        }

        // Add transport cars
        if (result.transport_cars && Array.isArray(result.transport_cars)) {
          result.transport_cars.forEach((car: Vehicle) => {
            vehicles.push({
              ...car,
              vehicle_type: 'transport_cars'
            });
          });
        }
      }
    });

    return vehicles;
  };

  const vehicles = getAllVehicles();

  // Generate unique key for vehicle
  const getVehicleKey = (vehicle: Vehicle, index: number): string => {
    return vehicle.id || `${vehicle.title}-${index}`;
  };

  // Toggle selection for a single vehicle
  const toggleVehicle = (key: string) => {
    const newSelected = new Set(selectedVehicles);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedVehicles(newSelected);
  };

  // Select all vehicles
  const selectAll = () => {
    const allKeys = new Set(vehicles.map((v, i) => getVehicleKey(v, i)));
    setSelectedVehicles(allKeys);
  };

  // Deselect all vehicles
  const deselectAll = () => {
    setSelectedVehicles(new Set());
  };

  // Get selected vehicles
  const getSelectedVehicles = (): Vehicle[] => {
    return vehicles.filter((v, i) => selectedVehicles.has(getVehicleKey(v, i)));
  };

  // Format price for display
  const formatPrice = (price: number | undefined | null): string => {
    if (!price || price === 0) return '-';
    return new Intl.NumberFormat('sv-SE').format(price) + ' kr';
  };

  // Push selected vehicles to CMS
  const handlePushToCMS = async () => {
    const selectedList = getSelectedVehicles();

    if (selectedList.length === 0) {
      setError('Välj minst ett fordon att skicka till CMS');
      return;
    }

    setIsPushing(true);
    setError(null);
    setPushResults(null);

    try {
      // Transform vehicles to the format expected by the API
      const transformedVehicles = selectedList.map(vehicle => ({
        title: vehicle.title,
        brand: vehicle.brand,
        description: vehicle.description || vehicle.free_text || '',
        thumbnail: vehicle.thumbnail_url,
        vehicle_model: (vehicle.vehicle_models || []).map(model => ({
          name: model.name,
          price: model.price,
          old_price: model.old_price,
          privatleasing: model.privatleasing,
          company_leasing_price: model.company_leasing_price,
          loan_price: model.loan_price,
          thumbnail: model.thumbnail_url
        })),
        free_text: vehicle.free_text
      }));

      console.log('🚀 Pushing to CMS:', transformedVehicles);

      const response = await fetch('/api/import/fordon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'fordon',
          items: transformedVehicles
        })
      });

      const result = await response.json();

      if (response.ok) {
        setPushResults({
          success: result.failed === 0,
          created: result.created || 0,
          updated: result.updated || 0,
          failed: result.failed || 0,
          total: result.total || selectedList.length,
          results: result.results || []
        });

        // Clear selection on success
        if (result.failed === 0) {
          setSelectedVehicles(new Set());
        }
      } else {
        throw new Error(result.error || 'Failed to push to CMS');
      }

    } catch (err) {
      console.error('❌ Push error:', err);
      setError(err instanceof Error ? err.message : 'Ett okänt fel uppstod');
    } finally {
      setIsPushing(false);
    }
  };

  if (vehicles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center text-gray-500">
          <p className="text-lg mb-2">Inga fordon att skicka</p>
          <p className="text-sm">Kör AI-analys först för att extrahera fordonsdata</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Skicka till CMS
            </h3>
            <p className="text-sm text-gray-500">
              Välj fordon att skicka till CMS ({selectedVehicles.size} av {vehicles.length} valda)
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {/* Select All / Deselect All */}
            <div className="flex space-x-2">
              <button
                onClick={selectAll}
                className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
              >
                Välj alla
              </button>
              <button
                onClick={deselectAll}
                className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 rounded transition-colors"
              >
                Avmarkera
              </button>
            </div>

            {/* Push Button */}
            <button
              onClick={handlePushToCMS}
              disabled={isPushing || selectedVehicles.size === 0}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${
                isPushing || selectedVehicles.size === 0
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                  : 'bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              {isPushing ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Skickar...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>Skicka {selectedVehicles.size > 0 ? `(${selectedVehicles.size})` : ''} till CMS</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Push Results */}
      {pushResults && (
        <div className="mx-6 mt-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
            <span className="mr-2">{pushResults.success ? '✅' : '⚠️'}</span>
            Resultat
          </h4>

          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="text-center p-2 bg-gray-50 rounded">
              <div className="text-xl font-bold text-gray-900">{pushResults.total}</div>
              <div className="text-xs text-gray-500">Totalt</div>
            </div>
            <div className="text-center p-2 bg-green-50 rounded">
              <div className="text-xl font-bold text-green-600">{pushResults.created}</div>
              <div className="text-xs text-green-700">Skapade</div>
            </div>
            <div className="text-center p-2 bg-blue-50 rounded">
              <div className="text-xl font-bold text-blue-600">{pushResults.updated}</div>
              <div className="text-xs text-blue-700">Uppdaterade</div>
            </div>
            <div className="text-center p-2 bg-red-50 rounded">
              <div className="text-xl font-bold text-red-600">{pushResults.failed}</div>
              <div className="text-xs text-red-700">Misslyckade</div>
            </div>
          </div>

          {/* Detailed Results */}
          {pushResults.results.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {pushResults.results.map((result, idx) => (
                <div key={idx} className={`flex items-center justify-between p-2 rounded text-sm ${
                  result.success
                    ? result.action === 'created' ? 'bg-green-50' : 'bg-blue-50'
                    : 'bg-red-50'
                }`}>
                  <span className="font-medium truncate flex-1">{result.title}</span>
                  <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                    result.success
                      ? result.action === 'created' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {result.action === 'created' ? 'Skapad' : result.action === 'updated' ? 'Uppdaterad' : 'Fel'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vehicle List */}
      <div className="p-6 space-y-3">
        {vehicles.map((vehicle, index) => {
          const key = getVehicleKey(vehicle, index);
          const isSelected = selectedVehicles.has(key);
          const modelCount = vehicle.vehicle_models?.length || 0;
          const lowestPrice = vehicle.vehicle_models?.reduce((min, m) =>
            m.price && m.price > 0 && (min === null || m.price < min) ? m.price : min
          , null as number | null);
          const lowestLeasing = vehicle.vehicle_models?.reduce((min, m) =>
            m.privatleasing && m.privatleasing > 0 && (min === null || m.privatleasing < min) ? m.privatleasing : min
          , null as number | null);

          return (
            <div
              key={key}
              onClick={() => toggleVehicle(key)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                isSelected
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start space-x-4">
                {/* Checkbox */}
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-1 ${
                  isSelected ? 'bg-green-500 border-green-500' : 'border-gray-300'
                }`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>

                {/* Thumbnail */}
                {vehicle.thumbnail_url && (
                  <div className="w-24 h-16 rounded overflow-hidden flex-shrink-0">
                    <img
                      src={vehicle.thumbnail_url}
                      alt={vehicle.title}
                      className="w-full h-full object-cover"
                      onError={(e) => e.currentTarget.style.display = 'none'}
                    />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-900">{vehicle.title}</h4>
                      <div className="flex items-center space-x-2 mt-1">
                        {vehicle.brand && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                            {vehicle.brand}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {modelCount} {modelCount === 1 ? 'variant' : 'varianter'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      {lowestPrice && (
                        <div className="text-sm font-medium text-gray-900">
                          Från {formatPrice(lowestPrice)}
                        </div>
                      )}
                      {lowestLeasing && (
                        <div className="text-xs text-green-600">
                          Leasing från {lowestLeasing.toLocaleString('sv-SE')} kr/mån
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {vehicle.description && (
                    <p className="mt-1 text-sm text-gray-600 line-clamp-1">
                      {vehicle.description}
                    </p>
                  )}

                  {/* Models Preview */}
                  {vehicle.vehicle_models && vehicle.vehicle_models.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {vehicle.vehicle_models.slice(0, 5).map((model, mIdx) => (
                        <span key={mIdx} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                          {model.name}
                        </span>
                      ))}
                      {vehicle.vehicle_models.length > 5 && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                          +{vehicle.vehicle_models.length - 5} till
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
