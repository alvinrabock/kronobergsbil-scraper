/**
 * URL Registry API
 * Manages URL-brand mappings in the database
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Ignore - called from Server Component
        }
      },
    },
  });
}

// GET: Fetch all registered URLs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get('brand');
    const contentType = searchParams.get('content_type');

    const client = await getSupabaseClient();

    let query = client
      .from('url_brand_registry')
      .select('*')
      .eq('is_active', true)
      .order('brand')
      .order('content_type');

    if (brand) {
      query = query.eq('brand', brand);
    }

    if (contentType) {
      query = query.eq('content_type', contentType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching URL registry:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error('Error in GET /api/url-registry:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Save URLs to registry (bulk upsert)
export async function POST(request: NextRequest) {
  try {
    const client = await getSupabaseClient();

    // Check authentication
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { urls } = body;

    if (!urls || !Array.isArray(urls)) {
      return NextResponse.json(
        { error: 'urls array is required' },
        { status: 400 }
      );
    }

    // Filter valid URLs
    const validUrls = urls.filter(
      (item: any) =>
        item.url &&
        item.url.trim().startsWith('http') &&
        item.brand &&
        item.brand.trim().length > 0
    );

    if (validUrls.length === 0) {
      return NextResponse.json(
        { error: 'No valid URLs with brands to save' },
        { status: 400 }
      );
    }

    // Handle multiple brands per URL (comma-separated)
    const expandedUrls: any[] = [];
    for (const item of validUrls) {
      const brands = item.brand.split(',').map((b: string) => b.trim()).filter(Boolean);
      for (const brand of brands) {
        expandedUrls.push({
          url: item.url.trim(),
          brand,
          content_type: item.contentType || item.content_type || 'cars',
          label: item.label || null,
          model_name: item.model_name || null,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Upsert each URL-brand combination
    const results = [];
    const errors = [];

    for (const urlData of expandedUrls) {
      const { data, error } = await client
        .from('url_brand_registry')
        .upsert(urlData, {
          onConflict: 'url,brand',
          ignoreDuplicates: false,
        })
        .select('id, url, brand')
        .single();

      if (error) {
        errors.push({ url: urlData.url, brand: urlData.brand, error: error.message });
      } else {
        results.push(data);
      }
    }

    return NextResponse.json({
      success: true,
      saved: results.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Saved ${results.length} URL-brand mappings`,
    });
  } catch (error) {
    console.error('Error in POST /api/url-registry:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Remove a URL from registry
export async function DELETE(request: NextRequest) {
  try {
    const client = await getSupabaseClient();

    // Check authentication
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Soft delete by setting is_active to false
    const { error } = await client
      .from('url_brand_registry')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error deleting URL:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'URL removed from registry',
    });
  } catch (error) {
    console.error('Error in DELETE /api/url-registry:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
