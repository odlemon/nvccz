import type { PrismaClient } from "@prisma/client";
import { formatYyyymmddUtc } from "./accountingDocumentNumbers";

function parseUnderscoreSuffix(input: string | null | undefined, prefix: string): number | null {
  if (!input) return null;
  const re = new RegExp(`^${prefix}_(\\d{8})_(\\d+)$`);
  const m = String(input).match(re);
  return m ? parseInt(m[2], 10) : null;
}

function applyTemplate(format: string, ymd: string, seq: number): string {
  const yyyy = ymd.slice(0, 4);
  const mm = ymd.slice(4, 6);
  const dd = ymd.slice(6, 8);
  const seq4 = String(seq).padStart(4, "0");
  return String(format)
    .replace(/\{YYYY\}/gi, yyyy)
    .replace(/\{MM\}/gi, mm)
    .replace(/\{DD\}/gi, dd)
    .replace(/\{####\}/g, seq4)
    .replace(/YYYYMMDD/g, ymd);
}

function literalPrefixFromFormat(format: string, fallback: string): string {
  const before = String(format).split("{")[0] || "";
  const cleaned = before.replace(/_+$/, "").trim();
  if (cleaned && /^[A-Za-z0-9]+$/.test(cleaned)) return cleaned;
  return fallback;
}

async function nextForTable(params: {
  prisma: PrismaClient;
  prefix: string;
  ymd: string;
  format?: string | null;
  findMany: () => Promise<Array<{ n: string | null }>>;
}): Promise<string> {
  const rows = await params.findMany();
  let max = 0;
  for (const r of rows) {
    const s = parseUnderscoreSuffix(r.n, params.prefix);
    if (s != null) max = Math.max(max, s);
    const m = String(r.n || "").match(/(\d{4})$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const next = max + 1;
  if (next > 9999) {
    throw new Error(`Daily ${params.prefix} sequence exhausted for ${params.ymd} (limit 9999)`);
  }
  if (params.format && /\{/.test(String(params.format))) {
    return applyTemplate(params.format, params.ymd, next);
  }
  return `${params.prefix}_${params.ymd}_${String(next).padStart(4, "0")}`;
}

async function readNumberFormat(
  prisma: PrismaClient,
  field: "prNumberFormat" | "poNumberFormat" | "rfqNumberFormat"
): Promise<string | null> {
  try {
    const row = await (prisma as any).procurementSettings.findUnique({ where: { id: "default" } });
    return row?.[field] ? String(row[field]) : null;
  } catch {
    return null;
  }
}

/**
 * References (SRD §39) come from the shared numbering service: one atomic counter per reference type and period, a format that is
 * a setting for every type, and a first number that continues after any that already exist (src/services/numbering).
 */
import { NumberingService } from "../services/numbering/NumberingService";

/** Next purchase requisition number, under the configured requisition format. */
export async function nextProcurementRequisitionNumber(prisma: PrismaClient, dateForSequence: Date) {
  return NumberingService.nextIn(prisma, "REQUISITION", dateForSequence);
}

/** Next sourcing-event number: the tender format for a tender, the RFQ format for every other method. */
export async function nextProcurementRfqNumber(prisma: PrismaClient, dateForSequence: Date, method?: string | null) {
  return NumberingService.nextIn(prisma, String(method || "").toUpperCase() === "TENDER" ? "TENDER" : "RFQ", dateForSequence);
}

/** Next purchase order number, under the configured PO format. */
export async function nextProcurementPoNumber(prisma: PrismaClient, dateForSequence: Date) {
  return NumberingService.nextIn(prisma, "PURCHASE_ORDER", dateForSequence);
}

/** Next goods received note number, under the configured GRN format. */
export async function nextProcurementGrnNumber(prisma: PrismaClient, dateForSequence: Date) {
  return NumberingService.nextIn(prisma, "GRN", dateForSequence);
}
