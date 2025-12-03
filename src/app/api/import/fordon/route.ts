// app/api/import/fordon/route.ts - Updated to use new CMS API
import { NextRequest, NextResponse } from 'next/server';
import {
  createMultipleBilmodellerInCMS,
  transformVehicleDataToCMS,
  createBilmodellInCMS,
  getExistingBilmodeller,
  findMatchingBilmodell,
  updateBilmodellInCMS,
  type BatchCreateResult
} from '@/lib/cms-api';

// Helper function to calculate string similarity using Levenshtein distance
function calculateStringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

// Process a single vehicle
async function processSingleVehicle(vehicleData: any, existingPosts: any[]) {
  try {
    console.log(`\n🔍 Processing vehicle: "${vehicleData.title}"`);

    // Transform to CMS format
    const cmsData = await transformVehicleDataToCMS(vehicleData);

    // Check for existing post
    const existingPost = findMatchingBilmodell(vehicleData.title, existingPosts);

    if (existingPost) {
      // Update existing
      console.log(`🔄 Updating existing post: ${existingPost.id}`);
      const response = await updateBilmodellInCMS(existingPost.id, cmsData);

      return {
        success: true,
        id: response.post.id,
        action: 'updated' as const,
        message: `Updated "${vehicleData.title}"`
      };
    } else {
      // Create new
      console.log(`➕ Creating new post: "${vehicleData.title}"`);
      const response = await createBilmodellInCMS(cmsData);

      return {
        success: true,
        id: response.post.id,
        action: 'created' as const,
        message: `Created "${vehicleData.title}"`
      };
    }
  } catch (error) {
    console.error(`❌ Error processing ${vehicleData?.title}:`, error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log(`📨 POST received`);

    // Get existing posts for deduplication
    let existingPosts;
    try {
      existingPosts = await getExistingBilmodeller();
    } catch (error) {
      console.error('❌ Failed to fetch existing posts:', error);
      existingPosts = [];
    }

    console.log(`📊 Found ${existingPosts.length} existing bilmodeller`);

    // Handle batch processing
    if (body.type === 'fordon' && body.items && Array.isArray(body.items)) {
      console.log(`🚀 Batch processing: ${body.items.length} items`);
      console.log('📋 Incoming titles:');
      body.items.forEach((item: any, index: number) => {
        console.log(`  ${index + 1}. "${item.title}"`);
      });

      const results: BatchCreateResult['results'] = [];
      let created = 0;
      let updated = 0;
      let failed = 0;

      for (const [index, item] of body.items.entries()) {
        try {
          console.log(`\n--- Item ${index + 1}/${body.items.length}: "${item.title}" ---`);
          const result = await processSingleVehicle(item, existingPosts);

          results.push({
            title: item.title,
            success: true,
            action: result.action,
            id: result.id
          });

          if (result.action === 'created') {
            created++;
            // Add to existing posts to prevent duplicates in same batch
            existingPosts.push({ id: result.id, title: item.title, slug: '' });
          } else {
            updated++;
          }

          console.log(`✅ Item ${index + 1} ${result.action.toUpperCase()} - Totals: ${created} created, ${updated} updated, ${failed} failed`);

        } catch (error) {
          console.error(`❌ Item ${index + 1} FAILED:`, error);
          results.push({
            title: item.title || 'Unknown',
            success: false,
            action: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          failed++;
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('\n' + '='.repeat(60));
      console.log('📊 FINAL BATCH RESULTS');
      console.log('='.repeat(60));
      console.log(`✅ Created: ${created}/${body.items.length}`);
      console.log(`🔄 Updated: ${updated}/${body.items.length}`);
      console.log(`❌ Failed: ${failed}/${body.items.length}`);
      console.log(`📈 Success Rate: ${Math.round(((created + updated) / body.items.length) * 100)}%`);
      console.log('='.repeat(60));

      return NextResponse.json({
        success: failed === 0,
        created,
        updated,
        failed,
        total: body.items.length,
        results,
        summary: {
          created,
          updated,
          failed,
          duplicatesFound: updated,
          newItemsCreated: created
        }
      });

    } else {
      // Single item processing
      console.log(`🚗 Individual processing: ${body.title}`);
      const result = await processSingleVehicle(body, existingPosts);
      return NextResponse.json(result, { status: result.action === 'created' ? 201 : 200 });
    }

  } catch (error) {
    console.error('❌ POST Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const existingPosts = await getExistingBilmodeller();

    return NextResponse.json({
      success: true,
      vehicles: existingPosts,
      count: existingPosts.length
    });

  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
