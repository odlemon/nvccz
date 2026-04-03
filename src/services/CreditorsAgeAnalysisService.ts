// @ts-nocheck
/**
 * Creditors (AP) age analysis from open credit purchase invoices.
 * Liability is recognised on bill posting: Dr expense / VAT, Cr Accounts Payable (typically 2000).
 *
 * Returns a vendor-grouped summary (like Xero / Sage Aged Creditors) plus per-vendor bill detail.
 */
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import {
  bucketForDaysPastDue,
  daysPastDueAsOf,
  emptyFiveBuckets,
  FIVE_BUCKET_LABELS,
  FIVE_BUCKET_SHORT_COLUMN_TITLES,
  type FiveBucketAgeKey
} from "../utils/fiveBucketAgeAnalysis";

export type CreditorsAgeBucket = FiveBucketAgeKey;

export { daysPastDueAsOf, bucketForDaysPastDue };

/* ── Bill-level detail (nested inside vendor) ───────────────────────── */

export interface CreditorsAgeAnalysisBill {
  purchaseInvoiceId: string;
  invoiceNumber: string;
  description: string | null;
  invoiceDate: string;
  dueDate: string | null;
  currencyCode: string;
  totalAmount: number;
  vatAmount: number;
  outstandingAmount: number;
  daysPastDue: number;
  bucket: CreditorsAgeBucket;
  reportColumnTitle: string;
  journalEntryId: string | null;
}

/* ── Vendor-level summary row ───────────────────────────────────────── */

export interface CreditorsAgeVendorSummary {
  vendorId: string;
  vendorName: string;
  billCount: number;
  total: number;
  vatTotal: number;
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  over90: number;
  bills: CreditorsAgeAnalysisBill[];
}

/* ── Full report ────────────────────────────────────────────────────── */

export interface CreditorsAgeAnalysisReport {
  reportType: "CREDITORS_AGE_ANALYSIS";
  asOfDate: string;
  liabilityGlNote: string;
  agingAnchorNote: string;
  bucketLabels: Record<CreditorsAgeBucket, string>;
  bucketShortColumnTitles: Record<CreditorsAgeBucket, string>;
  vendors: CreditorsAgeVendorSummary[];
  grandTotal: {
    total: number;
    vatTotal: number;
    current: number;
    days1To30: number;
    days31To60: number;
    days61To90: number;
    over90: number;
  };
  totalsByCurrency: Record<
    string,
    Record<CreditorsAgeBucket | "total", number>
  >;
}

