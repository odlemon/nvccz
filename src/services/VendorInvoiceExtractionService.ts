//@ts-nocheck
import { LlmChatService } from "./LlmChatService";
import { DocumentTextExtractionService } from "./DocumentTextExtractionService";
import { logger } from "../utils/logger";

export type ExtractedInvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

/** A figure on the invoice that does not add up, or a key figure that is missing. */
export type ExtractionCheck = { code: string; message: string };

export type ExtractedVendorInvoicePayload = {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate?: string | null;
  currencyCode: string | null;
  supplierName?: string | null;
  supplierTaxNumber?: string | null;
  purchaseOrderReference?: string | null;
  lines: ExtractedInvoiceLine[];
  subtotal?: number | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  totalAmount?: number | null;
  taxTreatment?: "VAT_15" | "ZERO_RATED" | "EXEMPT" | "UNKNOWN";
  fieldConfidence?: Record<string, number>;
  overallConfidence: number;
  /** Arithmetic and completeness checks on what was read; any failed arithmetic caps the confidence. */
  checks?: ExtractionCheck[];
  /** The text the model read came from OCR of a scan or photo. */
  readFromOcr?: boolean;
};

/** Confidence ceiling when the figures read do not add up: the reading goes to verification. */
const ARITHMETIC_CONFIDENCE_CAP = 0.6;
/** Confidence ceiling when the invoice total could not be read at all. */
const MISSING_TOTAL_CONFIDENCE_CAP = 0.75;

/**
 * Suite 06.1 — Text extraction (text layer, or OCR for scans and photos) + LLM structured parse (OpenAI-compatible API).
 */
export class VendorInvoiceExtractionService {
  static async extractTextFromUrl(documentUrl: string, fileName = "invoice.pdf"): Promise<string> {
    return (await this.extractTextFromUrlDetailed(documentUrl, fileName)).text;
  }

  /** The document's text, and whether it came from OCR. */
  static async extractTextFromUrlDetailed(documentUrl: string, fileName = "invoice.pdf"): Promise<{ text: string; ocr: boolean }> {
    const [doc] = await DocumentTextExtractionService.extractDocuments([
      { url: documentUrl, type: "VENDOR_INVOICE", fileName },
    ]);
    if (doc.extractionError) {
      throw new Error(doc.extractionError);
    }
    return { text: doc.text || "", ocr: Boolean(doc.ocr) };
  }

