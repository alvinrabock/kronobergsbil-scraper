'use client'

import { useAuth } from '@/lib/auth/AuthProvider'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'

interface NavigationHeaderProps {
  title?: string
  showBackButton?: boolean
  backHref?: string
}

export default function Header({ title, showBackButton, backHref }: NavigationHeaderProps = {}) {
  const { user, signOut, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (path: string) => pathname === path || pathname.startsWith(path)

  if (loading) {
    return (
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-48"></div>
              </div>
            </div>
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-32"></div>
            </div>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
            {showBackButton && (
              <Link
                href={backHref || '/scrape'}
                className="inline-flex items-center p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            )}
            
            <Link href="/scrape" className="flex items-center space-x-2">
              <Image
                src="/Kronobergsbil-ai.svg"
                alt="Kronobergsbil AI"
                width={40}
                height={40}
                className="w-10 h-10"
              />
              <h1 className="text-xl font-bold text-gray-900">
                {title || 'Kronobergsbil Scraper'}
              </h1>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            {user && (
              <>
                {/* Navigation Links */}
                <nav className="hidden md:flex items-center space-x-1">
                  <Link
                    href="/scrape"
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive('/scrape') && !pathname.includes('/history')
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    New Scrape
                  </Link>
                  <Link
                    href="/history"
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive('/history')
                        ? 'bg-green-100 text-green-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    History
                  </Link>
                </nav>

                {/* User Menu */}
                <div className="relative">
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  >
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                      {user.email?.[0]?.toUpperCase()}
                    </div>
                    <span className="hidden sm:block truncate max-w-32">
                      {user.email}
                    </span>
                    <svg className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                      <div className="py-1">
                        <div className="px-4 py-2 text-sm text-gray-700 border-b">
                          <div className="font-medium">Account</div>
                          <div className="text-xs text-gray-500 truncate">{user.email}</div>
                        </div>
                        
                        <Link
                          href="/admin/invite"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                          onClick={() => setIsDropdownOpen(false)}
                        >
                          Invite Users
                        </Link>
                        
                        <button
                          onClick={handleSignOut}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mobile Navigation */}
                <div className="md:hidden flex items-center space-x-2">
                  <Link
                    href="/scrape"
                    className={`p-2 rounded-md text-sm font-medium transition-colors ${
                      isActive('/scrape') && !pathname.includes('/history')
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </Link>
                  <Link
                    href="/history"
                    className={`p-2 rounded-md text-sm font-medium transition-colors ${
                      isActive('/history')
                        ? 'bg-green-100 text-green-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Dropdown backdrop */}
      {isDropdownOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsDropdownOpen(false)}
        />
      )}
    </header>
  )
}