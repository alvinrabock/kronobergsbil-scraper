/**
 * API Route: POST /api/master/import
 *
 * Import vehicle data from PDF extraction (Google Document AI)
 * into the master vehicle database.
 */

import { NextRequest, NextResponse } from 'next/server';
import { importPDFVehicleData, type ImportResult } from '@/lib/master-vehicle-service';
import type { PDFVehicleData } from '@/lib/database/master-types';

// Validate incoming PDF vehicle data
function validatePDFData(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Request body must be an object'] };
  }

  const pdf = data as Partial<PDFVehicleData>;

  // Check required meta fields
  if (!pdf.meta) {
    errors.push('Missing required field: meta');
  } else {
    if (!pdf.meta.brand) errors.push('Missing required field: meta.brand');
    if (!pdf.meta.model) errors.push('Missing required field: meta.model');
    if (!pdf.meta.pdf_type) errors.push('Missing required field: meta.pdf_type');
  }

  // Check variants
  if (!pdf.variants || !Array.isArray(pdf.variants)) {
    errors.push('Missing required field: variants (must be an array)');
  } else if (pdf.variants.length === 0) {
    errors.push('variants array cannot be empty');
  } else {
    // Validate each variant
    pdf.variants.forEach((v, i) => {
      if (!v.name) errors.push(`variants[${i}]: missing required field 'name'`);
      if (!v.trim) errors.push(`variants[${i}]: missing required field 'trim'`);
      if (!v.motor) errors.push(`variants[${i}]: missing required field 'motor'`);
    });
  }

  return { valid: errors.length === 0, errors };
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();

    // Validate the data
    const validation = validatePDFData(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          message: 'Validation failed',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }

    // Import the data
    const result: ImportResult = await importPDFVehicleData(body as PDFVehicleData);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Vehicle data imported successfully',
        vehicleId: result.vehicleId,
        variantsCreated: result.variantsCreated,
        pricesUpdated: result.pricesUpdated,
        warnings: result.errors.length > 0 ? result.errors : undefined,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: 'Import failed',
          errors: result.errors,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('PDF import error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET endpoint for testing/documentation
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/master/import',
    method: 'POST',
    description: 'Import vehicle data from PDF extraction into master database',
    expectedFormat: {
      meta: {
        pdf_type: 'pricelist | brochure | specifications | combined',
        brand: 'string (required)',
        model: 'string (required)',
        model_year: 'number (optional)',
        giltig_fran: 'string (optional)',
        giltig_till: 'string (optional)',
        pdf_url: 'string (optional)',
      },
      dimensioner: {
        langd_mm: 'number',
        bredd_mm: 'number',
        hojd_mm: 'number',
        axelavstand_mm: 'number',
        bagageutrymme_liter: 'number',
        '...': 'see PDFVehicleData type for full schema',
      },
      motor_specs: {
        '[MOTOR_KEY]': {
          motor_type: 'EL | BENSIN | DIESEL | HYBRID | LADDHYBRID | PHEV',
          effekt_kw: 'number',
          effekt_hk: 'number',
          '...': 'see PDFVehicleData type for full schema',
        },
      },
      utrustning: [
        {
          name: 'string (required)',
          category: 'string',
          standard_for: '["trim1", "trim2"]',
          tillval_for: '["trim3"]',
          tillval_via_paket: 'string',
          tillval_pris: 'number',
        },
      ],
      tillval_paket: [
        {
          name: 'string (required)',
          pris: 'number',
          available_for_trims: '["trim1", "trim2"]',
          innehall: '["item1", "item2"]',
        },
      ],
      tillval_farger: [
        {
          name: 'string (required)',
          color_type: 'solid | metallic | pearl | matte',
          pris: 'number',
          is_standard: 'boolean',
        },
      ],
      garanti: {
        nybilsgaranti: 'string',
        vagassistans: 'string',
        rostgaranti: 'string',
        batterigaranti: 'string',
      },
      variants: [
        {
          name: 'string (required)',
          trim: 'string (required)',
          motor: 'string (required)',
          drivlina: '2WD | 4WD | AWD',
          pris: 'number',
          old_pris: 'number (for campaigns)',
          privatleasing: 'number',
          old_privatleasing: 'number',
          foretagsleasing: 'number',
          billan_per_man: 'number',
        },
      ],
    },
    exampleRequest: {
      meta: {
        pdf_type: 'pricelist',
        brand: 'Suzuki',
        model: 'eVitara',
        model_year: 2025,
        pdf_url: 'https://example.com/evitara-prislista.pdf',
      },
      variants: [
        {
          name: 'eVitara Select',
          trim: 'Select',
          motor: 'EL',
          drivlina: '2WD',
          pris: 459900,
          privatleasing: 4995,
        },
        {
          name: 'eVitara Select AWD',
          trim: 'Select',
          motor: 'EL',
          drivlina: 'AWD',
          pris: 489900,
          privatleasing: 5295,
        },
      ],
    },
  });
}
