/**
 * Google Document AI Custom Extractor Client
 * Uses a trained custom extractor for full vehicle data extraction (variants, equipment, specs)
 *
 * This is EXPENSIVE (~$1.50 per 1,000 pages for OCR + processing)
 * Should only be used for:
 * - First-time extraction of new models
 * - Models that don't have full data yet
 *
 * For price-only updates, use the standard OCR processor instead (google-document-ai.ts)
 */

import axios from 'axios';
import * as fs from 'fs';
import * as crypto from 'crypto';

// Configuration from environment
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'eu';
const CUSTOM_PROCESSOR_ID = process.env.GOOGLE_CUSTOM_EXTRACTOR_PROCESSOR_ID || '1f5fb809088b2aec';
const CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

interface CustomExtractorEntity {
  type: string;
  mentionText?: string;
  normalizedValue?: {
    text?: string;
    moneyValue?: { units: string; currencyCode: string };
  };
  properties?: CustomExtractorEntity[];
  confidence: number;
  // Page and text anchors for position-based correlation
  pageAnchor?: {
    pageRefs?: Array<{
      page?: string; // Page number (0-indexed)
      boundingPoly?: {
        normalizedVertices?: Array<{ x: number; y: number }>;
      };
    }>;
  };
  textAnchor?: {
    textSegments?: Array<{
      startIndex?: string;
      endIndex?: string;
    }>;
  };
}

interface CustomExtractorResponse {
  document: {
    text: string;
    pages: Array<{
      pageNumber: number;
    }>;
    entities: CustomExtractorEntity[];
  };
}

export interface ExtractedVehicleData {
  modelName?: string;
  brand?: string;
  variants: Array<{
    name: string;
    price?: number;
    privatleasing?: number;
    companyLeasing?: number;
    loanPrice?: number;
    equipment?: string[];
    specifications?: Record<string, string>;
  }>;
  equipment?: Record<string, string[]>; // By category (Standard, AddOns)
  specifications?: Record<string, string>;
  rawEntities: CustomExtractorEntity[];
  extractedAt: string;
  processorId: string;

