// @ts-nocheck
import { prisma } from "../../utils/database";

/**
 * SRD §39: one numbering mechanism for every reference the procurement module generates.
 *
 * - Every reference has a configurable format (procurement_settings): {YYYY} {MM} {DD} and one zero-padded counter {####}.
 *   `REQ-{YYYY}-{######}` gives REQ-2026-000001; `PO_{YYYY}{MM}{DD}_{####}` gives PO_20260926_0001.
 * - The counter is scoped to everything in the format that is not the counter, so a yearly format restarts each year and a daily
 *   one each day. It is one row in document_sequences, bumped with an atomic upsert. Two creates at the same instant serialise on
 *   that row's lock and can never receive the same number. Called inside the transaction that creates the document, a rolled-back
 *   create rolls the bump back with it, so the numbers are gap-free; called on its own (a create that is not in a transaction) it
 *   uses a short transaction of its own, which is still unique and sequential, and leaves a gap only if the create then fails.
 * - The first time a period's counter is used it starts after the highest number already issued in that period, so switching
 *   the mechanism on (or changing back to an older format) never collides with a record that exists.
 * - Changing a format changes the references generated from then on; existing references are never renumbered.
 */
export type NumberingKey = "REQUISITION" | "RFQ" | "TENDER" | "QUOTATION" | "PURCHASE_ORDER" | "GRN" | "INVOICE";

type Source = { model: string; column: string };
export type NumberingSpec = { key: NumberingKey; label: string; docType: string; field: string; defaultFormat: string; sources: Source[] };

export const NUMBERING_SPECS: Record<NumberingKey, NumberingSpec> = {
  REQUISITION: { key: "REQUISITION", label: "Requisition", docType: "PR", field: "prNumberFormat", defaultFormat: "PR-{YYYY}-{######}", sources: [{ model: "purchaseRequisition", column: "requisitionNumber" }] },
  RFQ: { key: "RFQ", label: "RFQ", docType: "RFQ", field: "rfqNumberFormat", defaultFormat: "RFQ_{YYYY}{MM}{DD}_{####}", sources: [{ model: "procurementRfq", column: "rfqNumber" }] },
  TENDER: { key: "TENDER", label: "Tender", docType: "TND", field: "tenderNumberFormat", defaultFormat: "TND_{YYYY}{MM}{DD}_{####}", sources: [{ model: "procurementRfq", column: "rfqNumber" }] },
  QUOTATION: { key: "QUOTATION", label: "Quotation", docType: "QUO", field: "quotationNumberFormat", defaultFormat: "QUO_{YYYY}{MM}{DD}_{####}", sources: [{ model: "vendorQuotation", column: "quotationNumber" }] },
  PURCHASE_ORDER: { key: "PURCHASE_ORDER", label: "Purchase order", docType: "PO", field: "poNumberFormat", defaultFormat: "PO_{YYYY}{MM}{DD}_{####}", sources: [{ model: "purchaseOrder", column: "poNumber" }] },
  GRN: { key: "GRN", label: "Goods received note", docType: "GRN", field: "grnNumberFormat", defaultFormat: "GRN_{YYYY}{MM}{DD}_{####}", sources: [{ model: "goodsReceivedNote", column: "grnNumber" }] },
  INVOICE: {
    key: "INVOICE", label: "Invoice", docType: "INV", field: "invoiceNumberFormat", defaultFormat: "INV_{YYYY}{MM}{DD}_{####}",
    // one invoice sequence is shared with accounting, so the counter continues from the highest number in any of the three
    sources: [{ model: "invoice", column: "invoiceNumber" }, { model: "purchaseInvoice", column: "invoiceNumber" }, { model: "procurementInvoice", column: "invoiceNumber" }],
  },
};

