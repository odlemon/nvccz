//@ts-nocheck
import axios from 'axios';
import path from 'path';
import { createHash } from 'crypto';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from '../utils/logger';
import { collapseDuplicatePublicMediaPath } from './RemoteUploadService';

export interface ApplicationDocumentReference {
  url: string;
  type: string;
  fileName: string;
}

export interface ExtractedDocumentContent extends ApplicationDocumentReference {
  text: string;
  truncated: boolean;
  extractionError?: string;
  contentHash?: string;
}

/** Portfolio / shortlisting: keep prompts small. */
const MAX_CHAR_PER_DOCUMENT = 4000;
/** Suite 06 vendor invoices: must not truncate before LLM (see VendorInvoiceExtractionService slice). */
const MAX_CHAR_VENDOR_INVOICE_DEFAULT = 120000;

export class DocumentTextExtractionService {
  /**
   * Download and extract text content for a list of application documents.
   */
  static async extractDocuments(
    documents: ApplicationDocumentReference[]
  ): Promise<ExtractedDocumentContent[]> {
    const results: ExtractedDocumentContent[] = [];

    for (const document of documents) {
      try {
        const text = await this.extractSingleDocument(document);
        results.push(text);
      } catch (error: any) {
        logger.error('Failed to extract document text', {
          url: document.url,
          fileName: document.fileName,
          error: error.message
        });

        results.push({
          ...document,
          text: '[Unable to extract text for this document]',
          truncated: false,
          extractionError: error.message
        });
      }
    }

    return results;
  }

  private static maxCharsForDocument(document: ApplicationDocumentReference): number {
    if (document.type === 'VENDOR_INVOICE') {
      const n = Number(process.env.VENDOR_INVOICE_EXTRACT_MAX_CHARS);
      if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), 500000);
      return MAX_CHAR_VENDOR_INVOICE_DEFAULT;
    }
    return MAX_CHAR_PER_DOCUMENT;
  }

  /**
   * Turn stored URLs into an absolute URL for server-side axios (relative `/api/public-media/...` rows).
   */
  static resolveDocumentUrlForFetch(url: string): string {
    const u = String(url || '').trim();
    if (!u) throw new Error('Empty document URL');
    if (/^https?:\/\//i.test(u)) return collapseDuplicatePublicMediaPath(u);
    let origin =
      process.env.API_INTERNAL_BASE_URL?.trim() ||
      process.env.BASE_URL?.trim() ||
      'http://127.0.0.1:3000';
    origin = origin.replace(/\/+$/, '');
    if (/\/api$/i.test(origin)) {
      origin = origin.replace(/\/api$/i, '');
    }
    const path = u.startsWith('/') ? u : `/${u}`;
    return collapseDuplicatePublicMediaPath(`${origin}${path}`);
  }

  private static async extractSingleDocument(
    document: ApplicationDocumentReference
  ): Promise<ExtractedDocumentContent> {
    const buffer = await this.downloadDocument(document.url, document.fileName);
    const rawText = await this.extractTextFromBuffer(buffer, document.fileName);

    const cleaned = rawText.replace(/\s+/g, ' ').trim();
    const maxChars = this.maxCharsForDocument(document);
    const truncated = cleaned.length > maxChars;
    const text = truncated ? `${cleaned.substring(0, maxChars)}...` : cleaned;
    const contentHash = cleaned ? createHash('sha256').update(cleaned).digest('hex') : undefined;

    return {
      ...document,
      text: text || '[No text content extracted]',
      truncated,
      contentHash
    };
  }

  private static async downloadDocument(url: string, fileName: string): Promise<Buffer> {
    const fetchUrl = DocumentTextExtractionService.resolveDocumentUrlForFetch(url);
    const response = await axios.get(fetchUrl, {
      responseType: 'arraybuffer',
      validateStatus: () => true
    });

    logger.info('Document download attempt', {
      url: fetchUrl,
      fileName,
      status: response.status,
      contentType: response.headers['content-type'],
      contentLength: response.headers['content-length']
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to download document. Status: ${response.status}`);
    }

    return Buffer.from(response.data);
  }

  private static async extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
    const extension = path.extname(fileName).toLowerCase();

    switch (extension) {
      case '.pdf':
        return this.extractFromPdf(buffer);
      case '.docx':
        return this.extractFromDocx(buffer);
      case '.txt':
      case '.csv':
      case '.md':
      case '.json':
        return buffer.toString('utf-8');
      default:
        return '[Unsupported file type for automatic text extraction]';
    }
  }

  private static async extractFromPdf(buffer: Buffer): Promise<string> {
    try {
      const result = await pdfParse(buffer);
      return result.text || '';
    } catch (error: any) {
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  private static async extractFromDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } catch (error: any) {
      throw new Error(`DOCX parsing failed: ${error.message}`);
    }
  }
}