  // All entity types from custom extractor (raw arrays for debugging/display)
  entityData?: {
    addOns: string[];
    batterySize: string[];
    Brand: string[];
    campaign: string[];
    campaignEnd: string[];
    campaignTerms: string[];
    CarLoan: string[];
    CO2Emission: string[];
    color: string[];
    colorCode: string[];
    electricalRange: string[];
    energyConsumtion: string[];
    equipment: string[];
    Exterior: string[];
    freeText: string[];
    fuelConsumption: string[];
    fuelType: string[];
    Gearbox: string[];
    horsePower: string[];
    Interior: string[];
    kwhConsumption: string[];
    maxSpeed: string[];
    measurement: string[];
    Modell: string[];
    Motor: string[];
    oldPrice: string[];
    other_data: string[];
    PreferentialValue: string[];
    price: string[];
    privateLeasing: string[];
    range: string[];
    recSalePrice: string[];
    serviceDeal: string[];
    technicalData: string[];
    UPHOLSTERY_MATERIAL: string[];
    vehicleVariant: string[];
    waranty: string[];
    yearTax: string[];
  };
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Check if Custom Extractor is configured
 */
export function isCustomExtractorEnabled(): boolean {
  return !!(PROJECT_ID && CUSTOM_PROCESSOR_ID && CREDENTIALS_PATH);
}

/**
 * Get access token using service account credentials
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 minute buffer)
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 300000) {
    return cachedAccessToken.token;
  }

  if (!CREDENTIALS_PATH) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS not set');
  }

  // Read service account credentials
  const credentialsFile = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
  const credentials: ServiceAccountCredentials = JSON.parse(credentialsFile);

  // Create JWT for token request
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: credentials.token_uri,
    iat: now,
    exp: now + 3600,
  };

  // Sign JWT with private key
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signatureInput = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(credentials.private_key, 'base64url');

  const jwt = `${signatureInput}.${signature}`;

  // Exchange JWT for access token
  const tokenResponse = await axios.post(credentials.token_uri, {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  cachedAccessToken = {
    token: tokenResponse.data.access_token,
    expiresAt: Date.now() + (tokenResponse.data.expires_in * 1000),
  };

  return cachedAccessToken.token;
}

/**
 * Extract full vehicle data using Custom Document AI Extractor
 * This extracts structured entities: variants, prices, equipment, specifications
 *
 * EXPENSIVE: Only use for first-time extraction or new models
 */
export async function extractWithCustomExtractor(
  pdfUrl: string
): Promise<{
  success: boolean;
  data?: ExtractedVehicleData;
  error?: string;
  pageCount?: number;
  processingTimeMs: number;
}> {
  const startTime = Date.now();

  if (!isCustomExtractorEnabled()) {
    return {
      success: false,
      error: 'Google Custom Extractor not configured. Set GOOGLE_CLOUD_PROJECT_ID, GOOGLE_CUSTOM_EXTRACTOR_PROCESSOR_ID, and GOOGLE_APPLICATION_CREDENTIALS.',
      processingTimeMs: Date.now() - startTime,
    };
  }

  try {
    console.log(`🔧 [Custom Extractor] Processing PDF: ${pdfUrl}`);
    console.log(`   Processor ID: ${CUSTOM_PROCESSOR_ID}`);

    // Download PDF
    const pdfResponse = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const pdfBuffer = Buffer.from(pdfResponse.data);
    const pdfSizeKB = pdfBuffer.length / 1024;
    console.log(`📥 PDF downloaded: ${pdfSizeKB.toFixed(0)} KB`);

    // Get access token
    const accessToken = await getAccessToken();

    // Call Custom Extractor API
    const endpoint = `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/${CUSTOM_PROCESSOR_ID}:process`;

    console.log(`🔄 Calling Custom Extractor...`);
    const response = await axios.post<CustomExtractorResponse>(
      endpoint,
      {
        rawDocument: {
          content: pdfBuffer.toString('base64'),
          mimeType: 'application/pdf',
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 180000, // 3 minutes for custom extraction
      }
    );

    const processingTimeMs = Date.now() - startTime;
    const document = response.data.document;
    const pageCount = document.pages?.length || 0;
    const entities = document.entities || [];

    console.log(`✅ [Custom Extractor] Extraction complete:`);
    console.log(`   - Pages: ${pageCount}`);
    console.log(`   - Entities found: ${entities.length}`);
    console.log(`   - Processing time: ${processingTimeMs}ms`);

    // DEBUG: Check if position data (textAnchor/pageAnchor) is available
    if (entities.length > 0) {
      const sampleEntity = entities[0];
      const hasTextAnchor = !!sampleEntity.textAnchor?.textSegments?.length;
      const hasPageAnchor = !!sampleEntity.pageAnchor?.pageRefs?.length;
      console.log(`🔍 [DEBUG] Position data check:`);
      console.log(`   - textAnchor available: ${hasTextAnchor}`);
      console.log(`   - pageAnchor available: ${hasPageAnchor}`);
      if (hasTextAnchor) {
        console.log(`   - Sample textAnchor: ${JSON.stringify(sampleEntity.textAnchor)}`);
      }
      if (hasPageAnchor) {
        console.log(`   - Sample pageAnchor: ${JSON.stringify(sampleEntity.pageAnchor)}`);
      }
      // Log full first entity for debugging
      console.log(`   - First entity full structure: ${JSON.stringify(sampleEntity, null, 2)}`);
    }

    // Parse entities into structured data
    const extractedData = parseCustomExtractorEntities(entities, CUSTOM_PROCESSOR_ID!);

    // Log what was extracted
    console.log(`📊 Extracted data summary:`);
    console.log(`   - Variants: ${extractedData.variants.length}`);
    if (extractedData.equipment) {
      console.log(`   - Equipment categories: ${Object.keys(extractedData.equipment).length}`);
    }
    if (extractedData.specifications) {
      console.log(`   - Specifications: ${Object.keys(extractedData.specifications).length}`);
    }

    return {
      success: true,
      data: extractedData,
      pageCount,
      processingTimeMs,
    };

  } catch (error: any) {
    const processingTimeMs = Date.now() - startTime;
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';

    console.error(`❌ [Custom Extractor] Error after ${processingTimeMs}ms:`, errorMessage);

    return {
      success: false,
      error: errorMessage,
      processingTimeMs,
    };
  }
}

/**
 * Get the text position (startIndex) from an entity for ordering
 */
function getEntityTextPosition(entity: CustomExtractorEntity): number {
  if (entity.textAnchor?.textSegments?.[0]?.startIndex) {
    return parseInt(entity.textAnchor.textSegments[0].startIndex, 10);
  }
  return 0;
}

/**
 * Get the page number from an entity
 */
function getEntityPage(entity: CustomExtractorEntity): number {
  if (entity.pageAnchor?.pageRefs?.[0]?.page) {
    return parseInt(entity.pageAnchor.pageRefs[0].page, 10);
  }
  return 0;
}

/**
 * Get the Y position (vertical) from an entity's bounding box
 * Used to determine if entities are on the same "row" in the document
 */
function getEntityYPosition(entity: CustomExtractorEntity): number {
  const vertices = entity.pageAnchor?.pageRefs?.[0]?.boundingPoly?.normalizedVertices;
  if (vertices && vertices.length > 0) {
    // Use the top-left Y coordinate
    return vertices[0].y || 0;
  }
  return 0;
}

/**
 * Find the closest variant to a given entity based on text position
 * Entities that appear after a variant name but before the next variant belong to that variant
 */
function findOwningVariant(
  entity: CustomExtractorEntity,
  variantEntities: CustomExtractorEntity[]
): CustomExtractorEntity | null {
  const entityPos = getEntityTextPosition(entity);
  const entityPage = getEntityPage(entity);

  // Sort variants by text position
  const sortedVariants = [...variantEntities].sort(
    (a, b) => getEntityTextPosition(a) - getEntityTextPosition(b)
  );

  // Find the variant that comes before this entity
  let owningVariant: CustomExtractorEntity | null = null;
  for (const variant of sortedVariants) {
    const variantPos = getEntityTextPosition(variant);
    const variantPage = getEntityPage(variant);

    // If variant comes before entity (or on same page and higher up)
    if (variantPos <= entityPos) {
      owningVariant = variant;
    } else {
      break;
    }
  }

  return owningVariant;
}

/**
 * Parse entities from Custom Extractor response into structured vehicle data
 *
 * Entity types from trained extractor:
 * - vehicleVariant (32): Vehicle variant/trim names
 * - Modell (117): Model names
 * - Brand (22): Brand names
 * - price (120): Cash prices
 * - privateLeasing (31): Private leasing prices
 * - CarLoan (53): Car loan prices
 * - equipment (206): Equipment items
 * - addOns (100): Add-on equipment
 * - technicalData (199): Technical specifications
 * - Motor (59): Engine types
 * - Gearbox (42): Transmission types
 * - horsePower (28): Horsepower values
 * - fuelType (35): Fuel types
 * - CO2Emission (31): CO2 emissions
 * - Exterior (34): Exterior colors
 * - Interior (47): Interior options
 * - color (53): Color options
 * - measurement (56): Measurements/dimensions
 * - And more...
 */
function parseCustomExtractorEntities(
  entities: CustomExtractorEntity[],
  processorId: string
): ExtractedVehicleData {
  const data: ExtractedVehicleData = {
    variants: [],
    rawEntities: entities,
    extractedAt: new Date().toISOString(),
    processorId,
  };

  // Group entities by type for easier processing
  const entityMap: Record<string, CustomExtractorEntity[]> = {};
  for (const entity of entities) {
    if (!entityMap[entity.type]) {
      entityMap[entity.type] = [];
    }
    entityMap[entity.type].push(entity);
  }

  // Log entity type counts for debugging
  const entityCounts = Object.entries(entityMap)
    .map(([type, ents]) => `${type}(${ents.length})`)
    .join(', ');
  console.log(`📋 Entity types found: ${entityCounts}`);

  // Helper to extract mentionText from entities
  const extractTexts = (type: string): string[] => {
    return (entityMap[type] || [])
      .map(e => e.mentionText || e.normalizedValue?.text || '')
      .filter(t => t.length > 0);
  };

  // Populate entityData with all entity types as arrays
  data.entityData = {
    addOns: extractTexts('addOns'),
    batterySize: extractTexts('batterySize'),
    Brand: extractTexts('Brand'),
    campaign: extractTexts('campaign'),
    campaignEnd: extractTexts('campaignEnd'),
    campaignTerms: extractTexts('campaignTerms'),
    CarLoan: extractTexts('CarLoan'),
    CO2Emission: extractTexts('CO2Emission'),
    color: extractTexts('color'),
    colorCode: extractTexts('colorCode'),
    electricalRange: extractTexts('electricalRange'),
    energyConsumtion: extractTexts('energyConsumtion'),
    equipment: extractTexts('equipment'),
    Exterior: extractTexts('Exterior'),
    freeText: extractTexts('freeText'),
    fuelConsumption: extractTexts('fuelConsumption'),
    fuelType: extractTexts('fuelType'),
    Gearbox: extractTexts('Gearbox'),
    horsePower: extractTexts('horsePower'),
    Interior: extractTexts('Interior'),
    kwhConsumption: extractTexts('kwhConsumption'),
    maxSpeed: extractTexts('maxSpeed'),
    measurement: extractTexts('measurement'),
    Modell: extractTexts('Modell'),
    Motor: extractTexts('Motor'),
    oldPrice: extractTexts('oldPrice'),
    other_data: extractTexts('other_data'),
    PreferentialValue: extractTexts('PreferentialValue'),
    price: extractTexts('price'),
    privateLeasing: extractTexts('privateLeasing'),
    range: extractTexts('range'),
    recSalePrice: extractTexts('recSalePrice'),
    serviceDeal: extractTexts('serviceDeal'),
    technicalData: extractTexts('technicalData'),
    UPHOLSTERY_MATERIAL: extractTexts('UPHOLSTERY_MATERIAL'),
    vehicleVariant: extractTexts('vehicleVariant'),
    waranty: extractTexts('waranty'),
    yearTax: extractTexts('yearTax'),
  };

  // Extract brand (Brand entity type)
  if (entityMap['Brand']) {
    const brandEntity = entityMap['Brand'][0];
    data.brand = brandEntity?.mentionText || brandEntity?.normalizedValue?.text;
    console.log(`   Brand: ${data.brand}`);
  }

  // Extract model name (Modell entity type)
  if (entityMap['Modell']) {
    const modelEntity = entityMap['Modell'][0];
    data.modelName = modelEntity?.mentionText || modelEntity?.normalizedValue?.text;
    console.log(`   Model: ${data.modelName}`);
  }

  // Extract variants (vehicleVariant entity type)
  const variantEntities = entityMap['vehicleVariant'] || [];
  console.log(`   Processing ${variantEntities.length} vehicleVariant entities`);

  for (const variantEntity of variantEntities) {
    const variant: ExtractedVehicleData['variants'][0] = {
      name: variantEntity.mentionText || variantEntity.normalizedValue?.text || 'Unknown',
      equipment: [],
    };

    // Check for nested properties within variant
    if (variantEntity.properties && variantEntity.properties.length > 0) {
      for (const prop of variantEntity.properties) {
        const propType = prop.type.toLowerCase();
        const propValue = prop.mentionText || prop.normalizedValue?.text || prop.normalizedValue?.moneyValue?.units;

        if (propType === 'price' || propType === 'recsaleprice') {
          variant.price = parsePrice(propValue);
        } else if (propType === 'privateleasing' || propType === 'privateLeasing') {
          variant.privatleasing = parsePrice(propValue);
        } else if (propType === 'carloan' || propType === 'carLoan') {
          variant.loanPrice = parsePrice(propValue);
        } else if (propType === 'equipment' || propType === 'addons') {
          if (propValue && !variant.equipment!.includes(propValue)) {
            variant.equipment!.push(propValue);
          }
        }
      }
    }

    data.variants.push(variant);
  }

  // If no vehicleVariant entities but we have Modell entities, use those as variants
  if (data.variants.length === 0 && entityMap['Modell']) {
    console.log(`   No vehicleVariant found, using ${entityMap['Modell'].length} Modell entities as variants`);
    for (const modelEntity of entityMap['Modell']) {
      const variant: ExtractedVehicleData['variants'][0] = {
        name: modelEntity.mentionText || modelEntity.normalizedValue?.text || 'Unknown',
        equipment: [],
      };

      // Check for nested properties
      if (modelEntity.properties && modelEntity.properties.length > 0) {
        for (const prop of modelEntity.properties) {
          const propType = prop.type.toLowerCase();
          const propValue = prop.mentionText || prop.normalizedValue?.text;

          if (propType === 'price' || propType === 'recsaleprice') {
            variant.price = parsePrice(propValue);
          } else if (propType === 'privateleasing') {
            variant.privatleasing = parsePrice(propValue);
          } else if (propType === 'carloan') {
            variant.loanPrice = parsePrice(propValue);
          }
        }
      }

      data.variants.push(variant);
    }
  }

  // Extract standalone prices and try to match to variants using POSITION-BASED CORRELATION
  const priceEntities = entityMap['price'] || [];
  const privateLeasingEntities = entityMap['privateLeasing'] || [];
  const carLoanEntities = entityMap['CarLoan'] || [];
  const recSalePriceEntities = entityMap['recSalePrice'] || [];
  const motorEntities = entityMap['Motor'] || [];
  const gearboxEntities = entityMap['Gearbox'] || [];
  const horsePowerEntities = entityMap['horsePower'] || [];
  const fuelTypeEntities = entityMap['fuelType'] || [];

  console.log(`   Standalone prices: price(${priceEntities.length}), privateLeasing(${privateLeasingEntities.length}), CarLoan(${carLoanEntities.length}), recSalePrice(${recSalePriceEntities.length})`);

  // Build a map from variant name to variant object for quick lookup
  const variantMap = new Map<string, ExtractedVehicleData['variants'][0]>();
  for (const variant of data.variants) {
    variantMap.set(variant.name, variant);
  }

  // Use position-based correlation to assign prices to variants
  if (data.variants.length > 0 && variantEntities.length > 0) {
    console.log(`   🔗 Using position-based correlation for ${data.variants.length} variants`);

    // Helper to assign entity to its owning variant
    const assignToVariant = (
      entity: CustomExtractorEntity,
      assignFn: (variant: ExtractedVehicleData['variants'][0], value: string) => void
    ) => {
      const owningVariant = findOwningVariant(entity, variantEntities);
      if (owningVariant) {
        const variantName = owningVariant.mentionText || owningVariant.normalizedValue?.text || '';
        const variant = variantMap.get(variantName);
        if (variant) {
          const value = entity.mentionText || entity.normalizedValue?.text || '';
          if (value) {
            assignFn(variant, value);
          }
        }
      }
    };

    // Assign recSalePrice (recommended sale price)
    for (const priceEntity of recSalePriceEntities) {
      assignToVariant(priceEntity, (variant, value) => {
        if (!variant.price) {
          variant.price = parsePrice(value);
        }
      });
    }

    // Assign regular prices
    for (const priceEntity of priceEntities) {
      assignToVariant(priceEntity, (variant, value) => {
        if (!variant.price) {
          variant.price = parsePrice(value);
        }
      });
    }

    // Assign private leasing prices
    for (const leasingEntity of privateLeasingEntities) {
      assignToVariant(leasingEntity, (variant, value) => {
        if (!variant.privatleasing) {
          variant.privatleasing = parsePrice(value);
        }
      });
    }

    // Assign car loan prices
    for (const loanEntity of carLoanEntities) {
      assignToVariant(loanEntity, (variant, value) => {
        if (!variant.loanPrice) {
          variant.loanPrice = parsePrice(value);
        }
      });
    }

    // Assign motor/engine type
    for (const motorEntity of motorEntities) {
      assignToVariant(motorEntity, (variant, value) => {
        if (!variant.specifications) variant.specifications = {};
        if (!variant.specifications['Motor']) {
          variant.specifications['Motor'] = value;
        }
      });
    }

    // Assign gearbox
    for (const gearboxEntity of gearboxEntities) {
      assignToVariant(gearboxEntity, (variant, value) => {
        if (!variant.specifications) variant.specifications = {};
        if (!variant.specifications['Gearbox']) {
          variant.specifications['Gearbox'] = value;
        }
      });
    }

    // Assign horsepower
    for (const hpEntity of horsePowerEntities) {
      assignToVariant(hpEntity, (variant, value) => {
        if (!variant.specifications) variant.specifications = {};
        if (!variant.specifications['Horsepower']) {
          variant.specifications['Horsepower'] = value;
        }
      });
    }

    // Assign fuel type
    for (const fuelEntity of fuelTypeEntities) {
      assignToVariant(fuelEntity, (variant, value) => {
        if (!variant.specifications) variant.specifications = {};
        if (!variant.specifications['FuelType']) {
          variant.specifications['FuelType'] = value;
        }
      });
    }

    // Log correlation results
    let assignedPrices = 0;
    let assignedLeasing = 0;
    let assignedSpecs = 0;
    for (const variant of data.variants) {
      if (variant.price) assignedPrices++;
      if (variant.privatleasing) assignedLeasing++;
      if (variant.specifications && Object.keys(variant.specifications).length > 0) assignedSpecs++;
    }
    console.log(`   📊 Position correlation results: ${assignedPrices} prices, ${assignedLeasing} leasing, ${assignedSpecs} with specs`);
  } else {
    // Fallback to simple index-based matching
    console.log(`   ⚠️ Fallback to index-based matching (no position data available)`);
    const allPrices = [...recSalePriceEntities, ...priceEntities];
    for (let i = 0; i < Math.min(data.variants.length, allPrices.length); i++) {
      if (!data.variants[i].price) {
        data.variants[i].price = parsePrice(allPrices[i].mentionText);
      }
    }

    for (let i = 0; i < Math.min(data.variants.length, privateLeasingEntities.length); i++) {
      if (!data.variants[i].privatleasing) {
        data.variants[i].privatleasing = parsePrice(privateLeasingEntities[i].mentionText);
      }
    }

    for (let i = 0; i < Math.min(data.variants.length, carLoanEntities.length); i++) {
      if (!data.variants[i].loanPrice) {
        data.variants[i].loanPrice = parsePrice(carLoanEntities[i].mentionText);
      }
    }
  }

  // Extract equipment from multiple sources
  const equipmentEntities = [
    ...(entityMap['equipment'] || []),
    ...(entityMap['addOns'] || []),
  ];

  if (equipmentEntities.length > 0) {
    data.equipment = { 'Standard': [], 'AddOns': [] };

    for (const equipEntity of entityMap['equipment'] || []) {
      const feature = equipEntity.mentionText || '';
      if (feature && !data.equipment['Standard'].includes(feature)) {
        data.equipment['Standard'].push(feature);
      }
    }

    for (const addOnEntity of entityMap['addOns'] || []) {
      const feature = addOnEntity.mentionText || '';
      if (feature && !data.equipment['AddOns'].includes(feature)) {
        data.equipment['AddOns'].push(feature);
      }
    }

    console.log(`   Equipment: Standard(${data.equipment['Standard'].length}), AddOns(${data.equipment['AddOns'].length})`);
  }

  // Extract specifications from technicalData, Motor, Gearbox, etc.
  data.specifications = {};

  // Technical data
  for (const techEntity of entityMap['technicalData'] || []) {
    const value = techEntity.mentionText || '';
    if (value) {
      // Try to split key:value if present
      const colonIndex = value.indexOf(':');
      if (colonIndex > 0) {
        const key = value.substring(0, colonIndex).trim();
        const val = value.substring(colonIndex + 1).trim();
        data.specifications[key] = val;
      } else {
        data.specifications[`tech_${Object.keys(data.specifications).length}`] = value;
      }
    }
  }

  // Motor (engine)
  for (const motorEntity of entityMap['Motor'] || []) {
    const value = motorEntity.mentionText || '';
    if (value) {
      data.specifications[`Motor`] = value;
    }
  }

  // Gearbox
  for (const gearEntity of entityMap['Gearbox'] || []) {
    const value = gearEntity.mentionText || '';
    if (value) {
      data.specifications['Gearbox'] = value;
    }
  }

  // Horsepower
  for (const hpEntity of entityMap['horsePower'] || []) {
    const value = hpEntity.mentionText || '';
    if (value) {
      data.specifications['Horsepower'] = value;
    }
  }

  // Fuel type
  for (const fuelEntity of entityMap['fuelType'] || []) {
    const value = fuelEntity.mentionText || '';
    if (value) {
      data.specifications['FuelType'] = value;
    }
  }

  // CO2 Emission
  for (const co2Entity of entityMap['CO2Emission'] || []) {
    const value = co2Entity.mentionText || '';
    if (value) {
      data.specifications['CO2Emission'] = value;
    }
  }

  // Colors - Exterior
  if (entityMap['Exterior'] || entityMap['color']) {
    const colors: string[] = [];
    for (const colorEntity of [...(entityMap['Exterior'] || []), ...(entityMap['color'] || [])]) {
      const value = colorEntity.mentionText || '';
      if (value && !colors.includes(value)) {
        colors.push(value);
      }
    }
    if (colors.length > 0) {
      data.specifications['ExteriorColors'] = colors.join(', ');
    }
  }

  // Interior
  if (entityMap['Interior']) {
    const interiors: string[] = [];
    for (const intEntity of entityMap['Interior']) {
      const value = intEntity.mentionText || '';
      if (value && !interiors.includes(value)) {
        interiors.push(value);
      }
    }
    if (interiors.length > 0) {
      data.specifications['InteriorOptions'] = interiors.join(', ');
    }
  }

  console.log(`📊 Parsed result: ${data.variants.length} variants, ${Object.keys(data.equipment || {}).length} equipment categories, ${Object.keys(data.specifications || {}).length} specs`);

  return data;
}

/**
 * Parse Swedish price string to number
 */
function parsePrice(priceStr: string | undefined): number | undefined {
  if (!priceStr) return undefined;

  // Remove spaces, dots (thousand separators), and common suffixes
  const cleaned = priceStr
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '')
    .replace(/kr/gi, '')
    .replace(/:-/g, '')
    .replace(/SEK/gi, '');

  const match = cleaned.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    // Sanity check for car prices (100k-3M) or monthly payments (500-50k)
    if ((num >= 100000 && num <= 3000000) || (num >= 500 && num <= 50000)) {
      return num;
    }
  }
  return undefined;
}

/**
 * Estimate cost for custom extraction
 * Custom Extractor: ~$0.10-0.30 per document + OCR cost
 */
export function estimateCustomExtractorCost(pageCount: number): number {
  // Base cost for custom extraction + OCR ($1.50 per 1000 pages)
  const ocrCost = (pageCount / 1000) * 1.50;
  const customCost = 0.10; // Per-document processing fee estimate
  return ocrCost + customCost;
}
