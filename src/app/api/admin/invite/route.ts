import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseServer } from '@/lib/supabase/server'

async function getUser() {
  const cookieStore = await cookies()
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // For now, any authenticated user can invite others
    // You can add additional admin role checking here if needed
    // Example: Check if user has admin role in database

    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // Use the service role client to invite users
    const { data, error } = await supabaseServer.auth.admin.inviteUserByEmail(email, {
      data: {
        invited_by: user.id,
        invited_at: new Date().toISOString()
      },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login`
    })

    if (error) {
      console.error('Invitation error:', error)
      return NextResponse.json({ 
        error: error.message || 'Failed to send invitation' 
      }, { status: 400 })
    }

    console.log(`✅ Invitation sent to ${email} by ${user.email}`)

    return NextResponse.json({
      success: true,
      message: 'Invitation sent successfully',
      user: data.user
    })

  } catch (error) {
    console.error('Admin invite API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Get list of pending invitations (optional)
export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // You could implement a system to track invitations if needed
    // For now, just return success
    return NextResponse.json({
      success: true,
      invitations: []
    })

  } catch (error) {
    console.error('Get invitations error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}