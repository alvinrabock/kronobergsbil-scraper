import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    
    console.log('🔍 Auth Test - Available cookies:', allCookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`).join(', '))
    
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

    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    return NextResponse.json({
      hasCookies: allCookies.length > 0,
      cookieNames: allCookies.map(c => c.name),
      hasSession: !!session,
      hasUser: !!user,
      userId: user?.id,
      sessionError: sessionError?.message,
      userError: userError?.message,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
    })

  } catch (error) {
    console.error('Auth test error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}