export class CreditorsAgeAnalysisService {
  static async generate(params?: { asOfDate?: Date }): Promise<CreditorsAgeAnalysisReport> {
    const asOf = params?.asOfDate ?? new Date();

    const invoices = await prisma.purchaseInvoice.findMany({
      where: {
        status: "POSTED",
        paymentMethod: "CREDIT",
        paymentStatus: { in: ["PENDING", "PARTIALLY_PAID"] },
        outstandingAmount: { gt: 0 }
      },
      include: {
        vendor: { select: { id: true, name: true } },
        currency: { select: { code: true } }
      },
      orderBy: [{ vendorId: "asc" }, { invoiceDate: "asc" }]
    });

    const vendorMap = new Map<string, {
      vendorId: string;
      vendorName: string;
      buckets: Record<FiveBucketAgeKey, Decimal>;
      vatTotal: Decimal;
      total: Decimal;
      bills: CreditorsAgeAnalysisBill[];
    }>();

    const totalsByCurrency: Record<string, Record<FiveBucketAgeKey, Decimal>> = {};

    const grandBuckets = emptyFiveBuckets();
    let grandVat = new Decimal(0);
    let grandTotal = new Decimal(0);

    for (const inv of invoices) {
      const code = inv.currency.code.toUpperCase();
      if (!totalsByCurrency[code]) {
        totalsByCurrency[code] = emptyFiveBuckets();
      }

      const anchor = inv.dueDate ?? inv.invoiceDate;
      const dpd = daysPastDueAsOf(anchor, asOf);
      const bucket = bucketForDaysPastDue(dpd);
      const out = new Decimal(inv.outstandingAmount);
      const vat = new Decimal(inv.vatAmount);

      totalsByCurrency[code][bucket] = totalsByCurrency[code][bucket].plus(out);

      grandBuckets[bucket] = grandBuckets[bucket].plus(out);
      grandVat = grandVat.plus(vat);
      grandTotal = grandTotal.plus(out);

      if (!vendorMap.has(inv.vendorId)) {
        vendorMap.set(inv.vendorId, {
          vendorId: inv.vendorId,
          vendorName: inv.vendor.name,
          buckets: emptyFiveBuckets(),
          vatTotal: new Decimal(0),
          total: new Decimal(0),
          bills: []
        });
      }
      const v = vendorMap.get(inv.vendorId)!;
      v.buckets[bucket] = v.buckets[bucket].plus(out);
      v.vatTotal = v.vatTotal.plus(vat);
      v.total = v.total.plus(out);
      v.bills.push({
        purchaseInvoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        description: inv.description,
        invoiceDate: inv.invoiceDate.toISOString().slice(0, 10),
        dueDate: inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : null,
        currencyCode: code,
        totalAmount: new Decimal(inv.totalAmount).toNumber(),
        vatAmount: vat.toNumber(),
        outstandingAmount: out.toNumber(),
        daysPastDue: dpd,
        bucket,
        reportColumnTitle: FIVE_BUCKET_SHORT_COLUMN_TITLES[bucket],
        journalEntryId: inv.journalEntryId
      });
    }

    const vendors: CreditorsAgeVendorSummary[] = Array.from(vendorMap.values()).map(v => ({
      vendorId: v.vendorId,
      vendorName: v.vendorName,
      billCount: v.bills.length,
      total: v.total.toNumber(),
      vatTotal: v.vatTotal.toNumber(),
      current: v.buckets.current.toNumber(),
      days1To30: v.buckets.days1To30.toNumber(),
      days31To60: v.buckets.days31To60.toNumber(),
      days61To90: v.buckets.days61To90.toNumber(),
      over90: v.buckets.over90.toNumber(),
      bills: v.bills
    }));

    const numericTotals: Record<string, Record<FiveBucketAgeKey | "total", number>> = {};
    for (const [cur, buckets] of Object.entries(totalsByCurrency)) {
      const o: Record<string, number> = {};
      (Object.keys(buckets) as FiveBucketAgeKey[]).forEach(k => {
        o[k] = buckets[k].toNumber();
      });
      o.total = (Object.keys(buckets) as FiveBucketAgeKey[]).reduce((s, k) => s + buckets[k].toNumber(), 0);
      numericTotals[cur] = o as Record<FiveBucketAgeKey | "total", number>;
    }

    return {
      reportType: "CREDITORS_AGE_ANALYSIS",
      asOfDate: asOf.toISOString().slice(0, 10),
      liabilityGlNote:
        "Open amounts are creditor bills posted on credit terms (Dr expense / VAT, Cr Accounts Payable — typically account 2000 / Creditors Control).",
      agingAnchorNote:
        "Ageing uses due date when set, otherwise invoice date. daysPastDue > 0 means overdue from that anchor.",
      bucketLabels: { ...FIVE_BUCKET_LABELS },
      bucketShortColumnTitles: { ...FIVE_BUCKET_SHORT_COLUMN_TITLES },
      vendors,
      grandTotal: {
        total: grandTotal.toNumber(),
        vatTotal: grandVat.toNumber(),
        current: grandBuckets.current.toNumber(),
        days1To30: grandBuckets.days1To30.toNumber(),
        days31To60: grandBuckets.days31To60.toNumber(),
        days61To90: grandBuckets.days61To90.toNumber(),
        over90: grandBuckets.over90.toNumber()
      },
      totalsByCurrency: numericTotals
    };
  }
}
