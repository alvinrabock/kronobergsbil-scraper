'use client';

import { useState } from 'react';

// Updated interface to match UrlData from other components
interface UrlData {
  url: string;
  category: string;
  contentType: string;
  label?: string;
}

interface ScrapeFormProps {
  onScrapeMultiple: (urls: UrlData[]) => Promise<void>;
  loading: boolean;
}

interface CategorizedUrl {
  url: string;
  category: 'campaigns' | 'cars' | 'transport_cars';
  contentType: 'campaigns' | 'cars' | 'transport_cars';
  label?: string;
}

export default function ScrapeForm({ onScrapeMultiple, loading }: ScrapeFormProps) {
  const [urlCategories, setUrlCategories] = useState<CategorizedUrl[]>([
    // Predefined Campaign URLs
    { url: 'https://kronobergsbil.bilforetag.se/vaxjo/erbjudanden/', category: 'campaigns', contentType: 'campaigns', label: 'Main Offers' },
    { url: 'https://suzukibilar.se/kopa-suzuki/kampanjer-erbjudanden', category: 'campaigns', contentType: 'campaigns', label: 'Suzuki Campaigns' },
    { url: 'https://www.honda.se/cars/offers0.html', category: 'campaigns', contentType: 'campaigns', label: 'Honda Campaigns' },

    // Predefined Car URLs
    { url: 'https://kronobergsbil.bilforetag.se/vaxjo/personbilar/', category: 'cars', contentType: 'cars', label: 'Personbilar' },
    { url: 'https://suzukibilar.se/modeller', category: 'cars', contentType: 'cars', label: 'Suzuki Models' },
    { url: 'https://www.honda.se/cars.html', category: 'cars', contentType: 'cars', label: 'Honda Models' },

    // Predefined Transport Car URLs
    { url: 'https://kronobergsbil.bilforetag.se/vaxjo/transportbilar/', category: 'transport_cars', contentType: 'transport_cars', label: 'Transportbilar' },

    // Empty field for custom additions
    { url: '', category: 'campaigns', contentType: 'campaigns', label: '' }
  ]);

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
        label: item.label
      }));

    if (validUrls.length > 0) {
      await onScrapeMultiple(validUrls);
    }
  };

  const handleIndividualScrape = async (url: string, category: string, contentType: string, label?: string): Promise<void> => {
    const urlData: UrlData[] = [{ url, category, contentType, label }];
    await onScrapeMultiple(urlData);
  };

  const updateUrlItem = (index: number, field: keyof CategorizedUrl, value: string): void => {
    const newUrlCategories = [...urlCategories];
    newUrlCategories[index] = { ...newUrlCategories[index], [field]: value };
    setUrlCategories(newUrlCategories);
  };

  const addUrlField = (category: 'campaigns' | 'cars' | 'transport_cars' = 'campaigns'): void => {
    setUrlCategories([...urlCategories, { url: '', category, contentType: category, label: '' }]);
  };

  const removeUrlField = (index: number): void => {
    if (urlCategories.length > 1) {
      const newUrlCategories = urlCategories.filter((_, i) => i !== index);
      setUrlCategories(newUrlCategories);
    }
  };

  const clearAllUrls = (): void => {
    setUrlCategories([{ url: '', category: 'campaigns', contentType: 'campaigns', label: '' }]);
  };

  const getFilteredUrls = (): CategorizedUrl[] => {
    return urlCategories;
  };

  const loadPresetUrls = (): void => {
    setUrlCategories([
      // Campaign URLs
      { url: 'https://kronobergsbil.bilforetag.se/vaxjo/erbjudanden/', category: 'campaigns', contentType: 'campaigns', label: 'Main Offers' },
      { url: 'https://suzukibilar.se/kopa-suzuki/kampanjer-erbjudanden', category: 'campaigns', contentType: 'campaigns', label: 'Suzuki Campaigns' },

      // Car URLs
      { url: 'https://kronobergsbil.bilforetag.se/vaxjo/personbilar/', category: 'cars', contentType: 'cars', label: 'Personbilar' },
      { url: 'https://suzukibilar.se/modeller', category: 'cars', contentType: 'cars', label: 'Suzuki Models' },

      // Transport Car URLs
      { url: 'https://kronobergsbil.bilforetag.se/vaxjo/transportbilar/', category: 'transport_cars', contentType: 'transport_cars', label: 'Transportbilar' },

      // Empty field
      { url: '', category: 'campaigns', contentType: 'campaigns', label: '' }
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
                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) => updateUrlItem(item.originalIndex, 'label', e.target.value)}
                            placeholder="Label (optional)"
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={loading}
                          />
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
                          {/* Category Badge */}
                          <span className={`px-2 py-1 text-xs rounded-full ${config.bgColor} ${config.textColor} border ${config.borderColor}`}>
                            {categoryKey.replace('_', ' ')}
                          </span>

                          {/* Individual Scrape Button */}
                          <button
                            type="button"
                            onClick={() => handleIndividualScrape(item.url.trim(), item.category, item.contentType, item.label)}
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
              <button
                type="button"
                onClick={loadPresetUrls}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                disabled={loading}
              >
                Load Preset URLs
              </button>
              <button
                type="button"
                onClick={clearAllUrls}
                className="px-3 py-1 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors"
                disabled={loading}
              >
                Clear All
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
    </div>
  );
}