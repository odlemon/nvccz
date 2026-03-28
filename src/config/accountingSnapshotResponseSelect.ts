/**
 * Prisma `select` fragments so API JSON includes stored USD/ZWG rate, recording currency, and cashbook receipt attachments.
 * (Root-model findMany without `select` already returns all scalars once Prisma client is generated.)
 */

export const prismaJournalEntryRateSelect = {
  currencyId: true,
  usdZwgRateSnapshot: true
} as const;

export const prismaExpenseSnapshotSelect = {
  currencyId: true,
  usdZwgRateSnapshot: true
} as const;

export const prismaRevenueSnapshotSelect = {
  currencyId: true,
  usdZwgRateSnapshot: true
} as const;

export const prismaInvoiceSnapshotSelect = {
  currencyId: true,
  usdZwgRateSnapshot: true,
  exchangeRateAtCreation: true,
  exchangeRateAtSent: true,
  usdZwgRateSnapshotSent: true,
  exchangeRateAtPaid: true,
  usdZwgRateSnapshotPaid: true,
  paymentSettlementSnapshot: true,
  crossCurrencyPaymentSnapshot: true
} as const;

export const prismaCashbookEntrySnapshotSelect = {
  usdZwgRateSnapshot: true,
  recordedCurrencyId: true,
  recordedCurrency: {
    select: {
      id: true,
      code: true,
      name: true,
      symbol: true
    }
  },
  receiptAttachmentUrl: true,
  receiptAttachmentPath: true,
  receiptAttachmentFileName: true,
  receiptAttachmentMimeType: true
} as const;

export const prismaPurchaseInvoiceSnapshotSelect = {
  currencyId: true,
  usdZwgRateSnapshot: true
} as const;

export const prismaProcurementInvoiceSnapshotSelect = {
  currencyId: true,
  usdZwgRateSnapshot: true,
  exchangeRateAtCreation: true
} as const;

export const prismaCreditNoteSnapshotSelect = {
  currencyId: true,
  usdZwgRateSnapshot: true
} as const;
