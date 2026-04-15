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

    const system = `You extract structured data from vendor invoice text. Respond with JSON only, matching the schema. 
Use fieldConfidence 0-1 for critical fields (invoiceNumber, totals). overallConfidence is 0-1 for the whole extraction.
If a field is missing, use null or empty array.`;

    const user = `Extract invoice fields from this text:${hintBlock}
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