export function validateNumberFormat(format: string): string | null {
  if (!/\{#{1,12}\}/.test(format)) return "The format must contain a counter such as {######}.";
  if ((format.match(/\{#+\}/g) ?? []).length > 1) return "The format may contain only one counter.";
  const stripped = format.replace(/\{(YYYY|MM|DD)\}/gi, "").replace(/\{#+\}/g, "");
  if (/[{}]/.test(stripped)) return "Only {YYYY}, {MM}, {DD} and one {###…} counter are supported.";
  if (format.length > 64) return "The format is too long.";
  if (!/^[A-Za-z0-9_\-\/{}#]+$/.test(format)) return "Use letters, digits, - _ / and the placeholders only.";
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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isTx = (client: any) => typeof client?.$transaction !== "function";

export class NumberingService {
  /** The format in force for a reference type: the setting when it is valid, else the built-in default. */
  static async formatFor(client: any, key: NumberingKey): Promise<string> {
    const spec = NUMBERING_SPECS[key];
    const db = client?.procurementSettings ? client : prisma;
    const row = await db.procurementSettings.findUnique({ where: { id: "default" } }).catch(() => null);
    const fmt = row?.[spec.field] ? String(row[spec.field]) : "";
    return fmt && !validateNumberFormat(fmt) ? fmt : spec.defaultFormat;
  }

  /** What a format produces for the next number, without using one (for the settings screen and the tests). */
  static preview(format: string, at: Date = new Date(), counter = 1): string {
    return render(format, at, counter);
  }

  /** The highest counter already issued in the period `format` describes, from the records that exist. */
  private static async highestIssued(tx: any, spec: NumberingSpec, format: string, at: Date): Promise<number> {
    const period = render(format, at, null); // the period's text, the counter as #
    const at0 = period.indexOf("#");
    const literal = period.slice(0, at0);
    const re = new RegExp("^" + escapeRe(period).replace(/#+/, "(\\d+)") + "$");
    let max = 0;
    for (const s of spec.sources) {
      const rows = (await tx[s.model]?.findMany?.({ where: { [s.column]: { startsWith: literal } }, select: { [s.column]: true }, orderBy: { [s.column]: "desc" }, take: 500 })?.catch?.(() => [])) ?? [];
      for (const r of rows) {
        const m = String(r[s.column] ?? "").match(re);
        if (m) max = Math.max(max, Number(m[1]));
      }
    }
    return max;
  }

  /**
   * The next reference of a type. Pass the transaction that creates the record (gap-free); with the plain client it runs in a short
   * transaction of its own.
   */
  static async nextIn(client: any, key: NumberingKey, at: Date = new Date()): Promise<string> {
    if (!isTx(client)) return (client ?? prisma).$transaction((tx: any) => NumberingService.nextIn(tx, key, at));
    const spec = NUMBERING_SPECS[key];
    const format = await NumberingService.formatFor(client, key);
    const bad = validateNumberFormat(format);
    if (bad) throw new Error(`Invalid number format "${format}": ${bad}`);
    const seqKey = `${spec.docType}:${render(format, at, null)}`;
    // First use of a period's counter: seeded on the shared connection pool, in its own committed statement, NOT inside the creating
    // transaction. Seeding inside it left two racing creators each holding a shared lock on the row the other then needed exclusively (a deadlock).
    const existing = await prisma.$queryRawUnsafe<any[]>("SELECT counter FROM document_sequences WHERE seq_key = ?", seqKey);
    if (!existing.length) {
      const seed = await NumberingService.highestIssued(prisma, spec, format, at);
      await prisma.$executeRawUnsafe("INSERT IGNORE INTO document_sequences (seq_key, counter) VALUES (?, ?)", seqKey, seed);
    }
    await client.$executeRawUnsafe(
      "INSERT INTO document_sequences (seq_key, counter) VALUES (?, LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE counter = LAST_INSERT_ID(counter + 1)",
      seqKey,
    );
    const rows = await client.$queryRawUnsafe("SELECT LAST_INSERT_ID() AS n");
    return render(format, at, Number(rows[0].n));
  }

  /**
   * Gives a number back when the record it was issued for could not be created. Only if it is still the latest issued in its period
   * (nobody has taken the next one meanwhile), so numbers stay sequential and a failed create leaves no gap in the ordinary case.
   */
  static async releaseIfLast(key: NumberingKey, number: string, at: Date = new Date()): Promise<boolean> {
    try {
      const spec = NUMBERING_SPECS[key];
      const format = await NumberingService.formatFor(prisma, key);
      const period = render(format, at, null);
      const m = number.match(new RegExp("^" + escapeRe(period).replace(/#+/, "(\\d+)") + "$"));
      if (!m) return false;
      const r: any = await prisma.$executeRawUnsafe("UPDATE document_sequences SET counter = counter - 1 WHERE seq_key = ? AND counter = ? AND counter > 0", `${spec.docType}:${period}`, Number(m[1]));
      return Number(r) > 0;
    } catch (_e) {
      return false;
    }
  }

  /** Runs the create that uses `number`; if it fails, the number goes back (see releaseIfLast) and the failure carries on. */
  static async guard<T>(key: NumberingKey, number: string, create: () => Promise<T>): Promise<T> {
    try {
      return await create();
    } catch (e) {
      await NumberingService.releaseIfLast(key, number);
      throw e;
    }
  }

  /** Every reference type with its format in force, its default and what it would produce next: for the settings screen. */
  static async settings(client: any = prisma) {
    const now = new Date();
    return Promise.all(
      (Object.values(NUMBERING_SPECS) as NumberingSpec[]).map(async (s) => {
        const format = await NumberingService.formatFor(client, s.key);
        return { key: s.key, label: s.label, field: s.field, format, defaultFormat: s.defaultFormat, example: render(format, now, 1) };
      }),
    );
  }
}
