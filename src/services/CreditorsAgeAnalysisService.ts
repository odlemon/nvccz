// @ts-nocheck
/**
 * Creditors (AP) age analysis from open credit purchase invoices.
 * Liability is recognised on bill posting: Dr expense / VAT, Cr Accounts Payable (typically 2000).
 */
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import {
  bucketForDaysPastDue,
  daysPastDueAsOf,
  decimalFiveBucketsToNumber,
  emptyFiveBuckets,
  FIVE_BUCKET_LABELS,
  FIVE_BUCKET_SHORT_COLUMN_TITLES,
  type FiveBucketAgeKey
} from "../utils/fiveBucketAgeAnalysis";

export type CreditorsAgeBucket = FiveBucketAgeKey;

export { daysPastDueAsOf, bucketForDaysPastDue };

export interface CreditorsAgeAnalysisLine {
  purchaseInvoiceId: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  description: string | null;
  invoiceDate: string;
  dueDate: string | null;
  currencyCode: string;
  totalAmount: number;
  outstandingAmount: number;
  daysPastDue: number;
  bucket: CreditorsAgeBucket;
  /** Common printed column heading (Current / 30 Days / 60 Days / 90 Days / Over 90). */
  reportColumnTitle: string;
  journalEntryId: string | null;
}

export interface CreditorsAgeAnalysisReport {
  reportType: "CREDITORS_AGE_ANALYSIS";
  asOfDate: string;
  liabilityGlNote: string;
  agingAnchorNote: string;
  bucketLabels: Record<CreditorsAgeBucket, string>;
  bucketShortColumnTitles: Record<CreditorsAgeBucket, string>;
  lines: CreditorsAgeAnalysisLine[];
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

    const totalsByCurrency: Record<string, Record<CreditorsAgeBucket, Decimal>> = {};
    const lines: CreditorsAgeAnalysisLine[] = [];

    for (const inv of invoices) {
      const code = inv.currency.code.toUpperCase();
      if (!totalsByCurrency[code]) {
        totalsByCurrency[code] = emptyFiveBuckets();
      }

      const anchor = inv.dueDate ?? inv.invoiceDate;
      const dpd = daysPastDueAsOf(anchor, asOf);
      const bucket = bucketForDaysPastDue(dpd);
      const out = new Decimal(inv.outstandingAmount);

      totalsByCurrency[code][bucket] = totalsByCurrency[code][bucket].plus(out);

      lines.push({
        purchaseInvoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        vendorId: inv.vendorId,
        vendorName: inv.vendor.name,
        description: inv.description,
        invoiceDate: inv.invoiceDate.toISOString().slice(0, 10),
        dueDate: inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : null,
        currencyCode: code,
        totalAmount: new Decimal(inv.totalAmount).toNumber(),
        outstandingAmount: out.toNumber(),
        daysPastDue: dpd,
        bucket,
        reportColumnTitle: FIVE_BUCKET_SHORT_COLUMN_TITLES[bucket],
        journalEntryId: inv.journalEntryId
      });
    }

    const numericTotals: Record<string, Record<CreditorsAgeBucket | "total", number>> = {};
    for (const [cur, buckets] of Object.entries(totalsByCurrency)) {
      numericTotals[cur] = decimalFiveBucketsToNumber(buckets);
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
      lines,
      totalsByCurrency: numericTotals
    };
  }
}
