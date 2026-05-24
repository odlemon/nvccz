// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";

/** Exclude performance-originated KPI journals from GL native totals (anti double-count). */
function performanceJournalExcludeFilter() {
  return {
    AND: [
      { NOT: { referenceNumber: { startsWith: "PERF-GOAL-" } } },
      { NOT: { referenceNumber: { startsWith: "KPI-GOAL-" } } }
    ]
  };
}

function postedJournalWhere(periodStart: Date, periodEnd: Date, excludePerformance: boolean) {
  return {
    status: "POSTED",
    transactionDate: { gte: periodStart, lte: periodEnd },
    ...(excludePerformance ? performanceJournalExcludeFilter() : {})
  };
}

function dec(v: unknown): Decimal {
  if (v == null || v === "") return new Decimal(0);
  try {
    return new Decimal(typeof v === "object" && v !== null && "toString" in v ? (v as any).toString() : String(v));
  } catch {
    return new Decimal(0);
  }
}

/**
 * Posted GL totals for a date window (transactionDate on journal header).
 * Revenue/Income: net credits − debits; Expense: net debits − credits; Net profit ≈ revenue − expenses.
 * Aligns with SRD “data pull” from accounting (no full table scan in app code — DB aggregate).
 */
export async function getPostedPeriodRevenueExpenseNetProfit(
  periodStart: Date,
  periodEnd: Date,
  options?: { excludePerformanceJournals?: boolean }
): Promise<{
  revenue: number;
  totalExpense: number;
  netProfit: number;
  periodStart: string;
  periodEnd: string;
}> {
  const excludePerformance = options?.excludePerformanceJournals === true;
  const je = postedJournalWhere(periodStart, periodEnd, excludePerformance);

  const [revAgg, expAgg] = await Promise.all([
    prisma.journalEntryLine.aggregate({
      where: {
        journalEntry: { is: je },
        chartOfAccount: { accountType: { in: ["Revenue", "Income"] } }
      },
      _sum: { debitAmount: true, creditAmount: true }
    }),
    prisma.journalEntryLine.aggregate({
      where: {
        journalEntry: { is: je },
        chartOfAccount: { accountType: "Expense" }
      },
      _sum: { debitAmount: true, creditAmount: true }
    })
  ]);

  const rev = dec(revAgg._sum.creditAmount).minus(dec(revAgg._sum.debitAmount));
  const exp = dec(expAgg._sum.debitAmount).minus(dec(expAgg._sum.creditAmount));
  const net = rev.minus(exp);

  return {
    revenue: rev.toNumber(),
    totalExpense: exp.toNumber(),
    netProfit: net.toNumber(),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString()
  };
}

export type PostedPeriodExpenseAccount = {
  chartOfAccountId: string;
  accountNo: string;
  accountName: string;
  actualAmount: number;
};

/**
 * Posted expense (debits − credits) per GL account for a date window.
 */
export async function getPostedPeriodExpenseByAccount(
  periodStart: Date,
  periodEnd: Date
): Promise<PostedPeriodExpenseAccount[]> {
  const je = {
    status: "POSTED",
    transactionDate: { gte: periodStart, lte: periodEnd }
  };

  const lines = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: { is: je },
      chartOfAccount: { accountType: "Expense" }
    },
    select: {
      debitAmount: true,
      creditAmount: true,
      chartOfAccountId: true,
      chartOfAccount: {
        select: { accountNo: true, accountName: true }
      }
    }
  });

  const byAccount = new Map<string, PostedPeriodExpenseAccount & { _dec: Decimal }>();

  for (const line of lines) {
    const id = line.chartOfAccountId;
    const net = dec(line.debitAmount).minus(dec(line.creditAmount));
    const existing = byAccount.get(id);
    if (existing) {
      existing._dec = existing._dec.plus(net);
    } else {
      byAccount.set(id, {
        chartOfAccountId: id,
        accountNo: line.chartOfAccount.accountNo,
        accountName: line.chartOfAccount.accountName,
        actualAmount: 0,
        _dec: net
      });
    }
  }

  const result: PostedPeriodExpenseAccount[] = [];
  for (const row of byAccount.values()) {
    const amount = row._dec.toNumber();
    if (amount > 0.005) {
      result.push({
        chartOfAccountId: row.chartOfAccountId,
        accountNo: row.accountNo,
        accountName: row.accountName,
        actualAmount: Math.round(amount * 100) / 100
      });
    }
  }

  return result.sort((a, b) => b.actualAmount - a.actualAmount);
}

/**
 * Posted GL totals excluding journals tagged as performance KPI achievements.
 */
export async function getPostedPeriodRevenueExpenseNetProfitExcludingPerformance(
  periodStart: Date,
  periodEnd: Date
) {
  return getPostedPeriodRevenueExpenseNetProfit(periodStart, periodEnd, {
    excludePerformanceJournals: true
  });
}
