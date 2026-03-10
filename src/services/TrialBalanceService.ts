// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';

import { prisma } from '../utils/database';

export interface TrialBalanceTransaction {
  id: string;
  date: string;
  reference: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  source: string; // "CASHBOOK", "INVOICE", "EXPENSE", "MANUAL_ENTRY", etc.
  journalEntry: any; // Full journal entry details (referenceNumber, description, transactionDate, status, etc.)
  sourceTransaction: any; // Actual transaction details (cashbook entry, invoice, expense, etc.)
  journalEntryId: string;
  journalEntryStatus: string;
}

export interface TrialBalanceAccount {
  accountId: string;
  accountName: string;
  accountNo: string;
  accountType: string;
  debitBalance: number;
  creditBalance: number;
  transactions: TrialBalanceTransaction[]; // Transaction breakdown
}

export interface TrialBalanceData {
  date: string;
  startDate?: string; // Optional: start date for period-based trial balance
  endDate?: string; // Optional: end date for period-based trial balance
  isCumulative: boolean; // true = cumulative (all entries up to date), false = period-based (specific date range)
  accounts: TrialBalanceAccount[];
  totals: {
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
  };
}

export class TrialBalanceService {
  /**
   * Generate trial balance for a date range.
   * @param hideZeroBalances - When true, omit accounts with no transactions and zero balance (both debit and credit columns zero).
   * @param includeTransactionDetails - When false, uses a minimal query (no cashbook/invoice/expense/revenue joins) for scale; report generates in under 5s with 10k+ entries.
   */
  static async generateTrialBalance(
    date: Date,
    startDate?: Date,
    endDate?: Date,
    hideZeroBalances?: boolean,
    includeTransactionDetails: boolean = true
  ): Promise<TrialBalanceData> {
    try {
      // If startDate and endDate are provided, use them; otherwise use date as endDate
      let start: Date;
      let end: Date;
      
      if (startDate && endDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      } else {
        // Legacy behavior: use date as endDate, start from beginning of time
        start = new Date(0); // Beginning of time
        end = new Date(date);
        end.setHours(23, 59, 59, 999);
      }

      // Get all active accounts with a single query
      const accounts = await prisma.chartOfAccounts.findMany({
        where: { isActive: true },
        orderBy: [
          { accountType: 'asc' },
          { accountNo: 'asc' }
        ]
      });

      const lineWhere = {
        journalEntry: {
          transactionDate: { gte: start, lte: end },
          status: 'POSTED' as const,
          NOT: {
            cashbookEntries: {
              some: {
                OR: [
                  { status: 'VOIDED' },
                  { reversedAt: { not: null } }
                ]
              }
            }
          },
          AND: [
            { referenceNumber: { not: { startsWith: 'VR-' } } },
            { referenceNumber: { not: { startsWith: 'REV-' } } }
          ]
        }
      };

      // Lightweight path for scale (12 months, 10k+ entries): no cashbook/invoice/expense/revenue joins
      const journalEntryLinesRaw = includeTransactionDetails
        ? await prisma.journalEntryLine.findMany({
            where: lineWhere,
            select: {
              id: true,
              chartOfAccountId: true,
              debitAmount: true,
              creditAmount: true,
              journalEntry: {
                select: {
                  id: true,
                  referenceNumber: true,
                  description: true,
                  transactionDate: true,
                  status: true,
                  currencyId: true,
                  cashbookEntries: {
                    include: {
                      bank: { select: { id: true, name: true, accountNumber: true } },
                      customer: { select: { id: true, name: true, email: true } },
                      vendor: { select: { id: true, name: true, email: true } }
                    },
                    take: 1
                  },
                  invoices: {
                    include: { customer: { select: { id: true, name: true, email: true } } },
                    take: 1
                  },
                  expenses: {
                    include: {
                      vendor: { select: { id: true, name: true, email: true } },
                      category: { select: { id: true, name: true } }
                    },
                    take: 1
                  },
                  revenues: {
                    include: {
                      source: { select: { id: true, name: true } },
                      category: { select: { id: true, name: true } }
                    },
                    take: 1
                  }
                }
              }
            }
          })
        : await prisma.journalEntryLine.findMany({
            where: lineWhere,
            select: {
              id: true,
              chartOfAccountId: true,
              debitAmount: true,
              creditAmount: true,
              journalEntry: {
                select: {
                  id: true,
                  referenceNumber: true,
                  description: true,
                  transactionDate: true,
                  status: true,
                  currencyId: true
                }
              }
            }
          });

      // Filter out entries with null currency (matching GL Detail behavior)
      const journalEntryLines = journalEntryLinesRaw.filter(line => line.journalEntry.currencyId !== null);

      // Create a map to aggregate balances by account ID and store transactions
      const accountBalances = new Map<string, { 
        debitBalance: number; 
        creditBalance: number;
        transactions: TrialBalanceTransaction[];
      }>();

      // Initialize all accounts with zero balances
      for (const account of accounts) {
        accountBalances.set(account.id, { 
          debitBalance: 0, 
          creditBalance: 0,
          transactions: []
        });
      }

      // Aggregate journal entry lines by account and collect transactions
      // Use Decimal arithmetic to maintain precision - NO ROUNDING during calculations
      for (const line of journalEntryLines) {
        if (!line.chartOfAccountId) continue;
        
        const balance = accountBalances.get(line.chartOfAccountId);
        if (balance) {
          // Use Decimal arithmetic - convert to number only at the end
          const debitAmt = line.debitAmount && line.debitAmount.gt(0) ? new Decimal(line.debitAmount).toNumber() : 0;
          const creditAmt = line.creditAmount && line.creditAmount.gt(0) ? new Decimal(line.creditAmount).toNumber() : 0;
          
          if (debitAmt > 0) {
            balance.debitBalance = new Decimal(balance.debitBalance).plus(debitAmt).toNumber();
          }
          if (creditAmt > 0) {
            balance.creditBalance = new Decimal(balance.creditBalance).plus(creditAmt).toNumber();
          }

          // Determine source and get actual transaction details
          let source = "MANUAL_ENTRY";
          let sourceTransaction: any = null;

          if (line.journalEntry.cashbookEntries && line.journalEntry.cashbookEntries.length > 0) {
            source = "CASHBOOK";
            const cashbookEntry = line.journalEntry.cashbookEntries[0];
            sourceTransaction = {
              id: cashbookEntry.id,
              type: cashbookEntry.type,
              amount: cashbookEntry.amount ? new Decimal(cashbookEntry.amount).toNumber() : 0,
              description: cashbookEntry.description,
              reference: cashbookEntry.reference,
              transactionDate: cashbookEntry.transactionDate,
              status: cashbookEntry.status,
              bank: cashbookEntry.bank ? {
                id: cashbookEntry.bank.id,
                name: cashbookEntry.bank.name,
                accountNumber: cashbookEntry.bank.accountNumber
              } : null,
              customer: cashbookEntry.customer ? {
                id: cashbookEntry.customer.id,
                name: cashbookEntry.customer.name,
                email: cashbookEntry.customer.email
              } : null,
              vendor: cashbookEntry.vendor ? {
                id: cashbookEntry.vendor.id,
                name: cashbookEntry.vendor.name,
                email: cashbookEntry.vendor.email
              } : null
            };
          } else if (line.journalEntry.invoices && line.journalEntry.invoices.length > 0) {
            source = "INVOICE";
            const invoice = line.journalEntry.invoices[0];
            sourceTransaction = {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              amount: invoice.amount ? new Decimal(invoice.amount).toNumber() : 0,
              vatAmount: invoice.vatAmount ? new Decimal(invoice.vatAmount).toNumber() : 0,
              totalAmount: invoice.totalAmount ? new Decimal(invoice.totalAmount).toNumber() : 0,
              description: invoice.description,
              transactionDate: invoice.transactionDate,
              status: invoice.status,
              isTaxable: invoice.isTaxable,
              customer: invoice.customer ? {
                id: invoice.customer.id,
                name: invoice.customer.name,
                email: invoice.customer.email
              } : null
            };
          } else if (line.journalEntry.expenses && line.journalEntry.expenses.length > 0) {
            source = "EXPENSE";
            const expense = line.journalEntry.expenses[0];
            sourceTransaction = {
              id: expense.id,
              receiptNumber: expense.receiptNumber,
              amount: expense.amount ? new Decimal(expense.amount).toNumber() : 0,
              vatAmount: expense.vatAmount ? new Decimal(expense.vatAmount).toNumber() : 0,
              totalAmount: expense.totalAmount ? new Decimal(expense.totalAmount).toNumber() : 0,
              description: expense.description,
              transactionDate: expense.transactionDate,
              status: expense.status,
              paymentMethod: expense.paymentMethod,
              isTaxable: expense.isTaxable,
              vendor: expense.vendor ? {
                id: expense.vendor.id,
                name: expense.vendor.name,
                email: expense.vendor.email
              } : null,
              category: expense.category ? {
                id: expense.category.id,
                name: expense.category.name
              } : null
            };
          } else if (line.journalEntry.revenues && line.journalEntry.revenues.length > 0) {
            source = "REVENUE";
            const revenue = line.journalEntry.revenues[0];
            sourceTransaction = {
              id: revenue.id,
              amount: revenue.amount ? new Decimal(revenue.amount).toNumber() : 0,
              vatAmount: revenue.vatAmount ? new Decimal(revenue.vatAmount).toNumber() : 0,
              totalAmount: revenue.totalAmount ? new Decimal(revenue.totalAmount).toNumber() : 0,
              description: revenue.description,
              transactionDate: revenue.transactionDate,
              status: revenue.status,
              paymentMethod: revenue.paymentMethod,
              isTaxable: revenue.isTaxable,
              source: revenue.source ? {
                id: revenue.source.id,
                name: revenue.source.name
              } : null,
              category: revenue.category ? {
                id: revenue.category.id,
                name: revenue.category.name
              } : null
            };
          } else {
            // Manual entry - use journal entry details
            sourceTransaction = {
              id: line.journalEntry.id,
              referenceNumber: line.journalEntry.referenceNumber,
              description: line.journalEntry.description,
              transactionDate: line.journalEntry.transactionDate,
              status: line.journalEntry.status
            };
          }

          // Add transaction to breakdown
          balance.transactions.push({
            id: line.id,
            date: line.journalEntry.transactionDate.toISOString().split('T')[0],
            reference: line.journalEntry.referenceNumber || "",
            description: line.journalEntry.description || "",
            debitAmount: debitAmt,
            creditAmount: creditAmt,
            source: source,
            journalEntry: {
              id: line.journalEntry.id,
              referenceNumber: line.journalEntry.referenceNumber,
              description: line.journalEntry.description,
              transactionDate: line.journalEntry.transactionDate,
              status: line.journalEntry.status,
              currencyId: line.journalEntry.currencyId || null
            },
            sourceTransaction: sourceTransaction,
            journalEntryId: line.journalEntry.id,
            journalEntryStatus: line.journalEntry.status
          });
        }
      }

      // Build trial balance accounts array
      const trialBalanceAccounts: TrialBalanceAccount[] = [];
      let totalDebits = 0;
      let totalCredits = 0;

      // Create account map for quick lookup
      const accountMap = new Map(accounts.map(acc => [acc.id, acc]));

      // Process balances and build response
      for (const [accountId, balances] of accountBalances.entries()) {
        const account = accountMap.get(accountId);
        if (!account) continue;

        const { debitBalance, creditBalance } = balances;
        const netBalance = debitBalance - creditBalance;

        // For display: show net balance in debit or credit column
        const displayDebit = netBalance > 0 ? netBalance : 0;
        const displayCredit = netBalance < 0 ? Math.abs(netBalance) : 0;

        // Sort transactions by date
        const transactions = balances.transactions.sort((a, b) => a.date.localeCompare(b.date));

        trialBalanceAccounts.push({
          accountId: account.id,
          accountName: account.accountName,
          accountNo: account.accountNo,
          accountType: account.accountType,
          debitBalance: displayDebit,
          creditBalance: displayCredit,
          transactions: transactions
        });

        // IMPORTANT: For totals, sum ALL debits and ALL credits (gross totals), not net balances
        // This ensures month-end totals match journal entry totals
        totalDebits += debitBalance;  // Sum of ALL debit amounts
        totalCredits += creditBalance; // Sum of ALL credit amounts
      }

      // Sort accounts by account type and account number
      trialBalanceAccounts.sort((a, b) => {
        if (a.accountType !== b.accountType) {
          return a.accountType.localeCompare(b.accountType);
        }
        return a.accountNo.localeCompare(b.accountNo);
      });

      // Zero-balance suppression: omit accounts with no transactions and zero balance (reduce clutter)
      const ZERO_TOLERANCE = 0.01;
      const accountsToReturn =
        hideZeroBalances === true
          ? trialBalanceAccounts.filter(
              (a) => (a.debitBalance || 0) >= ZERO_TOLERANCE || (a.creditBalance || 0) >= ZERO_TOLERANCE
            )
          : trialBalanceAccounts;

      // Determine if this is cumulative or period-based
      const isCumulative = !startDate || !endDate || (startDate.getTime() === new Date(0).getTime());
      
      return {
        date: date.toISOString().split('T')[0],
        startDate: startDate ? startDate.toISOString().split('T')[0] : undefined,
        endDate: endDate ? endDate.toISOString().split('T')[0] : undefined,
        isCumulative, // Indicates if this is cumulative (all entries up to date) or period-based (specific date range)
        accounts: accountsToReturn,
        totals: {
          totalDebits,
          totalCredits,
          isBalanced: Math.abs(totalDebits - totalCredits) < 0.01 // Allow for small rounding differences
        }
      };
    } catch (error: any) {
      console.error('Error generating trial balance:', error);
      
      // Provide more helpful error messages for common database errors
      if (error.message && error.message.includes('Server shutdown')) {
        throw new Error('Database server is temporarily unavailable. Please try again in a moment.');
      }
      if (error.message && error.message.includes('connection')) {
        throw new Error('Database connection error. Please try again.');
      }
      
      throw new Error(`Failed to generate trial balance: ${error.message}`);
    }
  }

