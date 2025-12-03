/**
 * PDF Extractor Service
 * Extracts and parses vehicle pricing data from PDF files (brochures, price lists)
 *
 * Primary source of truth for vehicle data - more reliable than HTML scraping
 * Uses Google Document AI OCR as primary method (fast, reliable, good for tables)
 * Falls back to Claude AI if Document AI is not configured
 */

import axios from 'axios';
import { isClaudeEnabled, extractTextFromPDF as claudeExtractText, extractVehicleDataFromPDF } from './claude-client';
import { isDocumentAIEnabled, extractTextWithDocumentAI } from './google-document-ai';

// Try to import pdf-parse as last resort fallback
let pdfParse: any = null;
try {
  pdfParse = require('pdf-parse');
} catch (e) {
  console.warn('pdf-parse not installed. Using AI extraction only.');
}

export interface PDFVehicleVariant {
  name: string;
  price?: number;
  privatleasing?: number;
  companyLeasing?: number;
  loanPrice?: number;
  equipmentLevel?: string;
  transmission?: string;
  fuelType?: string;
  enginePower?: string;
}

export interface PDFVehicleData {
  modelName: string;
  brand: string;
  variants: PDFVehicleVariant[];
  validFrom?: string;
  validUntil?: string;
  currency: string;
  sourceUrl: string;
  extractedAt: string;
}

export interface PDFExtractionResult {
  success: boolean;
  data?: PDFVehicleData;
  rawText?: string;
  error?: string;
  processingTimeMs: number;
}

export interface PDFTextExtractionResult {
  success: boolean;
  text?: string;
  error?: string;
  method?: string;
  pageCount?: number;
  ocrCostUsd?: number;  // Google Document AI cost ($1.50 per 1000 pages)
}

/**
 * Download and extract text from a PDF file
 * Priority: Google Document AI OCR (fast, reliable) > Claude AI > pdf-parse
 */