  /**
   * Parse extracted text into structured JSON using the configured LLM.
   * @param correctionHints — per-vendor field overrides (from VendorInvoiceFieldCorrection).
   * @param ocr — the text came from OCR of a scan or photo.
   */
  static async parseExtractedTextWithLlm(
    rawText: string,
    options?: { correctionHints?: Record<string, string>; ocr?: boolean }
  ): Promise<{ payload: ExtractedVendorInvoicePayload; rawAssistant: string }> {
    const hints = options?.correctionHints || {};
    const hintBlock =
      Object.keys(hints).length > 0
        ? `\nKnown vendor-specific corrections (apply when reconciling ambiguous fields):\n${JSON.stringify(hints, null, 2)}\n`
        : "";
    const ocrBlock = options?.ocr
      ? "\nThe text below was produced by OCR from a scan or photo of the invoice, so characters may be misread (O/0, l/1, S/5, B/8, commas and full stops) and columns may be shifted.\n"
      : "";

    const system = `You are an expert accounts-payable clerk. Extract structured vendor invoice data from noisy OCR/plain text.

Output rules:
- Return JSON only (no markdown, no prose, no code fences) and match the schema exactly.
- Only use evidence in the text. Do not invent values.
- If a field is missing or ambiguous, use null (or empty array) and reduce confidence.

Extraction rules:
- Prefer invoice-specific labels: "Invoice", "Tax Invoice", "Invoice No", "Invoice #", "INV", "Bill To", "Sold To", "Subtotal", "VAT", "Tax", "Total", "Balance Due".
- Ignore unrelated sections like signatures/terms unless they contain invoice fields.
- invoiceNumber: pick the supplier invoice reference (often near "Invoice No/#"). Do not use PO/GRN numbers as invoiceNumber.
- invoiceDate: return ISO date YYYY-MM-DD. If multiple dates appear, choose the invoice date (not due date / delivery date / generated date). Read day-first dates (13/09/2026, 11-Sep-2026) as day, month, year.
- dueDate: the payment due date as ISO YYYY-MM-DD, or null.
- supplierName: the company that issued the invoice (the seller, usually at the top with its address). Never the buyer named under "Bill to", "Sold to", "Invoice to" or "Customer".
- supplierTaxNumber: the supplier's own VAT or tax registration number as printed, or null.
- purchaseOrderReference: the buyer's purchase order number exactly as printed (labels such as "PO", "Purchase order", "Order ref", "Your order", "Order no"), or null.
- currencyCode: 3-letter ISO (USD, ZWL, ZWG, ZAR, GBP, EUR). "US$" and "$" on a Zimbabwean or US invoice mean USD. Infer from symbols only when unambiguous; otherwise null.
- lines: extract every item row, across all pages. Prefer tabular structures; otherwise infer from repeated patterns of description + qty + unit price + amount. Columns may appear in any order.
- numeric parsing: strip thousands separators and currency symbols, keep decimals. If only two of (quantity, unitPrice, lineTotal) are present, compute the third only if consistent; otherwise set missing numeric fields to 0 and reduce confidence.
- subtotal, taxAmount, totalAmount: the figures printed on the invoice (total before tax, tax, total payable), not your own sums; null when not printed.
- taxRate: the tax percentage printed (for example 15.5 for "VAT @ 15.5%"), or null.
- Use arithmetic to resolve misread digits: quantity × unitPrice = lineTotal, the lines add up to the subtotal, subtotal + taxAmount = totalAmount.

Tax treatment:
- VAT_15: standard-rated VAT charged — Zimbabwe's standard rate is 15.5% (earlier 15%); "VAT 15%", "VAT @ 15.5%" and "VAT 15.5%" are all VAT_15.
- ZERO_RATED: explicit "zero rated" / "VAT 0%".
- EXEMPT: explicit "exempt" / "no VAT" / "VAT exempt".
- UNKNOWN: cannot determine.

Confidence:
- fieldConfidence values are 0..1 for key fields (invoiceNumber, invoiceDate, currencyCode, supplierName, purchaseOrderReference, lines, totalAmount, taxTreatment).
- overallConfidence is 0..1 for the whole extraction.
- If the document does NOT look like a vendor invoice (e.g. quote, statement, termsheet), set overallConfidence <= 0.3, avoid guessing invoiceNumber/invoiceDate/currencyCode, and keep lines empty unless clearly invoice line items.`;

    const user = `Extract vendor invoice fields from this text.${hintBlock}${ocrBlock}
"""${rawText.slice(0, 120000)}"""

Return JSON with this shape:
{
  "invoiceNumber": string | null,
  "invoiceDate": string | null (ISO date if possible),
  "dueDate": string | null (ISO date if possible),
  "currencyCode": string | null (3-letter),
  "supplierName": string | null,
  "supplierTaxNumber": string | null,
  "purchaseOrderReference": string | null,
  "lines": [ { "description": string, "quantity": number, "unitPrice": number, "lineTotal": number } ],
  "subtotal": number | null,
  "taxRate": number | null,
  "taxAmount": number | null,
  "totalAmount": number | null,
  "taxTreatment": "VAT_15" | "ZERO_RATED" | "EXEMPT" | "UNKNOWN",
  "fieldConfidence": { "invoiceNumber": number, ... },
  "overallConfidence": number
}`;

    let raw: string;
    try {
      raw = await LlmChatService.chatCompletion(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { temperature: 0.1, maxTokens: 6000, responseFormatJsonObject: true }
      );
    } catch (e: any) {
      logger.warn("LLM json_object mode failed, retrying without", { message: e.message });
      raw = await LlmChatService.chatCompletion(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { temperature: 0.1, maxTokens: 6000 }
      );
    }

    const payload = this.normalizePayload(raw, { ocr: Boolean(options?.ocr) });
    return { payload, rawAssistant: raw };
  }

