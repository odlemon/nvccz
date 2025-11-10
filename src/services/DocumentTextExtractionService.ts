//@ts-nocheck
import fetch from 'node-fetch';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from '../utils/logger';

export interface ApplicationDocumentReference {
  url: string;
  type: string;
  fileName: string;
}

export interface ExtractedDocumentContent extends ApplicationDocumentReference {
  text: string;
  truncated: boolean;
  extractionError?: string;
}

const MAX_CHAR_PER_DOCUMENT = 4000;

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

  private static async extractSingleDocument(
    document: ApplicationDocumentReference
  ): Promise<ExtractedDocumentContent> {
    const buffer = await this.downloadDocument(document.url);
    const rawText = await this.extractTextFromBuffer(buffer, document.fileName);

    const cleaned = rawText.replace(/\s+/g, ' ').trim();
    const truncated = cleaned.length > MAX_CHAR_PER_DOCUMENT;
    const text = truncated ? `${cleaned.substring(0, MAX_CHAR_PER_DOCUMENT)}...` : cleaned;

    return {
      ...document,
      text: text || '[No text content extracted]',
      truncated
    };
  }

  private static async downloadDocument(url: string): Promise<Buffer> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download document. Status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
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


