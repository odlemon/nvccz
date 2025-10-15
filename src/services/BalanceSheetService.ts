// @ts-nocheck
import { dbConnection } from "../utils/database";
import { Decimal } from "@prisma/client";

const prisma = dbConnection.getPrismaClient();

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
      const journalLines = await prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            is: {
              transactionDate: {
                lte: params.asOfDate
              },
              status: 'POSTED'
            }
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
      const retainedEarnings = await this.calculateRetainedEarnings(params.asOfDate);

      const totalEquity = equityAccounts.reduce((sum, acc) => sum + acc.balance, 0) + retainedEarnings;
      const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

      const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;
      const difference = totalAssets - totalLiabilitiesAndEquity;

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

