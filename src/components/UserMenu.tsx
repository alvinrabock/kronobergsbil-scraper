'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthProvider'

export function UserMenu() {
  const { user, signOut } = useAuth()
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    setLoading(true)
    try {
      await signOut()
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Error signing out:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <div className="flex items-center space-x-4 text-sm">
      <span className="text-gray-600">
        {user.email}
      </span>
      <button
        onClick={handleLogout}
        disabled={loading}
        className="text-red-600 hover:text-red-800 transition-colors disabled:opacity-50"
      >
        {loading ? 'Signing out...' : 'Sign out'}
      </button>
    </div>
  )
}