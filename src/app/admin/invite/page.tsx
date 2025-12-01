'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Image from 'next/image'
import Header from '@/components/Header'

export default function AdminInvitePage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviting(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(`Invitation sent successfully to ${email}`)
        setEmail('')
      } else {
        setError(data.error || 'Failed to send invitation')
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setInviting(false)
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
    <div className="container mx-auto px-4 py-4">
      <Header />
      
      <div className="max-w-md mx-auto mt-8">
        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-2xl font-bold text-center mb-6">
            Invite New User
          </h2>
          
          <form onSubmit={handleInvite} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md">
                {error}
              </div>
            )}
            {message && (
              <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md">
                {message}
              </div>
            )}
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter email address to invite"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <button
              type="submit"
              disabled={inviting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md disabled:opacity-50"
            >
              {inviting ? 'Sending Invitation...' : 'Send Invitation'}
            </button>
          </form>
          
          <div className="mt-6 p-4 bg-gray-50 rounded-md">
            <h3 className="text-sm font-medium text-gray-900 mb-2">Instructions:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Enter the email address of the user you want to invite</li>
              <li>• They will receive an email with a link to set up their account</li>
              <li>• The link will expire in 24 hours</li>
              <li>• Only invited users can access the scraper tool</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}