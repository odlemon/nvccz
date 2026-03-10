// @ts-nocheck
/**
 * Year-End Close: zero all P&L accounts (4000-5999) and transfer net to Retained Earnings (3100).
 */
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../utils/database';

const PNL_ACCOUNT_NO_START = '4000';
const PNL_ACCOUNT_NO_END = '5999';
const RETAINED_EARNINGS_ACCOUNT_NO = '3100';

export interface YearEndCloseParams {
  year: number;
  createdById: string;
  currencyId?: string;
}

export interface YearEndCloseResult {
  success: boolean;
  message: string;
  journalEntryId?: string;
  referenceNumber?: string;
  totalClosedToRetainedEarnings?: number;
  accountsZeroed?: number;
}

/**
 * Get balance for a single account as of endDate from posted JEs.
 * Revenue/Income: balance = credits - debits. Expense: balance = debits - credits.
 * Exported for tests.
 */
export async function getAccountBalanceAsOf(
  accountId: string,
  accountType: string,
  endDate: Date
): Promise<number> {
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      chartOfAccountId: accountId,
      journalEntry: {
        transactionDate: { lte: endDate },
        status: 'POSTED'
      }
    },
    select: { debitAmount: true, creditAmount: true }
  });
  let debits = 0;
  let credits = 0;
  for (const l of lines) {
    debits += Number(l.debitAmount ?? 0);
    credits += Number(l.creditAmount ?? 0);
  }
  const isRevenueOrIncome = accountType === 'Revenue' || accountType === 'Income';
  const isEquity = accountType === 'Equity';
  if (isRevenueOrIncome || isEquity) return credits - debits;
  return debits - credits; // Expense
}

/**
 * Run Year-End Close for the given year.
 * All accounts in range 4000-5999 are closed to 0; net difference is posted to GL 3100 (Retained Earnings).
 */
export async function runYearEndClose(params: YearEndCloseParams): Promise<YearEndCloseResult> {
  const { year, createdById, currencyId } = params;
  const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

  try {
    const pnlAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        accountNo: { gte: PNL_ACCOUNT_NO_START, lte: PNL_ACCOUNT_NO_END },
        isActive: true
      },
      orderBy: { accountNo: 'asc' }
    });

    if (pnlAccounts.length === 0) {
      return {
        success: true,
        message: `No P&L accounts (${PNL_ACCOUNT_NO_START}-${PNL_ACCOUNT_NO_END}) found; nothing to close.`
      };
    }

    const balances: { accountId: string; accountNo: string; accountType: string; balance: number }[] = [];
    for (const acc of pnlAccounts) {
      const balance = await getAccountBalanceAsOf(acc.id, acc.accountType, endOfYear);
      if (Math.abs(balance) >= 0.01) {
        balances.push({
          accountId: acc.id,
          accountNo: acc.accountNo,
          accountType: acc.accountType,
          balance
        });
      }
    }

    if (balances.length === 0) {
      return {
        success: true,
        message: `Year-End Close ${year}: all P&L accounts already zero; no entry created.`
      };
    }

    const retainedEarningsAccount = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: RETAINED_EARNINGS_ACCOUNT_NO, isActive: true }
    });
    if (!retainedEarningsAccount) {
      return {
        success: false,
        message: `Retained Earnings account (${RETAINED_EARNINGS_ACCOUNT_NO}) not found.`
      };
    }

    const currency = currencyId
      ? await prisma.currency.findUnique({ where: { id: currencyId } })
      : await prisma.currency.findFirst({ where: { isActive: true } });
    if (!currency) {
      return { success: false, message: 'No currency found.' };
    }

    const lines: { chartOfAccountId: string; debitAmount: number; creditAmount: number; description: string }[] = [];
    let totalDebits = 0;
    let totalCredits = 0;

    for (const b of balances) {
      const isRevenueOrIncome = b.accountType === 'Revenue' || b.accountType === 'Income';
      if (isRevenueOrIncome && b.balance > 0) {
        lines.push({
          chartOfAccountId: b.accountId,
          debitAmount: b.balance,
          creditAmount: 0,
          description: `Year-End Close ${year}: close to retained earnings`
        });
        totalDebits += b.balance;
      } else if (isRevenueOrIncome && b.balance < 0) {
        lines.push({
          chartOfAccountId: b.accountId,
          debitAmount: 0,
          creditAmount: Math.abs(b.balance),
          description: `Year-End Close ${year}: close to retained earnings`
        });
        totalCredits += Math.abs(b.balance);
      } else if (!isRevenueOrIncome && b.balance > 0) {
        lines.push({
          chartOfAccountId: b.accountId,
          debitAmount: 0,
          creditAmount: b.balance,
          description: `Year-End Close ${year}: close to retained earnings`
        });
        totalCredits += b.balance;
      } else if (!isRevenueOrIncome && b.balance < 0) {
        lines.push({
          chartOfAccountId: b.accountId,
          debitAmount: Math.abs(b.balance),
          creditAmount: 0,
          description: `Year-End Close ${year}: close to retained earnings`
        });
        totalDebits += Math.abs(b.balance);
      }
    }

    const netToRetainedEarnings = totalDebits - totalCredits;
    if (Math.abs(netToRetainedEarnings) >= 0.01) {
      if (netToRetainedEarnings > 0) {
        lines.push({
          chartOfAccountId: retainedEarningsAccount.id,
          debitAmount: 0,
          creditAmount: netToRetainedEarnings,
          description: `Year-End Close ${year}: net income to retained earnings`
        });
        totalCredits += netToRetainedEarnings;
      } else {
        lines.push({
          chartOfAccountId: retainedEarningsAccount.id,
          debitAmount: Math.abs(netToRetainedEarnings),
          creditAmount: 0,
          description: `Year-End Close ${year}: net loss to retained earnings`
        });
        totalDebits += Math.abs(netToRetainedEarnings);
      }
    }

    if (Math.abs(totalDebits - totalCredits) > 0.02) {
      return {
        success: false,
        message: `Year-End Close ${year}: closing entry unbalanced (Dr ${totalDebits.toFixed(2)} vs Cr ${totalCredits.toFixed(2)}).`
      };
    }

    const ref = `YEC-${year}-${Date.now()}`;
    const journalEntry = await prisma.journalEntry.create({
      data: {
        transactionDate: endOfYear,
        referenceNumber: ref,
        description: `Year-End Close ${year}`,
        totalAmount: new Decimal(totalDebits),
        currencyId: currency.id,
        status: 'POSTED',
        createdById
      }
    });

    for (const line of lines) {
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: line.chartOfAccountId,
          debitAmount: new Decimal(line.debitAmount),
          creditAmount: new Decimal(line.creditAmount),
          description: line.description
        }
      });
    }

    return {
      success: true,
      message: `Year-End Close ${year} completed.`,
      journalEntryId: journalEntry.id,
      referenceNumber: ref,
      totalClosedToRetainedEarnings: netToRetainedEarnings,
      accountsZeroed: balances.length
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message ?? 'Year-End Close failed.'
    };
  }
}
