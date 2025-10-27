// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../utils/database";
import { CashFlowAccount } from "./types";

export class CashFlowBalanceService {
  /**
   * Calculate account balances from journal entries
   */
  static async calculateAccountBalances(journalEntries: any[]): Promise<CashFlowAccount[]> {
    const accountBalances = new Map<string, CashFlowAccount>();

    // Process all journal entry lines
    for (const journalEntry of journalEntries) {
      for (const line of journalEntry.journalEntryLines) {
        const accountId = line.chartOfAccount.id;
        
        if (!accountBalances.has(accountId)) {
          accountBalances.set(accountId, {
            accountId: line.chartOfAccount.id,
            accountNo: line.chartOfAccount.accountNo,
            accountName: line.chartOfAccount.accountName,
            accountType: line.chartOfAccount.accountType,
            financialStatement: line.chartOfAccount.financialStatement,
            totalDebits: 0,
            totalCredits: 0,
            netAmount: 0,
            cashFlowCategory: ""
          });
        }

        const account = accountBalances.get(accountId)!;
        account.totalDebits += parseFloat(line.debitAmount.toString());
        account.totalCredits += parseFloat(line.creditAmount.toString());
      }
    }

    // Calculate net amounts based on account type
    for (const account of accountBalances.values()) {
      if (account.accountType === "Asset") {
        // Asset accounts: Debits increase, Credits decrease
        account.netAmount = account.totalDebits - account.totalCredits;
      } else if (account.accountType === "Liability" || account.accountType === "Equity") {
        // Liability/Equity accounts: Credits increase, Debits decrease
        account.netAmount = account.totalCredits - account.totalDebits;
      } else if (account.accountType === "Revenue") {
        // Revenue accounts: Credits increase, Debits decrease
        account.netAmount = account.totalCredits - account.totalDebits;
      } else if (account.accountType === "Expense") {
        // Expense accounts: Debits increase, Credits decrease
        account.netAmount = account.totalDebits - account.totalCredits;
      }
    }

    return Array.from(accountBalances.values());
  }

  /**
   * Get cash balances for beginning and end of period
   */
  static async getCashBalances(startDate: Date, endDate: Date, currencyId: string): Promise<{ beginning: number; ending: number }> {
    // Get cash accounts
    const cashAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        accountName: {
          contains: "Cash"
        },
        isActive: true
      }
    });

    let beginningBalance = 0;
    let endingBalance = 0;

    for (const cashAccount of cashAccounts) {
      // Get beginning balance (all transactions before start date)
      const beginningTransactions = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: cashAccount.id,
          journalEntry: {
            transactionDate: {
              lt: startDate
            },
            status: "POSTED",
            currencyId
          }
        }
      });

      // Get ending balance (all transactions up to end date)
      const endingTransactions = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: cashAccount.id,
          journalEntry: {
            transactionDate: {
              lte: endDate
            },
            status: "POSTED",
            currencyId
          }
        }
      });

      // Calculate balances
      const beginningDebits = beginningTransactions.reduce((sum, t) => sum + parseFloat(t.debitAmount.toString()), 0);
      const beginningCredits = beginningTransactions.reduce((sum, t) => sum + parseFloat(t.creditAmount.toString()), 0);
      beginningBalance += beginningDebits - beginningCredits;

      const endingDebits = endingTransactions.reduce((sum, t) => sum + parseFloat(t.debitAmount.toString()), 0);
      const endingCredits = endingTransactions.reduce((sum, t) => sum + parseFloat(t.creditAmount.toString()), 0);
      endingBalance += endingDebits - endingCredits;
    }

    return { beginning: beginningBalance, ending: endingBalance };
  }
} 