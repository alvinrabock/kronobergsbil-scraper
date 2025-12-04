'use client';

import { useState, useEffect } from 'react';

// Updated interface to match UrlData from other components
interface UrlData {
  url: string;
  category: string;
  contentType: string;
  label?: string;
  brand?: string;
}

export interface ScrapeOptions {
  autoPushToCMS: boolean;
}

interface ScrapeFormProps {
  onScrapeMultiple: (urls: UrlData[], options?: ScrapeOptions) => Promise<void>;
  loading: boolean;
}

interface CategorizedUrl {
  url: string;
  category: 'campaigns' | 'cars' | 'transport_cars';
  contentType: 'campaigns' | 'cars' | 'transport_cars';
  label?: string;
  brand?: string;
}

// Available car brands for the dealer
const AVAILABLE_BRANDS = [
  'Mazda',
  'Suzuki',
  'Honda',
  'Opel',
  'Subaru',
  'Isuzu',
  'MG',
  'Maxus',
  'Fiat Professional',
] as const;

export default function ScrapeForm({ onScrapeMultiple, loading }: ScrapeFormProps) {
  const [urlCategories, setUrlCategories] = useState<CategorizedUrl[]>([
    // Start with empty field - will load from registry
    { url: '', category: 'campaigns', contentType: 'campaigns', label: '', brand: '' }
  ]);
  const [saving, setSaving] = useState(false);
  const [loadingRegistry, setLoadingRegistry] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [autoPushToCMS, setAutoPushToCMS] = useState(false);
  const [clearingCatalog, setClearingCatalog] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Load URLs from registry on mount
  useEffect(() => {
    loadFromRegistry();
  }, []);

  // Load URLs from the database registry
  const loadFromRegistry = async () => {
    setLoadingRegistry(true);
    try {
      const response = await fetch('/api/url-registry');
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        // Group by URL to combine brands
        const urlMap = new Map<string, CategorizedUrl>();

        for (const item of result.data) {
          const key = item.url;
          if (urlMap.has(key)) {
            // Add brand to existing URL
            const existing = urlMap.get(key)!;
            if (existing.brand && !existing.brand.includes(item.brand)) {
              existing.brand = `${existing.brand}, ${item.brand}`;
            }
          } else {
            urlMap.set(key, {
              url: item.url,
              category: item.content_type as 'campaigns' | 'cars' | 'transport_cars',
              contentType: item.content_type as 'campaigns' | 'cars' | 'transport_cars',
              label: item.label || '',
              brand: item.brand || '',
            });
          }
        }

        const loadedUrls = Array.from(urlMap.values());
        // Add empty field at the end
        loadedUrls.push({ url: '', category: 'campaigns', contentType: 'campaigns', label: '', brand: '' });
        setUrlCategories(loadedUrls);
        setSaveMessage({ type: 'success', text: `Loaded ${result.data.length} URLs from registry` });
      }
    } catch (error) {
      console.error('Error loading from registry:', error);
    } finally {
      setLoadingRegistry(false);
      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // Save URLs to the database registry
  const saveToRegistry = async () => {
    setSaving(true);
    setSaveMessage(null);

    try {
      const validUrls = urlCategories.filter(
        item => item.url.trim().startsWith('http') && item.brand && item.brand.trim().length > 0
      );

      if (validUrls.length === 0) {
        setSaveMessage({ type: 'error', text: 'No URLs with brands to save. Add a brand to each URL first.' });
        return;
      }

      const response = await fetch('/api/url-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: validUrls }),
      });

      const result = await response.json();

      if (result.success) {
        setSaveMessage({ type: 'success', text: `✓ Saved ${result.saved} URL-brand mappings` });
      } else {
        setSaveMessage({ type: 'error', text: result.error || 'Failed to save' });
      }
    } catch (error) {
      console.error('Error saving to registry:', error);
      setSaveMessage({ type: 'error', text: 'Failed to save to registry' });
    } finally {
      setSaving(false);
      // Clear message after 5 seconds
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };

  const categoryConfig = {
    campaigns: {
      name: 'Campaigns & Offers',
      color: 'purple',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-800',
      description: 'Campaign pages with offers, promotions, and special deals'
    },
    cars: {
      name: 'Cars (Personbilar)',
      color: 'blue',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-800',
      description: 'Passenger car model pages and listings'
    },
    transport_cars: {
      name: 'Transport Cars',
      color: 'green',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      textColor: 'text-green-800',
      description: 'Commercial and transport vehicle pages'
    }
  };

  const handleMultipleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const validUrls = getFilteredUrls()
      .filter(item => item.url.trim().length > 0 && (item.url.trim().startsWith('http://') || item.url.trim().startsWith('https://')))
      .map(item => ({
        url: item.url.trim(),
        category: item.category,
        contentType: item.contentType,
        label: item.label,
        brand: item.brand || undefined
      }));

    if (validUrls.length > 0) {
      await onScrapeMultiple(validUrls, { autoPushToCMS });
    }
  };

  const handleIndividualScrape = async (url: string, category: string, contentType: string, label?: string, brand?: string): Promise<void> => {
    const urlData: UrlData[] = [{ url, category, contentType, label, brand }];
    await onScrapeMultiple(urlData, { autoPushToCMS });
  };

  const updateUrlItem = (index: number, field: keyof CategorizedUrl, value: string): void => {
    const newUrlCategories = [...urlCategories];
    newUrlCategories[index] = { ...newUrlCategories[index], [field]: value };
    setUrlCategories(newUrlCategories);
  };

  const addUrlField = (category: 'campaigns' | 'cars' | 'transport_cars' = 'campaigns'): void => {
    setUrlCategories([...urlCategories, { url: '', category, contentType: category, label: '', brand: '' }]);
  };

  const removeUrlField = (index: number): void => {
    if (urlCategories.length > 1) {
      const newUrlCategories = urlCategories.filter((_, i) => i !== index);
      setUrlCategories(newUrlCategories);
    }
  };

  const clearAllUrls = (): void => {
    setUrlCategories([{ url: '', category: 'campaigns', contentType: 'campaigns', label: '', brand: '' }]);
  };

  // Clear catalog from database
  const clearCatalog = async (): Promise<void> => {
    setClearingCatalog(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/catalog?confirm=yes', {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        setSaveMessage({
          type: 'success',
          text: `Katalog rensad! Raderade ${result.deleted?.vehicles || 0} fordon och ${result.deleted?.variants || 0} varianter.`
        });
      } else {
        setSaveMessage({ type: 'error', text: result.error || 'Kunde inte rensa katalogen' });
      }
    } catch (error) {
      console.error('Error clearing catalog:', error);
      setSaveMessage({ type: 'error', text: 'Fel vid rensning av katalog' });
    } finally {
      setClearingCatalog(false);
      setShowClearConfirm(false);
      // Clear message after 5 seconds
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };

  const getFilteredUrls = (): CategorizedUrl[] => {
    return urlCategories;
  };

  const loadPresetUrls = (): void => {
    setUrlCategories([
      // Campaign URLs
      { url: 'https://kronobergsbil.bilforetag.se/vaxjo/erbjudanden/', category: 'campaigns', contentType: 'campaigns', label: 'Main Offers', brand: '' },
      { url: 'https://suzukibilar.se/kopa-suzuki/kampanjer-erbjudanden', category: 'campaigns', contentType: 'campaigns', label: 'Suzuki Campaigns', brand: 'Suzuki' },

      // Car URLs
      { url: 'https://kronobergsbil.bilforetag.se/vaxjo/personbilar/', category: 'cars', contentType: 'cars', label: 'Personbilar', brand: '' },
      { url: 'https://suzukibilar.se/modeller', category: 'cars', contentType: 'cars', label: 'Suzuki Models', brand: 'Suzuki' },

      // Transport Car URLs
      { url: 'https://kronobergsbil.bilforetag.se/vaxjo/transportbilar/', category: 'transport_cars', contentType: 'transport_cars', label: 'Transportbilar', brand: '' },

      // Empty field
      { url: '', category: 'campaigns', contentType: 'campaigns', label: '', brand: '' }
    ]);
  };

  const validUrlCount = urlCategories.filter(item =>
    item.url.trim().length > 0 && (item.url.trim().startsWith('http://') || item.url.trim().startsWith('https://'))
  ).length;

  const isValidUrl = (url: string): boolean => {
    return url.trim().length > 0 && (url.trim().startsWith('http://') || url.trim().startsWith('https://'));
  };

  const getCategoryStats = () => {
    const stats = { campaigns: 0, cars: 0, transport_cars: 0 };
    urlCategories.forEach(item => {
      if (isValidUrl(item.url)) {
        stats[item.category]++;
      }
    });
    return stats;
  };

  const categoryStats = getCategoryStats();

  return (
    <div className="bg-white p-6 rounded-lg shadow-md text-gray-900">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Automotive Content Scraper</h2>
        <div className="text-sm text-gray-600">
          Total valid URLs: {validUrlCount}
        </div>
      </div>

      <form onSubmit={handleMultipleSubmit} className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Categorized URLs by Content Type
            </label>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <select
                  onChange={(e) => addUrlField(e.target.value as 'campaigns' | 'cars' | 'transport_cars')}
                  className="px-3 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded border appearance-none pr-6"
                  disabled={loading}
                  defaultValue=""
                >
                  <option value="" disabled>+ Add URL to...</option>
                  <option value="campaigns">Campaigns</option>
                  <option value="cars">Cars</option>
                  <option value="transport_cars">Transport Cars</option>
                </select>
                <div className="absolute inset-y-0 right-1 flex items-center pointer-events-none">
                  <svg className="w-3 h-3 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* URL Input Fields Grouped by Category */}
          <div className="space-y-4 max-h-80 overflow-y-auto">
            {Object.entries(categoryConfig).map(([categoryKey, config]) => {
              const categoryUrls = urlCategories
                .map((item, index) => ({ ...item, originalIndex: index }))
                .filter(item => item.category === categoryKey);

              if (categoryUrls.length === 0) return null;

              return (
                <div key={categoryKey} className={`p-4 rounded-lg border-2 ${config.bgColor} ${config.borderColor}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`text-sm font-medium ${config.textColor}`}>
                      {config.name} ({categoryUrls.filter(item => isValidUrl(item.url)).length} valid)
                    </h4>
                    <div className={`text-xs ${config.textColor} opacity-75`}>
                      {config.description}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {categoryUrls.map((item) => (
                      <div key={item.originalIndex} className="flex items-center space-x-2">
                        <div className="flex-1 space-y-1">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={item.label}
                              onChange={(e) => updateUrlItem(item.originalIndex, 'label', e.target.value)}
                              placeholder="Label (optional)"
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              disabled={loading}
                            />
                            <div className="relative min-w-[160px]">
                              <input
                                type="text"
                                list={`brands-${item.originalIndex}`}
                                value={item.brand || ''}
                                onChange={(e) => updateUrlItem(item.originalIndex, 'brand', e.target.value)}
                                placeholder="Märke(n) t.ex. Mazda, Suzuki"
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                disabled={loading}
                              />
                              <datalist id={`brands-${item.originalIndex}`}>
                                {AVAILABLE_BRANDS.map(brand => (
                                  <option key={brand} value={brand} />
                                ))}
                                {/* Common combinations */}
                                <option value="Mazda, Suzuki, Honda" />
                                <option value="Opel, Subaru" />
                                <option value="MG, Maxus" />
                              </datalist>
                            </div>
                          </div>
                          <input
                            type="url"
                            value={item.url}
                            onChange={(e) => updateUrlItem(item.originalIndex, 'url', e.target.value)}
                            placeholder={`https://example.com/${categoryKey === 'campaigns' ? 'erbjudanden' : categoryKey === 'cars' ? 'personbilar' : 'transportbilar'}`}
                            className={`w-full px-2 py-1 border rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${item.url.trim() === ''
                                ? 'border-gray-300 bg-white'
                                : isValidUrl(item.url)
                                  ? 'border-green-300 bg-green-50'
                                  : 'border-red-300 bg-red-50'
                              }`}
                            disabled={loading}
                          />
                        </div>

                        <div className="flex items-center space-x-1">
                          {/* Brand Badge(s) (if set) */}
                          {item.brand && (
                            <div className="flex flex-wrap gap-1">
                              {item.brand.split(',').map((b, i) => (
                                <span key={i} className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200">
                                  {b.trim()}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Category Badge */}
                          <span className={`px-2 py-1 text-xs rounded-full ${config.bgColor} ${config.textColor} border ${config.borderColor}`}>
                            {categoryKey.replace('_', ' ')}
                          </span>

                          {/* Individual Scrape Button */}
                          <button
                            type="button"
                            onClick={() => handleIndividualScrape(item.url.trim(), item.category, item.contentType, item.label, item.brand)}
                            disabled={loading || !isValidUrl(item.url)}
                            className={`px-3 py-1 rounded text-sm transition-colors flex-shrink-0 ${loading || !isValidUrl(item.url)
                                ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                              }`}
                          >
                            {loading ? 'Wait' : 'Scrape'}
                          </button>

                          {/* Remove Button */}
                          {urlCategories.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeUrlField(item.originalIndex)}
                              className="px-2 py-1 text-red-600 hover:bg-red-100 rounded transition-colors flex-shrink-0 text-sm"
                              disabled={loading}
                              title="Remove this URL"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* URL Management Buttons */}
          <div className="flex items-center justify-between pt-3">
            <div className="flex space-x-2">
              {/* Save to Database Button */}
              <button
                type="button"
                onClick={saveToRegistry}
                disabled={saving || loading}
                className={`px-3 py-1 text-sm rounded transition-colors flex items-center gap-1 ${
                  saving
                    ? 'bg-gray-300 text-gray-500 cursor-wait'
                    : 'bg-green-100 hover:bg-green-200 text-green-700'
                }`}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>💾 Save to DB</>
                )}
              </button>
              {/* Load from Database Button */}
              <button
                type="button"
                onClick={loadFromRegistry}
                disabled={loadingRegistry || loading}
                className={`px-3 py-1 text-sm rounded transition-colors flex items-center gap-1 ${
                  loadingRegistry
                    ? 'bg-gray-300 text-gray-500 cursor-wait'
                    : 'bg-blue-100 hover:bg-blue-200 text-blue-700'
                }`}
              >
                {loadingRegistry ? (
                  <>
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>📂 Load from DB</>
                )}
              </button>
              <button
                type="button"
                onClick={loadPresetUrls}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                disabled={loading}
              >
                Load Presets
              </button>
              <button
                type="button"
                onClick={clearAllUrls}
                className="px-3 py-1 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors"
                disabled={loading}
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                disabled={loading || clearingCatalog}
              >
                Rensa Katalog
              </button>
            </div>

            {/* Category Summary */}
            <div className="flex space-x-3 text-xs text-gray-600">
              <span className="flex items-center">
                <div className="w-2 h-2 bg-purple-400 rounded-full mr-1"></div>
                Campaigns: {categoryStats.campaigns}
              </span>
              <span className="flex items-center">
                <div className="w-2 h-2 bg-blue-400 rounded-full mr-1"></div>
                Cars: {categoryStats.cars}
              </span>
              <span className="flex items-center">
                <div className="w-2 h-2 bg-green-400 rounded-full mr-1"></div>
                Transport: {categoryStats.transport_cars}
              </span>
            </div>
          </div>

          {/* Save/Load Message */}
          {saveMessage && (
            <div className={`mt-2 px-3 py-2 rounded text-sm ${
              saveMessage.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {saveMessage.text}
            </div>
          )}
        </div>

        {/* Auto-push to CMS Toggle */}
        <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoPushToCMS}
                onChange={(e) => setAutoPushToCMS(e.target.checked)}
                className="sr-only peer"
                disabled={loading}
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
            <div>
              <span className="text-sm font-medium text-gray-900">Auto-push till CMS</span>
              <p className="text-xs text-gray-500">Uppdatera katalogen automatiskt efter skrapning</p>
            </div>
          </div>
          {autoPushToCMS && (
            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 border border-blue-200">
              Aktiverad
            </span>
          )}
        </div>

        {/* Submit Button - Scrape All */}
        <button
          type="submit"
          disabled={loading || validUrlCount === 0}
          className={`w-full flex items-center justify-center px-4 py-3 rounded-md text-white font-medium transition-colors ${loading || validUrlCount === 0
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
            }`}
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing Content...
            </>
          ) : (
            `Scrape All URLs (${validUrlCount})`
          )}
        </button>
      </form>

      {/* Clear Catalog Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Rensa hela katalogen?</h3>
            <p className="text-gray-600 mb-4">
              Detta kommer att ta bort <strong>alla fordon och varianter</strong> från databasen.
              Du kan sedan skrapa om sidorna för att få ren data.
            </p>
            <p className="text-red-600 text-sm mb-4">
              OBS: Denna åtgärd kan inte ångras!
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                disabled={clearingCatalog}
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={clearCatalog}
                disabled={clearingCatalog}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors flex items-center"
              >
                {clearingCatalog ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Rensar...
                  </>
                ) : (
                  'Ja, rensa katalogen'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}