/**
 * API Route: POST /api/master/test-import
 *
 * Test endpoint to import sample vehicle data (eVitara + Mokka)
 */

import { NextRequest, NextResponse } from 'next/server';
import { importPDFVehicleData } from '@/lib/master-vehicle-service';
import type { PDFVehicleData } from '@/lib/database/master-types';

// Sample data for Suzuki eVitara
const eVitaraData: PDFVehicleData = {
  meta: {
    pdf_type: 'pricelist',
    brand: 'Suzuki',
    model: 'eVitara',
    model_year: 2025,
    giltig_fran: '2024-10-01',
    pdf_url: 'https://suzukibilar.se/prislista-evitara',
  },
  dimensioner: {
    langd_mm: 4275,
    bredd_mm: 1800,
    hojd_mm: 1635,
    axelavstand_mm: 2700,
    bagageutrymme_liter: 390,
    bagageutrymme_max_liter: 1130,
  },
  motor_specs: {
    EL_2WD: {
      motor_type: 'EL',
      effekt_kw: 128,
      effekt_hk: 174,
      batterikapacitet_kwh: 61,
      rackvidd_km: 400,
      acceleration_0_100: 8.0,
      toppfart: 160,
      forbrukning: '15.2 kWh/100km',
      co2_utslapp: 0,
      vaxellada: 'Automat',
    },
    EL_AWD: {
      motor_type: 'EL',
      effekt_kw: 135,
      effekt_hk: 184,
      systemeffekt_kw: 182,
      systemeffekt_hk: 248,
      batterikapacitet_kwh: 61,
      rackvidd_km: 370,
      acceleration_0_100: 6.8,
      toppfart: 160,
      forbrukning: '16.5 kWh/100km',
      co2_utslapp: 0,
      vaxellada: 'Automat',
    },
  },
  garanti: {
    nybilsgaranti: '5 år / 100 000 km',
    vagassistans: '5 år',
    rostgaranti: '12 år',
    batterigaranti: '8 år / 160 000 km',
  },
  variants: [
    {
      name: 'eVitara Select 2WD',
      trim: 'Select',
      motor: 'EL_2WD',
      drivlina: '2WD',
      pris: 459900,
      privatleasing: 4995,
    },
    {
      name: 'eVitara Select AWD',
      trim: 'Select',
      motor: 'EL_AWD',
      drivlina: 'AWD',
      pris: 489900,
      privatleasing: 5295,
    },
    {
      name: 'eVitara Exclusive 2WD',
      trim: 'Exclusive',
      motor: 'EL_2WD',
      drivlina: '2WD',
      pris: 499900,
      privatleasing: 5495,
    },
    {
      name: 'eVitara Exclusive AWD',
      trim: 'Exclusive',
      motor: 'EL_AWD',
      drivlina: 'AWD',
      pris: 529900,
      privatleasing: 5795,
    },
  ],
};

// Sample data for Opel Mokka
const mokkaData: PDFVehicleData = {
  meta: {
    pdf_type: 'combined',
    brand: 'Opel',
    model: 'Mokka',
    model_year: 2025,
    pdf_url: 'https://opel.se/mokka-prislista',
  },
  dimensioner: {
    langd_mm: 4151,
    bredd_mm: 1791,
    hojd_mm: 1534,
    axelavstand_mm: 2557,
    bagageutrymme_liter: 350,
    bagageutrymme_max_liter: 1060,
  },
  motor_specs: {
    EL: {
      motor_type: 'EL',
      effekt_kw: 115,
      effekt_hk: 156,
      batterikapacitet_kwh: 54,
      rackvidd_km: 338,
      acceleration_0_100: 9.0,
      toppfart: 150,
      forbrukning: '16.0 kWh/100km',
      co2_utslapp: 0,
      vaxellada: 'Automat',
    },
    HYBRID: {
      motor_type: 'HYBRID',
      effekt_kw: 100,
      effekt_hk: 136,
      acceleration_0_100: 9.2,
      toppfart: 198,
      forbrukning: '4.8 l/100km',
      co2_utslapp: 109,
      vaxellada: 'Automat',
      antal_vaxlar: 6,
    },
    BENSIN: {
      motor_type: 'BENSIN',
      effekt_kw: 96,
      effekt_hk: 130,
      acceleration_0_100: 9.8,
      toppfart: 198,
      forbrukning: '5.9 l/100km',
      co2_utslapp: 134,
      vaxellada: 'Automat',
      antal_vaxlar: 8,
    },
  },
  utrustning: [
    { name: 'LED-strålkastare', category: 'Exteriör', standard_for: ['MOKKA', 'GS'] },
    { name: 'Parkeringssensorer bak', category: 'Säkerhet', standard_for: ['MOKKA', 'GS'] },
    { name: 'Pure Panel', category: 'Interiör', standard_for: ['GS'] },
    { name: 'Adaptiv farthållare', category: 'Säkerhet', standard_for: ['GS'], tillval_for: ['MOKKA'] },
    { name: 'Panoramatak', category: 'Komfort', tillval_for: ['MOKKA', 'GS'], tillval_pris: 15900 },
  ],
  tillval_farger: [
    { name: 'Hakuba White', color_type: 'solid', pris: 0, is_standard: true },
    { name: 'Quartz Grey', color_type: 'metallic', pris: 8900 },
    { name: 'Power Blue', color_type: 'metallic', pris: 8900 },
    { name: 'Vulkan Red', color_type: 'metallic', pris: 8900 },
  ],
  garanti: {
    nybilsgaranti: '8 år / 160 000 km',
    vagassistans: '8 år',
    rostgaranti: '12 år',
    batterigaranti: '8 år / 160 000 km',
  },
  variants: [
    {
      name: 'Mokka Electric',
      trim: 'MOKKA',
      motor: 'EL',
      pris: 399900,
      privatleasing: 4295,
    },
    {
      name: 'Mokka GS Electric',
      trim: 'GS',
      motor: 'EL',
      pris: 449900,
      privatleasing: 4795,
    },
    {
      name: 'Mokka Hybrid',
      trim: 'MOKKA',
      motor: 'HYBRID',
      pris: 349900,
      privatleasing: 3795,
    },
    {
      name: 'Mokka GS Hybrid',
      trim: 'GS',
      motor: 'HYBRID',
      pris: 399900,
      privatleasing: 4295,
    },
  ],
};

export async function POST(request: NextRequest) {
  try {
    const results = [];

    // Import eVitara
    console.log('📥 Importing Suzuki eVitara...');
    const eVitaraResult = await importPDFVehicleData(eVitaraData);
    results.push({
      vehicle: 'Suzuki eVitara',
      ...eVitaraResult,
    });

    // Import Mokka
    console.log('📥 Importing Opel Mokka...');
    const mokkaResult = await importPDFVehicleData(mokkaData);
    results.push({
      vehicle: 'Opel Mokka',
      ...mokkaResult,
    });

    const allSuccess = results.every((r) => r.success);
    const totalVariants = results.reduce((sum, r) => sum + r.variantsCreated, 0);
    const totalPrices = results.reduce((sum, r) => sum + r.pricesUpdated, 0);

    return NextResponse.json({
      success: allSuccess,
      message: `Imported ${results.length} vehicles`,
      summary: {
        vehiclesImported: results.length,
        totalVariants,
        totalPrices,
      },
      results,
    });
  } catch (error) {
    console.error('Test import error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Test import failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/master/test-import',
    method: 'POST',
    description: 'Test endpoint to import sample vehicle data (Suzuki eVitara + Opel Mokka)',
    usage: 'Send a POST request to import test data',
  });
}