export async function extractPDFText(pdfUrl: string): Promise<PDFTextExtractionResult> {
  // Try Google Document AI first (fast, reliable OCR for tables)
  if (isDocumentAIEnabled()) {
    console.log(`📄 Using Google Document AI OCR for PDF extraction: ${pdfUrl}`);
    try {
      const result = await extractTextWithDocumentAI(pdfUrl);
      if (result.success && result.text) {
        const pageCount = result.pageCount || 1;
        const ocrCostUsd = (pageCount / 1000) * 1.50;  // $1.50 per 1000 pages
        console.log(`✅ Google Document AI extracted ${result.text.length} characters from ${pageCount} pages (cost: $${ocrCostUsd.toFixed(4)})`);
        return {
          success: true,
          text: result.text,
          method: 'google-document-ai',
          pageCount,
          ocrCostUsd
        };
      }
      console.warn(`⚠️ Google Document AI failed: ${result.error}, trying Claude AI fallback...`);
    } catch (error) {
      console.warn(`⚠️ Google Document AI error: ${error}, trying Claude AI fallback...`);
    }
  }

  // Fallback to Claude AI if Document AI is not configured or failed
  if (isClaudeEnabled()) {
    console.log(`📄 Using Claude AI for PDF extraction: ${pdfUrl}`);
    try {
      const result = await claudeExtractText(pdfUrl);
      if (result.success && result.text) {
        console.log(`✅ Claude AI extracted ${result.text.length} characters`);
        return {
          success: true,
          text: result.text,
          method: 'claude-ai'
        };
      }
      console.warn(`⚠️ Claude AI failed: ${result.error}, trying pdf-parse fallback...`);
    } catch (error) {
      console.warn(`⚠️ Claude AI error: ${error}, trying pdf-parse fallback...`);
    }
  }

  // Fallback to pdf-parse
  if (!pdfParse) {
    return {
      success: false,
      error: 'No PDF extraction method available. Configure Claude API or install pdf-parse.'
    };
  }

  try {
    console.log(`📄 Using pdf-parse for extraction: ${pdfUrl}`);

    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const pdfBuffer = Buffer.from(response.data);
    const pdfSizeKB = pdfBuffer.length / 1024;
    console.log(`📄 Downloaded PDF, size: ${pdfSizeKB.toFixed(0)} KB`);

    const pdfData = await pdfParse(pdfBuffer);
    const extractedChars = pdfData.text.length;
    const numPages = pdfData.numpages || 0;

    console.log(`📄 pdf-parse results:`);
    console.log(`   - Pages: ${numPages}`);
    console.log(`   - Characters extracted: ${extractedChars}`);
    console.log(`   - Chars per page: ${numPages > 0 ? Math.round(extractedChars / numPages) : 0}`);

    // Warn if extraction seems incomplete (less than 100 chars per page for a multi-page PDF)
    if (numPages > 1 && extractedChars < numPages * 100) {
      console.warn(`⚠️ pdf-parse extracted very little text (${extractedChars} chars for ${numPages} pages)`);
      console.warn(`   This PDF may use embedded fonts or images that pdf-parse cannot read.`);
      console.warn(`   Consider using Claude AI directly for better extraction.`);
    }

    // If we got almost no text, return as failure so Claude can be tried
    if (extractedChars < 200 && pdfSizeKB > 100) {
      console.warn(`⚠️ pdf-parse failed to extract meaningful text from ${pdfSizeKB.toFixed(0)} KB PDF`);
      return {
        success: false,
        error: `pdf-parse extracted only ${extractedChars} characters from a ${pdfSizeKB.toFixed(0)} KB PDF - likely contains embedded fonts/images`,
        method: 'pdf-parse'
      };
    }

    return {
      success: true,
      text: pdfData.text,
      method: 'pdf-parse'
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ PDF extraction failed: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Parse Swedish price from text
 * Handles formats like: "199.900 kr", "199 900:-", "199900"
 */
function parseSwedishPrice(text: string): number | undefined {
  // Remove spaces and common separators
  const cleaned = text.replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '');

  // Extract number
  const match = cleaned.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    // Sanity check - car prices are typically between 100,000 and 2,000,000 SEK
    if (num >= 50000 && num <= 3000000) {
      return num;
    }
    // Monthly payments are typically 1,000 - 20,000 SEK
    if (num >= 500 && num <= 30000) {
      return num;
    }
  }
  return undefined;
}

/**
 * Parse Suzuki price list PDF format
 * These PDFs have consistent structure with model names, equipment levels, and prices
 */
function parseSuzukiPriceList(text: string, modelName: string): PDFVehicleVariant[] {
  const variants: PDFVehicleVariant[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  console.log(`🔍 Parsing Suzuki price list for ${modelName}`);

  // Common equipment levels for Suzuki
  const equipmentLevels = ['Base', 'Comfort', 'Select', 'Inclusive', 'Sport', 'Style', 'Active', 'Club'];

  // Transmission types
  const transmissionPatterns = {
    'CVT': /CVT|steglös|automat/i,
    'Manuell': /manuell|5-växl|6-växl/i,
    '4x4': /4x4|AllGrip|fyrhjuls/i
  };

  let currentVariant: Partial<PDFVehicleVariant> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';
    const prevLine = lines[i - 1] || '';

    // Check for equipment level
    for (const level of equipmentLevels) {
      if (line.toLowerCase().includes(level.toLowerCase())) {
        // Save previous variant if exists
        if (currentVariant.name && currentVariant.price) {
          variants.push(currentVariant as PDFVehicleVariant);
        }

        currentVariant = {
          name: `${modelName} ${level}`,
          equipmentLevel: level
        };

        // Check for transmission in same line
        for (const [trans, pattern] of Object.entries(transmissionPatterns)) {
          if (pattern.test(line)) {
            currentVariant.transmission = trans;
            currentVariant.name += ` ${trans}`;
          }
        }
        break;
      }
    }

    // Look for prices
    // Pattern: "Rek. cirkapris" or "cirkapris" followed by price
    if (/cirkapris|rekommenderat\s*pris|kontantpris/i.test(line)) {
      const priceMatch = line.match(/(\d[\d\s\.]*)\s*(kr|:-)?/);
      if (priceMatch) {
        const price = parseSwedishPrice(priceMatch[1]);
        if (price && price > 100000) {
          currentVariant.price = price;
        }
      }
      // Also check next line
      if (!currentVariant.price) {
        const nextPriceMatch = nextLine.match(/(\d[\d\s\.]*)\s*(kr|:-)?/);
        if (nextPriceMatch) {
          const price = parseSwedishPrice(nextPriceMatch[1]);
          if (price && price > 100000) {
            currentVariant.price = price;
          }
        }
      }
    }

    // Look for leasing prices
    if (/privatleasing|privatleas/i.test(line)) {
      const priceMatch = line.match(/(\d[\d\s\.]*)\s*(kr|:-)?/);
      if (priceMatch) {
        const price = parseSwedishPrice(priceMatch[1]);
        if (price && price > 1000 && price < 20000) {
          currentVariant.privatleasing = price;
        }
      }
    }

    // Look for loan prices
    if (/billån|lån/i.test(line) && !/privat/i.test(line)) {
      const priceMatch = line.match(/(\d[\d\s\.]*)\s*(kr|:-)?/);
      if (priceMatch) {
        const price = parseSwedishPrice(priceMatch[1]);
        if (price && price > 1000 && price < 20000) {
          currentVariant.loanPrice = price;
        }
      }
    }
  }

  // Add last variant
  if (currentVariant.name && currentVariant.price) {
    variants.push(currentVariant as PDFVehicleVariant);
  }

  console.log(`📄 Found ${variants.length} variants in PDF`);
  return variants;
}

/**
 * Extract structured vehicle data from a PDF price list
 */
export async function extractVehicleDataFromPDF(
  pdfUrl: string,
  modelName: string,
  brand: string = 'Suzuki'
): Promise<PDFExtractionResult> {
  const startTime = Date.now();

  try {
    // Extract text from PDF
    const textResult = await extractPDFText(pdfUrl);

    if (!textResult.success || !textResult.text) {
      return {
        success: false,
        error: textResult.error || 'Failed to extract text from PDF',
        processingTimeMs: Date.now() - startTime
      };
    }

    // Parse the text based on brand
    let variants: PDFVehicleVariant[] = [];

    if (brand.toLowerCase() === 'suzuki') {
      variants = parseSuzukiPriceList(textResult.text, modelName);
    } else {
      // Generic parsing - try to extract any price patterns
      variants = parseGenericPriceList(textResult.text, modelName);
    }

    const data: PDFVehicleData = {
      modelName,
      brand,
      variants,
      currency: 'SEK',
      sourceUrl: pdfUrl,
      extractedAt: new Date().toISOString()
    };

    return {
      success: true,
      data,
      rawText: textResult.text,
      processingTimeMs: Date.now() - startTime
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: Date.now() - startTime
    };
  }
}

/**
 * Generic price list parser for other brands
 */
function parseGenericPriceList(text: string, modelName: string): PDFVehicleVariant[] {
  const variants: PDFVehicleVariant[] = [];

  // Look for price patterns
  const pricePatterns = [
    /(\d{2,3}[\s\.]?\d{3})\s*(kr|:-|SEK)/gi,
    /pris[:\s]*(\d{2,3}[\s\.]?\d{3})/gi,
    /från\s*(\d{2,3}[\s\.]?\d{3})/gi
  ];

  const prices: number[] = [];

  for (const pattern of pricePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const price = parseSwedishPrice(match[1]);
      if (price && !prices.includes(price)) {
        prices.push(price);
      }
    }
  }

  // Sort prices and create variants
  prices.sort((a, b) => a - b);

  // Filter to likely car prices (100k - 2M) and leasing prices (1k - 20k)
  const carPrices = prices.filter(p => p >= 100000 && p <= 2000000);
  const leasingPrices = prices.filter(p => p >= 1000 && p <= 20000);

  if (carPrices.length > 0) {
    for (let i = 0; i < Math.min(carPrices.length, 5); i++) {
      const variant: PDFVehicleVariant = {
        name: `${modelName} Variant ${i + 1}`,
        price: carPrices[i]
      };

      // Try to match with a leasing price
      if (leasingPrices[i]) {
        variant.privatleasing = leasingPrices[i];
      }

      variants.push(variant);
    }
  }

  return variants;
}

