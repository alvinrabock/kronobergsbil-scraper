/**
 * Google Document AI Client
 * Uses OCR to extract text from PDFs - excellent for complex layouts and tables
 *
 * Pricing: $1.50 per 1,000 pages for OCR processor
 * Much faster and more reliable than Claude for PDF text extraction
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Configuration from environment
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'eu';
const PROCESSOR_ID = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;
const CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;

interface DocumentAIResponse {
  document: {
    text: string;
    pages: Array<{
      pageNumber: number;
      dimension: { width: number; height: number };
      tables?: Array<{
        headerRows: Array<{ cells: Array<{ text: string }> }>;
        bodyRows: Array<{ cells: Array<{ text: string }> }>;
      }>;
    }>;
  };
}

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

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Check if Google Document AI is configured
 */
export function isDocumentAIEnabled(): boolean {
  return !!(PROJECT_ID && PROCESSOR_ID && CREDENTIALS_PATH);
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
  const crypto = await import('crypto');

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
 * Extract text from PDF using Google Document AI OCR
 */
export async function extractTextWithDocumentAI(
  pdfUrl: string
): Promise<{ success: boolean; text?: string; error?: string; method: string; pageCount?: number }> {
  const startTime = Date.now();

  if (!isDocumentAIEnabled()) {
    return {
      success: false,
      error: 'Google Document AI not configured. Set GOOGLE_CLOUD_PROJECT_ID, GOOGLE_DOCUMENT_AI_PROCESSOR_ID, and GOOGLE_APPLICATION_CREDENTIALS.',
      method: 'google-document-ai',
    };
  }

  try {
    console.log(`📄 [Google Document AI] Processing PDF: ${pdfUrl}`);

    // Download PDF
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const pdfResponse = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    clearTimeout(timeoutId);

    const pdfBuffer = Buffer.from(pdfResponse.data);
    const pdfSizeKB = pdfBuffer.length / 1024;
    console.log(`📥 PDF downloaded: ${pdfSizeKB.toFixed(0)} KB`);

    // Get access token
    const accessToken = await getAccessToken();

    // Call Document AI API
    const endpoint = `https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}:process`;

    console.log(`🔄 Calling Document AI OCR...`);
    const response = await axios.post<DocumentAIResponse>(
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
        timeout: 120000, // 2 minutes for processing
      }
    );

    const processingTime = Date.now() - startTime;
    const document = response.data.document;
    const text = document.text || '';
    const pageCount = document.pages?.length || 0;

    console.log(`✅ [Google Document AI] Extraction complete:`);
    console.log(`   - Pages: ${pageCount}`);
    console.log(`   - Characters: ${text.length}`);
    console.log(`   - Processing time: ${processingTime}ms`);
    console.log(`   - Text preview: ${text.substring(0, 200).replace(/\n/g, ' ')}...`);

    // Check for tables and format them as structured text
    let formattedText = text;

    if (document.pages) {
      const tableTexts: string[] = [];

      for (const page of document.pages) {
        if (page.tables && page.tables.length > 0) {
          console.log(`   - Tables found on page ${page.pageNumber}: ${page.tables.length}`);

          for (const table of page.tables) {
            let tableText = '\n--- TABLE START ---\n';

            // Format header rows
            if (table.headerRows) {
              for (const row of table.headerRows) {
                const cells = row.cells?.map(c => (c.text || '').trim()).join(' | ') || '';
                if (cells) tableText += `HEADER: ${cells}\n`;
              }
            }

            // Format body rows - each row on its own line with | separator
            if (table.bodyRows) {
              for (const row of table.bodyRows) {
                const cells = row.cells?.map(c => (c.text || '').trim()).join(' | ') || '';
                if (cells) tableText += `ROW: ${cells}\n`;
              }
            }

            tableText += '--- TABLE END ---\n';
            tableTexts.push(tableText);
          }
        }
      }

      // Append structured table data to the text if tables were found
      if (tableTexts.length > 0) {
        formattedText += '\n\n=== STRUCTURED TABLE DATA ===\n';
        formattedText += tableTexts.join('\n');
      }
    }

    return {
      success: true,
      text: formattedText,
      method: 'google-document-ai',
      pageCount,
    };

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error';

    console.error(`❌ [Google Document AI] Error after ${processingTime}ms:`, errorMessage);

    return {
      success: false,
      error: errorMessage,
      method: 'google-document-ai',
    };
  }
}

/**
 * Get estimated cost for Document AI processing
 * OCR Processor: $1.50 per 1,000 pages
 */
export function estimateCost(pageCount: number): number {
  return (pageCount / 1000) * 1.50;
}
