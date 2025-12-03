'use client'

import { useAuth } from '@/lib/auth/AuthProvider'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Image from "next/image"
import Link from "next/link"

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.push('/scrape')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (user) {
    return null // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="mb-8">
          <Image
            src="/Kronobergsbil-ai.svg"
            alt="Kronobergsbil AI"
            width={300}
            height={150}
            className="mx-auto"
            priority
          />
        </div>
        
        <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
          Website Scraper
        </h1>
        
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Advanced web scraping with AI-powered data processing. Extract vehicle information, campaigns, and structured data from any website.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200"
          >
            Sign In
          </Link>
        </div>
        
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Access is by invitation only. Please contact your administrator if you need access.
          </p>
        </div>
        
        <div className="mt-16 grid md:grid-cols-3 gap-8 text-left">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-2xl mb-3">🕷️</div>
            <h3 className="text-lg font-semibold mb-2">Smart Scraping</h3>
            <p className="text-gray-600">
              Advanced web scraping with Puppeteer, handling dynamic content and following links automatically.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-2xl mb-3">🧠</div>
            <h3 className="text-lg font-semibold mb-2">AI Processing</h3>
            <p className="text-gray-600">
              Claude AI-powered data extraction and structuring for campaigns, vehicles, and pricing information.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-2xl mb-3">💾</div>
            <h3 className="text-lg font-semibold mb-2">Secure Storage</h3>
            <p className="text-gray-600">
              All scraped data is securely stored with user authentication and session tracking.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
