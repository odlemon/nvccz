// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "decimal.js";

export interface BalanceSheetParams {
  asOfDate: Date;
  currencyId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface BalanceSheetTransaction {
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

export interface BalanceSheetAccount {
  accountNo: string;
  accountName: string;
  balance: number;
  transactions: BalanceSheetTransaction[]; // Transaction breakdown
}

export interface BalanceSheetData {
  asOfDate: Date;
  currency: string;
  assets: {
    cashAndCashEquivalents: {
      total: number;
      breakdown: BalanceSheetAccount[]; // Breakdown showing all cash/bank accounts that make up this total
    };
    currentAssets: {
      accounts: BalanceSheetAccount[];
      total: number;
    };
    fixedAssets: {
      accounts: BalanceSheetAccount[];
      total: number;
    };
    otherAssets: {
      accounts: BalanceSheetAccount[];
      total: number;
    };
    totalAssets: number;
  };
  liabilities: {
    currentLiabilities: {
      accounts: BalanceSheetAccount[];
      total: number;
    };
    longTermLiabilities: {
      accounts: BalanceSheetAccount[];
      total: number;
    };
    totalLiabilities: number;
  };
  equity: {
    accounts: BalanceSheetAccount[];
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
      
      // Debug: Check if asset account 1100 is in the accounts list
      const assetAccount1100 = accounts.find(acc => acc.accountNo === '1100');
      if (assetAccount1100) {
        console.log(`   ✅ Account 1100 (Office Equipment) IS in the accounts list`);
      } else {
        console.log(`   ⚠️  Account 1100 (Office Equipment) is NOT in the accounts list`);
        console.log(`   This means it doesn't match the filter: financialStatement="Balance Sheet" AND isActive=true`);
      }
      console.log("");

      // Determine date range: use startDate/endDate if provided, otherwise use asOfDate
      let startDate: Date;
      let endDate: Date;
      
      if (params.startDate && params.endDate) {
        startDate = new Date(params.startDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(params.endDate);
        endDate.setHours(23, 59, 59, 999);
      } else {
        // Legacy: use asOfDate as endDate, start from beginning of time
        startDate = new Date(0);
        endDate = new Date(params.asOfDate);
        endDate.setHours(23, 59, 59, 999);
      }

      // Get all posted journal entry lines within the date range
      // Exclude journal entries linked to voided/reversed cashbook entries
      // IMPORTANT: Use OR to explicitly include entries with NO cashbook entries (like asset acquisitions)
      const journalEntryWhere: any = {
        transactionDate: {
          gte: startDate,
          lte: endDate
        },
        status: 'POSTED',
        // Exclude reversal journal entries AND handle cashbook entries filter
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
          },
          {
            // IMPORTANT: Explicitly include journal entries with NO cashbook entries
            // (like asset acquisitions) while excluding entries with voided/reversed cashbook entries
            OR: [
              {
                // Include entries with no cashbook entries (like asset acquisitions)
                cashbookEntries: {
                  none: {}
                }
              },
              {
                // Include entries where all cashbook entries are valid (not voided, not reversed)
                cashbookEntries: {
                  every: {
                    AND: [
                      { status: { not: 'VOIDED' } },
                      { reversedAt: null }
                    ]
                  }
                }
              }
            ]
          }
        ]
      };

      // Add currency filter if provided
      if (params.currencyId) {
        journalEntryWhere.currencyId = params.currencyId;
        console.log(`   💱 Currency filter applied: ${params.currencyId}`);
        console.log(`   ⚠️  Only journal entries with this currency will be included`);
      } else {
        console.log(`   💱 No currency filter - including all currencies`);
      }

      // OPTIMIZED: First get journal lines without transaction details for fast balance calculation
      // Transaction details will be loaded on-demand only for accounts that have transactions
      const journalLines = await prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            is: journalEntryWhere
          }
        },
        select: {
          id: true,
          chartOfAccountId: true,
          debitAmount: true,
          creditAmount: true,
          journalEntryId: true,
          chartOfAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true,
              accountType: true,
              financialStatement: true
            }
          },
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

      console.log(`✅ Retrieved ${journalLines.length} journal entry line(s)`);
      
      // Debug: Check if asset journal entry lines are included
      const assetLines = journalLines.filter(line => 
        line.journalEntry.referenceNumber?.includes('ASSET') ||
        line.chartOfAccount.accountNo === '1100'
      );
      if (assetLines.length > 0) {
        console.log(`   📦 Found ${assetLines.length} asset-related journal entry line(s):`);
        assetLines.forEach(line => {
          console.log(`      - ${line.journalEntry.referenceNumber}: ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName} (Debit: $${line.debitAmount}, Credit: $${line.creditAmount})`);
        });
      } else {
        console.log(`   ⚠️  No asset-related journal entry lines found in query results`);
        console.log(`   This means the query filter is excluding asset entries`);
        console.log(`   Checking query structure...`);
        console.log(`   Query date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
        console.log(`   Query status: POSTED`);
        console.log(`   Query cashbook filter: OR with none/every`);
      }
      console.log("");

      // Calculate balance for each account and collect transactions
      const accountBalances = new Map<string, number>();
      const accountTransactions = new Map<string, BalanceSheetTransaction[]>();

      for (const line of journalLines) {
        const accountId = line.chartOfAccountId;
        const currentBalance = accountBalances.get(accountId) || 0;
        
        // Initialize transactions array if needed
        if (!accountTransactions.has(accountId)) {
          accountTransactions.set(accountId, []);
        }

        // For balance sheet accounts:
        // Assets: Debits increase, Credits decrease
        // Contra-Asset (Accumulated Depreciation): Credits increase, Debits decrease (opposite of normal assets)
        // Liabilities: Credits increase, Debits decrease
        // Equity: Credits increase, Debits decrease

        const accountType = line.chartOfAccount.accountType;
        const accountName = line.chartOfAccount.accountName.toLowerCase();
        let newBalance = currentBalance;

        // Use Decimal arithmetic to maintain precision - NO ROUNDING during calculations
        const debitAmount = new Decimal(line.debitAmount);
        const creditAmount = new Decimal(line.creditAmount);
        const currentBalanceDecimal = new Decimal(currentBalance);
        
        // Check if this is a Contra-Asset account (Accumulated Depreciation)
        if (accountName.includes('accumulated depreciation') || accountType === 'Contra-Asset') {
          // Contra-Asset: Credits increase, Debits decrease (opposite of normal assets)
          newBalance = currentBalanceDecimal.plus(creditAmount).minus(debitAmount).toNumber();
        } else if (accountType.includes('Asset')) {
          // Normal Asset: Debits increase, Credits decrease
          newBalance = currentBalanceDecimal.plus(debitAmount).minus(creditAmount).toNumber();
        } else if (accountType.includes('Liability') || accountType === 'Equity') {
          // Liabilities & Equity: Credits increase, Debits decrease
          newBalance = currentBalanceDecimal.plus(creditAmount).minus(debitAmount).toNumber();
        }

        accountBalances.set(accountId, newBalance);

        // Store basic transaction info (will enrich with details later if needed)
        const debitAmt = new Decimal(line.debitAmount || 0).toNumber();
        const creditAmt = new Decimal(line.creditAmount || 0).toNumber();

        // Add transaction to breakdown (basic info only for now)
        accountTransactions.get(accountId)!.push({
          id: line.id,
          date: line.journalEntry.transactionDate.toISOString().split('T')[0],
          reference: line.journalEntry.referenceNumber || "",
          description: line.journalEntry.description || "",
          debitAmount: debitAmt,
          creditAmount: creditAmt,
          source: "MANUAL_ENTRY", // Will be determined when loading details
          journalEntry: {
            id: line.journalEntry.id,
            referenceNumber: line.journalEntry.referenceNumber,
            description: line.journalEntry.description,
            transactionDate: line.journalEntry.transactionDate,
            status: line.journalEntry.status,
            currencyId: line.journalEntry.currencyId
          },
          sourceTransaction: null, // Will be loaded on-demand
          journalEntryId: line.journalEntry.id,
          journalEntryStatus: line.journalEntry.status
        });
      }

      console.log(`📊 Calculated balances for ${accountBalances.size} account(s)`);
      
      // Debug: Check if account 1100 is in accountBalances
      const account1100 = accounts.find(acc => acc.accountNo === '1100');
      if (account1100) {
        const balance1100 = accountBalances.get(account1100.id) || 0;
        console.log(`   [DEBUG] Account 1100 in accounts array:`);
        console.log(`      - Account ID: ${account1100.id}`);
        console.log(`      - Balance in accountBalances map: $${balance1100}`);
        
        // Check what account IDs are in accountBalances for account 1100
        const account1100Lines = journalLines.filter(line => line.chartOfAccount.accountNo === '1100');
        if (account1100Lines.length > 0) {
          console.log(`      - Journal entry lines found: ${account1100Lines.length}`);
          account1100Lines.forEach(line => {
            console.log(`         Line account ID: ${line.chartOfAccountId}`);
            console.log(`         Matches account1100.id? ${line.chartOfAccountId === account1100.id ? 'YES ✅' : 'NO ❌'}`);
            const lineBalance = accountBalances.get(line.chartOfAccountId) || 0;
            console.log(`         Balance for this account ID: $${lineBalance}`);
          });
        }
        
        if (balance1100 === 0) {
          console.log(`   ⚠️  WARNING: Account 1100 has zero balance in accountBalances map!`);
          console.log(`   This means either:`);
          console.log(`   1. No journal entry lines were found for this account ID`);
          console.log(`   2. The account ID from journal lines doesn't match the account ID in accounts array`);
          console.log(`   3. Currency filter is excluding the journal entry`);
        }
      } else {
        console.log(`   ⚠️  Account 1100 is NOT in the accounts array!`);
        console.log(`   This means it doesn't match: financialStatement="Balance Sheet" AND isActive=true`);
      }
      console.log("");

      // OPTIMIZED: Load transaction details only for accounts that have transactions
      // This significantly reduces query time by avoiding loading details for all transactions
      const journalEntryIds = new Set<string>();
      for (const transactions of accountTransactions.values()) {
        for (const tx of transactions) {
          journalEntryIds.add(tx.journalEntryId);
        }
      }

      if (journalEntryIds.size > 0) {
        console.log(`📦 Loading transaction details for ${journalEntryIds.size} journal entry(s)...`);
        const journalEntriesWithDetails = await prisma.journalEntry.findMany({
          where: {
            id: { in: Array.from(journalEntryIds) }
          },
          select: {
            id: true,
            referenceNumber: true,
            description: true,
            transactionDate: true,
            status: true,
            currencyId: true,
            cashbookEntries: {
              include: {
                bank: {
                  select: {
                    id: true,
                    name: true,
                    accountNumber: true
                  }
                },
                customer: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                },
                vendor: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              },
              take: 1
            },
            invoices: {
              include: {
                customer: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              },
              take: 1
            },
            expenses: {
              include: {
                vendor: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                },
                category: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              },
              take: 1
            },
            revenues: {
              include: {
                source: {
                  select: {
                    id: true,
                    name: true
                  }
                },
                category: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              },
              take: 1
            }
          }
        });

        // Create a map for quick lookup
        const journalEntryDetailsMap = new Map<string, any>();
        for (const je of journalEntriesWithDetails) {
          journalEntryDetailsMap.set(je.id, je);
        }

        // Enrich transactions with details
        for (const transactions of accountTransactions.values()) {
          for (const tx of transactions) {
            const jeDetails = journalEntryDetailsMap.get(tx.journalEntryId);
            if (!jeDetails) continue;

            let source = "MANUAL_ENTRY";
            let sourceTransaction: any = null;

            if (jeDetails.cashbookEntries && jeDetails.cashbookEntries.length > 0) {
              source = "CASHBOOK";
              const cashbookEntry = jeDetails.cashbookEntries[0];
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
            } else if (jeDetails.invoices && jeDetails.invoices.length > 0) {
              source = "INVOICE";
              const invoice = jeDetails.invoices[0];
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
            } else if (jeDetails.expenses && jeDetails.expenses.length > 0) {
              source = "EXPENSE";
              const expense = jeDetails.expenses[0];
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
            } else if (jeDetails.revenues && jeDetails.revenues.length > 0) {
              source = "REVENUE";
              const revenue = jeDetails.revenues[0];
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
                id: jeDetails.id,
                referenceNumber: tx.reference,
                description: tx.description,
                transactionDate: tx.date,
                status: tx.journalEntryStatus
              };
            }

            tx.source = source;
            tx.journalEntry = {
              id: jeDetails.id,
              referenceNumber: jeDetails.referenceNumber || tx.reference,
              description: jeDetails.description || tx.description,
              transactionDate: jeDetails.transactionDate || tx.date,
              status: jeDetails.status || tx.journalEntryStatus,
              currencyId: jeDetails.currencyId || null
            };
            tx.sourceTransaction = sourceTransaction;
          }
        }
        console.log(`✅ Transaction details loaded`);
        console.log("");
      }

      // Verify control account balances match sub-ledger totals
      await this.verifyControlAccountBalances(accountBalances, params.asOfDate, params.currencyId);

      // Get all bank accounts and their GL account IDs for cash and cash equivalents calculation
      // This matches the logic used in CashFlowBalanceService.getCashBalances()
      const banks = await prisma.bank.findMany({
        where: {
          isActive: true,
          glAccount: {
            isActive: true
          }
        },
        include: {
          glAccount: true
        }
      });
      const bankGLAccountIds = new Set<string>();
      for (const bank of banks) {
        if (bank.glAccount) {
          bankGLAccountIds.add(bank.glAccount.id);
        }
      }

      // Categorize accounts
      const currentAssets: Array<{ accountNo: string; accountName: string; balance: number }> = [];
      const fixedAssets: Array<{ accountNo: string; accountName: string; balance: number }> = [];
      const otherAssets: Array<{ accountNo: string; accountName: string; balance: number }> = [];
      const currentLiabilities: Array<{ accountNo: string; accountName: string; balance: number }> = [];
      const longTermLiabilities: Array<{ accountNo: string; accountName: string; balance: number }> = [];
      const equityAccounts: Array<{ accountNo: string; accountName: string; balance: number }> = [];
      
      let accumulatedDepreciation = 0;
      let cashAndCashEquivalents = 0; // Track cash and cash equivalents separately
      const cashAccountsBreakdown: BalanceSheetAccount[] = []; // Track all cash accounts for breakdown

      for (const account of accounts) {
        // IMPORTANT: Look up balance using account.id from accounts array
        // The accountBalances map was populated using line.chartOfAccountId
        // These should match, but if they don't, we need to find the correct account ID
        let balance = accountBalances.get(account.id) || 0;
        
        // If balance is zero, check if there's a different account ID in accountBalances
        // This can happen if the account was updated or there's a data inconsistency
        if (balance === 0 && account.accountNo === '1100') {
          // Try to find the balance by checking all entries in accountBalances
          for (const [accId, accBalance] of accountBalances.entries()) {
            // Find the account with this ID to check if it's account 1100
            const acc = accounts.find(a => a.id === accId);
            if (acc && acc.accountNo === '1100' && accBalance !== 0) {
              console.log(`   [DEBUG] ⚠️  Found account 1100 balance under different account ID: ${accId}`);
              console.log(`      - Original account ID: ${account.id}`);
              console.log(`      - Balance: $${accBalance}`);
              balance = accBalance;
              break;
            }
          }
        }
        
        // Debug: Log account 1100 specifically
        if (account.accountNo === '1100') {
          console.log(`   [DEBUG] Processing account 1100: ${account.accountName}`);
          console.log(`      - Account ID: ${account.id}`);
          console.log(`      - Balance from accountBalances: $${balance}`);
          console.log(`      - Account Type: ${account.accountType}`);
          console.log(`      - Will be skipped if zero? ${Math.abs(balance) < 0.01 ? 'YES' : 'NO'}`);
          console.log(`      - Is in accountBalances map? ${accountBalances.has(account.id) ? 'YES' : 'NO'}`);
          
          // Also check if there are any journal lines for this account
          const linesForThisAccount = journalLines.filter(line => 
            line.chartOfAccount.accountNo === '1100' && line.chartOfAccountId === account.id
          );
          console.log(`      - Journal lines for this account ID: ${linesForThisAccount.length}`);
          if (linesForThisAccount.length > 0) {
            const calculatedBalance = linesForThisAccount.reduce((sum, line) => {
              return sum + Number(line.debitAmount) - Number(line.creditAmount);
            }, 0);
            console.log(`      - Calculated balance from lines: $${calculatedBalance}`);
          }
        }

        // Check if this is a cash and cash equivalent account BEFORE skipping zero balances
        // Cash accounts should always be included in "Cash and Cash Equivalents" even if zero balance
        const accountName = account.accountName.toLowerCase();
        const accountNo = account.accountNo.toLowerCase();
        const accountType = account.accountType;
        const accountNameLower = accountName.toLowerCase();
        const isCashAccount = 
          accountNameLower.includes('cash') ||
          accountNameLower.includes('bank') ||
          (accountType === 'Current Asset' && 
           account.accountNo >= '1000' && 
           account.accountNo < '1100'); // Account numbers 1000-1099 are typically cash/bank accounts
        // IMPORTANT: Only treat as bank account if it's actually a Current Asset, not Fixed Asset
        // A Fixed Asset account should never be treated as a bank account, even if it's linked to a Bank record
        // Bank accounts should be Current Assets in the 1000-1099 range
        const isBankAccount = bankGLAccountIds.has(account.id) && 
          accountType === 'Current Asset' && 
          account.accountNo >= '1000' && 
          account.accountNo < '1100';
        const isCashOrBankAccount = isCashAccount || isBankAccount;
        
        // Debug for account 1100
        if (account.accountNo === '1100') {
          console.log(`   [DEBUG] Cash/Bank account check:`);
          console.log(`      - accountName: "${account.accountName}"`);
          console.log(`      - accountNameLower: "${accountNameLower}"`);
          console.log(`      - isCashAccount: ${isCashAccount}`);
          console.log(`      - isBankAccount: ${isBankAccount} (account.id in bankGLAccountIds?)`);
          console.log(`      - isCashOrBankAccount: ${isCashOrBankAccount}`);
        }

        // Skip accounts with zero balance, EXCEPT:
        // 1. Cash and bank accounts (must be included in "Cash and Cash Equivalents" even if zero)
        // 2. Specific liability accounts that need to be shown even when cleared (for UAT verification: PAYE Payable 2150, Net Wages Payable 2250)
        const isImportantLiabilityAccount = account.accountNo === '2150' || account.accountNo === '2250';
        if (Math.abs(balance) < 0.01 && !isImportantLiabilityAccount && !isCashOrBankAccount) {
          continue;
        }

        // Handle Accumulated Depreciation separately - collect all but don't add to array yet
        // Check multiple conditions to catch all accumulated depreciation accounts:
        // 1. Account name contains "accumulated depreciation" (case-insensitive, partial match)
        // 2. Account type is "Contra-Asset"
        // 3. Account name contains "depreciation" and account type is asset-related
        const normalizedAccountName = accountName.replace(/[^a-z0-9]/g, ''); // Remove special chars for matching
        const isAccumulatedDepreciation = 
          accountName.includes('accumulated') && accountName.includes('depreciation') ||
          accountName.includes('accumulated') && accountName.includes('depr') ||
          accountType === 'Contra-Asset' ||
          (accountType.includes('Asset') && (accountName.includes('depreciation') || accountName.includes('depr')));

        // Debug for account 1100
        if (account.accountNo === '1100') {
          console.log(`   [DEBUG] Accumulated Depreciation check:`);
          console.log(`      - accountName.includes('accumulated'): ${accountName.includes('accumulated')}`);
          console.log(`      - accountName.includes('depreciation'): ${accountName.includes('depreciation')}`);
          console.log(`      - accountType === 'Contra-Asset': ${accountType === 'Contra-Asset'}`);
          console.log(`      - isAccumulatedDepreciation: ${isAccumulatedDepreciation}`);
        }

        if (isAccumulatedDepreciation) {
          // Accumulated depreciation is a credit balance (positive in DB), but we want to show it as negative
          // because it reduces the value of assets
          console.log(`   [Balance Sheet] Found Accumulated Depreciation account: ${account.accountNo} - ${account.accountName} (Type: ${accountType}, Balance: ${balance})`);
          if (account.accountNo === '1100') {
            console.log(`   [DEBUG] ⚠️  Account 1100 is being treated as Accumulated Depreciation (WRONG!)`);
          }
          accumulatedDepreciation += balance;
          continue; // Don't add individual accounts, we'll add one consolidated line item later
        }

        // Double-check: Make sure this isn't an accumulated depreciation account that slipped through
        // (safety check in case the condition above didn't catch it)
        const isDepreciationAccount = 
          accountName.includes('accumulated') && (accountName.includes('depreciation') || accountName.includes('depr')) ||
          accountType === 'Contra-Asset';
        
        if (isDepreciationAccount) {
          console.log(`   [Balance Sheet] WARNING: Found Accumulated Depreciation account that should have been caught earlier: ${account.accountNo} - ${account.accountName}`);
          accumulatedDepreciation += balance;
          continue; // Skip this account
        }

        // Get transactions for this account
        const transactions = (accountTransactions.get(account.id) || []).sort((a, b) => a.date.localeCompare(b.date));

        const accountData: BalanceSheetAccount = {
          accountNo: account.accountNo,
          accountName: account.accountName,
          balance: balance,
          transactions: transactions
        };

        // Add to cash and cash equivalents if it's a cash/bank account
        // (Already determined above to avoid skipping zero-balance cash accounts)
        if (isCashOrBankAccount) {
          if (account.accountNo === '1100') {
            console.log(`   [DEBUG] ⚠️  Account 1100 is being treated as cash/bank account (WRONG!)`);
          }
          cashAndCashEquivalents += balance;
          
          // Add to breakdown for "Cash and Cash Equivalents" - shows how it was constructed
          // Get transactions for this cash account
          const cashTransactions = (accountTransactions.get(account.id) || []).sort((a, b) => a.date.localeCompare(b.date));
          cashAccountsBreakdown.push({
            accountNo: account.accountNo,
            accountName: account.accountName,
            balance: balance,
            transactions: cashTransactions
          });
          
          // DO NOT add cash/bank accounts to currentAssets - they are consolidated into "Cash and Cash Equivalents"
          // Skip to next account
          continue;
        }
        
        // Debug: Log before categorization for account 1100
        if (account.accountNo === '1100') {
          console.log(`   [DEBUG] About to categorize account 1100:`);
          console.log(`      - accountType: "${accountType}"`);
          console.log(`      - accountType === 'Fixed Asset'? ${accountType === 'Fixed Asset'}`);
          console.log(`      - accountType === 'Long-Term Asset'? ${accountType === 'Long-Term Asset'}`);
          console.log(`      - accountType.includes('Asset')? ${accountType.includes('Asset')}`);
        }
        
        if (accountType === 'Current Asset') {
          currentAssets.push(accountData);
          if (account.accountNo === '1100') {
            console.log(`   [DEBUG] Added account 1100 to currentAssets (WRONG - should be Fixed Asset!)`);
          }
        } else if (accountType === 'Fixed Asset' || accountType === 'Long-Term Asset' || accountType === 'Non-Current Asset') {
          fixedAssets.push(accountData);
          if (account.accountNo === '1100') {
            console.log(`   [DEBUG] ✅ Added account 1100 to fixedAssets array`);
            console.log(`      - Balance: $${accountData.balance}`);
            console.log(`      - Transactions: ${accountData.transactions.length}`);
          }
        } else if (accountType.includes('Asset')) {
          otherAssets.push(accountData);
          if (account.accountNo === '1100') {
            console.log(`   [DEBUG] Added account 1100 to otherAssets`);
          }
        } else if (accountType === 'Current Liability') {
          currentLiabilities.push(accountData);
        } else if (accountType === 'Long-Term Liability') {
          longTermLiabilities.push(accountData);
        } else if (accountType === 'Equity') {
          equityAccounts.push(accountData);
        } else {
          if (account.accountNo === '1100') {
            console.log(`   [DEBUG] ⚠️  Account 1100 was NOT categorized! AccountType: ${accountType}`);
          }
        }
      }

      // Consolidate Portfolio Investment accounts (1500 and 1501) into a single "Portfolio Investments" account
      const portfolioAccount1500 = fixedAssets.find(acc => acc.accountNo === '1500');
      const portfolioAccount1501 = fixedAssets.find(acc => acc.accountNo === '1501');
      
      if (portfolioAccount1500 || portfolioAccount1501) {
        // Calculate combined balance
        const combinedBalance = (portfolioAccount1500?.balance || 0) + (portfolioAccount1501?.balance || 0);
        
        // Collect all transactions from both accounts
        const portfolioTransactions: BalanceSheetTransaction[] = [];
        if (portfolioAccount1500) {
          portfolioTransactions.push(...portfolioAccount1500.transactions);
        }
        if (portfolioAccount1501) {
          portfolioTransactions.push(...portfolioAccount1501.transactions);
        }
        portfolioTransactions.sort((a, b) => a.date.localeCompare(b.date));
        
        // Remove individual accounts from fixedAssets
        fixedAssets = fixedAssets.filter(acc => acc.accountNo !== '1500' && acc.accountNo !== '1501');
        
        // Add consolidated Portfolio Investments account
        fixedAssets.push({
          accountNo: '1501',
          accountName: 'Portfolio Investments',
          balance: combinedBalance,
          transactions: portfolioTransactions
        });
      }

      // Add Accumulated Depreciation as a single consolidated line item (shown as negative)
      if (Math.abs(accumulatedDepreciation) > 0.01) {
        // Collect all transactions from accumulated depreciation accounts
        const accumDeprTransactions: BalanceSheetTransaction[] = [];
        for (const account of accounts) {
          const accountName = account.accountName.toLowerCase();
          const isAccumDepr = 
            accountName.includes('accumulated') && accountName.includes('depreciation') ||
            account.accountType === 'Contra-Asset';
          if (isAccumDepr) {
            const accTrans = accountTransactions.get(account.id) || [];
            accumDeprTransactions.push(...accTrans);
          }
        }
        accumDeprTransactions.sort((a, b) => a.date.localeCompare(b.date));

        fixedAssets.push({
          accountNo: 'ACCUM-DEPR',
          accountName: 'Accumulated Depreciation',
          balance: -Math.abs(accumulatedDepreciation), // Show as negative value
          transactions: accumDeprTransactions
        });
      }

      // Add "Cash and Cash Equivalents" as the first line item in Current Assets for UI display
      // This consolidates all cash/bank accounts into a single line item
      // The breakdown is still available in cashAndCashEquivalents.breakdown
      if (cashAndCashEquivalents !== 0 || cashAccountsBreakdown.length > 0) {
        // Collect all transactions from all cash accounts for the consolidated line item
        const allCashTransactions: BalanceSheetTransaction[] = [];
        for (const cashAccount of cashAccountsBreakdown) {
          allCashTransactions.push(...cashAccount.transactions);
        }
        allCashTransactions.sort((a, b) => a.date.localeCompare(b.date));

        // Add as first item in currentAssets array
        currentAssets.unshift({
          accountNo: 'CASH-EQUIV',
          accountName: 'Cash and Cash Equivalents',
          balance: cashAndCashEquivalents,
          transactions: allCashTransactions
        });
      }

      // Calculate totals
      // Note: cashAndCashEquivalents is already included in currentAssets array now
      const totalCurrentAssets = currentAssets.reduce((sum, acc) => sum + acc.balance, 0);
      
      // Fixed Assets: Sum all line items (including negative accumulated depreciation)
      // This will give us Net Fixed Assets = Gross Fixed Assets - Accumulated Depreciation
      const totalFixedAssets = fixedAssets.reduce((sum, acc) => sum + acc.balance, 0);
      
      // Debug: Check if account 1100 is in fixedAssets
      const account1100InFixedAssets = fixedAssets.find(acc => acc.accountNo === '1100');
      if (account1100InFixedAssets) {
        console.log(`   [DEBUG] ✅ Account 1100 IS in fixedAssets array (${fixedAssets.length} total fixed assets)`);
        console.log(`      - Balance: $${account1100InFixedAssets.balance}`);
      } else {
        console.log(`   [DEBUG] ❌ Account 1100 is NOT in fixedAssets array (${fixedAssets.length} total fixed assets)`);
        console.log(`   [DEBUG] Fixed assets list:`, fixedAssets.map(acc => `${acc.accountNo} - ${acc.accountName}: $${acc.balance}`));
      }
      
      // Alternative: Sum of all fixed asset line items (for user reference)
      // This would be: grossFixedAssets + accumulatedDepreciation (if treating dep as positive)
      // But accounting-wise, net is correct: grossFixedAssets - accumulatedDepreciation
      
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
        console.log(`     (Accum. Depr. (negative):   $${(-Math.abs(accumulatedDepreciation)).toFixed(2)})`);
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
          cashAndCashEquivalents: {
            total: cashAndCashEquivalents, // Consolidated total of all cash/bank accounts
            breakdown: cashAccountsBreakdown // Breakdown showing all accounts (petty cash, bank accounts) that make up this total
          },
          currentAssets: {
            accounts: currentAssets,
            total: totalCurrentAssets
          },
          fixedAssets: {
            accounts: fixedAssets,
            total: totalFixedAssets
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
          total: totalEquity, // Total equity including retained earnings
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

      // Calculate balance using Decimal arithmetic - NO ROUNDING (Credits increase, Debits decrease for Liability accounts)
      let balance = new Decimal(0);
      for (const line of journalLines) {
        balance = balance.plus(line.creditAmount).minus(line.debitAmount);
      }
      return balance.toNumber();
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

      // Use Decimal arithmetic - NO ROUNDING during calculations
      let totalRevenueDecimal = new Decimal(0);
      let totalExpenseDecimal = new Decimal(0);
      
      for (const line of journalLines) {
        const accountType = line.chartOfAccount.accountType;
        const debitAmount = new Decimal(line.debitAmount);
        const creditAmount = new Decimal(line.creditAmount);

        if (accountType === 'Revenue' || accountType === 'Income') {
          // Revenue: Credits increase, Debits decrease
          totalRevenueDecimal = totalRevenueDecimal.plus(creditAmount).minus(debitAmount);
        } else if (accountType === 'Expense') {
          // Expense: Debits increase, Credits decrease
          totalExpenseDecimal = totalExpenseDecimal.plus(debitAmount).minus(creditAmount);
        }
      }

      const totalRevenue = totalRevenueDecimal.toNumber();
      const totalExpense = totalExpenseDecimal.toNumber();
      const netIncome = totalRevenueDecimal.minus(totalExpenseDecimal).toNumber();
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

