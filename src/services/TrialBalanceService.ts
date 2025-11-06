// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';

import { prisma } from '../utils/database';

export interface TrialBalanceAccount {
  accountId: string;
  accountName: string;
  accountNo: string;
  accountType: string;
  debitBalance: number;
  creditBalance: number;
  netBalance: number;
}

export interface TrialBalanceData {
  date: string;
  accounts: TrialBalanceAccount[];
  totals: {
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
  };
}

export class TrialBalanceService {
  /**
   * Generate trial balance for a specific date
   */
  static async generateTrialBalance(date: Date): Promise<TrialBalanceData> {
    try {
      // Create end of day date to include all entries from the specified date
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Get all active accounts with a single query
      const accounts = await prisma.chartOfAccounts.findMany({
        where: { isActive: true },
        orderBy: [
          { accountType: 'asc' },
          { accountNo: 'asc' }
        ]
      });

      // Get all journal entry lines in a single optimized query with aggregation
      // This avoids N+1 query problem
      const journalEntryLines = await prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            transactionDate: {
              lte: endOfDay
            },
            status: 'POSTED' // Only include POSTED entries (exclude VOID and PENDING)
          }
        },
        select: {
          chartOfAccountId: true,
          debitAmount: true,
          creditAmount: true
        }
      });

      // Create a map to aggregate balances by account ID
      const accountBalances = new Map<string, { debitBalance: number; creditBalance: number }>();

      // Initialize all accounts with zero balances
      for (const account of accounts) {
        accountBalances.set(account.id, { debitBalance: 0, creditBalance: 0 });
      }

      // Aggregate journal entry lines by account
      for (const line of journalEntryLines) {
        if (!line.chartOfAccountId) continue;
        
        const balance = accountBalances.get(line.chartOfAccountId);
        if (balance) {
          if (line.debitAmount && line.debitAmount.gt(0)) {
            balance.debitBalance += line.debitAmount.toNumber();
          }
          if (line.creditAmount && line.creditAmount.gt(0)) {
            balance.creditBalance += line.creditAmount.toNumber();
          }
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

        // Only include accounts with non-zero balances
        if (debitBalance > 0 || creditBalance > 0) {
          trialBalanceAccounts.push({
            accountId: account.id,
            accountName: account.accountName,
            accountNo: account.accountNo,
            accountType: account.accountType,
            debitBalance,
            creditBalance,
            netBalance
          });

          totalDebits += debitBalance;
          totalCredits += creditBalance;
        }
      }

      // Sort accounts by account type and account number
      trialBalanceAccounts.sort((a, b) => {
        if (a.accountType !== b.accountType) {
          return a.accountType.localeCompare(b.accountType);
        }
        return a.accountNo.localeCompare(b.accountNo);
      });

      return {
        date: date.toISOString().split('T')[0],
        accounts: trialBalanceAccounts,
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
  static async getTrialBalanceSummary(date: Date): Promise<{
    totalAccounts: number;
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
    balanceDifference: number;
  }> {
    try {
      const trialBalance = await this.generateTrialBalance(date);
      
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
  static async getTrialBalanceByAccountType(date: Date): Promise<{
    [accountType: string]: {
      accounts: TrialBalanceAccount[];
      totalDebits: number;
      totalCredits: number;
      netBalance: number;
    };
  }> {
    try {
      const trialBalance = await this.generateTrialBalance(date);
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
