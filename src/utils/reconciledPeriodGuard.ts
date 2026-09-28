// @ts-nocheck
/**
 * SRD ACC-PER-04 (UATV1 REC-4.4): once a bank statement is reconciled, nothing new may be booked into that bank on or
 * before the statement date — the reconciled balance would silently stop being true. Every cashbook entry is created
 * through Prisma (receipts, payments, transfers, batch import, payroll, supplier payments, reversals), so the check sits
 * here rather than in each of those services. The line is the latest finished reconciliation's statement date, compared
 * as calendar days in the tenant's time zone.
 */
const dayKey = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

async function tenantTz(client: any): Promise<string> {
  try {
    const { default: FiscalCalendarService } = await import("../services/FiscalCalendarService");
    return await FiscalCalendarService.getFiscalTimezone();
  } catch {
    return "Africa/Harare";
  }
}

export function attachReconciledPeriodGuard(client: any) {
  client.$use(async (params: any, next: any) => {
    if (params.model === "CashbookEntry" && (params.action === "create" || params.action === "createMany")) {
      const rows = params.action === "create" ? [params.args?.data] : Array.isArray(params.args?.data) ? params.args.data : [params.args?.data];
      for (const d of rows) {
        const bankId = d?.bankId || d?.bank?.connect?.id;
        const when = d?.transactionDate ? new Date(d.transactionDate) : null;
        if (!bankId || !when || Number.isNaN(when.getTime())) continue;
        const last = await client.cashbookReconciliationSession.findFirst({
          where: { bankId, status: "FINALIZED" },
          orderBy: { statementDate: "desc" },
          select: { statementDate: true, bank: { select: { name: true } } },
        });
        if (!last) continue;
        const tz = await tenantTz(client);
        const through = dayKey(last.statementDate, tz);
        if (dayKey(when, tz) <= through) {
          throw Object.assign(
            new Error(`${last.bank?.name || "This bank account"} is reconciled up to ${through}: nothing can be booked to it on or before that date. Date the entry after ${through}, or reopen that reconciliation.`),
            { statusCode: 409, code: "BANK_PERIOD_RECONCILED" }
          );
        }
      }
    }
    return next(params);
  });
}
