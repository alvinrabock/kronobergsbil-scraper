'use client'

import { useState, useEffect } from 'react'

interface SavedLink {
  id: string
  url: string
  label: string
  content_type: 'campaigns' | 'cars' | 'transport_cars'
  brand: string | null
  car_type: string | null
  description: string | null
  created_at: string
  updated_at: string
  last_scraped: string | null
  scrape_count: number
  is_active: boolean
  total_cost_usd: number | null
  avg_cost_per_scrape: number | null
  last_scrape_cost: number | null
}

interface SavedLinksManagerProps {
  onScrapeLink: (url: string, contentType: string, label: string, brand?: string, carType?: string) => Promise<void>
}

export default function SavedLinksManager({ onScrapeLink }: SavedLinksManagerProps) {
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingLink, setEditingLink] = useState<string | null>(null)
  const [loadingScrape, setLoadingScrape] = useState<string | null>(null)

  const categoryConfig = {
    campaigns: {
      name: 'Campaigns',
      color: 'purple',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-800',
      icon: '📢'
    },
    cars: {
      name: 'Cars',
      color: 'blue',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-800',
      icon: '🚗'
    },
    transport_cars: {
      name: 'Transport',
      color: 'green',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      textColor: 'text-green-800',
      icon: '🚛'
    }
  }

  useEffect(() => {
    loadSavedLinks()
  }, [])

  const loadSavedLinks = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/saved-links')
      const data = await response.json()

      if (data.success) {
        setSavedLinks(data.links)
        setError(null)
        
        // If no links exist, try to initialize defaults
        if (data.links.length === 0) {
          try {
            await fetch('/api/saved-links/initialize-defaults', { method: 'POST' })
            // Reload after initialization
            const retryResponse = await fetch('/api/saved-links')
            const retryData = await retryResponse.json()
            if (retryData.success) {
              setSavedLinks(retryData.links)
            }
          } catch (initError) {
            console.warn('Failed to initialize default links:', initError)
          }
        }
      } else {
        setError('Failed to load saved links')
      }
    } catch (error) {
      console.error('Error loading saved links:', error)
      setError('Failed to load saved links')
    } finally {
      setLoading(false)
    }
  }

  const handleScrapeLink = async (link: SavedLink) => {
    try {
      setLoadingScrape(link.id)
      await onScrapeLink(
        link.url, 
        link.content_type, 
        link.label,
        link.brand || undefined,
        link.car_type || undefined
      )
    } catch (error) {
      console.error('Error scraping link:', error)
    } finally {
      setLoadingScrape(null)
    }
  }

  const handleDeleteLink = async (linkId: string) => {
    if (!confirm('Are you sure you want to delete this saved link?')) {
      return
    }

    try {
      const response = await fetch(`/api/saved-links?linkId=${linkId}`, {
        method: 'DELETE'
      })
      const data = await response.json()

      if (data.success) {
        await loadSavedLinks() // Reload the list
      } else {
        alert('Failed to delete link: ' + data.error)
      }
    } catch (error) {
      console.error('Error deleting link:', error)
      alert('Error deleting link')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatCost = (costUsd: number | null) => {
    if (!costUsd || costUsd === 0) return '$0.000'
    if (costUsd < 0.001) {
      return `$${(costUsd * 1000).toFixed(3)}k` // Show in thousandths
    }
    return `$${costUsd.toFixed(4)}`
  }

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-lg font-semibold mb-4">Saved Links</h3>
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Saved Links ({savedLinks.length})</h3>
        <button
          onClick={loadSavedLinks}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {savedLinks.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No saved links yet.</p>
          <p className="text-sm mt-1">Use the save button (💾) in the form above to save links.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {savedLinks.map((link) => {
            const config = categoryConfig[link.content_type]
            
            return (
              <div key={link.id} className={`border rounded-lg p-3 ${config.bgColor} ${config.borderColor}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-lg">{config.icon}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
                        {config.name}
                      </span>
                      {link.brand && (
                        <span className="px-2 py-0.5 rounded bg-white text-xs text-gray-600 border">
                          {link.brand}
                        </span>
                      )}
                      {link.car_type && (
                        <span className="px-2 py-0.5 rounded bg-white text-xs text-gray-600 border">
                          {link.car_type}
                        </span>
                      )}
                    </div>
                    
                    <h4 className="font-medium text-gray-900 mb-1">{link.label}</h4>
                    
                    {link.description && (
                      <p className="text-sm text-gray-600 mb-1">{link.description}</p>
                    )}
                    
                    <p className="text-xs text-gray-500 truncate mb-2">{link.url}</p>
                    
                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>Added: {formatDate(link.created_at)}</span>
                      {link.last_scraped && (
                        <span>Last scraped: {formatDate(link.last_scraped)}</span>
                      )}
                      <span>Scraped {link.scrape_count} times</span>
                      {link.total_cost_usd && link.total_cost_usd > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-green-600 font-medium">Total cost: {formatCost(link.total_cost_usd)}</span>
                        </>
                      )}
                      {link.avg_cost_per_scrape && link.avg_cost_per_scrape > 0 && (
                        <>
                          <span>•</span>
                          <span>Avg: {formatCost(link.avg_cost_per_scrape)}</span>
                        </>
                      )}
                      {link.last_scrape_cost && link.last_scrape_cost > 0 && (
                        <>
                          <span>•</span>
                          <span>Last: {formatCost(link.last_scrape_cost)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleScrapeLink(link)}
                      disabled={loadingScrape === link.id}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        loadingScrape === link.id
                          ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {loadingScrape === link.id ? (
                        <div className="flex items-center space-x-1">
                          <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                          <span>Wait</span>
                        </div>
                      ) : (
                        'Scrape'
                      )}
                    </button>
                    
                    <button
                      onClick={() => handleDeleteLink(link.id)}
                      className="px-2 py-1 text-red-600 hover:bg-red-100 rounded transition-colors text-sm"
                      title="Delete link"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}