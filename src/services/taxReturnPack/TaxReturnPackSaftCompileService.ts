// @ts-nocheck
import { prisma } from "../../utils/database";

/**
 * ZIMRA Audit Support File (SAF-T) pack compile path — pack tracking only, NOT a file generator.
 *
 * Scoping rationale: generating an actual ZIMRA-compliant SAF-T XML export requires exact regulatory
 * file-format specs this task doesn't have access to; shipping a wrong-format file would be worse
 * than shipping none. "Compile" for this regime instead gathers honest, real counts — posted journal
 * count, chart-of-accounts count, distinct GL accounts touched in the period — into liabilitySnapshot
 * as a readiness/completeness signal a preparer can use before running the actual export through
 * ZIMRA's own tooling. No reconciliation lines are fabricated and no PDF/file is generated (see
 * TaxReturnPackApprovalService.signOff, which skips PDF generation for this regime).
 */
export class TaxReturnPackSaftCompileService {
  static async compileForPack(pack: { periodStart: Date; periodEnd: Date }) {
    const start = new Date(pack.periodStart);
    const end = new Date(pack.periodEnd);
    end.setHours(23, 59, 59, 999);

    const [postedJournalCount, chartOfAccountsCount, touchedAccounts] = await Promise.all([
      prisma.journalEntry.count({
        where: { status: "POSTED", transactionDate: { gte: start, lte: end } },
      }),
      prisma.chartOfAccounts.count({ where: { isActive: true } }),
      prisma.journalEntryLine.findMany({
        where: { journalEntry: { status: "POSTED", transactionDate: { gte: start, lte: end } } },
        select: { chartOfAccountId: true },
        distinct: ["chartOfAccountId"],
      }),
    ]);

    return {
      reconciliationLines: [],
      cgtLines: [],
      packUpdateData: {
        liabilitySnapshot: {
          saft: {
            postedJournalCount,
            chartOfAccountsCount,
            distinctGlAccountsTouched: touchedAccounts.length,
            periodStart: start.toISOString().slice(0, 10),
            periodEnd: pack.periodEnd.toISOString().slice(0, 10),
            note:
              "Readiness/completeness summary only — not a ZIMRA-compliant SAF-T XML export. Exact " +
              "regulatory file-format specs were not available; generating a wrong-format file would be " +
              "worse than none.",
          },
        },
      },
      auditDetails: {
        postedJournalCount,
        chartOfAccountsCount,
        distinctGlAccountsTouched: touchedAccounts.length,
      },
    };
  }
}
