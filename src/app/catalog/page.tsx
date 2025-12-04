'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface VehicleModel {
  id: string;
  name: string;
  price: number | null;
  old_price: number | null;
  privatleasing: number | null;
  old_privatleasing: number | null;
  company_leasing_price: number | null;
  old_company_leasing_price: number | null;
  loan_price: number | null;
  old_loan_price: number | null;
  biltyp: string | null;
  bransle: string | null;
  vaxellada: string | null;
  thumbnail_url: string | null;
  utrustning: string[] | null;
  created_at: string;
}

interface ScrapedVehicle {
  id: string;
  title: string;
  brand: string;
  description: string | null;
  thumbnail_url: string | null;
  vehicle_type: string;
  free_text: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  vehicle_models: VehicleModel[];
}

interface CatalogResponse {
  success: boolean;
  data: ScrapedVehicle[];
  filters: {
    brands: string[];
    bransle: string[];
  };
  stats: {
    totalVehicles: number;
    totalVariants: number;
    totalBrands: number;
    campaignCount: number;
  };
}

function formatPrice(price: number | null): string {
  if (!price) return '-';
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(price);
}

function formatDate(date: string | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('sv-SE');
}

function formatDateTime(date: string | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleString('sv-SE');
}

export default function CatalogPage() {
  const [catalog, setCatalog] = useState<ScrapedVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    brand: '',
    bransle: '',
  });
  const [availableFilters, setAvailableFilters] = useState({
    brands: [] as string[],
    bransle: [] as string[],
  });
  const [stats, setStats] = useState({
    totalVehicles: 0,
    totalVariants: 0,
    totalBrands: 0,
    campaignCount: 0,
  });
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [jsonData, setJsonData] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table' | 'json'>('cards');

  const fetchCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.brand) params.set('brand', filters.brand);
      if (filters.bransle) params.set('bransle', filters.bransle);

      const res = await fetch(`/api/catalog?${params}`);
      const data: CatalogResponse = await res.json();

      if (data.success) {
        setCatalog(data.data || []);
        setAvailableFilters(data.filters);
        setStats(data.stats);

        // Also fetch JSON format for the JSON view
        const jsonRes = await fetch(`/api/catalog?${params}&format=json`);
        const jsonResult = await jsonRes.json();
        setJsonData(jsonResult);
      } else {
        setError('Failed to fetch catalog');
      }
    } catch {
      setError('Failed to fetch catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Helper to check if there's a discount
  const hasDiscount = (oldPrice: number | null, newPrice: number | null) => {
    return oldPrice && oldPrice > 0 && newPrice && oldPrice > newPrice;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Fordonskatalog</h1>
            <p className="text-gray-400 mt-1">
              {stats.totalVariants} varianter från {stats.totalVehicles} fordon • {stats.totalBrands} märken
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/scrape"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
            >
              Scraper
            </Link>
            <div className="flex bg-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-2 transition ${viewMode === 'cards' ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
              >
                Kort
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-2 transition ${viewMode === 'table' ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
              >
                Tabell
              </button>
              <button
                onClick={() => setViewMode('json')}
                className={`px-3 py-2 transition ${viewMode === 'json' ? 'bg-green-600' : 'hover:bg-gray-600'}`}
              >
                JSON
              </button>
            </div>
            <button
              onClick={() => fetchCatalog()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition"
            >
              Uppdatera
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6 flex gap-4 flex-wrap">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Märke</label>
            <select
              value={filters.brand}
              onChange={(e) => setFilters({ ...filters, brand: e.target.value })}
              className="bg-gray-700 rounded px-3 py-2 text-white min-w-[150px]"
            >
              <option value="">Alla märken</option>
              {availableFilters.brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Bränsle</label>
            <select
              value={filters.bransle}
              onChange={(e) => setFilters({ ...filters, bransle: e.target.value })}
              className="bg-gray-700 rounded px-3 py-2 text-white min-w-[150px]"
            >
              <option value="">Alla</option>
              {availableFilters.bransle.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-400">Laddar katalog...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && catalog.length === 0 && (
          <div className="text-center py-12 bg-gray-800 rounded-lg">
            <p className="text-gray-400 text-lg">Inga fordon i katalogen</p>
            <p className="text-gray-500 mt-2">
              Kör en scrape för att hämta fordonsdata
            </p>
            <Link
              href="/scrape"
              className="mt-4 inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition"
            >
              Gå till Scraper
            </Link>
          </div>
        )}

        {/* JSON View */}
        {!loading && !error && viewMode === 'json' && jsonData && (
          <div className="bg-gray-800 rounded-lg overflow-hidden mb-6">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold">JSON Data ({jsonData.meta?.total_vehicles || 0} fordon, {jsonData.meta?.total_variants || 0} varianter)</h2>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
                  alert('JSON kopierad till urklipp!');
                }}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Kopiera JSON
              </button>
            </div>
            <pre className="p-4 overflow-auto max-h-[70vh] text-sm text-green-400 bg-gray-900">
              {JSON.stringify(jsonData, null, 2)}
            </pre>
          </div>
        )}

        {/* Full Table View - All Data */}
        {!loading && !error && viewMode === 'table' && catalog.length > 0 && (
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-700 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium whitespace-nowrap">Bild</th>
                    <th className="text-left p-2 font-medium whitespace-nowrap">Märke</th>
                    <th className="text-left p-2 font-medium whitespace-nowrap">Modell</th>
                    <th className="text-left p-2 font-medium whitespace-nowrap">Variant</th>
                    <th className="text-left p-2 font-medium whitespace-nowrap">Kaross</th>
                    <th className="text-left p-2 font-medium whitespace-nowrap">Bränsle</th>
                    <th className="text-left p-2 font-medium whitespace-nowrap">Växellåda</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">Pris</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">Ord. Pris</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">Privatleasing</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">Ord. Privatl.</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">Företagsleasing</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">Ord. Företag</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">Billån</th>
                    <th className="text-right p-2 font-medium whitespace-nowrap">Ord. Billån</th>
                    <th className="text-left p-2 font-medium whitespace-nowrap">Utrustning</th>
                    <th className="text-left p-2 font-medium whitespace-nowrap">Uppdaterad</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.flatMap((vehicle) =>
                    vehicle.vehicle_models.map((model, idx) => {
                      const hasPriceDiscount = hasDiscount(model.old_price, model.price);
                      const hasLeasingDiscount = hasDiscount(model.old_privatleasing, model.privatleasing);
                      const hasCompanyDiscount = hasDiscount(model.old_company_leasing_price, model.company_leasing_price);
                      const hasLoanDiscount = hasDiscount(model.old_loan_price, model.loan_price);
                      const isCampaign = hasPriceDiscount || hasLeasingDiscount;

                      return (
                        <tr
                          key={`${vehicle.id}-${model.id}`}
                          className={`border-t border-gray-700 hover:bg-gray-700/30 ${isCampaign ? 'bg-yellow-900/20' : ''}`}
                        >
                          <td className="p-2">
                            {(model.thumbnail_url || vehicle.thumbnail_url) && (
                              <img
                                src={model.thumbnail_url || vehicle.thumbnail_url || ''}
                                alt={model.name}
                                className="w-16 h-10 object-cover rounded"
                              />
                            )}
                          </td>
                          <td className="p-2 font-medium">{vehicle.brand}</td>
                          <td className="p-2">{vehicle.title}</td>
                          <td className="p-2 max-w-[200px]">
                            <div className="truncate" title={model.name}>{model.name}</div>
                          </td>
                          <td className="p-2 text-gray-400">{model.biltyp || '-'}</td>
                          <td className="p-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              model.bransle?.toLowerCase() === 'el' ? 'bg-green-600' :
                              model.bransle?.toLowerCase() === 'hybrid' ? 'bg-blue-600' :
                              model.bransle?.toLowerCase() === 'laddhybrid' ? 'bg-purple-600' :
                              'bg-gray-600'
                            }`}>
                              {model.bransle || '-'}
                            </span>
                          </td>
                          <td className="p-2 text-gray-400">{model.vaxellada || '-'}</td>
                          <td className={`p-2 text-right ${hasPriceDiscount ? 'text-yellow-400 font-semibold' : ''}`}>
                            {formatPrice(model.price)}
                          </td>
                          <td className={`p-2 text-right ${hasPriceDiscount ? 'text-gray-500 line-through' : 'text-gray-500'}`}>
                            {model.old_price && model.old_price > 0 ? formatPrice(model.old_price) : '-'}
                          </td>
                          <td className={`p-2 text-right ${hasLeasingDiscount ? 'text-yellow-400 font-semibold' : ''}`}>
                            {model.privatleasing ? `${formatPrice(model.privatleasing)}/m` : '-'}
                          </td>
                          <td className={`p-2 text-right ${hasLeasingDiscount ? 'text-gray-500 line-through' : 'text-gray-500'}`}>
                            {model.old_privatleasing && model.old_privatleasing > 0 ? `${formatPrice(model.old_privatleasing)}/m` : '-'}
                          </td>
                          <td className={`p-2 text-right ${hasCompanyDiscount ? 'text-yellow-400 font-semibold' : ''}`}>
                            {model.company_leasing_price ? `${formatPrice(model.company_leasing_price)}/m` : '-'}
                          </td>
                          <td className={`p-2 text-right ${hasCompanyDiscount ? 'text-gray-500 line-through' : 'text-gray-500'}`}>
                            {model.old_company_leasing_price && model.old_company_leasing_price > 0 ? `${formatPrice(model.old_company_leasing_price)}/m` : '-'}
                          </td>
                          <td className={`p-2 text-right ${hasLoanDiscount ? 'text-yellow-400 font-semibold' : ''}`}>
                            {model.loan_price ? `${formatPrice(model.loan_price)}/m` : '-'}
                          </td>
                          <td className={`p-2 text-right ${hasLoanDiscount ? 'text-gray-500 line-through' : 'text-gray-500'}`}>
                            {model.old_loan_price && model.old_loan_price > 0 ? `${formatPrice(model.old_loan_price)}/m` : '-'}
                          </td>
                          <td className="p-2 max-w-[150px]">
                            {model.utrustning && model.utrustning.length > 0 ? (
                              <div className="truncate text-gray-400 text-xs" title={model.utrustning.join(', ')}>
                                {model.utrustning.slice(0, 3).join(', ')}
                                {model.utrustning.length > 3 && ` +${model.utrustning.length - 3}`}
                              </div>
                            ) : '-'}
                          </td>
                          <td className="p-2 text-gray-500 whitespace-nowrap">
                            {formatDate(vehicle.updated_at)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Card View */}
        {!loading && !error && viewMode === 'cards' && catalog.length > 0 && (
          <div className="space-y-6">
            {catalog.map((vehicle) => {
              const isExpanded = expandedVehicle === vehicle.id;
              const hasCampaigns = vehicle.vehicle_models.some(m =>
                hasDiscount(m.old_price, m.price) || hasDiscount(m.old_privatleasing, m.privatleasing)
              );

              return (
                <div key={vehicle.id} className="bg-gray-800 rounded-lg overflow-hidden">
                  {/* Vehicle header */}
                  <div
                    className="p-4 border-b border-gray-700 cursor-pointer hover:bg-gray-750"
                    onClick={() => setExpandedVehicle(isExpanded ? null : vehicle.id)}
                  >
                    <div className="flex items-start gap-4">
                      {vehicle.thumbnail_url && (
                        <img
                          src={vehicle.thumbnail_url}
                          alt={vehicle.title}
                          className="w-32 h-20 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-1 bg-blue-600 text-white rounded text-sm font-semibold">
                            {vehicle.brand}
                          </span>
                          <h2 className="text-xl font-semibold">
                            {vehicle.title}
                          </h2>
                          {hasCampaigns && (
                            <span className="px-2 py-1 bg-yellow-600 text-yellow-100 rounded text-xs font-medium">
                              Kampanj
                            </span>
                          )}
                        </div>
                        <p className="text-gray-400 text-sm mt-1">
                          {vehicle.vehicle_models.length} varianter • {vehicle.vehicle_type}
                        </p>
                        {vehicle.description && (
                          <p className="text-gray-500 text-sm mt-2 line-clamp-2">
                            {vehicle.description}
                          </p>
                        )}
                      </div>
                      <div className="text-gray-400">
                        {isExpanded ? '▲' : '▼'}
                      </div>
                    </div>
                  </div>

                  {/* Expanded content - Full variant details */}
                  {isExpanded && (
                    <div>
                      {/* Detailed table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-700/50">
                            <tr>
                              <th className="text-left p-3 font-medium">Variant</th>
                              <th className="text-left p-3 font-medium">Kaross</th>
                              <th className="text-left p-3 font-medium">Bränsle</th>
                              <th className="text-left p-3 font-medium">Växellåda</th>
                              <th className="text-right p-3 font-medium">Pris</th>
                              <th className="text-right p-3 font-medium">Privatleasing</th>
                              <th className="text-right p-3 font-medium">Företagsleasing</th>
                              <th className="text-right p-3 font-medium">Billån</th>
                              <th className="text-left p-3 font-medium">Utrustning</th>
                            </tr>
                          </thead>
                          <tbody>
                            {vehicle.vehicle_models.map((model) => {
                              const hasPriceDiscount = hasDiscount(model.old_price, model.price);
                              const hasLeasingDiscount = hasDiscount(model.old_privatleasing, model.privatleasing);
                              const hasCompanyLeasingDiscount = hasDiscount(model.old_company_leasing_price, model.company_leasing_price);
                              const hasLoanDiscount = hasDiscount(model.old_loan_price, model.loan_price);
                              const isCampaign = hasPriceDiscount || hasLeasingDiscount;

                              return (
                                <tr
                                  key={model.id}
                                  className={`border-t border-gray-700 hover:bg-gray-700/30 ${
                                    isCampaign ? 'bg-yellow-900/20' : ''
                                  }`}
                                >
                                  <td className="p-3">
                                    <div className="flex items-center gap-2">
                                      {model.thumbnail_url && (
                                        <img
                                          src={model.thumbnail_url}
                                          alt={model.name}
                                          className="w-12 h-8 object-cover rounded"
                                        />
                                      )}
                                      <div className="font-medium">{model.name}</div>
                                    </div>
                                  </td>
                                  <td className="p-3 text-gray-400">{model.biltyp || '-'}</td>
                                  <td className="p-3">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      model.bransle?.toLowerCase() === 'el' ? 'bg-green-600' :
                                      model.bransle?.toLowerCase() === 'hybrid' ? 'bg-blue-600' :
                                      model.bransle?.toLowerCase() === 'laddhybrid' ? 'bg-purple-600' :
                                      'bg-gray-600'
                                    }`}>
                                      {model.bransle || '-'}
                                    </span>
                                  </td>
                                  <td className="p-3 text-gray-300">{model.vaxellada || '-'}</td>
                                  <td className="p-3 text-right">
                                    {hasPriceDiscount && (
                                      <div className="text-gray-500 line-through text-xs">
                                        {formatPrice(model.old_price)}
                                      </div>
                                    )}
                                    <div className={hasPriceDiscount ? 'text-yellow-400 font-semibold' : ''}>
                                      {formatPrice(model.price)}
                                    </div>
                                  </td>
                                  <td className="p-3 text-right">
                                    {hasLeasingDiscount && (
                                      <div className="text-gray-500 line-through text-xs">
                                        {formatPrice(model.old_privatleasing)}/mån
                                      </div>
                                    )}
                                    <div className={hasLeasingDiscount ? 'text-yellow-400 font-semibold' : ''}>
                                      {model.privatleasing ? `${formatPrice(model.privatleasing)}/mån` : '-'}
                                    </div>
                                  </td>
                                  <td className="p-3 text-right">
                                    {hasCompanyLeasingDiscount && (
                                      <div className="text-gray-500 line-through text-xs">
                                        {formatPrice(model.old_company_leasing_price)}/mån
                                      </div>
                                    )}
                                    <div className={hasCompanyLeasingDiscount ? 'text-yellow-400 font-semibold' : ''}>
                                      {model.company_leasing_price ? `${formatPrice(model.company_leasing_price)}/mån` : '-'}
                                    </div>
                                  </td>
                                  <td className="p-3 text-right">
                                    {hasLoanDiscount && (
                                      <div className="text-gray-500 line-through text-xs">
                                        {formatPrice(model.old_loan_price)}/mån
                                      </div>
                                    )}
                                    <div className={hasLoanDiscount ? 'text-yellow-400 font-semibold' : ''}>
                                      {model.loan_price ? `${formatPrice(model.loan_price)}/mån` : '-'}
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    {model.utrustning && model.utrustning.length > 0 ? (
                                      <div className="text-xs text-gray-400">
                                        {model.utrustning.join(', ')}
                                      </div>
                                    ) : (
                                      <span className="text-gray-500">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Vehicle metadata */}
                      <div className="p-4 bg-gray-700/30 border-t border-gray-700 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">ID:</span>
                          <span className="ml-2 text-gray-300 font-mono text-xs">{vehicle.id}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Typ:</span>
                          <span className="ml-2 text-gray-300">{vehicle.vehicle_type}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Skapad:</span>
                          <span className="ml-2 text-gray-300">{formatDateTime(vehicle.created_at)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Uppdaterad:</span>
                          <span className="ml-2 text-gray-300">{formatDateTime(vehicle.updated_at)}</span>
                        </div>
                      </div>

                      {/* Description and free text */}
                      {(vehicle.description || vehicle.free_text) && (
                        <div className="p-4 border-t border-gray-700 space-y-3">
                          {vehicle.description && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-400 mb-1">Beskrivning</h4>
                              <p className="text-sm text-gray-300">{vehicle.description}</p>
                            </div>
                          )}
                          {vehicle.free_text && (
                            <div>
                              <h4 className="text-sm font-medium text-gray-400 mb-1">Kampanjinfo</h4>
                              <p className="text-sm text-gray-300">{vehicle.free_text}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Source link */}
                      {vehicle.source_url && (
                        <div className="p-4 border-t border-gray-700 flex justify-between items-center">
                          <span className="text-gray-500 text-xs font-mono truncate max-w-[70%]">
                            {vehicle.source_url}
                          </span>
                          <a
                            href={vehicle.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 text-sm"
                          >
                            Öppna källa →
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Stats */}
        {!loading && catalog.length > 0 && (
          <div className="mt-8 grid grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-2xl font-bold">{stats.totalVehicles}</div>
              <div className="text-gray-400 text-sm">Fordon</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-2xl font-bold">{stats.totalVariants}</div>
              <div className="text-gray-400 text-sm">Varianter</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-2xl font-bold">{stats.totalBrands}</div>
              <div className="text-gray-400 text-sm">Märken</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-400">
                {stats.campaignCount}
              </div>
              <div className="text-gray-400 text-sm">Kampanjer</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
