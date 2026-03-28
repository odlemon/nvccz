/**
 * Shared rules for which posted journal entries hit GL-based reports (Balance Sheet, TB-style cash, etc.).
 * Matches BalanceSheetService: include JEs with no cashbook links, or where every linked cashbook row is non-voided and not reversed.
 */
export type JournalDateFilter = {
  gte?: Date;
  lte?: Date;
  lt?: Date;
  gt?: Date;
};

export function buildJournalEntryWhereForGlReporting(
  transactionDate: JournalDateFilter,
  currencyId?: string
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    status: "POSTED" as const,
    transactionDate,
    AND: [
      { referenceNumber: { not: { startsWith: "VR-" } } },
      { referenceNumber: { not: { startsWith: "REV-" } } },
      {
        OR: [
          { cashbookEntries: { none: {} } },
          {
            cashbookEntries: {
              every: {
                AND: [{ status: { not: "VOIDED" } }, { reversedAt: null }],
              },
            },
          },
        ],
      },
    ],
  };
  if (currencyId) {
    base.currencyId = currencyId;
  }
  return base;
}
