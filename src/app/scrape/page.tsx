'use client'

import { Suspense } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthProvider';
import ScrapeClient from './ScrapeClient';
import Header from '@/components/Header';

export default function ScrapePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      console.log('🔄 Scrape page: No user, redirecting to login');
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Redirecting to login
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="New Scrape" />
      
      {/* Main content */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">
            Website Scraper
          </h1>
          <Link
            href="/catalog"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
          >
            <span>📚</span> Fordonskatalog
          </Link>
        </div>

        <div className="w-full mx-auto">
          <Suspense fallback={<div>Loading scraper...</div>}>
            <ScrapeClient />
          </Suspense>
        </div>
      </div>
    </div>
  );
}