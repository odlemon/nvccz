import type { Prisma } from "@prisma/client";
import { prisma } from "../utils/database";

/**
 * SRD §11 automatic numbering. The format is configurable (procurement_settings.pr_number_format), e.g. `PR-{YYYY}-{######}`:
 *   {YYYY} {MM} {DD}  date parts, and {#…} a zero-padded counter whose width is the number of `#`.
 * The counter is scoped to everything in the format that is not the counter (so `PR-{YYYY}-…` restarts each year, `{YYYY}{MM}`
 * each month). It is one row in `document_sequences` bumped with an atomic upsert, and it must be called with the transaction
 * that creates the document: a rolled-back create rolls the bump back with it, so numbers are gap-free, and two concurrent
 * creates serialise on the row lock so they can never receive the same number.
 */
export const DEFAULT_PR_FORMAT = "PR-{YYYY}-{######}";

export type NumberingClient = Prisma.TransactionClient;

export function validateNumberFormat(format: string): string | null {
  if (!/\{#{1,12}\}/.test(format)) return "The format must contain a counter such as {######}.";
  if ((format.match(/\{#+\}/g) ?? []).length > 1) return "The format may contain only one counter.";
  const stripped = format.replace(/\{(YYYY|MM|DD)\}/gi, "").replace(/\{#+\}/g, "");
  if (/[{}]/.test(stripped)) return "Only {YYYY}, {MM}, {DD} and one {###…} counter are supported.";
  if (format.length > 64) return "The format is too long.";
  return null;
}

function render(format: string, d: Date, seq: number | null): string {
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return format
    .replace(/\{YYYY\}/gi, yyyy)
    .replace(/\{MM\}/gi, mm)
    .replace(/\{DD\}/gi, dd)
    .replace(/\{(#+)\}/g, (_m, hashes: string) => (seq == null ? "#" : String(seq).padStart(hashes.length, "0")));
}

export class DocumentNumberingService {
  static async formatFor(tx: NumberingClient | typeof prisma, field: "prNumberFormat" | "poNumberFormat" | "rfqNumberFormat" = "prNumberFormat") {
    const row = await (tx as any).procurementSettings.findUnique({ where: { id: "default" } }).catch(() => null);
    const fmt = row?.[field] ? String(row[field]) : "";
    return fmt && !validateNumberFormat(fmt) ? fmt : DEFAULT_PR_FORMAT;
  }

  /** Next number for `docType` under the configured format. Call inside the transaction that creates the document. */
  static async next(tx: NumberingClient, docType: string, format: string, at: Date = new Date()): Promise<string> {
    const bad = validateNumberFormat(format);
    if (bad) throw new Error(`Invalid number format "${format}": ${bad}`);
    const key = `${docType}:${render(format, at, null)}`;
    await tx.$executeRawUnsafe(
      "INSERT INTO document_sequences (seq_key, counter) VALUES (?, LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE counter = LAST_INSERT_ID(counter + 1)",
      key
    );
    const rows = await tx.$queryRawUnsafe<Array<{ n: bigint | number }>>("SELECT LAST_INSERT_ID() AS n");
    return render(format, at, Number(rows[0].n));
  }

  static async nextRequisitionNumber(tx: NumberingClient, at: Date = new Date()) {
    const { NumberingService } = await import("./numbering/NumberingService");
    return NumberingService.nextIn(tx, "REQUISITION", at);
  }
}
