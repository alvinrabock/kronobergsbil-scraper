/**
 * Quick test script for master database import
 * Run with: node test-master.mjs
 */

import { createClient } from '@supabase/supabase-js';

// Load env
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('🚀 Testing Master Database...\n');

  // 1. Create brand
  console.log('1️⃣ Creating brand: Suzuki');
  const { data: brand, error: brandError } = await client
    .from('master_brands')
    .upsert({ name: 'Suzuki' }, { onConflict: 'name' })
    .select()
    .single();

  if (brandError) {
    console.error('❌ Brand error:', brandError.message);
    return;
  }
  console.log('✅ Brand:', brand.id, brand.name);

  // 2. Create vehicle
  console.log('\n2️⃣ Creating vehicle: eVitara');
  const { data: vehicle, error: vehicleError } = await client
    .from('master_vehicles')
    .upsert({
      brand_id: brand.id,
      name: 'eVitara',
      slug: 'evitara',
      model_year: 2025,
      vehicle_type: 'cars',
      is_active: true,
    }, { onConflict: 'brand_id,name,model_year' })
    .select()
    .single();

  if (vehicleError) {
    console.error('❌ Vehicle error:', vehicleError.message);
    return;
  }
  console.log('✅ Vehicle:', vehicle.id, vehicle.name);

  // 3. Create variant
  console.log('\n3️⃣ Creating variant: eVitara Select 2WD');
  const { data: variant, error: variantError } = await client
    .from('master_variants')
    .upsert({
      vehicle_id: vehicle.id,
      name: 'eVitara Select 2WD',
      trim_level: 'Select',
      motor_type: 'EL',
      motor_key: 'EL_2WD',
      drivlina: '2WD',
      vaxellada: 'Automat',
    }, { onConflict: 'vehicle_id,name,motor_type,drivlina' })
    .select()
    .single();

  if (variantError) {
    console.error('❌ Variant error:', variantError.message);
    return;
  }
  console.log('✅ Variant:', variant.id, variant.name);

  // 4. Create price
  console.log('\n4️⃣ Creating price for variant');
  const { data: price, error: priceError } = await client
    .from('variant_prices')
    .insert({
      variant_id: variant.id,
      pris: 459900,
      privatleasing: 4995,
      is_campaign: false,
      source_url: 'test-script',
    })
    .select()
    .single();

  if (priceError) {
    console.error('❌ Price error:', priceError.message);
    return;
  }
  console.log('✅ Price:', price.id, 'pris:', price.pris, 'leasing:', price.privatleasing);

  // 5. Query the catalog view
  console.log('\n5️⃣ Querying vehicle_catalog view...');
  const { data: catalog, error: catalogError } = await client
    .from('vehicle_catalog')
    .select('*')
    .limit(5);

  if (catalogError) {
    console.error('❌ Catalog error:', catalogError.message);
    return;
  }
  console.log('✅ Catalog entries:', catalog.length);
  if (catalog.length > 0) {
    console.log('   First entry:', JSON.stringify(catalog[0], null, 2));
  }

  console.log('\n🎉 All tests passed!');
}

test().catch(console.error);
