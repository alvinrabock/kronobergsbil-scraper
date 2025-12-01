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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId } = await params
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    const scrapeService = new ScrapeService(true)
    const sessionDetails = await scrapeService.getSessionDetails(sessionId)

    // Verify the session belongs to the user (including anonymous sessions)
    if (!sessionDetails.session || sessionDetails.session.user_id !== user.id) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      ...sessionDetails
    })

  } catch (error) {
    console.error('Get session details error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}