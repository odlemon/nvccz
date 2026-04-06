// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "decimal.js";
import { MultiCurrencyService } from "./MultiCurrencyService";
import { isDebitNaturalBalance } from "../utils/chartOfAccountsNaturalBalance";

export interface GLLedgerDetailParams {
  accountNo: string; // e.g., "1100"
  startDate: Date;
  endDate: Date;
  currencyId?: string;
  includeMultiCurrency?: boolean; // Include multi-currency columns
  /** When set, only journal entries that touch this cashbook bank (including transfer partner leg) are included. */
  restrictToBankId?: string;
}

export interface GLLedgerDetailTransaction {
  id: string;
  date: string;
  reference: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  journalEntryId: string;
  journalEntryStatus: string;
  transactionType?: string; // Receipt, Payment, Invoice, Expense, Manual Entry, etc.
  // Multi-currency fields
  transactionCurrency?: string; // Currency code of the transaction
  transactionCurrencyId?: string; // Currency ID of the transaction
  debitAmountBaseCurrency?: number; // Debit amount converted to base currency
  creditAmountBaseCurrency?: number; // Credit amount converted to base currency
  runningBalanceBaseCurrency?: number; // Running balance in base currency
  exchangeRate?: number; // Exchange rate used for conversion
  exchangeRateDate?: string; // Date of exchange rate used
}

export interface GLLedgerDetailResult {
  account: {
    accountNo: string;
    accountName: string;
    accountType: string;
    naturalBalance: 'DEBIT' | 'CREDIT';
    openingBalance: number;
    closingBalance: number;
  };
  period: {
    startDate: string;
    endDate: string;
  };
  transactions: GLLedgerDetailTransaction[];
  summary: {
    totalDebits: number;
    totalCredits: number;
    netChange: number; // totalDebits - totalCredits
    transactionCount: number;
    // Multi-currency totals
    totalDebitsBaseCurrency?: number;
    totalCreditsBaseCurrency?: number;
    netChangeBaseCurrency?: number;
    baseCurrency?: string; // Base currency code (e.g., "ZIG")
  };
}

export class GLLedgerDetailService {
  /**
   * Journal entry ids linked to this bank: direct `journalEntryId` on cashbook rows, plus transfer IN rows
   * that share a `transferId` with an OUT row that holds the single journal link.
   */
  private static async journalEntryIdsTouchingBank(bankId: string): Promise<string[]> {
    const ids = new Set<string>();

    const direct = await prisma.cashbookEntry.findMany({
      where: { bankId, journalEntryId: { not: null } },
      select: { journalEntryId: true },
    });
    for (const d of direct) {
      if (d.journalEntryId) ids.add(d.journalEntryId);
    }

    const transferLegs = await prisma.cashbookEntry.findMany({
      where: { bankId, transferId: { not: null }, journalEntryId: null },
      select: { transferId: true },
    });
    const transferIds = [...new Set(transferLegs.map((t) => t.transferId).filter(Boolean))] as string[];
    if (transferIds.length > 0) {
      const partners = await prisma.cashbookEntry.findMany({
        where: { transferId: { in: transferIds }, journalEntryId: { not: null } },
        select: { journalEntryId: true },
      });
      for (const p of partners) {
        if (p.journalEntryId) ids.add(p.journalEntryId);
      }
    }

    return [...ids];
  }

