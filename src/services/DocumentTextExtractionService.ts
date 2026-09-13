//@ts-nocheck
import axios from 'axios';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from '../utils/logger';
import { collapseDuplicatePublicMediaPath } from './RemoteUploadService';

const execFileAsync = promisify(execFile);

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
  /** The text came from OCR (a scan or a photo), not from the document's own text layer. */
  ocr?: boolean;
}

/** Portfolio / shortlisting: keep prompts small. */
const MAX_CHAR_PER_DOCUMENT = 4000;
/** Suite 06 vendor invoices: must not truncate before LLM (see VendorInvoiceExtractionService slice). */
const MAX_CHAR_VENDOR_INVOICE_DEFAULT = 120000;
/** A vendor invoice PDF with fewer letters and digits than this in its text layer is a scan, read with OCR instead. */
const MIN_PDF_TEXT_CHARS = 40;
/** Pages of a scanned invoice PDF read with OCR. */
const OCR_MAX_PAGES = Math.max(1, Math.min(20, Number(process.env.VENDOR_INVOICE_OCR_MAX_PAGES) || 6));

type BufferText = { text: string; ocr: boolean };

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
    const isInvoice = document.type === 'VENDOR_INVOICE';
    const buffer = await this.downloadDocument(document.url, document.fileName);
    const { text: rawText, ocr } = await this.extractTextFromBuffer(buffer, document.fileName, isInvoice);

    // An invoice keeps its line breaks: a table read as one run-on line loses which figures belong to which row,
    // and OCR text especially depends on them. Other documents are collapsed to keep prompts small, as before.
    const cleaned = isInvoice
      ? rawText.replace(/[ \t\f\v]+/g, ' ').replace(/ *\n[\s]*/g, '\n').trim()
      : rawText.replace(/\s+/g, ' ').trim();
    // A vendor invoice with nothing readable is an error, not a placeholder the model would be asked to read
    // (it answered with an empty, zero-confidence reading, and the scan looked "read").
    if (isInvoice && this.meaningfulChars(cleaned) === 0) {
      throw new Error(
        ocr
          ? 'No readable text was found in this invoice, even with OCR — the scan or photo may be too faint, blurred or small'
          : 'No readable text was found in this invoice document'
      );
    }
    const maxChars = this.maxCharsForDocument(document);
    const truncated = cleaned.length > maxChars;
    const text = truncated ? `${cleaned.substring(0, maxChars)}...` : cleaned;
    const contentHash = cleaned ? createHash('sha256').update(cleaned).digest('hex') : undefined;

    return {
      ...document,
      text: text || '[No text content extracted]',
      truncated,
      contentHash,
      ocr
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

  /** What the bytes are, whatever the file is called: stored invoices are fetched under a generic name. */
  private static sniffKind(buffer: Buffer, fileName: string): 'pdf' | 'image' | 'docx' | 'text' | 'unknown' {
    const head = buffer.subarray(0, 12);
    if (head.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
    if (head[0] === 0x89 && head.subarray(1, 4).toString('latin1') === 'PNG') return 'image';
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image';
    // TIFF: "II*" then a zero byte (little-endian), or "MM", a zero byte, "*" (big-endian).
    if ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0x00) || (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0x00 && head[3] === 0x2a)) return 'image';
    if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image';
    const extension = path.extname(fileName).toLowerCase();
    if (extension === '.docx') return 'docx';
    if (['.txt', '.csv', '.md', '.json'].includes(extension)) return 'text';
    if (extension === '.pdf') return 'pdf';
    if (['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'].includes(extension)) return 'image';
    return 'unknown';
  }

  private static meaningfulChars(text: string): number {
    return (String(text || '').match(/[A-Za-z0-9]/g) || []).length;
  }

  private static async extractTextFromBuffer(buffer: Buffer, fileName: string, allowOcr = false): Promise<BufferText> {
    switch (this.sniffKind(buffer, fileName)) {
      case 'pdf': {
        const text = await this.extractFromPdf(buffer);
        if (allowOcr && this.meaningfulChars(text) < MIN_PDF_TEXT_CHARS) {
          logger.info('Invoice PDF has no usable text layer; reading it with OCR', { fileName, textChars: this.meaningfulChars(text) });
          return { text: await this.ocrPdf(buffer), ocr: true };
        }
        return { text, ocr: false };
      }
      case 'image':
        if (!allowOcr) return { text: '[Unsupported file type for automatic text extraction]', ocr: false };
        return { text: await this.ocrImage(buffer), ocr: true };
      case 'docx':
        return { text: await this.extractFromDocx(buffer), ocr: false };
      case 'text':
        return { text: buffer.toString('utf-8'), ocr: false };
      default:
        return { text: '[Unsupported file type for automatic text extraction]', ocr: false };
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

  // ------------------------------------------------------------------ OCR (scans and photos of invoices)

  private static async withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'invoice-ocr-'));
    try {
      return await fn(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Tesseract on one image. Page segmentation 6 keeps a table row's description and figures on one line. */
  private static async tesseract(imagePath: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        'tesseract',
        [imagePath, 'stdout', '-l', process.env.VENDOR_INVOICE_OCR_LANG || 'eng', '--psm', '6', '-c', 'preserve_interword_spaces=1'],
        { timeout: 90000, maxBuffer: 20 * 1024 * 1024 }
      );
      return stdout || '';
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        throw new Error('This invoice is a scan or a photo, and OCR (tesseract) is not installed on this server');
      }
      throw new Error(`OCR failed: ${String(error?.message || error).split('\n')[0]}`);
    }
  }

  private static async ocrImage(buffer: Buffer): Promise<string> {
    return this.withTempDir(async (dir) => {
      const file = path.join(dir, 'invoice-image');
      await fs.writeFile(file, buffer);
      return this.tesseract(file);
    });
  }

  private static async ocrPdf(buffer: Buffer): Promise<string> {
    return this.withTempDir(async (dir) => {
      const pdfPath = path.join(dir, 'invoice.pdf');
      await fs.writeFile(pdfPath, buffer);
      try {
        await execFileAsync('pdftoppm', ['-r', '300', '-png', '-f', '1', '-l', String(OCR_MAX_PAGES), pdfPath, path.join(dir, 'page')], {
          timeout: 120000,
        });
      } catch (error: any) {
        if (error?.code === 'ENOENT') {
          throw new Error('This invoice PDF is a scan, and the PDF renderer (pdftoppm) is not installed on this server');
        }
        throw new Error(`Could not render the scanned invoice PDF: ${String(error?.message || error).split('\n')[0]}`);
      }
      const pages = (await fs.readdir(dir))
        .filter((f) => /^page-\d+\.png$/.test(f))
        .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
      const texts = [];
      for (const page of pages) texts.push(await this.tesseract(path.join(dir, page)));
      return texts.join('\n\n');
    });
  }
}
