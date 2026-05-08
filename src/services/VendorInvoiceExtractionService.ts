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

export type ExtractedVendorInvoicePayload = {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currencyCode: string | null;
  lines: ExtractedInvoiceLine[];
  taxTreatment?: "VAT_15" | "ZERO_RATED" | "EXEMPT" | "UNKNOWN";
  fieldConfidence?: Record<string, number>;
  overallConfidence: number;
};

/**
 * Suite 06.1 — Text extraction + LLM structured parse (OpenAI-compatible API).
 */
export class VendorInvoiceExtractionService {
  static async extractTextFromUrl(documentUrl: string, fileName = "invoice.pdf"): Promise<string> {
    const [doc] = await DocumentTextExtractionService.extractDocuments([
      { url: documentUrl, type: "VENDOR_INVOICE", fileName },
    ]);
    if (doc.extractionError) {
      throw new Error(doc.extractionError);
    }
    return doc.text || "";
  }

  /**
   * Parse extracted text into structured JSON using the configured LLM.
   * @param correctionHints — per-vendor field overrides (from VendorInvoiceFieldCorrection).
   */
  static async parseExtractedTextWithLlm(
    rawText: string,
    options?: { correctionHints?: Record<string, string> }
  ): Promise<{ payload: ExtractedVendorInvoicePayload; rawAssistant: string }> {
    const hints = options?.correctionHints || {};
    const hintBlock =
      Object.keys(hints).length > 0
        ? `\nKnown vendor-specific corrections (apply when reconciling ambiguous fields):\n${JSON.stringify(hints, null, 2)}\n`
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
- invoiceDate: return ISO date YYYY-MM-DD. If multiple dates appear, choose the invoice date (not due date / delivery date / generated date).
- currencyCode: 3-letter ISO (USD, ZWL, ZWG, ZAR, GBP, EUR). Infer from symbols only when unambiguous; otherwise null.
- lines: extract item rows. Prefer tabular structures; otherwise infer from repeated patterns of description + qty + unit price + amount.
- numeric parsing: strip thousands separators, keep decimals. If only two of (quantity, unitPrice, lineTotal) are present, compute the third only if consistent; otherwise set missing numeric fields to 0 and reduce confidence.

Tax treatment:
- VAT_15: explicit VAT at 15% / "VAT 15%".
- ZERO_RATED: explicit "zero rated" / "VAT 0%".
- EXEMPT: explicit "exempt" / "no VAT" / "VAT exempt".
- UNKNOWN: cannot determine.

Confidence:
- fieldConfidence values are 0..1 for key fields (invoiceNumber, invoiceDate, currencyCode, lines, taxTreatment).
- overallConfidence is 0..1 for the whole extraction.
- If the document does NOT look like a vendor invoice (e.g. quote, statement, termsheet), set overallConfidence <= 0.3, avoid guessing invoiceNumber/invoiceDate/currencyCode, and keep lines empty unless clearly invoice line items.`;

    const user = `Extract vendor invoice fields from this text.${hintBlock}
"""${rawText.slice(0, 120000)}"""

Return JSON with this shape:
{
  "invoiceNumber": string | null,
  "invoiceDate": string | null (ISO date if possible),
  "currencyCode": string | null (3-letter),
  "lines": [ { "description": string, "quantity": number, "unitPrice": number, "lineTotal": number } ],
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
        { temperature: 0.1, maxTokens: 4000, responseFormatJsonObject: true }
      );
    } catch (e: any) {
      logger.warn("LLM json_object mode failed, retrying without", { message: e.message });
      raw = await LlmChatService.chatCompletion(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { temperature: 0.1, maxTokens: 4000 }
      );
    }

    const payload = this.normalizePayload(raw);
    return { payload, rawAssistant: raw };
  }

  static normalizePayload(raw: string): ExtractedVendorInvoicePayload {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("LLM did not return parseable JSON");
    }
    const p = JSON.parse(jsonMatch[0]);
    const lines = Array.isArray(p.lines) ? p.lines : [];
    return {
      invoiceNumber: p.invoiceNumber ?? null,
      invoiceDate: p.invoiceDate ?? null,
      currencyCode: p.currencyCode ?? null,
      lines: lines.map((l: any) => ({
        description: String(l.description || ""),
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0,
        lineTotal: Number(l.lineTotal) || 0,
      })),
      taxTreatment: p.taxTreatment || "UNKNOWN",
      fieldConfidence:
        typeof p.fieldConfidence === "object" && p.fieldConfidence ? p.fieldConfidence : undefined,
      overallConfidence:
        typeof p.overallConfidence === "number"
          ? Math.max(0, Math.min(1, p.overallConfidence))
          : 0.5,
    };
  }
}
