import { NextRequest, NextResponse } from 'next/server'
import { ScrapeService } from '@/lib/database/scrapeService'
import { getSupabaseServer } from '@/lib/supabase/server'

async function getUser() {
  try {
    const supabase = await getSupabaseServer()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) {
      console.log('🚨 Supabase auth error:', error.message)
      return null
    }
    
    return user
  } catch (error) {
    console.error('🚨 Authentication error:', error)
    return null
  }
}

// POST - Initialize default links for the current user
export async function POST(request: NextRequest) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const scrapeService = new ScrapeService(true)
    await scrapeService.initializeDefaultLinksForUser(user.id)

    return NextResponse.json({
      success: true,
      message: 'Default links initialized successfully'
    })

  } catch (error) {
    console.error('Error initializing default links:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to initialize default links' 
    }, { status: 500 })
  }
}