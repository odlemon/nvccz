// @ts-nocheck
/**
 * Debtors (AR) age analysis from open sales invoices (SENT / PARTIALLY_PAID).
 * Balances tie to Dr Accounts Receivable on posted invoices (e.g. 1200).
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

export type DebtorsAgeBucket = FiveBucketAgeKey;

export interface DebtorsAgeAnalysisLine {
  invoiceId: string;
  invoiceNumber: string | null;
  customerId: string;
  customerName: string;
  description: string;
  transactionDate: string;
  dueDate: string | null;
  currencyCode: string;
  totalAmount: number;
  outstandingAmount: number;
  daysPastDue: number;
  bucket: DebtorsAgeBucket;
  /** Typical column heading: Current | 30 Days | 60 Days | 90 Days | Over 90 */
  reportColumnTitle: string;
  status: string;
  journalEntryId: string | null;
}

export interface DebtorsAgeAnalysisReport {
  reportType: "DEBTORS_AGE_ANALYSIS";
  asOfDate: string;
  receivableGlNote: string;
  agingAnchorNote: string;
  /** Exact day ranges per bucket. */
  bucketLabels: Record<DebtorsAgeBucket, string>;
  /** Matches many printed reports: third band 31–60 is often headed "60 Days"; 61–90 is "90 Days". */
  bucketShortColumnTitles: Record<DebtorsAgeBucket, string>;
  lines: DebtorsAgeAnalysisLine[];
  totalsByCurrency: Record<string, Record<DebtorsAgeBucket | "total", number>>;
}

export class DebtorsAgeAnalysisService {
  static async generate(params?: { asOfDate?: Date }): Promise<DebtorsAgeAnalysisReport> {
    const asOf = params?.asOfDate ?? new Date();

    const invoices = await prisma.invoice.findMany({
      where: {
        isActive: true,
        status: { in: ["SENT", "PARTIALLY_PAID"] },
        outstandingAmount: { gt: 0 }
      },
      include: {
        customer: { select: { id: true, name: true } },
        currency: { select: { code: true } }
      },
      orderBy: [{ customerId: "asc" }, { transactionDate: "asc" }]
    });

    const totalsByCurrency: Record<string, Record<DebtorsAgeBucket, Decimal>> = {};
    const lines: DebtorsAgeAnalysisLine[] = [];

    for (const inv of invoices) {
      const code = inv.currency.code.toUpperCase();
      if (!totalsByCurrency[code]) {
        totalsByCurrency[code] = emptyFiveBuckets();
      }

      const anchor = inv.dueDate ?? inv.transactionDate;
      const dpd = daysPastDueAsOf(anchor, asOf);
      const bucket = bucketForDaysPastDue(dpd);
      const out = new Decimal(inv.outstandingAmount);

      totalsByCurrency[code][bucket] = totalsByCurrency[code][bucket].plus(out);

      lines.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: inv.customer.name,
        description: inv.description,
        transactionDate: inv.transactionDate.toISOString().slice(0, 10),
        dueDate: inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : null,
        currencyCode: code,
        totalAmount: new Decimal(inv.totalAmount).toNumber(),
        outstandingAmount: out.toNumber(),
        daysPastDue: dpd,
        bucket,
        reportColumnTitle: FIVE_BUCKET_SHORT_COLUMN_TITLES[bucket],
        status: inv.status,
        journalEntryId: inv.journalEntryId
      });
    }

    const numericTotals: Record<string, Record<DebtorsAgeBucket | "total", number>> = {};
    for (const [cur, buckets] of Object.entries(totalsByCurrency)) {
      numericTotals[cur] = decimalFiveBucketsToNumber(buckets);
    }

    return {
      reportType: "DEBTORS_AGE_ANALYSIS",
      asOfDate: asOf.toISOString().slice(0, 10),
      receivableGlNote:
        "Open amounts are customer invoices not fully paid (Dr Accounts Receivable until cleared — often 1200).",
      agingAnchorNote:
        "Ageing anchor: dueDate when set, otherwise transactionDate. " +
        "Example: invoice 65 days ago with due 30 days after invoice → ~35 days past due → 31–60 band (often labelled '60 Days'). " +
        "If dueDate is omitted, anchor is invoice date, so 65 days old → 61–90 band (often '90 Days').",
      bucketLabels: { ...FIVE_BUCKET_LABELS },
      bucketShortColumnTitles: { ...FIVE_BUCKET_SHORT_COLUMN_TITLES },
      lines,
      totalsByCurrency: numericTotals
    };
  }
}