/**
 * Extract PDF links from HTML content
 * Searches through main page AND linked pages content
 */
export function extractPDFLinksFromHTML(html: string, baseUrl: string): string[] {
  const pdfLinks: string[] = [];

  // Pattern 1: Find PDF links in anchor tags (handles both relative and absolute URLs)
  // Updated to handle <a href="..."> format (space before href)
  const pdfPattern = /<a\s[^>]*href=["']([^"']*\.pdf[^"']*)["'][^>]*>/gi;

  let match;
  while ((match = pdfPattern.exec(html)) !== null) {
    let pdfUrl = match[1].split('?')[0]; // Remove query params

    // Handle absolute URLs (already full URLs)
    if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) {
      if (!pdfLinks.includes(pdfUrl)) {
        pdfLinks.push(pdfUrl);
      }
      continue;
    }

    // Convert relative URLs to absolute
    if (pdfUrl.startsWith('/')) {
      try {
        const url = new URL(baseUrl);
        pdfUrl = `${url.protocol}//${url.host}${pdfUrl}`;
      } catch (e) {
        continue;
      }
    } else {
      // Relative path without leading slash
      try {
        const url = new URL(baseUrl);
        const basePath = url.pathname.substring(0, url.pathname.lastIndexOf('/'));
        pdfUrl = `${url.protocol}//${url.host}${basePath}/${pdfUrl}`;
      } catch (e) {
        continue;
      }
    }

    if (!pdfLinks.includes(pdfUrl)) {
      pdfLinks.push(pdfUrl);
    }
  }

  // Pattern 2: Find any href containing .pdf (catches edge cases)
  const hrefPattern = /href=["']([^"']+\.pdf[^"']*)["']/gi;
  while ((match = hrefPattern.exec(html)) !== null) {
    let pdfUrl = match[1].split('?')[0]; // Remove query params

    // Handle absolute URLs
    if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) {
      if (!pdfLinks.includes(pdfUrl)) {
        pdfLinks.push(pdfUrl);
      }
      continue;
    }

    // Handle relative URLs
    if (pdfUrl.startsWith('/')) {
      try {
        const url = new URL(baseUrl);
        pdfUrl = `${url.protocol}//${url.host}${pdfUrl}`;
      } catch (e) {
        continue;
      }
    }

    if (pdfUrl.includes('.pdf') && !pdfLinks.includes(pdfUrl)) {
      pdfLinks.push(pdfUrl);
    }
  }

  // Pattern 3: Find URLs in text that look like PDF links (for edge cases)
  const urlPattern = /https?:\/\/[^\s"'<>]+\.pdf/gi;
  while ((match = urlPattern.exec(html)) !== null) {
    const pdfUrl = match[0].split('?')[0]; // Remove query params
    if (!pdfLinks.includes(pdfUrl)) {
      pdfLinks.push(pdfUrl);
    }
  }

  console.log(`📄 Found ${pdfLinks.length} PDF links in HTML content:`);
  pdfLinks.forEach((url, i) => {
    const type = categorizePDF(url);
    console.log(`   ${i + 1}. [${type}] ${url}`);
  });
  return pdfLinks;
}

