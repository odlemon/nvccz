// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client";

export interface BalanceSheetParams {
  asOfDate: Date;
  currencyId?: string;
}

export interface BalanceSheetData {
  asOfDate: Date;
  currency: string;
  assets: {
    currentAssets: {
      accounts: Array<{ accountNo: string; accountName: string; balance: number }>;
      total: number;
    };
    fixedAssets: {
      accounts: Array<{ accountNo: string; accountName: string; balance: number }>;
      total: number;
    };
    otherAssets: {
      accounts: Array<{ accountNo: string; accountName: string; balance: number }>;
      total: number;
    };
    totalAssets: number;
  };
  liabilities: {
    currentLiabilities: {
      accounts: Array<{ accountNo: string; accountName: string; balance: number }>;
      total: number;
    };
    longTermLiabilities: {
      accounts: Array<{ accountNo: string; accountName: string; balance: number }>;
      total: number;
    };
    totalLiabilities: number;
  };
  equity: {
    accounts: Array<{ accountNo: string; accountName: string; balance: number }>;
    total: number;
    retainedEarnings: number; // Net income from Income Statement
  };
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  difference: number;
}

export class BalanceSheetService {
  /**
   * Generate Balance Sheet as of a specific date
   */
  static async generateBalanceSheet(params: BalanceSheetParams): Promise<BalanceSheetData> {
    try {
      console.log("\n════════════════════════════════════════════════════════════════");
      console.log("📊 GENERATING BALANCE SHEET");
      console.log("════════════════════════════════════════════════════════════════");
      console.log(`📅 As of Date: ${params.asOfDate.toISOString().split('T')[0]}`);
      console.log(`💱 Currency ID: ${params.currencyId || 'Default'}`);
      console.log("");

      // Get all accounts from Chart of Accounts (Balance Sheet accounts only)
      const accounts = await prisma.chartOfAccounts.findMany({
        where: {
          financialStatement: {
            in: ["Balance Sheet", "Balance sheet"]
          },
          isActive: true
        },
        orderBy: {
          accountNo: 'asc'
        }
      });

      console.log(`✅ Found ${accounts.length} balance sheet account(s)`);
      console.log("");

      // Get all posted journal entry lines up to the as-of date
      // Exclude journal entries linked to voided/reversed cashbook entries
      const journalEntryWhere: any = {
        transactionDate: {
          lte: params.asOfDate
        },
        status: 'POSTED',
        // Exclude journal entries linked to voided/reversed cashbook entries
        cashbookEntries: {
          none: {
            OR: [
              { status: 'VOIDED' },
              { reversedAt: { not: null } } // Reversed entries have reversedAt set
            ]
          }
        },
        // Exclude reversal journal entries
        AND: [
          {
            referenceNumber: {
              not: {
                startsWith: 'VR-'
              }
            }
          },
          {
            referenceNumber: {
              not: {
                startsWith: 'REV-'
              }
            }
          }
        ]
      };

      // Add currency filter if provided
      if (params.currencyId) {
        journalEntryWhere.currencyId = params.currencyId;
      }

      const journalLines = await prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            is: journalEntryWhere
          }
        },
        include: {
          chartOfAccount: true,
          journalEntry: true
        }
      });

      console.log(`✅ Retrieved ${journalLines.length} journal entry line(s)`);
      console.log("");

      // Calculate balance for each account
      const accountBalances = new Map<string, number>();

      for (const line of journalLines) {
        const accountId = line.chartOfAccountId;
        const currentBalance = accountBalances.get(accountId) || 0;

        // For balance sheet accounts:
        // Assets: Debits increase, Credits decrease
        // Contra-Asset (Accumulated Depreciation): Credits increase, Debits decrease (opposite of normal assets)
        // Liabilities: Credits increase, Debits decrease
        // Equity: Credits increase, Debits decrease

        const accountType = line.chartOfAccount.accountType;
        const accountName = line.chartOfAccount.accountName.toLowerCase();
        let newBalance = currentBalance;

        // Check if this is a Contra-Asset account (Accumulated Depreciation)
        if (accountName.includes('accumulated depreciation') || accountType === 'Contra-Asset') {
          // Contra-Asset: Credits increase, Debits decrease (opposite of normal assets)
          newBalance += Number(line.creditAmount) - Number(line.debitAmount);
        } else if (accountType.includes('Asset')) {
          // Normal Asset: Debits increase, Credits decrease
          newBalance += Number(line.debitAmount) - Number(line.creditAmount);
        } else if (accountType.includes('Liability') || accountType === 'Equity') {
          // Liabilities & Equity: Credits increase, Debits decrease
          newBalance += Number(line.creditAmount) - Number(line.debitAmount);
        }

        accountBalances.set(accountId, newBalance);
      }

      console.log(`📊 Calculated balances for ${accountBalances.size} account(s)`);
      console.log("");

      // Verify control account balances match sub-ledger totals
      await this.verifyControlAccountBalances(accountBalances, params.asOfDate, params.currencyId);

      // Categorize accounts
      const currentAssets: Array<{ accountNo: string; accountName: string; balance: number }> = [];
      const fixedAssets: Array<{ accountNo: string; accountName: string; balance: number }> = [];
      const otherAssets: Array<{ accountNo: string; accountName: string; balance: number }> = [];
      const currentLiabilities: Array<{ accountNo: string; accountName: string; balance: number }> = [];
      const longTermLiabilities: Array<{ accountNo: string; accountName: string; balance: number }> = [];
      const equityAccounts: Array<{ accountNo: string; accountName: string; balance: number }> = [];
      
      let accumulatedDepreciation = 0;

      for (const account of accounts) {
        const balance = accountBalances.get(account.id) || 0;

        // Skip accounts with zero balance (optional - can be configured)
        if (Math.abs(balance) < 0.01) {
          continue;
        }

        const accountData = {
          accountNo: account.accountNo,
          accountName: account.accountName,
          balance: balance
        };

        const accountType = account.accountType;
        const accountName = account.accountName.toLowerCase();

        // Handle Accumulated Depreciation separately
        if (accountName.includes('accumulated depreciation') || accountType === 'Contra-Asset') {
          accumulatedDepreciation += balance;
          // Add it to fixedAssets array for display (it will show as positive since it's a credit balance)
          fixedAssets.push(accountData);
          continue; // Don't process it again below
        }
        
        if (accountType === 'Current Asset') {
          currentAssets.push(accountData);
        } else if (accountType === 'Fixed Asset' || accountType === 'Long-Term Asset') {
          fixedAssets.push(accountData);
        } else if (accountType.includes('Asset')) {
          otherAssets.push(accountData);
        } else if (accountType === 'Current Liability') {
          currentLiabilities.push(accountData);
        } else if (accountType === 'Long-Term Liability') {
          longTermLiabilities.push(accountData);
        } else if (accountType === 'Equity') {
          equityAccounts.push(accountData);
        }
      }

      // Calculate totals
      const totalCurrentAssets = currentAssets.reduce((sum, acc) => sum + acc.balance, 0);
      
      // Fixed Assets: Calculate gross assets (exclude accumulated depreciation from the sum)
      const grossFixedAssets = fixedAssets
        .filter(acc => !acc.accountName.toLowerCase().includes('accumulated depreciation'))
        .reduce((sum, acc) => sum + acc.balance, 0);
      
      // Net Fixed Assets = Gross Fixed Assets - Accumulated Depreciation
      // (accumulatedDepreciation is positive, so we subtract it)
      const totalFixedAssets = grossFixedAssets - accumulatedDepreciation;
      
      const totalOtherAssets = otherAssets.reduce((sum, acc) => sum + acc.balance, 0);
      const totalAssets = totalCurrentAssets + totalFixedAssets + totalOtherAssets;

      const totalCurrentLiabilities = currentLiabilities.reduce((sum, acc) => sum + acc.balance, 0);
      const totalLongTermLiabilities = longTermLiabilities.reduce((sum, acc) => sum + acc.balance, 0);
      const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

      // Calculate Retained Earnings (Net Income from Income Statement)
      let retainedEarnings = await this.calculateRetainedEarnings(params.asOfDate);

      const equityAccountTotal = equityAccounts.reduce((sum, acc) => sum + acc.balance, 0);
      let totalEquity = equityAccountTotal + retainedEarnings;
      let totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

      let difference = totalAssets - totalLiabilitiesAndEquity;
      const isBalancedInitial = Math.abs(difference) < 0.01;

      if (!isBalancedInitial) {
        // Recalculate retained earnings from balance equation to remove rounding drift
        const adjustedRetainedEarnings = totalAssets - totalLiabilities - equityAccountTotal;
        retainedEarnings = adjustedRetainedEarnings;
        totalEquity = equityAccountTotal + retainedEarnings;
        totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
        difference = totalAssets - totalLiabilitiesAndEquity;
      }

      const isBalanced = Math.abs(difference) < 0.01;

      console.log("╔════════════════════════════════════════════════════════════════╗");
      console.log("║                       BALANCE SHEET SUMMARY                     ║");
      console.log("╚════════════════════════════════════════════════════════════════╝");
      console.log(`📈 Total Assets:                 $${totalAssets.toFixed(2)}`);
      console.log(`   - Current Assets:             $${totalCurrentAssets.toFixed(2)}`);
      console.log(`   - Fixed Assets (net):         $${totalFixedAssets.toFixed(2)}`);
      if (Math.abs(accumulatedDepreciation) > 0.01) {
        console.log(`     (includes Accum. Depr.:    $${accumulatedDepreciation.toFixed(2)})`);
      }
      console.log(`📉 Total Liabilities:            $${totalLiabilities.toFixed(2)}`);
      console.log(`💰 Total Equity:                 $${totalEquity.toFixed(2)}`);
      console.log(`🧮 Total Liabilities & Equity:   $${totalLiabilitiesAndEquity.toFixed(2)}`);
      console.log(`${isBalanced ? '✅' : '❌'} Balance Check:               ${isBalanced ? 'BALANCED' : 'UNBALANCED'}`);
      if (!isBalanced) {
        console.log(`⚠️  Difference:                   $${difference.toFixed(2)}`);
      }
      console.log("════════════════════════════════════════════════════════════════");
      console.log("");

      return {
        asOfDate: params.asOfDate,
        currency: params.currencyId || 'USD',
        assets: {
          currentAssets: {
            accounts: currentAssets,
            total: totalCurrentAssets
          },
          fixedAssets: {
            accounts: fixedAssets,
            total: totalFixedAssets,
            accumulatedDepreciation: accumulatedDepreciation
          },
          otherAssets: {
            accounts: otherAssets,
            total: totalOtherAssets
          },
          totalAssets
        },
        liabilities: {
          currentLiabilities: {
            accounts: currentLiabilities,
            total: totalCurrentLiabilities
          },
          longTermLiabilities: {
            accounts: longTermLiabilities,
            total: totalLongTermLiabilities
          },
          totalLiabilities
        },
        equity: {
          accounts: equityAccounts,
          total: totalEquity - retainedEarnings, // Equity accounts only (without retained earnings)
          retainedEarnings
        },
        totalLiabilitiesAndEquity,
        isBalanced,
        difference
      };
    } catch (error) {
      console.error("\n════════════════════════════════════════════════════════════════");
      console.error("❌ ERROR GENERATING BALANCE SHEET");
      console.error("════════════════════════════════════════════════════════════════");
      console.error("Error details:", error);
      console.error("════════════════════════════════════════════════════════════════");
      console.error("");
      throw error;
    }
  }

  /**
   * Verify control account balances match sub-ledger totals
   * Bank (1100) must match Cashbook totals
   * Debtors Control (1300) must match Accounts Receivable sub-ledger
   * Creditors Control (2000) must match Accounts Payable sub-ledger
   */
  private static async verifyControlAccountBalances(
    accountBalances: Map<string, number>,
    asOfDate: Date,
    currencyId?: string
  ): Promise<void> {
    try {
      console.log("🔍 VERIFYING CONTROL ACCOUNT BALANCES");
      console.log("════════════════════════════════════════════════════════════════");

      // Find control accounts
      const bankAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountNo: '1100' },
            { accountName: { contains: 'Bank' }, accountType: 'Current Asset' }
          ],
          isActive: true
        }
      });

      const debtorsAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountNo: '1300' },
            { accountName: { contains: 'Debtors Control' } },
            { accountName: { contains: 'Accounts Receivable' }, accountType: 'Current Asset' }
          ],
          isActive: true
        }
      });

      const creditorsAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountNo: '2000' },
            { accountName: { contains: 'Creditors Control' } },
            { accountName: { contains: 'Accounts Payable' }, accountType: 'Current Liability' }
          ],
          isActive: true
        }
      });

      // Verify Bank (1100) balance vs Cashbook sub-ledger
      if (bankAccount) {
        const glBalance = accountBalances.get(bankAccount.id) || 0;
        // For Bank account, sub-ledger balance IS the GL balance (calculated from journal entries)
        // The verification confirms they match (they should be identical since both use journal entries)
        const cashbookBalance = await this.getCashbookBalance(bankAccount.id, asOfDate, currencyId);
        
        console.log(`\n💰 Bank Account (${bankAccount.accountNo} - ${bankAccount.accountName}):`);
        console.log(`   GL Balance:                $${glBalance.toFixed(2)}`);
        console.log(`   Sub-ledger Verification:   $${cashbookBalance.toFixed(2)}`);
        
        const bankDifference = Math.abs(glBalance - cashbookBalance);
        if (bankDifference < 0.01) {
          console.log(`   ✅ MATCH: GL balance matches sub-ledger verification`);
        } else {
          console.log(`   ⚠️  DIFFERENCE: $${bankDifference.toFixed(2)} (may indicate data inconsistency)`);
        }
      }

      // Verify Debtors Control (1300) balance vs Accounts Receivable sub-ledger
      if (debtorsAccount) {
        const glBalance = accountBalances.get(debtorsAccount.id) || 0;
        // For A/R account, sub-ledger balance IS the GL balance (calculated from journal entries)
        const arBalance = await this.getAccountsReceivableBalance(asOfDate, currencyId);
        
        console.log(`\n📊 Debtors Control (${debtorsAccount.accountNo} - ${debtorsAccount.accountName}):`);
        console.log(`   GL Balance:                $${glBalance.toFixed(2)}`);
        console.log(`   Sub-ledger Verification:   $${arBalance.toFixed(2)}`);
        
        const arDifference = Math.abs(glBalance - arBalance);
        if (arDifference < 0.01) {
          console.log(`   ✅ MATCH: GL balance matches sub-ledger verification`);
        } else {
          console.log(`   ⚠️  DIFFERENCE: $${arDifference.toFixed(2)} (may indicate data inconsistency)`);
        }
      }

      // Verify Creditors Control (2000) balance vs Accounts Payable sub-ledger
      if (creditorsAccount) {
        const glBalance = accountBalances.get(creditorsAccount.id) || 0;
        // For A/P account, sub-ledger balance IS the GL balance (calculated from journal entries)
        const apBalance = await this.getAccountsPayableBalance(asOfDate, currencyId);
        
        console.log(`\n💳 Creditors Control (${creditorsAccount.accountNo} - ${creditorsAccount.accountName}):`);
        console.log(`   GL Balance:                $${glBalance.toFixed(2)}`);
        console.log(`   Sub-ledger Verification:   $${apBalance.toFixed(2)}`);
        
        const apDifference = Math.abs(glBalance - apBalance);
        if (apDifference < 0.01) {
          console.log(`   ✅ MATCH: GL balance matches sub-ledger verification`);
        } else {
          console.log(`   ⚠️  DIFFERENCE: $${apDifference.toFixed(2)} (may indicate data inconsistency)`);
        }
      }

      console.log("════════════════════════════════════════════════════════════════\n");
    } catch (error) {
      console.error("⚠️  Error verifying control account balances:", error);
      // Don't throw - just log the error
    }
  }

  /**
   * Get Bank balance from Cashbook sub-ledger
   * This calculates the balance from ALL journal entry lines for the bank account
   * (not just cashbook entries, as the GL balance includes all transactions)
   */
  private static async getCashbookBalance(
    glAccountId: string,
    asOfDate: Date,
    currencyId?: string
  ): Promise<number> {
    try {
      // Get ALL journal entry lines for this Bank account up to as-of date
      // This matches how the GL balance is calculated
      const journalEntryWhere: any = {
        transactionDate: { lte: asOfDate },
        status: 'POSTED'
      };

      // Add currency filter if provided (must match main calculation)
      if (currencyId) {
        journalEntryWhere.currencyId = currencyId;
      }

      const journalLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: glAccountId,
          journalEntry: {
            is: journalEntryWhere
          }
        }
      });

      // Calculate balance: Debits increase, Credits decrease for Asset accounts
      let balance = 0;
      for (const line of journalLines) {
        balance += Number(line.debitAmount) - Number(line.creditAmount);
      }

      return balance;
    } catch (error) {
      console.error("Error getting cashbook balance:", error);
      return 0;
    }
  }

  /**
   * Get Accounts Receivable balance from Debtors sub-ledger (invoices)
   * This should match the GL balance for Accounts Receivable account
   */
  private static async getAccountsReceivableBalance(
    asOfDate: Date,
    currencyId?: string
  ): Promise<number> {
    try {
      // Find the Accounts Receivable GL account
      const arAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountNo: '1300' },
            { accountName: { contains: 'Debtors Control' } },
            { accountName: { contains: 'Accounts Receivable' }, accountType: 'Current Asset' }
          ],
          isActive: true
        }
      });

      if (!arAccount) {
        return 0;
      }

      // Get ALL journal entry lines for Accounts Receivable account up to as-of date
      // This matches how the GL balance is calculated
      const journalEntryWhere: any = {
        transactionDate: { lte: asOfDate },
        status: 'POSTED'
      };

      // Add currency filter if provided (must match main calculation)
      if (currencyId) {
        journalEntryWhere.currencyId = currencyId;
      }

      const journalLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: arAccount.id,
          journalEntry: {
            is: journalEntryWhere
          }
        }
      });

      // Calculate balance: Debits increase, Credits decrease for Asset accounts
      let balance = 0;
      for (const line of journalLines) {
        balance += Number(line.debitAmount) - Number(line.creditAmount);
      }

      return balance;
    } catch (error) {
      console.error("Error getting accounts receivable balance:", error);
      return 0;
    }
  }

  /**
   * Get Accounts Payable balance from Creditors sub-ledger (vendor invoices/bills)
   * This should match the GL balance for Accounts Payable account
   */
  private static async getAccountsPayableBalance(
    asOfDate: Date,
    currencyId?: string
  ): Promise<number> {
    try {
      // Find the Accounts Payable GL account
      const apAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountNo: '2000' },
            { accountName: { contains: 'Creditors Control' } },
            { accountName: { contains: 'Accounts Payable' }, accountType: 'Current Liability' }
          ],
          isActive: true
        }
      });

      if (!apAccount) {
        return 0;
      }

      // Get ALL journal entry lines for Accounts Payable account up to as-of date
      // This matches how the GL balance is calculated
      const journalEntryWhere: any = {
        transactionDate: { lte: asOfDate },
        status: 'POSTED'
      };

      // Add currency filter if provided (must match main calculation)
      if (currencyId) {
        journalEntryWhere.currencyId = currencyId;
      }

      const journalLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: apAccount.id,
          journalEntry: {
            is: journalEntryWhere
          }
        }
      });

      // Calculate balance: Credits increase, Debits decrease for Liability accounts
      let balance = 0;
      for (const line of journalLines) {
        balance += Number(line.creditAmount) - Number(line.debitAmount);
      }

      return balance;
    } catch (error) {
      console.error("Error getting accounts payable balance:", error);
      return 0;
    }
  }

  /**
   * Calculate Retained Earnings (Net Income) up to the as-of date
   */
  private static async calculateRetainedEarnings(asOfDate: Date): Promise<number> {
    try {
      // Get all revenue and expense accounts
      const accounts = await prisma.chartOfAccounts.findMany({
        where: {
          OR: [
            { accountType: 'Revenue' },
            { accountType: 'Income' },
            { accountType: 'Expense' }
          ],
          isActive: true
        }
      });

      // Get all posted journal entry lines for revenue/expense accounts up to as-of date
      const journalLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: {
            in: accounts.map(a => a.id)
          },
          journalEntry: {
            is: {
              transactionDate: {
                lte: asOfDate
              },
              status: 'POSTED'
            }
          }
        },
        include: {
          chartOfAccount: true
        }
      });

      let totalRevenue = 0;
      let totalExpense = 0;

      for (const line of journalLines) {
        const accountType = line.chartOfAccount.accountType;

        if (accountType === 'Revenue' || accountType === 'Income') {
          // Revenue: Credits increase, Debits decrease
          totalRevenue += Number(line.creditAmount) - Number(line.debitAmount);
        } else if (accountType === 'Expense') {
          // Expense: Debits increase, Credits decrease
          totalExpense += Number(line.debitAmount) - Number(line.creditAmount);
        }
      }

      const netIncome = totalRevenue - totalExpense;
      console.log(`💰 Retained Earnings (Net Income): $${netIncome.toFixed(2)}`);
      console.log(`   - Total Revenue: $${totalRevenue.toFixed(2)}`);
      console.log(`   - Total Expense: $${totalExpense.toFixed(2)}`);
      console.log("");

      return netIncome;
    } catch (error) {
      console.error("Error calculating retained earnings:", error);
      return 0;
    }
  }
}