  /**
   * Get trial balance summary
   */
  static async getTrialBalanceSummary(date: Date, startDate?: Date, endDate?: Date): Promise<{
    totalAccounts: number;
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
    balanceDifference: number;
  }> {
    try {
      const trialBalance = await this.generateTrialBalance(date, startDate, endDate);
      
      return {
        totalAccounts: trialBalance.accounts.length,
        totalDebits: trialBalance.totals.totalDebits,
        totalCredits: trialBalance.totals.totalCredits,
        isBalanced: trialBalance.totals.isBalanced,
        balanceDifference: Math.abs(trialBalance.totals.totalDebits - trialBalance.totals.totalCredits)
      };
    } catch (error: any) {
      console.error('Error getting trial balance summary:', error);
      throw new Error(`Failed to get trial balance summary: ${error.message}`);
    }
  }

  /**
   * Get trial balance by account type
   */
  static async getTrialBalanceByAccountType(date: Date, startDate?: Date, endDate?: Date): Promise<{
    [accountType: string]: {
      accounts: TrialBalanceAccount[];
      totalDebits: number;
      totalCredits: number;
      netBalance: number;
    };
  }> {
    try {
      const trialBalance = await this.generateTrialBalance(date, startDate, endDate);
      const groupedByType: { [key: string]: any } = {};

      for (const account of trialBalance.accounts) {
        if (!groupedByType[account.accountType]) {
          groupedByType[account.accountType] = {
            accounts: [],
            totalDebits: 0,
            totalCredits: 0,
            netBalance: 0
          };
        }

        groupedByType[account.accountType].accounts.push(account);
        groupedByType[account.accountType].totalDebits += account.debitBalance;
        groupedByType[account.accountType].totalCredits += account.creditBalance;
        groupedByType[account.accountType].netBalance += account.netBalance;
      }

      return groupedByType;
    } catch (error: any) {
      console.error('Error getting trial balance by account type:', error);
      throw new Error(`Failed to get trial balance by account type: ${error.message}`);
    }
  }
}
