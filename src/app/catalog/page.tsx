'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface CatalogItem {
  brand: string;
  vehicle_name: string;
  slug: string | null;
  vehicle_type: string;
  model_year: number | null;
  thumbnail_url: string | null;
  variant_name: string;
  trim_level: string | null;
  motor_type: string | null;
  drivlina: string | null;
  vaxellada: string | null;
  pris: number | null;
  old_pris: number | null;
  privatleasing: number | null;
  foretagsleasing: number | null;
  billan_per_man: number | null;
  is_campaign: boolean;
  campaign_name: string | null;
  campaign_end: string | null;
  price_updated_at: string | null;
  effekt_hk: number | null;
  rackvidd_km: number | null;
  forbrukning: string | null;
  langd: number | null;
  bagageutrymme_liter: number | null;
}

interface GroupedVehicle {
  brand: string;
  vehicle_name: string;
  model_year: number | null;
  thumbnail_url: string | null;
  variants: CatalogItem[];
}

function formatPrice(price: number | null): string {
  if (!price) return '-';
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(price);
}

function formatDate(date: string | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('sv-SE');
}

export default function CatalogPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    brand: '',
    motor_type: '',
    is_campaign: '',
  });

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.brand) params.set('brand', filters.brand);
      if (filters.motor_type) params.set('motor_type', filters.motor_type);
      if (filters.is_campaign) params.set('is_campaign', filters.is_campaign);

      const res = await fetch(`/api/master/prices?${params}`);
      const data = await res.json();

      if (data.success) {
        setCatalog(data.data || []);
      } else {
        setError(data.message || 'Failed to fetch catalog');
      }
    } catch (err) {
      setError('Failed to fetch catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, [filters]);

  // Group by vehicle
  const groupedVehicles: GroupedVehicle[] = [];
  const vehicleMap = new Map<string, GroupedVehicle>();

  catalog.forEach((item) => {
    const key = `${item.brand}-${item.vehicle_name}-${item.model_year}`;
    if (!vehicleMap.has(key)) {
      vehicleMap.set(key, {
        brand: item.brand,
        vehicle_name: item.vehicle_name,
        model_year: item.model_year,
        thumbnail_url: item.thumbnail_url,
        variants: [],
      });
    }
    vehicleMap.get(key)!.variants.push(item);
  });

  vehicleMap.forEach((v) => groupedVehicles.push(v));

  // Get unique brands and motor types for filters
  const brands = [...new Set(catalog.map((c) => c.brand))].sort();
  const motorTypes = [...new Set(catalog.map((c) => c.motor_type).filter(Boolean))].sort();

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Fordonskatalog</h1>
            <p className="text-gray-400 mt-1">
              Master vehicle database - {catalog.length} varianter
            </p>
          </div>
          <div className="flex gap-4">
            <Link
              href="/scrape"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
            >
              Scraper
            </Link>
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
              className="bg-gray-700 rounded px-3 py-2 text-white"
            >
              <option value="">Alla märken</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Drivmedel</label>
            <select
              value={filters.motor_type}
              onChange={(e) => setFilters({ ...filters, motor_type: e.target.value })}
              className="bg-gray-700 rounded px-3 py-2 text-white"
            >
              <option value="">Alla</option>
              {motorTypes.map((m) => (
                <option key={m} value={m || ''}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Kampanj</label>
            <select
              value={filters.is_campaign}
              onChange={(e) => setFilters({ ...filters, is_campaign: e.target.value })}
              className="bg-gray-700 rounded px-3 py-2 text-white"
            >
              <option value="">Alla</option>
              <option value="true">Endast kampanjer</option>
              <option value="false">Ej kampanj</option>
            </select>
          </div>
        </div>

        {/* Loading/Error states */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-400">Laddar katalog...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && groupedVehicles.length === 0 && (
          <div className="text-center py-12 bg-gray-800 rounded-lg">
            <p className="text-gray-400 text-lg">Inga fordon i katalogen</p>
            <p className="text-gray-500 mt-2">
              Importera fordon via <code className="bg-gray-700 px-2 py-1 rounded">/api/master/import</code>
            </p>
            <button
              onClick={async () => {
                const res = await fetch('/api/master/test-import', { method: 'POST' });
                const data = await res.json();
                alert(JSON.stringify(data, null, 2));
                fetchCatalog();
              }}
              className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition"
            >
              Importera testdata (eVitara + Mokka)
            </button>
          </div>
        )}

        {/* Vehicle cards */}
        {!loading && !error && groupedVehicles.length > 0 && (
          <div className="space-y-6">
            {groupedVehicles.map((vehicle) => (
              <div key={`${vehicle.brand}-${vehicle.vehicle_name}`} className="bg-gray-800 rounded-lg overflow-hidden">
                {/* Vehicle header */}
                <div className="bg-gray-750 p-4 border-b border-gray-700">
                  <div className="flex items-center gap-4">
                    {vehicle.thumbnail_url && (
                      <img
                        src={vehicle.thumbnail_url}
                        alt={vehicle.vehicle_name}
                        className="w-20 h-14 object-cover rounded"
                      />
                    )}
                    <div>
                      <h2 className="text-xl font-semibold">
                        {vehicle.brand} {vehicle.vehicle_name}
                      </h2>
                      <p className="text-gray-400 text-sm">
                        {vehicle.model_year} • {vehicle.variants.length} varianter
                      </p>
                    </div>
                  </div>
                </div>

                {/* Variants table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-700/50">
                      <tr>
                        <th className="text-left p-3 font-medium">Variant</th>
                        <th className="text-left p-3 font-medium">Motor</th>
                        <th className="text-left p-3 font-medium">Drivlina</th>
                        <th className="text-right p-3 font-medium">Pris</th>
                        <th className="text-right p-3 font-medium">Privatleasing</th>
                        <th className="text-right p-3 font-medium">Företagsleasing</th>
                        <th className="text-center p-3 font-medium">Kampanj</th>
                        <th className="text-right p-3 font-medium">Uppdaterad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicle.variants.map((variant, idx) => (
                        <tr
                          key={`${variant.variant_name}-${idx}`}
                          className={`border-t border-gray-700 hover:bg-gray-700/30 ${
                            variant.is_campaign ? 'bg-yellow-900/20' : ''
                          }`}
                        >
                          <td className="p-3">
                            <div className="font-medium">{variant.variant_name}</div>
                            {variant.trim_level && (
                              <div className="text-gray-400 text-xs">{variant.trim_level}</div>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              variant.motor_type === 'EL' ? 'bg-green-600' :
                              variant.motor_type === 'HYBRID' ? 'bg-blue-600' :
                              variant.motor_type === 'PHEV' ? 'bg-purple-600' :
                              'bg-gray-600'
                            }`}>
                              {variant.motor_type || '-'}
                            </span>
                            {variant.effekt_hk && (
                              <span className="text-gray-400 text-xs ml-2">{variant.effekt_hk} hk</span>
                            )}
                          </td>
                          <td className="p-3 text-gray-300">{variant.drivlina || '-'}</td>
                          <td className="p-3 text-right">
                            {variant.old_pris && variant.old_pris > 0 && (
                              <div className="text-gray-500 line-through text-xs">
                                {formatPrice(variant.old_pris)}
                              </div>
                            )}
                            <div className={variant.is_campaign ? 'text-yellow-400 font-semibold' : ''}>
                              {formatPrice(variant.pris)}
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            {variant.privatleasing ? (
                              <span>{formatPrice(variant.privatleasing)}/mån</span>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-right">
                            {variant.foretagsleasing ? (
                              <span>{formatPrice(variant.foretagsleasing)}/mån</span>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-center">
                            {variant.is_campaign ? (
                              <span className="px-2 py-1 bg-yellow-600 text-yellow-100 rounded text-xs">
                                {variant.campaign_name || 'Kampanj'}
                              </span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                          <td className="p-3 text-right text-gray-400 text-xs">
                            {formatDate(variant.price_updated_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        {!loading && catalog.length > 0 && (
          <div className="mt-8 grid grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-2xl font-bold">{groupedVehicles.length}</div>
              <div className="text-gray-400 text-sm">Fordon</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-2xl font-bold">{catalog.length}</div>
              <div className="text-gray-400 text-sm">Varianter</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-2xl font-bold">{brands.length}</div>
              <div className="text-gray-400 text-sm">Märken</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-400">
                {catalog.filter((c) => c.is_campaign).length}
              </div>
              <div className="text-gray-400 text-sm">Kampanjer</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