/**
 * Filter PDF links to only include pricelists and unknown PDFs (which may contain pricing)
 * Skips only brochures and specifications, since they typically don't have price tables
 */
export function filterPricelistPDFs(pdfLinks: string[]): string[] {
  const filtered = pdfLinks.filter(url => {
    const category = categorizePDF(url);
    // Include pricelists and unknown PDFs (could be model-specific like "208.pdf")
    // Skip only brochures and specifications
    return category === 'pricelist' || category === 'unknown';
  });
  console.log(`📄 Filtered to ${filtered.length} potential pricelist PDFs (from ${pdfLinks.length} total)`);
  return filtered;
}

/**
 * Categorize PDF by type (brochure, price list, etc.)
 */
export function categorizePDF(url: string): 'pricelist' | 'brochure' | 'specifications' | 'unknown' {
  const urlLower = url.toLowerCase();

  // Price list patterns - Swedish and English
  // "prislistor" contains "prislista" so it matches
  // "produktfakta" means product facts (often combined price/spec sheets)
  if (urlLower.includes('prislista') || urlLower.includes('pricelist') || urlLower.includes('price') ||
      urlLower.includes('prislistor') || urlLower.includes('produktfakta') || urlLower.includes('pris')) {
    return 'pricelist';
  }

  // Brochure patterns - including page count patterns like _8s_ (8 sidor), _12s_ (12 sidor)
  if (urlLower.includes('broschyr') || urlLower.includes('brochure') || urlLower.includes('folder') ||
      /_\d+s_/.test(urlLower) || urlLower.includes('webbversion')) {
    return 'brochure';
  }

  if (urlLower.includes('spec') || urlLower.includes('tekn') || urlLower.includes('data')) {
    return 'specifications';
  }

  return 'unknown';
}

