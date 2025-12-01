// Google Document AI service for processing PDFs
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import axios from 'axios';

interface DocumentAIResult {
  success: boolean;
  text: string;
  error?: string;
  processingTimeMs: number;
}

class DocumentAIService {
  private client: DocumentProcessorServiceClient;
  private projectId: string;
  private location: string;
  private processorId: string;

  constructor() {
    this.client = new DocumentProcessorServiceClient();
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || '';
    this.location = process.env.GOOGLE_CLOUD_LOCATION || 'us'; // e.g., 'us', 'eu'
    this.processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID || '';

    if (!this.projectId || !this.processorId) {
      console.warn('Google Document AI credentials not configured. Set GOOGLE_CLOUD_PROJECT_ID and GOOGLE_DOCUMENT_AI_PROCESSOR_ID environment variables.');
    }
  }

  async processPDF(pdfUrl: string): Promise<DocumentAIResult> {
    const startTime = Date.now();
    
    try {
      if (!this.projectId || !this.processorId) {
        throw new Error('Google Document AI not configured. Missing project ID or processor ID.');
      }

      console.log(`[DocumentAI] Processing PDF: ${pdfUrl}`);

      // Download PDF
      const response = await axios.get(pdfUrl, { 
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const pdfBuffer = Buffer.from(response.data);
      console.log(`[DocumentAI] Downloaded PDF, size: ${pdfBuffer.length} bytes`);

      // Configure the processor resource name
      const name = `projects/${this.projectId}/locations/${this.location}/processors/${this.processorId}`;

      // Create the request
      const request = {
        name,
        rawDocument: {
          content: pdfBuffer,
          mimeType: 'application/pdf',
        },
      };

      // Process the document
      console.log(`[DocumentAI] Sending to processor: ${name}`);
      const [result] = await this.client.processDocument(request);

      if (!result.document) {
        throw new Error('No document returned from Document AI');
      }

      // Extract text from the document
      const text = result.document.text || '';
      console.log(`[DocumentAI] Extracted ${text.length} characters from PDF`);

      // Clean up the text (remove excessive whitespace but preserve structure)
      const cleanedText = text
        .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
        .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
        .trim();

      const processingTime = Date.now() - startTime;
      console.log(`[DocumentAI] Processing completed in ${processingTime}ms`);

      return {
        success: true,
        text: cleanedText,
        processingTimeMs: processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`[DocumentAI] Error processing PDF ${pdfUrl}:`, errorMessage);
      
      return {
        success: false,
        text: '',
        error: errorMessage,
        processingTimeMs: processingTime
      };
    }
  }

  // Test connection to Document AI
  async testConnection(): Promise<boolean> {
    try {
      if (!this.projectId || !this.processorId) {
        console.error('[DocumentAI] Missing configuration');
        return false;
      }

      const name = `projects/${this.projectId}/locations/${this.location}/processors/${this.processorId}`;
      
      // Try to get processor info to test connection
      const [processor] = await this.client.getProcessor({ name });
      console.log(`[DocumentAI] Connection test successful. Processor: ${processor.displayName}`);
      return true;
    } catch (error) {
      console.error('[DocumentAI] Connection test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const documentAI = new DocumentAIService();

// Export the result interface for use in other modules
export type { DocumentAIResult };