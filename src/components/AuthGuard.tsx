'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

interface AuthGuardProps {
  children: React.ReactNode
  redirectTo?: string
}

export function AuthGuard({ children, redirectTo = '/login' }: AuthGuardProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      try {
        console.log('🔍 AuthGuard: Checking session...')
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('🚨 AuthGuard: Session error:', error)
        }
        
        console.log('👤 AuthGuard: Session user:', session?.user?.email || 'none')
        setUser(session?.user ?? null)
        setLoading(false)

        if (!session?.user) {
          console.log('🔄 AuthGuard: No user, redirecting to login')
          router.push(redirectTo)
        } else {
          console.log('✅ AuthGuard: User authenticated, showing content')
        }
      } catch (err) {
        console.error('🚨 AuthGuard: Unexpected error:', err)
        setLoading(false)
      }
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('🔄 AuthGuard: Auth state changed:', event, session?.user?.email || 'none')
        setUser(session?.user ?? null)
        setLoading(false)

        if (!session?.user && event === 'SIGNED_OUT') {
          router.push(redirectTo)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router, redirectTo])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // Redirecting to login
  }

  return <>{children}</>
}