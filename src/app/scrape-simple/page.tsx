'use client'

import { useState } from 'react'

interface ScrapeResult {
  success: boolean
  scrapeResult?: any
  aiResult?: any
  error?: string
  stats?: {
    processingTimeMs: number
    contentLength: number
    structuredDataCount: number
    linkedContentCount: number
  }
}

export default function SimpleScrape() {
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState('cars')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScrapeResult | null>(null)

  const handleScrape = async () => {
    if (!url.trim()) return

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/scrape/simple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: url.trim(),
          category,
          depth: 1
        })
      })

      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Simple Web Scraper</h1>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                URL to scrape
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              >
                <option value="cars">Cars</option>
                <option value="campaigns">Campaigns</option>
                <option value="transport_cars">Transport Cars</option>
              </select>
            </div>

            <button
              onClick={handleScrape}
              disabled={loading || !url.trim()}
              className={`w-full py-2 px-4 rounded-md font-medium ${
                loading || !url.trim()
                  ? 'bg-gray-400 cursor-not-allowed text-gray-600'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {loading ? 'Scraping...' : 'Scrape Website'}
            </button>
          </div>
        </div>

        {result && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Results</h2>
            
            {result.success ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-3 rounded">
                    <div className="text-sm text-gray-600">Processing Time</div>
                    <div className="font-semibold">{result.stats?.processingTimeMs}ms</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded">
                    <div className="text-sm text-gray-600">Content Length</div>
                    <div className="font-semibold">{result.stats?.contentLength}</div>
                  </div>
                  <div className="bg-yellow-50 p-3 rounded">
                    <div className="text-sm text-gray-600">Structured Items</div>
                    <div className="font-semibold">{result.stats?.structuredDataCount}</div>
                  </div>
                  <div className="bg-purple-50 p-3 rounded">
                    <div className="text-sm text-gray-600">Linked Pages</div>
                    <div className="font-semibold">{result.stats?.linkedContentCount}</div>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Scrape Result</h3>
                  <div className="bg-gray-50 p-4 rounded text-sm">
                    <div><strong>URL:</strong> {result.scrapeResult?.url}</div>
                    <div><strong>Title:</strong> {result.scrapeResult?.pageInfo?.title || 'No title'}</div>
                    <div><strong>Success:</strong> {result.scrapeResult?.success ? '✅' : '❌'}</div>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-2">AI Processing Result</h3>
                  <div className="bg-gray-50 p-4 rounded text-sm">
                    <div><strong>Content Type:</strong> {result.aiResult?.content_type}</div>
                    <div><strong>Success:</strong> {result.aiResult?.success ? '✅' : '❌'}</div>
                    <div><strong>Items Found:</strong> {result.aiResult?.data?.length || 0}</div>
                  </div>
                </div>

                {result.scrapeResult?.cleanedHtml && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Cleaned HTML Preview</h3>
                    <div className="bg-gray-50 p-4 rounded text-sm max-h-64 overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-xs">
                        {result.scrapeResult.cleanedHtml.substring(0, 1000)}
                        {result.scrapeResult.cleanedHtml.length > 1000 && '...'}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded p-4">
                <div className="text-red-800 font-medium">Error</div>
                <div className="text-red-600 text-sm mt-1">{result.error}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}