  /**
   * Generate General Ledger Detail report with running balance
   * Shows all transactions for a specific GL account with running balance after each transaction
   * Optionally includes multi-currency columns with base currency equivalents
   */
  static async generateGLLedgerDetail(params: GLLedgerDetailParams): Promise<GLLedgerDetailResult> {
    try {
      const { accountNo, startDate, endDate, currencyId, includeMultiCurrency = true, restrictToBankId } = params;

      console.log(`\n📊 Generating GL Detail Report for Account ${accountNo}`);
      console.log(`   Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

      // 1. Get the GL account
      const account = await prisma.chartOfAccounts.findFirst({
        where: {
          accountNo: accountNo,
          isActive: true
        }
      });

      if (!account) {
        throw new Error(`GL Account ${accountNo} not found`);
      }

      console.log(`   Account: ${account.accountName} (${account.accountType})`);

      let bankScopedJeIds: string[] | undefined;
      if (restrictToBankId) {
        bankScopedJeIds = await this.journalEntryIdsTouchingBank(restrictToBankId);
        console.log(
          `   Bank-scoped report: ${bankScopedJeIds.length} journal entries touch bank ${restrictToBankId}`
        );
      }

      // 2. Get base currency (USD) if multi-currency is enabled
      let baseCurrency = null;
      let baseCurrencyId = null;
      if (includeMultiCurrency) {
        // First try to get default currency (should be USD)
        baseCurrency = await prisma.currency.findFirst({
          where: { isDefault: true, isActive: true }
        });
        if (!baseCurrency) {
          // Fallback to USD if no default is set
          baseCurrency = await prisma.currency.findFirst({
            where: {
              OR: [
                { code: 'USD' },
                { code: 'ZIG' }, // Legacy fallback
                { code: 'ZWL' }  // Legacy fallback
              ],
              isActive: true
            }
          });
        }
        if (baseCurrency) {
          baseCurrencyId = baseCurrency.id;
          console.log(`   Base Currency: ${baseCurrency.code} (${baseCurrency.name})`);
        } else {
          console.log(`   ⚠️  Base currency not found, multi-currency columns will be skipped`);
        }
      }

      // 3. Calculate opening balance (balance before startDate)
      const openingBalance =
        restrictToBankId && bankScopedJeIds?.length === 0
          ? 0
          : await this.calculateOpeningBalance(account.id, startDate, currencyId, bankScopedJeIds);
      console.log(`   Opening Balance: $${openingBalance.toFixed(2)}`);

      // Calculate opening balance in base currency if multi-currency is enabled
      let openingBalanceBaseCurrency = 0;
      if (includeMultiCurrency && baseCurrencyId) {
        openingBalanceBaseCurrency =
          restrictToBankId && bankScopedJeIds?.length === 0
            ? 0
            : await this.calculateOpeningBalanceBaseCurrency(
                account.id,
                startDate,
                currencyId,
                baseCurrencyId,
                bankScopedJeIds
              );
        console.log(`   Opening Balance (Base): ${baseCurrency?.code || 'N/A'} ${openingBalanceBaseCurrency.toFixed(2)}`);
      }

      // 4. Get all journal entry lines for this account in the date range
      // Apply the SAME filters as Trial Balance to ensure consistency:
      // - Only POSTED entries (exclude PENDING and VOID)
      // - Exclude journal entries linked to voided/reversed cashbook entries
      // - Exclude reversal journal entries (VR- prefix)
      // - If currencyId is provided, filter by it. Otherwise, include ALL currencies
      const journalEntryWhere: any = {
        transactionDate: {
          gte: startDate,
          lte: endDate
        },
        status: 'POSTED', // Only include POSTED entries to match Trial Balance (exclude PENDING and VOID)
        // Exclude journal entries where ANY linked cashbook entry is voided or reversed
        NOT: {
          cashbookEntries: {
            some: {
              OR: [
                { status: 'VOIDED' },
                { reversedAt: { not: null } } // Reversed entries have reversedAt set
              ]
            }
          }
        },
        // Exclude reversal journal entries (those with VR- or REV- prefix) - match Trial Balance and Balance Sheet
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

      // Only filter by currency if explicitly provided
      // If not provided, include ALL currencies (including null currencies will be filtered out later)
      if (currencyId) {
        journalEntryWhere.currencyId = currencyId;
      } else {
        // When no currencyId is provided, we want ALL currencies
        // But we still need to exclude entries with null currencyId (they cause errors)
        // We'll filter those out after fetching
      }

      if (restrictToBankId && bankScopedJeIds !== undefined && bankScopedJeIds.length > 0) {
        journalEntryWhere.id = { in: bankScopedJeIds };
      }

      // OPTIMIZED: Get journal entry lines with efficient query
      // Use select instead of include to reduce data transfer
      // Note: We'll filter out null currencyId entries after fetching (can't use not: null on string fields)

      // First, get journal entry lines with minimal data
      const journalEntryLinesRaw =
        restrictToBankId && bankScopedJeIds?.length === 0
          ? []
          : await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: account.id,
          journalEntry: journalEntryWhere
        },
        select: {
          id: true,
          debitAmount: true,
          creditAmount: true,
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              transactionDate: true,
              status: true,
              description: true,
              currencyId: true,
              cashbookEntries: {
                select: {
                  id: true,
                  type: true,
                  reference: true,
                  description: true
                },
                take: 1 // Only need first entry for transaction type
              },
              invoices: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  description: true
                },
                take: 1 // Only need first entry for transaction type
              },
              expenses: {
                select: {
                  id: true,
                  receiptNumber: true,
                  description: true
                },
                take: 1 // Only need first entry for transaction type
              },
              revenues: {
                select: {
                  id: true,
                  description: true
                },
                take: 1 // Only need first entry for transaction type
              }
            }
          }
        },
        orderBy: {
          journalEntry: {
            transactionDate: 'asc'
          }
        }
      });

      // Get currencies in batch for all unique currencyIds
      const currencyIds = [...new Set(journalEntryLinesRaw.map(l => l.journalEntry.currencyId).filter(Boolean))];
      const currencies = currencyIds.length > 0 
        ? await prisma.currency.findMany({
            where: { id: { in: currencyIds } }
          })
        : [];
      const currencyMap = new Map(currencies.map(c => [c.id, c]));

      // Attach currencies to journal entries and filter out any with missing currencies
      const journalEntryLines = journalEntryLinesRaw
        .map(line => ({
          ...line,
          journalEntry: {
            ...line.journalEntry,
            currency: line.journalEntry.currencyId ? currencyMap.get(line.journalEntry.currencyId) || null : null
          }
        }))
        .filter(line => line.journalEntry.currency !== null);

      console.log(`   Found ${journalEntryLines.length} transactions in period`);

      // 5. Build transactions with running balance
      const transactions: GLLedgerDetailTransaction[] = [];
      let runningBalance = openingBalance;
      let runningBalanceBaseCurrency = openingBalanceBaseCurrency;

      // Cache for exchange rates to avoid repeated lookups
      const exchangeRateCache = new Map<string, number>();

      for (const line of journalEntryLines) {
        const je = line.journalEntry;
        const transactionCurrency = je.currency;
        const transactionCurrencyId = je.currencyId;
        const transactionDate = je.transactionDate;
        
        // Use Decimal arithmetic - NO ROUNDING during calculations
        const debitAmount = new Decimal(line.debitAmount || 0).toNumber();
        const creditAmount = new Decimal(line.creditAmount || 0).toNumber();
        
        // Calculate running balance based on account type
        // For Asset accounts: Debit increases, Credit decreases
        // For Liability/Equity accounts: Credit increases, Debit decreases
        if (isDebitNaturalBalance(account.naturalBalance, account.accountType)) {
          runningBalance = runningBalance + debitAmount - creditAmount;
        } else {
          runningBalance = runningBalance + creditAmount - debitAmount;
        }

        // Multi-currency conversion
        let debitAmountBaseCurrency = debitAmount;
        let creditAmountBaseCurrency = creditAmount;
        let exchangeRate = 1;
        let exchangeRateDate: string | undefined = undefined;

        if (includeMultiCurrency && baseCurrencyId && transactionCurrencyId && transactionCurrencyId !== baseCurrencyId) {
          try {
            // Create cache key: currencyId_date
            const cacheKey = `${transactionCurrencyId}_${baseCurrencyId}_${transactionDate.toISOString().split('T')[0]}`;
            
            // Check cache first
            if (exchangeRateCache.has(cacheKey)) {
              exchangeRate = exchangeRateCache.get(cacheKey)!;
            } else {
              // Get exchange rate at transaction date (time of posting)
              const rate = await MultiCurrencyService.convertCurrency({
                amount: 1,
                fromCurrencyId: transactionCurrencyId,
                toCurrencyId: baseCurrencyId,
                date: transactionDate
              });
              
              exchangeRate = rate.exchangeRate;
              // Cache the rate
              exchangeRateCache.set(cacheKey, exchangeRate);
            }
            
            exchangeRateDate = transactionDate.toISOString().split('T')[0];
            
            // Convert amounts to base currency
            debitAmountBaseCurrency = debitAmount * exchangeRate;
            creditAmountBaseCurrency = creditAmount * exchangeRate;
            
            // Update running balance in base currency
            if (isDebitNaturalBalance(account.naturalBalance, account.accountType)) {
              runningBalanceBaseCurrency = runningBalanceBaseCurrency + debitAmountBaseCurrency - creditAmountBaseCurrency;
            } else {
              runningBalanceBaseCurrency = runningBalanceBaseCurrency + creditAmountBaseCurrency - debitAmountBaseCurrency;
            }
          } catch (error: any) {
            // If exchange rate is missing, it's likely because:
            // 1. Transaction is in a currency that doesn't have exchange rates set up
            // 2. Or the transaction date doesn't have a rate
            // We'll use the transaction amount as-is and log a less alarming message
            const errorMsg = error.message || 'Unknown error';
            if (errorMsg.includes('Exchange rate not found')) {
              // Only log if it's not a same-currency conversion (which should be caught earlier)
              console.warn(`   ⚠️  Exchange rate not found for ${transactionCurrency?.code || transactionCurrencyId} → ${baseCurrency?.code || baseCurrencyId} on ${transactionDate.toISOString().split('T')[0]}. Using transaction amount as-is.`);
            } else {
              console.warn(`   ⚠️  Could not convert currency for transaction ${je.referenceNumber}: ${errorMsg}`);
            }
            // Use transaction amount as-is if conversion fails
            debitAmountBaseCurrency = debitAmount;
            creditAmountBaseCurrency = creditAmount;
            exchangeRate = 1;
          }
        } else if (includeMultiCurrency && baseCurrencyId && transactionCurrencyId === baseCurrencyId) {
          // Already in base currency
          runningBalanceBaseCurrency = runningBalance;
          debitAmountBaseCurrency = debitAmount;
          creditAmountBaseCurrency = creditAmount;
          exchangeRate = 1;
        }

        // Determine transaction type
        let transactionType = 'Manual Entry';
        let reference = je.referenceNumber;
        let description = je.description;

        if (je.cashbookEntries && je.cashbookEntries.length > 0) {
          const cb = je.cashbookEntries[0];
          transactionType = cb.type === 'RECEIPT' ? 'Receipt' : 'Payment';
          reference = cb.reference || je.referenceNumber;
          description = cb.description || je.description;
        } else if (je.invoices && je.invoices.length > 0) {
          const inv = je.invoices[0];
          transactionType = 'Invoice';
          reference = inv.invoiceNumber || je.referenceNumber;
          description = inv.description || je.description;
        } else if (je.expenses && je.expenses.length > 0) {
          const exp = je.expenses[0];
          transactionType = 'Expense';
          reference = exp.receiptNumber || je.referenceNumber;
          description = exp.description || je.description;
        } else if (je.revenues && je.revenues.length > 0) {
          const rev = je.revenues[0];
          transactionType = 'Revenue';
          reference = je.referenceNumber;
          description = rev.description || je.description;
        }

        const transaction: GLLedgerDetailTransaction = {
          id: line.id,
          date: je.transactionDate.toISOString().split('T')[0],
          reference: reference,
          description: description,
          debitAmount: debitAmount,
          creditAmount: creditAmount,
          runningBalance: runningBalance,
          journalEntryId: je.id,
          journalEntryStatus: je.status,
          transactionType: transactionType
        };

        // Add multi-currency fields if enabled
        if (includeMultiCurrency && baseCurrencyId) {
          transaction.transactionCurrency = transactionCurrency?.code || 'N/A';
          transaction.transactionCurrencyId = transactionCurrencyId;
          transaction.debitAmountBaseCurrency = debitAmountBaseCurrency;
          transaction.creditAmountBaseCurrency = creditAmountBaseCurrency;
          transaction.runningBalanceBaseCurrency = runningBalanceBaseCurrency;
          // Always include exchange rate in response (even if 1.0 or null)
          transaction.exchangeRate = exchangeRate;
          transaction.exchangeRateDate = exchangeRateDate || (transactionCurrencyId && transactionCurrencyId !== baseCurrencyId ? transactionDate.toISOString().split('T')[0] : undefined);
        }

        transactions.push(transaction);
      }

      // 6. Calculate summary using Decimal arithmetic - NO ROUNDING during calculations
      let totalDebitsDecimal = new Decimal(0);
      let totalCreditsDecimal = new Decimal(0);
      
      for (const t of transactions) {
        totalDebitsDecimal = totalDebitsDecimal.plus(t.debitAmount);
        totalCreditsDecimal = totalCreditsDecimal.plus(t.creditAmount);
      }
      
      const totalDebits = totalDebitsDecimal.toNumber();
      const totalCredits = totalCreditsDecimal.toNumber();
      
      const netChange = isDebitNaturalBalance(account.naturalBalance, account.accountType)
        ? totalDebitsDecimal.minus(totalCreditsDecimal).toNumber()
        : totalCreditsDecimal.minus(totalDebitsDecimal).toNumber();
      const closingBalance = new Decimal(openingBalance).plus(netChange).toNumber();

      // Calculate multi-currency totals using Decimal arithmetic - NO ROUNDING
      let totalDebitsBaseCurrency: number | undefined = undefined;
      let totalCreditsBaseCurrency: number | undefined = undefined;
      let netChangeBaseCurrency: number | undefined = undefined;
      
      if (includeMultiCurrency && baseCurrencyId) {
        let totalDebitsBaseDecimal = new Decimal(0);
        let totalCreditsBaseDecimal = new Decimal(0);
        
        for (const t of transactions) {
          if (t.debitAmountBaseCurrency !== undefined) {
            totalDebitsBaseDecimal = totalDebitsBaseDecimal.plus(t.debitAmountBaseCurrency);
          }
          if (t.creditAmountBaseCurrency !== undefined) {
            totalCreditsBaseDecimal = totalCreditsBaseDecimal.plus(t.creditAmountBaseCurrency);
          }
        }
        
        totalDebitsBaseCurrency = totalDebitsBaseDecimal.toNumber();
        totalCreditsBaseCurrency = totalCreditsBaseDecimal.toNumber();
        netChangeBaseCurrency = isDebitNaturalBalance(account.naturalBalance, account.accountType)
          ? totalDebitsBaseDecimal.minus(totalCreditsBaseDecimal).toNumber()
          : totalCreditsBaseDecimal.minus(totalDebitsBaseDecimal).toNumber();
      }

      console.log(`   Total Debits: $${totalDebits.toFixed(2)}`);
      console.log(`   Total Credits: $${totalCredits.toFixed(2)}`);
      console.log(`   Net Change: $${netChange.toFixed(2)}`);
      console.log(`   Closing Balance: $${closingBalance.toFixed(2)}`);
      
      if (includeMultiCurrency && baseCurrencyId && totalDebitsBaseCurrency !== undefined) {
        console.log(`   Total Debits (Base): ${baseCurrency?.code || 'N/A'} ${totalDebitsBaseCurrency.toFixed(2)}`);
        console.log(`   Total Credits (Base): ${baseCurrency?.code || 'N/A'} ${totalCreditsBaseCurrency?.toFixed(2) || '0.00'}`);
        console.log(`   Net Change (Base): ${baseCurrency?.code || 'N/A'} ${netChangeBaseCurrency?.toFixed(2) || '0.00'}`);
      }

      const summary: any = {
        totalDebits: totalDebits,
        totalCredits: totalCredits,
        netChange: netChange,
        transactionCount: transactions.length
      };

      // Add multi-currency summary if enabled
      if (includeMultiCurrency && baseCurrencyId) {
        summary.totalDebitsBaseCurrency = totalDebitsBaseCurrency;
        summary.totalCreditsBaseCurrency = totalCreditsBaseCurrency;
        summary.netChangeBaseCurrency = netChangeBaseCurrency;
        summary.baseCurrency = baseCurrency?.code || 'N/A';
      }

      return {
        account: {
          accountNo: account.accountNo,
          accountName: account.accountName,
          accountType: account.accountType,
          naturalBalance: isDebitNaturalBalance(account.naturalBalance, account.accountType) ? 'DEBIT' : 'CREDIT',
          openingBalance: openingBalance,
          closingBalance: closingBalance
        },
        period: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        },
        transactions: transactions,
        summary: summary
      };
    } catch (error: any) {
      console.error('Error generating GL Detail report:', error);
      throw new Error(`Failed to generate GL Detail report: ${error.message}`);
    }
  }

  /**
   * Calculate opening balance (balance before startDate)
   */
  private static async calculateOpeningBalance(
    accountId: string,
    startDate: Date,
    currencyId?: string,
    allowedJournalEntryIds?: string[]
  ): Promise<number> {
    try {
      if (allowedJournalEntryIds !== undefined && allowedJournalEntryIds.length === 0) {
        return 0;
      }

      // Get all journal entry lines before startDate
      const openingJournalEntryWhere: any = {
        transactionDate: {
          lt: startDate
        },
        status: {
          in: ['POSTED', 'PENDING']
        }
      };

      // Add currency filter if provided
      if (currencyId) {
        openingJournalEntryWhere.currencyId = currencyId;
      }

      if (allowedJournalEntryIds && allowedJournalEntryIds.length > 0) {
        openingJournalEntryWhere.id = { in: allowedJournalEntryIds };
      }
      // Note: If currencyId not provided, include all entries (currencyId is required in schema, so all should have it)

      const openingLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: accountId,
          journalEntry: openingJournalEntryWhere
        },
        include: {
          journalEntry: true,
          chartOfAccount: true
        }
      });

      // Get account type to determine balance calculation
      const account = await prisma.chartOfAccounts.findUnique({
        where: { id: accountId }
      });

      if (!account) {
        return 0;
      }

      // Calculate opening balance
      let balance = 0;
      for (const line of openingLines) {
        // Use Decimal arithmetic - NO ROUNDING during calculations
        const debitAmount = new Decimal(line.debitAmount || 0).toNumber();
        const creditAmount = new Decimal(line.creditAmount || 0).toNumber();
        
        if (isDebitNaturalBalance(account.naturalBalance, account.accountType)) {
          balance = balance + debitAmount - creditAmount;
        } else {
          balance = balance + creditAmount - debitAmount;
        }
      }

      return balance;
    } catch (error: any) {
      console.error('Error calculating opening balance:', error);
      return 0; // Return 0 if calculation fails
    }
  }

  /**
   * Calculate opening balance in base currency (for multi-currency reporting)
   */
  private static async calculateOpeningBalanceBaseCurrency(
    accountId: string,
    startDate: Date,
    currencyId: string | undefined,
    baseCurrencyId: string,
    allowedJournalEntryIds?: string[]
  ): Promise<number> {
    try {
      if (allowedJournalEntryIds !== undefined && allowedJournalEntryIds.length === 0) {
        return 0;
      }

      // Get all journal entry lines before startDate
      const openingJournalEntryWhere: any = {
        transactionDate: {
          lt: startDate
        },
        status: {
          in: ['POSTED', 'PENDING']
        }
      };

      // Add currency filter if provided
      if (currencyId) {
        openingJournalEntryWhere.currencyId = currencyId;
      }

      if (allowedJournalEntryIds && allowedJournalEntryIds.length > 0) {
        openingJournalEntryWhere.id = { in: allowedJournalEntryIds };
      }

      const openingLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: accountId,
          journalEntry: openingJournalEntryWhere
        },
        include: {
          journalEntry: {
            include: {
              currency: true
            }
          },
          chartOfAccount: true
        }
      });

      // Get account type to determine balance calculation
      const account = await prisma.chartOfAccounts.findUnique({
        where: { id: accountId }
      });

      if (!account) {
        return 0;
      }

      // Calculate opening balance in base currency
      let balance = 0;
      for (const line of openingLines) {
        // Use Decimal arithmetic - NO ROUNDING during calculations
        const debitAmount = new Decimal(line.debitAmount || 0).toNumber();
        const creditAmount = new Decimal(line.creditAmount || 0).toNumber();
        const transactionCurrencyId = line.journalEntry.currencyId;
        const transactionDate = line.journalEntry.transactionDate;
        
        let debitAmountBase = debitAmount;
        let creditAmountBase = creditAmount;
        
        // Convert to base currency if different
        if (transactionCurrencyId !== baseCurrencyId) {
          try {
            const rate = await MultiCurrencyService.convertCurrency({
              amount: 1,
              fromCurrencyId: transactionCurrencyId,
              toCurrencyId: baseCurrencyId,
              date: transactionDate
            });
            
            debitAmountBase = debitAmount * rate.exchangeRate;
            creditAmountBase = creditAmount * rate.exchangeRate;
          } catch (error) {
            // Use transaction amount as-is if conversion fails
            console.warn(`   ⚠️  Could not convert opening balance for transaction ${line.journalEntry.referenceNumber}`);
          }
        }
        
        if (isDebitNaturalBalance(account.naturalBalance, account.accountType)) {
          balance = balance + debitAmountBase - creditAmountBase;
        } else {
          balance = balance + creditAmountBase - debitAmountBase;
        }
      }

      return balance;
    } catch (error: any) {
      console.error('Error calculating opening balance in base currency:', error);
      return 0;
    }
  }

}

export default GLLedgerDetailService;