/**
 * Main function to process all PDFs found in HTML and extract vehicle data
 */
export async function processPDFsFromHTML(
  html: string,
  baseUrl: string,
  modelName: string,
  brand: string = 'Suzuki'
): Promise<{
  success: boolean;
  pdfResults: PDFExtractionResult[];
  combinedData?: PDFVehicleData;
}> {
  const pdfLinks = extractPDFLinksFromHTML(html, baseUrl);

  if (pdfLinks.length === 0) {
    return {
      success: false,
      pdfResults: []
    };
  }

  const results: PDFExtractionResult[] = [];

  // Prioritize price lists over brochures
  const sortedLinks = pdfLinks.sort((a, b) => {
    const aType = categorizePDF(a);
    const bType = categorizePDF(b);

    const priority = { pricelist: 0, specifications: 1, brochure: 2, unknown: 3 };
    return priority[aType] - priority[bType];
  });

  // Process up to 3 PDFs (prioritizing price lists)
  for (const pdfUrl of sortedLinks.slice(0, 3)) {
    const type = categorizePDF(pdfUrl);
    console.log(`📄 Processing ${type} PDF: ${pdfUrl}`);

    const result = await extractVehicleDataFromPDF(pdfUrl, modelName, brand);
    results.push(result);

    // If we got good data from a price list, we can stop
    if (type === 'pricelist' && result.success && result.data && result.data.variants.length > 0) {
      break;
    }
  }

  // Combine data from all successful results
  const successfulResults = results.filter(r => r.success && r.data);

  if (successfulResults.length > 0) {
    // Use the first successful result as base, merge variants from others
    const combinedData: PDFVehicleData = {
      ...successfulResults[0].data!,
      variants: []
    };

    for (const result of successfulResults) {
      if (result.data) {
        combinedData.variants.push(...result.data.variants);
      }
    }

    // Remove duplicate variants
    combinedData.variants = combinedData.variants.filter((v, i, self) =>
      i === self.findIndex(other => other.name === v.name && other.price === v.price)
    );

    return {
      success: true,
      pdfResults: results,
      combinedData
    };
  }

  return {
    success: false,
    pdfResults: results
  };
}

export type { PDFVehicleData, PDFVehicleVariant, PDFExtractionResult };
