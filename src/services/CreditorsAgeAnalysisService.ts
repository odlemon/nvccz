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

/** Aging buckets for one currency slice of a vendor (or whole vendor when single-currency). */
export interface CreditorsAgeVendorCurrencyTotals {
  total: number;
  vatTotal: number;
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  over90: number;
}

export interface CreditorsAgeVendorSummary {
  vendorId: string;
  vendorName: string;
  billCount: number;
  bills: CreditorsAgeAnalysisBill[];
  /**
   * When false, `total` / bucket fields are in that vendor’s invoice currency (all bills share one currency).
   * When true, those top-level totals are null — use `perCurrencyVendorTotals` only.
   */
  multiCurrencyVendor: boolean;
  total: number | null;
  vatTotal: number | null;
  current: number | null;
  days1To30: number | null;
  days31To60: number | null;
  days61To90: number | null;
  over90: number | null;
  /** Present when `multiCurrencyVendor` — do not sum across keys (different units). */
  perCurrencyVendorTotals?: Record<string, CreditorsAgeVendorCurrencyTotals>;
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
  /**
   * Report-wide totals. When `grandTotalMixedCurrency` is true, every field is null
   * (adding USD + ZIG numerically is meaningless) — use `totalsByCurrency` instead.
   */
  grandTotal: {
    total: number | null;
    vatTotal: number | null;
    current: number | null;
    days1To30: number | null;
    days31To60: number | null;
    days61To90: number | null;
    over90: number | null;
  };
  grandTotalMixedCurrency: boolean;
  /** Set when more than one invoice currency appears on the report. */
  grandTotalNote: string | null;
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

    const vendorMap = new Map<
      string,
      {
        vendorId: string;
        vendorName: string;
        byCurrency: Record<
          string,
          {
            buckets: Record<FiveBucketAgeKey, Decimal>;
            vatTotal: Decimal;
            total: Decimal;
          }
        >;
        bills: CreditorsAgeAnalysisBill[];
      }
    >();

    const totalsByCurrency: Record<string, Record<FiveBucketAgeKey, Decimal>> = {};

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

      if (!vendorMap.has(inv.vendorId)) {
        vendorMap.set(inv.vendorId, {
          vendorId: inv.vendorId,
          vendorName: inv.vendor.name,
          byCurrency: {},
          bills: []
        });
      }
      const v = vendorMap.get(inv.vendorId)!;
      if (!v.byCurrency[code]) {
        v.byCurrency[code] = {
          buckets: emptyFiveBuckets(),
          vatTotal: new Decimal(0),
          total: new Decimal(0)
        };
      }
      const vc = v.byCurrency[code];
      vc.buckets[bucket] = vc.buckets[bucket].plus(out);
      vc.vatTotal = vc.vatTotal.plus(vat);
      vc.total = vc.total.plus(out);
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

    const nullGrand = (): CreditorsAgeAnalysisReport["grandTotal"] => ({
      total: null,
      vatTotal: null,
      current: null,
      days1To30: null,
      days31To60: null,
      days61To90: null,
      over90: null
    });

    const zeroGrand = (): CreditorsAgeAnalysisReport["grandTotal"] => ({
      total: 0,
      vatTotal: 0,
      current: 0,
      days1To30: 0,
      days31To60: 0,
      days61To90: 0,
      over90: 0
    });

    const currencyCodes = Object.keys(totalsByCurrency).sort();
    const grandTotalMixedCurrency = currencyCodes.length > 1;
    const grandTotalNote = grandTotalMixedCurrency
      ? "Grand total omitted: invoices span multiple currencies (e.g. USD and ZIG). Use totalsByCurrency and per-currency vendor rows — do not add those figures."
      : null;

    let grandTotal: CreditorsAgeAnalysisReport["grandTotal"];
    if (currencyCodes.length === 0) {
      grandTotal = zeroGrand();
    } else if (grandTotalMixedCurrency) {
      grandTotal = nullGrand();
    } else {
      const only = currencyCodes[0];
      const b = totalsByCurrency[only];
      let vatSum = new Decimal(0);
      for (const inv of invoices) {
        if (inv.currency.code.toUpperCase() === only) {
          vatSum = vatSum.plus(new Decimal(inv.vatAmount));
        }
      }
      grandTotal = {
        total: b.current
          .plus(b.days1To30)
          .plus(b.days31To60)
          .plus(b.days61To90)
          .plus(b.over90)
          .toNumber(),
        vatTotal: vatSum.toNumber(),
        current: b.current.toNumber(),
        days1To30: b.days1To30.toNumber(),
        days31To60: b.days31To60.toNumber(),
        days61To90: b.days61To90.toNumber(),
        over90: b.over90.toNumber()
      };
    }

    const vendors: CreditorsAgeVendorSummary[] = Array.from(vendorMap.values()).map((v) => {
      const codes = Object.keys(v.byCurrency).sort();
      const multi = codes.length > 1;
      const perCurrency: Record<string, CreditorsAgeVendorCurrencyTotals> = {};
      for (const c of codes) {
        const vc = v.byCurrency[c];
        perCurrency[c] = {
          total: vc.total.toNumber(),
          vatTotal: vc.vatTotal.toNumber(),
          current: vc.buckets.current.toNumber(),
          days1To30: vc.buckets.days1To30.toNumber(),
          days31To60: vc.buckets.days31To60.toNumber(),
          days61To90: vc.buckets.days61To90.toNumber(),
          over90: vc.buckets.over90.toNumber()
        };
      }
      if (multi) {
        return {
          vendorId: v.vendorId,
          vendorName: v.vendorName,
          billCount: v.bills.length,
          multiCurrencyVendor: true,
          total: null,
          vatTotal: null,
          current: null,
          days1To30: null,
          days31To60: null,
          days61To90: null,
          over90: null,
          perCurrencyVendorTotals: perCurrency,
          bills: v.bills
        };
      }
      const c0 = codes[0];
      const vc = v.byCurrency[c0];
      return {
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        billCount: v.bills.length,
        multiCurrencyVendor: false,
        total: vc.total.toNumber(),
        vatTotal: vc.vatTotal.toNumber(),
        current: vc.buckets.current.toNumber(),
        days1To30: vc.buckets.days1To30.toNumber(),
        days31To60: vc.buckets.days31To60.toNumber(),
        days61To90: vc.buckets.days61To90.toNumber(),
        over90: vc.buckets.over90.toNumber(),
        bills: v.bills
      };
    });

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
      grandTotal,
      grandTotalMixedCurrency,
      grandTotalNote,
      totalsByCurrency: numericTotals
    };
  }
}
