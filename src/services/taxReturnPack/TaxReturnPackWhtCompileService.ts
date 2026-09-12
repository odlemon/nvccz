// @ts-nocheck
import { prisma } from "../../utils/database";
import { TRP_TAX_CATEGORIES } from "./taxReturnPackSupport";

/**
 * Withholding Tax (WHT) pack compile path — deliberately evidence/tracking only, NOT a computed
 * liability engine.
 *
 * Scoping rationale: no WHT rate/threshold data exists anywhere in this codebase (checked — only
 * payroll PAYE-bracket models under unrelated names, nothing for supplier/dividend withholding), so
 * there is no reliable basis to compute a defensible liability number. Guessing at Zimbabwean WHT
 * rates would be worse than not computing one. Instead this pulls real posted GL activity on whatever
 * withholding-related account(s) actually exist in the chart of accounts into reconciliation lines —
 * an honest evidence trail a tax officer can review and use to make the real determination manually
 * through the existing reconciliation-line-review / sign-off / audit-trail scaffold. The pack's
 * liability fields are left null (never set), never 0-as-if-computed.
 */
export class TaxReturnPackWhtCompileService {
  static async findWhtAccounts() {
    return prisma.chartOfAccounts.findMany({
      where: {
        isActive: true,
        OR: [
          { accountName: { contains: "Withholding" } },
          { accountName: { contains: "withholding" } },
          { accountName: { contains: "WHT" } },
        ],
      },
      select: { id: true, accountNo: true, accountName: true },
    });
  }

  static async compileForPack(pack: { periodStart: Date; periodEnd: Date; baseCurrency: string }) {
    const start = new Date(pack.periodStart);
    const end = new Date(pack.periodEnd);
    end.setHours(23, 59, 59, 999);

    const accounts = await TaxReturnPackWhtCompileService.findWhtAccounts();

    if (!accounts.length) {
      return {
        reconciliationLines: [
          {
            lineCode: "WHT_NONE_FOUND",
            lineLabel:
              "0 WHT-classified transactions found — no withholding-tax GL account exists in the chart of accounts",
            accountNo: null,
            glBalance: 0,
            taxAdjustment: 0,
            taxCategory: TRP_TAX_CATEGORIES.BOOK,
            currencyCode: pack.baseCurrency,
            journalLineRefs: undefined,
            displayOrder: 1,
          },
        ],
        cgtLines: [],
        packUpdateData: {
          liabilitySnapshot: {
            wht: {
              accountsFound: 0,
              transactionCount: 0,
              note:
                "No withholding-tax related GL accounts found in the chart of accounts as of compile time. " +
                "Liability intentionally left null (not 0) — this system has no reliable WHT rate/threshold " +
                "data to compute a defensible number from. Evidence/tracking pass only.",
            },
          },
        },
        auditDetails: { whtAccountsFound: 0, transactionCount: 0, reconciliationLineCount: 1 },
      };
    }

    const lines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: { in: accounts.map((a) => a.id) },
        journalEntry: { status: "POSTED", transactionDate: { gte: start, lte: end } },
      },
      select: { id: true, debitAmount: true, creditAmount: true, chartOfAccountId: true },
    });

    const byAccount = new Map<string, { glBalance: number; refs: string[] }>();
    for (const line of lines) {
      const net = Number(line.creditAmount ?? 0) - Number(line.debitAmount ?? 0);
      const bucket = byAccount.get(line.chartOfAccountId) ?? { glBalance: 0, refs: [] };
      bucket.glBalance += net;
      bucket.refs.push(line.id);
      byAccount.set(line.chartOfAccountId, bucket);
    }

    const reconciliationLines = accounts.map((acc, idx) => {
      const bucket = byAccount.get(acc.id);
      return {
        lineCode: `WHT_${acc.accountNo}`,
        lineLabel: `${acc.accountName} (${acc.accountNo})`,
        accountNo: acc.accountNo,
        glBalance: Math.round((bucket?.glBalance ?? 0) * 100) / 100,
        taxAdjustment: 0,
        taxCategory: TRP_TAX_CATEGORIES.BOOK,
        currencyCode: pack.baseCurrency,
        journalLineRefs: bucket?.refs?.length ? bucket.refs : undefined,
        displayOrder: idx + 1,
      };
    });

    return {
      reconciliationLines,
      cgtLines: [],
      packUpdateData: {
        liabilitySnapshot: {
          wht: {
            accountsFound: accounts.length,
            accounts: accounts.map((a) => ({ accountNo: a.accountNo, accountName: a.accountName })),
            transactionCount: lines.length,
            note:
              "Evidence/tracking pass only — real posted GL activity on withholding-related accounts, " +
              "not an auto-computed liability. A tax officer must determine the actual WHT liability manually.",
          },
        },
      },
      auditDetails: {
        whtAccountsFound: accounts.length,
        transactionCount: lines.length,
        reconciliationLineCount: reconciliationLines.length,
      },
    };
  }
}
