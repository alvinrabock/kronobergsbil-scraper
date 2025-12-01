'use client'

import { useAuth } from '@/lib/auth/AuthProvider'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Link from 'next/link'

interface ScrapeSession {
  id: string
  url: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  completed_at: string | null
  page_title: string | null
  content_type: 'campaigns' | 'cars' | 'transport_cars' | null
  total_items: number
  success_items: number
  failed_items: number
  error_message: string | null
}

export default function HistoryPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [sessions, setSessions] = useState<ScrapeSession[]>([])
  const [loadingSessions, setLoadingSessions] = useState(true)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      fetchSessions()
    }
  }, [user])

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/scrape')
      const data = await response.json()
      
      if (data.success) {
        // Filter out sessions with invalid URLs to prevent URL construction errors
        const validSessions = data.sessions.filter((session: ScrapeSession) => {
          try {
            if (session.url && session.url !== 'undefined' && session.url !== 'null') {
              new URL(session.url) // Test if URL is valid
              return true
            }
            return false
          } catch {
            console.warn('Invalid URL found in session:', session.id, session.url)
            return false
          }
        })
        setSessions(validSessions)
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setLoadingSessions(false)
    }
  }


  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      completed: 'bg-green-100 text-green-800',
      processing: 'bg-blue-100 text-blue-800',
      pending: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800'
    }
    return colors[status as keyof typeof colors] || colors.pending
  }

  const getContentTypeIcon = (contentType: string | null) => {
    switch (contentType) {
      case 'campaigns':
        return '📢'
      case 'cars':
        return '🚗'
      case 'transport_cars':
        return '🚛'
      default:
        return '📄'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Scrape History" />
      
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center mb-8">
          Scrape History
        </h1>

        {loadingSessions ? (
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto">
          {/* Sessions List */}
          <div>
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b">
                <h2 className="text-lg font-semibold text-gray-900">
                  Recent Scrapes ({sessions.length})
                </h2>
              </div>
              
              {sessions.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No scrapes yet. <Link href="/scrape" className="text-blue-600 hover:text-blue-500">Start scraping</Link> to see results here.
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {sessions.map((session) => (
                    <Link
                      key={session.id}
                      href={`/scrape/${session.id}`}
                      className={`block p-4 hover:bg-gray-50 transition-colors`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-lg">
                              {getContentTypeIcon(session.content_type)}
                            </span>
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(
                                session.status
                              )}`}
                            >
                              {session.status}
                            </span>
                            {session.content_type && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                {session.content_type.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm font-medium text-gray-900 truncate mb-1">
                            {session.page_title || 'Untitled'}
                          </p>
                          
                          <p className="text-xs text-gray-500 truncate mb-2">
                            {session.url}
                          </p>
                          
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span>{formatDate(session.created_at)}</span>
                            {session.total_items > 0 && (
                              <span>
                                {session.success_items}/{session.total_items} items
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex-shrink-0 ml-4">
                          <svg
                            className="h-5 w-5 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </div>
                      
                      {session.error_message && (
                        <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                          {session.error_message}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}