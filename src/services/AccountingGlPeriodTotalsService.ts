// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";

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
  periodEnd: Date
): Promise<{
  revenue: number;
  totalExpense: number;
  netProfit: number;
  periodStart: string;
  periodEnd: string;
}> {
  const je = {
    status: "POSTED",
    transactionDate: { gte: periodStart, lte: periodEnd }
  };

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