  /** A figure as the model returned it: "1,068.00", "US$ 7 264,95", 1068 or "(12.00)". */
  static toNumber(v: any): number | null {
    if (v == null || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    let s = String(v).trim();
    const negative = /^\(.*\)$/.test(s) || /^-/.test(s);
    s = s.replace(/[^0-9.,]/g, "");
    if (!s) return null;
    // A comma followed by exactly two digits at the end, with no full stop, is a decimal comma.
    if (/,\d{2}$/.test(s) && !s.includes(".")) s = s.replace(/,(?=\d{2}$)/, ".");
    s = s.replace(/,/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? (negative ? -n : n) : null;
  }

  static toIsoDate(v: any): string | null {
    if (v == null || v === "") return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
  }

  static toText(v: any): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
  }

  static normalizePayload(raw: string, meta?: { ocr?: boolean }): ExtractedVendorInvoicePayload {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("LLM did not return parseable JSON");
    }
    const p = JSON.parse(jsonMatch[0]);
    const lines = (Array.isArray(p.lines) ? p.lines : []).map((l: any) => ({
      description: String(l?.description || "").trim(),
      quantity: this.toNumber(l?.quantity) ?? 0,
      unitPrice: this.toNumber(l?.unitPrice) ?? 0,
      lineTotal: this.toNumber(l?.lineTotal) ?? 0,
    }));
    const payload: ExtractedVendorInvoicePayload = {
      invoiceNumber: this.toText(p.invoiceNumber),
      invoiceDate: this.toIsoDate(p.invoiceDate) ?? this.toText(p.invoiceDate),
      dueDate: this.toIsoDate(p.dueDate),
      currencyCode: this.toText(p.currencyCode)?.toUpperCase() ?? null,
      supplierName: this.toText(p.supplierName),
      supplierTaxNumber: this.toText(p.supplierTaxNumber),
      purchaseOrderReference: this.toText(p.purchaseOrderReference),
      lines,
      subtotal: this.toNumber(p.subtotal),
      taxRate: this.toNumber(p.taxRate),
      taxAmount: this.toNumber(p.taxAmount),
      totalAmount: this.toNumber(p.totalAmount),
      taxTreatment: p.taxTreatment || "UNKNOWN",
      fieldConfidence:
        typeof p.fieldConfidence === "object" && p.fieldConfidence ? p.fieldConfidence : undefined,
      overallConfidence:
        typeof p.overallConfidence === "number"
          ? Math.max(0, Math.min(1, p.overallConfidence))
          : 0.5,
      readFromOcr: Boolean(meta?.ocr),
    };
    payload.checks = this.checkArithmetic(payload);
    const arithmetic = payload.checks.filter((c) => c.code !== "TOTAL_NOT_READ");
    if (arithmetic.length) payload.overallConfidence = Math.min(payload.overallConfidence, ARITHMETIC_CONFIDENCE_CAP);
    else if (payload.checks.length) payload.overallConfidence = Math.min(payload.overallConfidence, MISSING_TOTAL_CONFIDENCE_CAP);
    return payload;
  }

  /** Whether the figures read agree with each other; each failure is said in words an AP clerk would use. */
  static checkArithmetic(p: ExtractedVendorInvoicePayload): ExtractionCheck[] {
    const checks: ExtractionCheck[] = [];
    const tol = (n: number) => Math.max(0.02, Math.abs(n) * 0.0005);
    const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    p.lines.forEach((l, i) => {
      if (l.quantity > 0 && l.unitPrice > 0 && l.lineTotal > 0 && Math.abs(l.quantity * l.unitPrice - l.lineTotal) > tol(l.lineTotal)) {
        checks.push({ code: "LINE_ARITHMETIC", message: `Line ${i + 1} (${l.description || "no description"}): ${l.quantity} × ${fmt(l.unitPrice)} is ${fmt(l.quantity * l.unitPrice)}, not ${fmt(l.lineTotal)}` });
      }
    });
    const linesTotal = Math.round(p.lines.reduce((t, l) => t + (l.lineTotal || 0), 0) * 100) / 100;
    if (p.subtotal != null && p.lines.length && Math.abs(linesTotal - p.subtotal) > tol(p.subtotal)) {
      checks.push({ code: "SUBTOTAL_MISMATCH", message: `The lines add up to ${fmt(linesTotal)}, but the subtotal reads ${fmt(p.subtotal)}` });
    }
    if (p.subtotal != null && p.taxAmount != null && p.totalAmount != null && Math.abs(p.subtotal + p.taxAmount - p.totalAmount) > tol(p.totalAmount)) {
      checks.push({ code: "TOTAL_MISMATCH", message: `Subtotal ${fmt(p.subtotal)} plus tax ${fmt(p.taxAmount)} is ${fmt(p.subtotal + p.taxAmount)}, but the total reads ${fmt(p.totalAmount)}` });
    }
    if (p.subtotal && p.taxAmount != null && p.taxRate != null && Math.abs((p.taxAmount / p.subtotal) * 100 - p.taxRate) > 0.1) {
      checks.push({ code: "TAX_RATE_MISMATCH", message: `Tax ${fmt(p.taxAmount)} is ${((p.taxAmount / p.subtotal) * 100).toFixed(2)}% of the subtotal, not the ${p.taxRate}% printed` });
    }
    if (p.totalAmount == null && p.lines.length) {
      checks.push({ code: "TOTAL_NOT_READ", message: "The invoice total could not be read" });
    }
    return checks;
  }
}
