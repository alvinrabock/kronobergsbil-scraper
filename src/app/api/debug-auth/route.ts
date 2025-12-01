import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    
    console.log('=== DEBUG AUTH ===')
    console.log('Cookies received:', cookieStore.getAll().map(c => `${c.name}=...`))
    
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

    const { data: { user }, error } = await supabase.auth.getUser()
    
    console.log('User:', user ? { id: user.id, email: user.email } : null)
    console.log('Error:', error)
    console.log('=================')

    return NextResponse.json({
      authenticated: !!user,
      user: user ? { id: user.id, email: user.email } : null,
      error: error?.message,
      cookieCount: cookieStore.getAll().length
    })

  } catch (error) {
    console.error('Auth debug error:', error)
    return NextResponse.json({
      authenticated: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}