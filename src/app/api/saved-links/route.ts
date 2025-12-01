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

// POST - Save a new link with metadata
export async function POST(request: NextRequest) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { url, label, contentType, brand, carType, description } = body

    if (!url || !label || !contentType) {
      return NextResponse.json({ 
        error: 'Missing required fields: url, label, and contentType are required' 
      }, { status: 400 })
    }

    // Validate contentType
    if (!['campaigns', 'cars', 'transport_cars'].includes(contentType)) {
      return NextResponse.json({ 
        error: 'Invalid contentType. Must be campaigns, cars, or transport_cars' 
      }, { status: 400 })
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return NextResponse.json({ 
        error: 'Invalid URL format' 
      }, { status: 400 })
    }

    const scrapeService = new ScrapeService(true)
    
    // Check if link already exists for this user
    const existingLink = await scrapeService.getSavedLinkByUrl(user.id, url)
    if (existingLink) {
      return NextResponse.json({ 
        error: 'This URL has already been saved' 
      }, { status: 409 })
    }

    // Save the link
    const linkId = await scrapeService.saveLinkWithMetadata(
      user.id,
      url,
      label,
      contentType,
      brand || null,
      carType || null,
      description || null
    )

    return NextResponse.json({
      success: true,
      linkId,
      message: 'Link saved successfully'
    })

  } catch (error) {
    console.error('Error saving link:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to save link' 
    }, { status: 500 })
  }
}

// GET - Get user's saved links
export async function GET(request: NextRequest) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const scrapeService = new ScrapeService(true)
    const savedLinks = await scrapeService.getUserSavedLinks(user.id)

    return NextResponse.json({
      success: true,
      links: savedLinks
    })

  } catch (error) {
    console.error('Error fetching saved links:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch saved links' 
    }, { status: 500 })
  }
}

// PUT - Update a saved link
export async function PUT(request: NextRequest) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { linkId, label, brand, carType, description, contentType } = body

    if (!linkId) {
      return NextResponse.json({ 
        error: 'Link ID is required' 
      }, { status: 400 })
    }

    const scrapeService = new ScrapeService(true)
    
    // Verify the link belongs to the user
    const savedLinks = await scrapeService.getUserSavedLinks(user.id)
    const linkExists = savedLinks.some(link => link.id === linkId)
    
    if (!linkExists) {
      return NextResponse.json({ 
        error: 'Link not found or access denied' 
      }, { status: 404 })
    }

    // Update the link
    await scrapeService.updateSavedLink(linkId, {
      label,
      brand,
      carType,
      description,
      contentType
    })

    return NextResponse.json({
      success: true,
      message: 'Link updated successfully'
    })

  } catch (error) {
    console.error('Error updating link:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to update link' 
    }, { status: 500 })
  }
}

// DELETE - Delete a saved link
export async function DELETE(request: NextRequest) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const linkId = searchParams.get('linkId')

    if (!linkId) {
      return NextResponse.json({ 
        error: 'Link ID is required' 
      }, { status: 400 })
    }

    const scrapeService = new ScrapeService(true)
    
    // Verify the link belongs to the user
    const savedLinks = await scrapeService.getUserSavedLinks(user.id)
    const linkExists = savedLinks.some(link => link.id === linkId)
    
    if (!linkExists) {
      return NextResponse.json({ 
        error: 'Link not found or access denied' 
      }, { status: 404 })
    }

    // Delete the link (soft delete)
    await scrapeService.deleteSavedLink(linkId)

    return NextResponse.json({
      success: true,
      message: 'Link deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting link:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to delete link' 
    }, { status: 500 })
  }
}