/**
 * API Route: GET /api/master/status
 *
 * Diagnostic endpoint to check master database status and table availability
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({
      success: false,
      error: 'Missing Supabase credentials',
      config: {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey,
      },
    });
  }

  // Use the same server client pattern as the rest of the app
  const cookieStore = await cookies();
  const client = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
  const tableStatus: Record<string, { exists: boolean; count?: number; error?: string }> = {};

  // List of master tables to check
  const tables = [
    'master_brands',
    'master_vehicles',
    'master_variants',
    'master_motor_specs',
    'master_dimensions',
    'master_equipment',
    'master_colors',
    'master_wheels',
    'master_interiors',
    'master_packages',
    'master_warranty',
    'variant_prices',
    'price_history',
  ];

  for (const table of tables) {
    try {
      const { data, error, count } = await client
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        tableStatus[table] = {
          exists: false,
          error: error.message,
        };
      } else {
        tableStatus[table] = {
          exists: true,
          count: count || 0,
        };
      }
    } catch (err) {
      tableStatus[table] = {
        exists: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  // Check if any tables exist
  const existingTables = Object.entries(tableStatus).filter(([, v]) => v.exists);
  const missingTables = Object.entries(tableStatus).filter(([, v]) => !v.exists);

  return NextResponse.json({
    success: true,
    config: {
      supabaseUrl,
      keyType: 'anon (server client with cookies)',
    },
    summary: {
      totalTables: tables.length,
      existingTables: existingTables.length,
      missingTables: missingTables.length,
      migrationRequired: missingTables.length > 0,
    },
    tables: tableStatus,
    migrationFile: 'migrations/005_master_vehicle_database.sql',
    instructions: missingTables.length > 0
      ? 'Run the SQL migration file in your Supabase dashboard to create the required tables.'
      : 'All tables exist. You can import test data using POST /api/master/test-import',
  });
}
