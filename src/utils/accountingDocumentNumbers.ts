import type { PrismaClient } from "@prisma/client";

/** YYYYMMDD in UTC — used as the date anchor in document numbers. */
export function formatYyyymmddUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

type InvoiceNumberDb = Pick<
  PrismaClient,
  "invoice" | "purchaseInvoice" | "procurementInvoice"
>;

function parseInvUnderscoreSuffix(invoiceNumber: string | null | undefined): number | null {
  if (!invoiceNumber) return null;
  const m = String(invoiceNumber).match(/^INV_(\d{8})_(\d+)$/);
  return m ? parseInt(m[2], 10) : null;
}

async function maxInvSuffixForDate(
  prisma: InvoiceNumberDb,
  ymd: string
): Promise<number> {
  const prefix = `INV_${ymd}_`;
  const [ar, ap, proc] = await Promise.all([
    prisma.invoice.findMany({
      where: { invoiceNumber: { startsWith: prefix } },
      select: { invoiceNumber: true },
    }),
    prisma.purchaseInvoice.findMany({
      where: { invoiceNumber: { startsWith: prefix } },
      select: { invoiceNumber: true },
    }),
    prisma.procurementInvoice.findMany({
      where: { invoiceNumber: { startsWith: prefix } },
      select: { invoiceNumber: true },
    }),
  ]);
  let max = 0;
  for (const row of [...ar, ...ap, ...proc]) {
    const s = parseInvUnderscoreSuffix(row.invoiceNumber);
    if (s != null) max = Math.max(max, s);
  }
  return max;
}

/**
 * Next unified sales / AP / procurement internal invoice number for the UTC calendar day
 * of `dateForSequence`, shared across `Invoice`, `PurchaseInvoice`, and `ProcurementInvoice`.
 */
export async function nextUnifiedInvoiceNumber(
  prisma: InvoiceNumberDb,
  dateForSequence: Date
): Promise<string> {
  // one shared counter (procurement, accounts payable and receivable), under the configured invoice format
  const { NumberingService } = await import("../services/numbering/NumberingService");
  return NumberingService.nextIn(prisma, "INVOICE", dateForSequence);
}

export async function isUnifiedInvoiceNumberInUse(
  prisma: InvoiceNumberDb,
  invoiceNumber: string
): Promise<boolean> {
  const [a, b, c] = await Promise.all([
    prisma.invoice.findFirst({ where: { invoiceNumber }, select: { id: true } }),
    prisma.purchaseInvoice.findFirst({ where: { invoiceNumber }, select: { id: true } }),
    prisma.procurementInvoice.findFirst({ where: { invoiceNumber }, select: { id: true } }),
  ]);
  return !!(a || b || c);
}

type QuotationDb = Pick<PrismaClient, "vendorQuotation">;

async function maxQuoSuffixForDate(prisma: QuotationDb, ymd: string): Promise<number> {
  const prefix = `QUO_${ymd}_`;
  const rows = await prisma.vendorQuotation.findMany({
    where: { quotationNumber: { startsWith: prefix } }, 
    select: { quotationNumber: true },
  });
  let max = 0;
  const re = /^QUO_(\d{8})_(\d+)$/;
  for (const row of rows) {
    const m = row.quotationNumber.match(re);
    if (m) max = Math.max(max, parseInt(m[2], 10));
  }
  return max;
}

/** Next vendor quotation number for the UTC calendar day of `dateForSequence`. */
export async function nextQuotationNumber(
  prisma: QuotationDb,
  dateForSequence: Date
): Promise<string> {
  const { NumberingService } = await import("../services/numbering/NumberingService");
  return NumberingService.nextIn(prisma, "QUOTATION", dateForSequence);
}
