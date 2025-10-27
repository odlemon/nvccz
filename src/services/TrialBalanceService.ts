// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';

import { dbConnection } from '../utils/database';
const prisma = dbConnection.getPrismaClient();

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
      // Get all active accounts
      const accounts = await prisma.chartOfAccounts.findMany({
        where: { isActive: true },
        orderBy: [
          { accountType: 'asc' },
          { accountNo: 'asc' }
        ]
      });

      const trialBalanceAccounts: TrialBalanceAccount[] = [];
      let totalDebits = 0;
      let totalCredits = 0;

      // Create end of day date to include all entries from the specified date
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Calculate balance for each account
      for (const account of accounts) {
        const journalEntries = await prisma.journalEntryLine.findMany({
          where: {
            chartOfAccountId: account.id,
            journalEntry: {
              transactionDate: {
                lte: endOfDay
              },
              status: 'POSTED' // Only include POSTED entries (exclude VOID and PENDING)
            }
          },
          include: {
            journalEntry: true
          }
        });

        let debitBalance = 0;
        let creditBalance = 0;

        // Sum up debits and credits for this account
        for (const entry of journalEntries) {
          if (entry.debitAmount && entry.debitAmount.gt(0)) {
            debitBalance += entry.debitAmount.toNumber();
          }
          if (entry.creditAmount && entry.creditAmount.gt(0)) {
            creditBalance += entry.creditAmount.toNumber();
          }
        }

        // Calculate net balance
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
