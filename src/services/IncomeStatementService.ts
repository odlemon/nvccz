// @ts-nocheck
import { PrismaClient, ChartOfAccounts, JournalEntryLine } from "@prisma/client";
import { prisma } from "../utils/database";
import { Decimal } from "decimal.js";
import { baseContext, isBaseReport, toBaseAmounts, journalsToBase, baseCurrencyRow } from "../utils/baseCurrencyAmounts";

export interface IncomeStatementParams {
  startDate: Date;
  endDate: Date;
  currencyId?: string;
}

export interface IncomeStatementAccount {
  accountId: string;
  accountNo: string;
  accountName: string;
  accountType: string;
  financialStatement: string;
  totalDebits: number;
  totalCredits: number;
  netAmount: number;
}

export interface IncomeStatementTransaction {
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

export interface IncomeStatementLine {
  accountId: string;
  accountNo: string;
  accountName: string;
  accountType: string;
  netAmount: number;
  amount: number;
  transactions: IncomeStatementTransaction[]; // Transaction breakdown
  /** When P&L is generated with budget variance: budget, actual, variance, % over-spend, flag for highlight in red */
  budgetVariance?: {
    budgetedAmount: number;
    actualAmount: number;
    variance: number;       // actual - budget (positive = over budget for expenses)
    variancePercentage: number;
    isOverBudget: boolean;
  };
}

export interface IncomeStatementSection {
  label: string;
  accounts: IncomeStatementLine[];
  total: number;
}

export interface IncomeStatementTotals {
  netIncomeBeforeTaxes: number;
  incomeTaxExpense: number;
  incomeFromContinuingOperations: number;
  belowTheLine: number;
  netIncome: number;
}

export interface IncomeStatement {
  period: {
    startDate: Date;
    endDate: Date;
  };
  sections: {
    revenue: IncomeStatementSection;
    operatingExpenses: IncomeStatementSection;
    incomeTax: IncomeStatementSection;
    belowTheLine: IncomeStatementSection;
  };
  totals: IncomeStatementTotals;
  currency: {
    id: string;
    code: string;
    name: string;
  };
  generatedAt: Date;
}

export class IncomeStatementService {
  /**
   * Generate income statement for a specific period
   */
  static async generateIncomeStatement(params: IncomeStatementParams): Promise<IncomeStatement> {
    try {
      const { startDate, endDate, currencyId } = params;

      // Get currency information
      // no currency means the base currency (it picked whichever active currency came first)
      const currency = currencyId
        ? await prisma.currency.findUnique({ where: { id: currencyId } })
        : await baseCurrencyRow();
      const baseCtx = await baseContext();
      const baseMode = await isBaseReport(currency?.id, baseCtx);

      if (!currency) {
        throw new Error("No active currency found");
      }

      // Get all posted journal entries for the period
      // Exclude journal entries linked to voided/reversed cashbook entries
      const journalEntries = await prisma.journalEntry.findMany({
        where: {
          transactionDate: {
            gte: startDate,
            lte: endDate
          },
          status: "POSTED",
          // the base currency covers every currency at base amounts (FX-01)
          ...(baseMode ? {} : { currencyId: currency.id }),
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
        },
        include: {
          journalEntryLines: {
            include: {
              chartOfAccount: true
            }
          },
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

      if (baseMode) await journalsToBase(journalEntries, baseCtx);

      // Calculate account balances from journal entry lines with transaction breakdowns
      const accountBalances = await this.calculateAccountBalances(journalEntries);

      const sections = this.buildIncomeStatementSections(accountBalances, journalEntries);

      // Calculate Net Income following standard accounting formula:
      // Net Income = Revenue - Operating Expenses - Income Tax + Below-the-Line Items
      const netIncomeBeforeTaxes =
        sections.revenue.total - sections.operatingExpenses.total;
      const incomeTaxExpense = sections.incomeTax.total;
      const incomeFromContinuingOperations =
        netIncomeBeforeTaxes - incomeTaxExpense;
      const belowTheLineTotal = sections.belowTheLine.total;
      const netIncome = incomeFromContinuingOperations + belowTheLineTotal;

      return {
        period: {
          startDate,
          endDate
        },
        sections,
        totals: {
          netIncomeBeforeTaxes,
          incomeTaxExpense,
          incomeFromContinuingOperations,
          belowTheLine: belowTheLineTotal,
          netIncome
        },
        currency: {
          id: currency.id,
          code: currency.code,
          name: currency.name
        },
        generatedAt: new Date()
      };
    } catch (error) {
      console.error("Error generating income statement:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to generate income statement. Please try again.");
    }
  }

  /**
   * Generate P&L with budget vs actual: each operating expense line gets budgetedAmount, variance, variancePercentage, isOverBudget.
   * Use this so the UI can highlight variance in red or show percentage over-spend.
   */
  static async generateIncomeStatementWithBudgetVariance(params: IncomeStatementParams): Promise<IncomeStatement> {
    const statement = await this.generateIncomeStatement(params);
    const { startDate, endDate } = params;
    const budget = await this.getBudgetForPeriod(startDate, endDate);
    if (!budget || !budget.budgetItems || budget.budgetItems.length === 0) {
      return statement;
    }
    const items = budget.budgetItems as Array<{ category: string; accountCode?: string | null; budgetedAmount: unknown }>;
    for (const line of statement.sections.operatingExpenses.accounts) {
      const budgetItem = this.matchBudgetItemToExpenseLine(line, items);
      if (!budgetItem) continue;
      const budgeted = Number(budgetItem.budgetedAmount ?? 0);
      const actual = Math.abs(line.amount);
      const variance = actual - budgeted;
      const variancePercentage = budgeted > 0 ? (variance / budgeted) * 100 : 0;
      (line as IncomeStatementLine).budgetVariance = {
        budgetedAmount: budgeted,
        actualAmount: actual,
        variance,
        variancePercentage,
        isOverBudget: variance > 0
      };
    }
    return statement;
  }

  /**
   * Get the budget that overlaps the given period (prefer isActive).
   */
  private static async getBudgetForPeriod(startDate: Date, endDate: Date) {
    const budgets = await prisma.budget.findMany({
      where: {
        startDate: { lte: endDate },
        endDate: { gte: startDate }
      },
      include: { budgetItems: true },
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      take: 1
    });
    return budgets[0] ?? null;
  }

  /**
   * Match a budget item to an expense line by accountCode (GL account number) or by category name in account name.
   */
  private static matchBudgetItemToExpenseLine(
    line: IncomeStatementLine,
    items: Array<{ category: string; accountCode?: string | null; budgetedAmount: unknown }>
  ): (typeof items)[0] | null {
    const accountNo = (line.accountNo || "").trim();
    const accountName = (line.accountName || "").toLowerCase();
    for (const item of items) {
      if (item.accountCode && String(item.accountCode).trim() === accountNo) return item;
      const cat = (item.category || "").toLowerCase();
      if (cat && accountName.includes(cat)) return item;
    }
    return null;
  }

  /**
   * Build structured income statement sections aligned with standard presentation
   */
  private static buildIncomeStatementSections(accounts: IncomeStatementAccount[], journalEntries: any[]) {
    const revenueSection: IncomeStatementSection = {
      label: "Revenue",
      accounts: [],
      total: 0
    };

    const operatingExpensesSection: IncomeStatementSection = {
      label: "Operating Expenses",
      accounts: [],
      total: 0
    };

    const incomeTaxSection: IncomeStatementSection = {
      label: "Income Tax Expense",
      accounts: [],
      total: 0
    };

    const belowTheLineSection: IncomeStatementSection = {
      label: "Below-the-Line Items",
      accounts: [],
      total: 0
    };

    const returnsAccounts: IncomeStatementLine[] = [];

    const getAccountNoValue = (accountNo: string) => {
      const numeric = parseInt(accountNo, 10);
      return Number.isNaN(numeric) ? 0 : numeric;
    };

    for (const account of accounts) {
      // "Income Statement / Cash Flow" accounts belong here too
      if (!String(account.financialStatement || "").startsWith("Income Statement")) {
        continue;
      }

      const accountNoValue = getAccountNoValue(account.accountNo);
      if (accountNoValue === 0) continue;

      // Get transactions for this account
      const accountTransactions: IncomeStatementTransaction[] = [];
      for (const journalEntry of journalEntries) {
        for (const line of journalEntry.journalEntryLines) {
          if (line.chartOfAccount.id !== account.accountId) continue;

          // Determine source and get actual transaction details
          let source = "MANUAL_ENTRY";
          let sourceTransaction: any = null;

          if (journalEntry.cashbookEntries && journalEntry.cashbookEntries.length > 0) {
            source = "CASHBOOK";
            const cashbookEntry = journalEntry.cashbookEntries[0];
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
          } else if (journalEntry.invoices && journalEntry.invoices.length > 0) {
            source = "INVOICE";
            const invoice = journalEntry.invoices[0];
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
          } else if (journalEntry.expenses && journalEntry.expenses.length > 0) {
            source = "EXPENSE";
            const expense = journalEntry.expenses[0];
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
          } else if (journalEntry.revenues && journalEntry.revenues.length > 0) {
            source = "REVENUE";
            const revenue = journalEntry.revenues[0];
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
              id: journalEntry.id,
              referenceNumber: journalEntry.referenceNumber,
              description: journalEntry.description,
              transactionDate: journalEntry.transactionDate,
              status: journalEntry.status
            };
          }

          const debitAmt = new Decimal(line.debitAmount || 0).toNumber();
          const creditAmt = new Decimal(line.creditAmount || 0).toNumber();

          accountTransactions.push({
            id: line.id,
            date: journalEntry.transactionDate.toISOString().split('T')[0],
            reference: journalEntry.referenceNumber || "",
            description: journalEntry.description || "",
            debitAmount: debitAmt,
            creditAmount: creditAmt,
            source: source,
            journalEntry: {
              id: journalEntry.id,
              referenceNumber: journalEntry.referenceNumber,
              description: journalEntry.description,
              transactionDate: journalEntry.transactionDate,
              status: journalEntry.status,
              currencyId: journalEntry.currencyId || null
            },
            sourceTransaction: sourceTransaction,
            journalEntryId: journalEntry.id,
            journalEntryStatus: journalEntry.status
          });
        }
      }

      // Sort transactions by date
      accountTransactions.sort((a, b) => a.date.localeCompare(b.date));

      const baseLine: IncomeStatementLine = {
        accountId: account.accountId,
        accountNo: account.accountNo,
        accountName: account.accountName,
        accountType: account.accountType,
        netAmount: account.netAmount,
        amount: account.netAmount,
        transactions: accountTransactions
      };

      // Sections follow the account's type. The 41xx accounts are investment income (dividends, interest, realised
      // gains) and were treated as contra-revenue and sign-flipped; a revenue account's debits (returns, reversals)
      // already reduce it through its net amount.
      const isIncomeType = account.accountType === "Revenue" || account.accountType === "Income";
      const isTaxExpense = account.accountType === "Expense" && /(corporate|income) tax/i.test(account.accountName || "");
      if (isIncomeType && !(accountNoValue >= 6200 && accountNoValue <= 6999)) {
        revenueSection.accounts.push(baseLine);
        revenueSection.total += baseLine.amount;
        continue;
      }

      if (isTaxExpense || (accountNoValue >= 6100 && accountNoValue <= 6199)) {
        incomeTaxSection.accounts.push(baseLine);
        incomeTaxSection.total += baseLine.amount;
        continue;
      }

      if (accountNoValue >= 5000 && accountNoValue <= 5999) {
        // Operating expenses (debits positive)
        operatingExpensesSection.accounts.push(baseLine);
        operatingExpensesSection.total += baseLine.amount;
        continue;
      }

      if (accountNoValue >= 6100 && accountNoValue <= 6199) {
        // Income tax
        incomeTaxSection.accounts.push(baseLine);
        incomeTaxSection.total += baseLine.amount;
        continue;
      }

      if (accountNoValue >= 6200 && accountNoValue <= 6999) {
        // Below-the-line items
        const line: IncomeStatementLine = {
          ...baseLine,
          amount:
            account.accountType === "Expense" ? baseLine.amount * -1 : baseLine.amount
        };
        belowTheLineSection.accounts.push(line);
        belowTheLineSection.total += line.amount;
        continue;
      }

      // Default to operating expenses if nothing else matches
      operatingExpensesSection.accounts.push(baseLine);
      operatingExpensesSection.total += baseLine.amount;
    }

    // Insert returns/allowances after revenue lines
    if (returnsAccounts.length > 0) {
      revenueSection.accounts.push(
        ...returnsAccounts.map(line => ({
          ...line,
          netAmount: line.netAmount,
          amount: line.amount
        }))
      );
    }

    const sortLines = (section: IncomeStatementSection) => {
      section.accounts.sort((a, b) => a.accountNo.localeCompare(b.accountNo));
    };

    sortLines(revenueSection);
    sortLines(operatingExpensesSection);
    sortLines(incomeTaxSection);
    sortLines(belowTheLineSection);

    return {
      revenue: revenueSection,
      operatingExpenses: operatingExpensesSection,
      incomeTax: incomeTaxSection,
      belowTheLine: belowTheLineSection
    };
  }

  /**
   * Calculate account balances from journal entries
   * Excludes VAT accounts (VAT Input/Output) as VAT is a Balance Sheet liability, not P&L
   */
  private static async calculateAccountBalances(journalEntries: any[]): Promise<IncomeStatementAccount[]> {
    const accountBalances = new Map<string, IncomeStatementAccount>();

    // Identify VAT accounts to exclude from P&L
    // Note: VAT accounts should appear on Balance Sheet, not P&L
    const vatAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        OR: [
          { accountName: { contains: 'VAT Input' } },
          { accountName: { contains: 'VAT Output' } },
          { accountNo: { in: ['2100', '2110'] } }, // Common VAT account numbers
          { 
            accountName: { contains: 'VAT' },
            accountType: { in: ['Current Liability', 'Current Asset'] }
          }
        ],
        isActive: true
      }
    });

    const vatAccountIds = new Set(vatAccounts.map(acc => acc.id));
    console.log(`📊 Excluding ${vatAccounts.length} VAT accounts from P&L: ${vatAccounts.map(a => `${a.accountNo} - ${a.accountName}`).join(', ')}`);

    // Process all journal entry lines (excluding VAT accounts)
    for (const journalEntry of journalEntries) {
      for (const line of journalEntry.journalEntryLines) {
        const accountId = line.chartOfAccount.id;
        
        // Skip VAT accounts - they belong on Balance Sheet, not P&L
        if (vatAccountIds.has(accountId)) {
          continue;
        }
        
        if (!accountBalances.has(accountId)) {
          accountBalances.set(accountId, {
            accountId: line.chartOfAccount.id,
            accountNo: line.chartOfAccount.accountNo,
            accountName: line.chartOfAccount.accountName,
            accountType: line.chartOfAccount.accountType,
            financialStatement: line.chartOfAccount.financialStatement,
            totalDebits: 0,
            totalCredits: 0,
            netAmount: 0
          });
        }

        const account = accountBalances.get(accountId)!;
        // Use Decimal arithmetic - NO ROUNDING during calculations
        account.totalDebits = new Decimal(account.totalDebits).plus(line.debitAmount).toNumber();
        account.totalCredits = new Decimal(account.totalCredits).plus(line.creditAmount).toNumber();
      }
    }

    // Calculate net amounts based on account type
    for (const account of accountBalances.values()) {
      if (account.accountType === "Revenue" || account.accountType === "Income") {
        // Revenue and other income: credits increase, debits decrease ("Income" accounts were given no amount)
        account.netAmount = account.totalCredits - account.totalDebits;
      } else {
        // Expenses (and anything else on the income statement): debits increase
        account.netAmount = account.totalDebits - account.totalCredits;
      }
    }

    return Array.from(accountBalances.values());
  }

  /**
   * Get income statement with detailed breakdown by account
   */
  static async getDetailedIncomeStatement(params: IncomeStatementParams): Promise<any> {
    try {
      const incomeStatement = await this.generateIncomeStatement(params);

      const detailedRevenue = await this.addAccountDetails(
        incomeStatement.sections.revenue.accounts,
        params
      );
      const detailedOperatingExpenses = await this.addAccountDetails(
        incomeStatement.sections.operatingExpenses.accounts,
        params
      );
      const detailedIncomeTax = await this.addAccountDetails(
        incomeStatement.sections.incomeTax.accounts,
        params
      );
      const detailedBelowTheLine = await this.addAccountDetails(
        incomeStatement.sections.belowTheLine.accounts,
        params
      );

      return {
        ...incomeStatement,
        sections: {
          revenue: {
            ...incomeStatement.sections.revenue,
            accounts: detailedRevenue
          },
          operatingExpenses: {
            ...incomeStatement.sections.operatingExpenses,
            accounts: detailedOperatingExpenses
          },
          incomeTax: {
            ...incomeStatement.sections.incomeTax,
            accounts: detailedIncomeTax
          },
          belowTheLine: {
            ...incomeStatement.sections.belowTheLine,
            accounts: detailedBelowTheLine
          }
        }
      };
    } catch (error) {
      console.error("Error getting detailed income statement:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to get detailed income statement. Please try again.");
    }
  }

  /**
   * Add transaction details for each account
   */
  private static async addAccountDetails(accounts: IncomeStatementLine[], params: IncomeStatementParams): Promise<any[]> {
    const detailedAccounts = [];

    // Get currency information for filtering
    const currency = params.currencyId
      ? await prisma.currency.findUnique({ where: { id: params.currencyId } })
      : await baseCurrencyRow();
    const baseCtxD = await baseContext();
    const baseModeD = await isBaseReport(currency?.id, baseCtxD);

    if (!currency) {
      throw new Error("No active currency found");
    }

    for (const account of accounts) {
      // Get all transactions for this account in the period with complete details
      const transactionsRaw = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: account.accountId,
          journalEntry: {
            transactionDate: {
              gte: params.startDate,
              lte: params.endDate
            },
            status: "POSTED",
            ...(baseModeD ? {} : { currencyId: currency.id })
          }
        },
        include: {
          journalEntry: {
            include: {
              currency: true,
              createdBy: true,
              expenses: {
                include: {
                  vendor: true,
                  category: true,
                  currency: true
                }
              },
              invoices: {
                include: {
                  customer: true,
                  currency: true
                }
              },
              journalEntryLines: {
                include: {
                  chartOfAccount: true
                }
              }
            }
          },
          chartOfAccount: true
        },
        orderBy: {
          journalEntry: {
            transactionDate: 'desc'
          }
        }
      });
      const transactions = baseModeD ? (await toBaseAmounts(transactionsRaw as any[], baseCtxD)).lines as any[] : transactionsRaw;

      // Group transactions by journal entry for better organization
      const journalEntries = new Map();
      
      for (const transaction of transactions) {
        const journalEntryId = transaction.journalEntry.id;
        
        if (!journalEntries.has(journalEntryId)) {
          journalEntries.set(journalEntryId, {
            id: transaction.journalEntry.id,
            transactionDate: transaction.journalEntry.transactionDate,
            referenceNumber: transaction.journalEntry.referenceNumber,
            description: transaction.journalEntry.description,
            status: transaction.journalEntry.status,
            totalAmount: parseFloat(transaction.journalEntry.totalAmount.toString()),
            currency: {
              id: transaction.journalEntry.currency.id,
              code: transaction.journalEntry.currency.code,
              name: transaction.journalEntry.currency.name
            },
            createdBy: {
              id: transaction.journalEntry.createdBy.id,
              firstName: transaction.journalEntry.createdBy.firstName,
              lastName: transaction.journalEntry.createdBy.lastName,
              email: transaction.journalEntry.createdBy.email
            },
            expenses: transaction.journalEntry.expenses.map(expense => ({
              id: expense.id,
              description: expense.description,
              amount: parseFloat(expense.amount.toString()),
              vatAmount: expense.vatAmount ? parseFloat(expense.vatAmount.toString()) : 0,
              totalAmount: parseFloat(expense.totalAmount.toString()),
              receiptNumber: expense.receiptNumber,
              isTaxable: expense.isTaxable,
              paymentMethod: expense.paymentMethod,
              status: expense.status,
              vendor: {
                id: expense.vendor.id,
                name: expense.vendor.name,
                email: expense.vendor.email,
                phone: expense.vendor.phone
              },
              category: {
                id: expense.category.id,
                name: expense.category.name
              }
            })),
            invoices: transaction.journalEntry.invoices.map(invoice => ({
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              description: invoice.description,
              amount: parseFloat(invoice.amount.toString()),
              vatAmount: invoice.vatAmount ? parseFloat(invoice.vatAmount.toString()) : 0,
              totalAmount: parseFloat(invoice.totalAmount.toString()),
              isTaxable: invoice.isTaxable,
              status: invoice.status,
              customer: {
                id: invoice.customer.id,
                name: invoice.customer.name,
                email: invoice.customer.email,
                phone: invoice.customer.phone
              },
              items: invoice.items || []
            })),
            lines: []
          });
        }
        
        // Add this line to the journal entry
        const journalEntry = journalEntries.get(journalEntryId);
        journalEntry.lines.push({
          id: transaction.id,
          description: transaction.description,
          debitAmount: new Decimal(transaction.debitAmount).toNumber(),
          creditAmount: new Decimal(transaction.creditAmount).toNumber(),
          vatAmount: transaction.vatAmount ? new Decimal(transaction.vatAmount).toNumber() : 0,
          account: {
            id: transaction.chartOfAccount.id,
            accountNo: transaction.chartOfAccount.accountNo,
            accountName: transaction.chartOfAccount.accountName,
            accountType: transaction.chartOfAccount.accountType,
            financialStatement: transaction.chartOfAccount.financialStatement
          }
        });
      }

      detailedAccounts.push({
        ...account,
        journalEntries: Array.from(journalEntries.values()),
        transactionCount: transactions.length,
        // Calculate totals using Decimal arithmetic - NO ROUNDING
        totalDebitAmount: (() => {
          let total = new Decimal(0);
          for (const t of transactions) {
            total = total.plus(t.debitAmount);
          }
          return total.toNumber();
        })(),
        totalCreditAmount: (() => {
          let total = new Decimal(0);
          for (const t of transactions) {
            total = total.plus(t.creditAmount);
          }
          return total.toNumber();
        })(),
        totalVatAmount: (() => {
          let total = new Decimal(0);
          for (const t of transactions) {
            if (t.vatAmount) {
              total = total.plus(t.vatAmount);
            }
          }
          return total.toNumber();
        })()
      });
    }

    return detailedAccounts;
  }

  /**
   * Get income statement summary (high-level totals only)
   */
  static async getIncomeStatementSummary(params: IncomeStatementParams): Promise<any> {
    try {
      const incomeStatement = await this.generateIncomeStatement(params);

      return {
        period: incomeStatement.period,
        revenue: {
          total: incomeStatement.sections.revenue.total,
          accountCount: incomeStatement.sections.revenue.accounts.length
        },
        operatingExpenses: {
          total: incomeStatement.sections.operatingExpenses.total,
          accountCount: incomeStatement.sections.operatingExpenses.accounts.length
        },
        incomeTaxExpense: incomeStatement.sections.incomeTax.total,
        belowTheLine: incomeStatement.sections.belowTheLine.total,
        netIncomeBeforeTaxes: incomeStatement.totals.netIncomeBeforeTaxes,
        incomeFromContinuingOperations: incomeStatement.totals.incomeFromContinuingOperations,
        netIncome: incomeStatement.totals.netIncome,
        currency: incomeStatement.currency,
        generatedAt: incomeStatement.generatedAt
      };
    } catch (error) {
      console.error("Error getting income statement summary:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to get income statement summary. Please try again.");
    }
  }

  /**
   * Get income statement for multiple periods (comparative) with variance column (dollar and percentage change).
   * When exactly two periods are provided, response includes variance and lineItems for two-column + variance display.
   * @param periods - Array of period params (startDate, endDate, currencyId?). For "This Month vs Last Month" pass [lastMonth, thisMonth].
   * @param labels - Optional labels for each period (e.g. ["Last Month", "This Month"]).
   */
  static async getComparativeIncomeStatement(
    periods: IncomeStatementParams[],
    labels?: string[]
  ): Promise<any> {
    try {
      const comparativeData: Array<{
        label?: string;
        period: { startDate: Date; endDate: Date };
        revenue: number;
        expenses: number;
        netIncome: number;
        currency: { id: string; code: string; name: string };
        sections?: { revenue: IncomeStatementSection; operatingExpenses: IncomeStatementSection };
      }> = [];
      const fullStatements: IncomeStatement[] = [];

      for (let i = 0; i < periods.length; i++) {
        const period = periods[i];
        const incomeStatement = await this.generateIncomeStatement(period);
        fullStatements.push(incomeStatement);
        comparativeData.push({
          label: labels?.[i],
          period: incomeStatement.period,
          revenue: incomeStatement.sections.revenue.total,
          expenses: incomeStatement.sections.operatingExpenses.total,
          netIncome: incomeStatement.totals.netIncome,
          currency: incomeStatement.currency,
          sections: incomeStatement.sections
        });
      }

      const result: any = {
        periods: comparativeData.map((p) => ({
          label: p.label,
          period: p.period,
          revenue: p.revenue,
          expenses: p.expenses,
          netIncome: p.netIncome,
          currency: p.currency
        })),
        currency: comparativeData[0]?.currency,
        generatedAt: new Date()
      };

      if (periods.length === 2) {
        const rev0 = comparativeData[0].revenue;
        const rev1 = comparativeData[1].revenue;
        const exp0 = comparativeData[0].expenses;
        const exp1 = comparativeData[1].expenses;
        const ni0 = comparativeData[0].netIncome;
        const ni1 = comparativeData[1].netIncome;

        const dollar = (a: number, b: number) => a - b;
        const pct = (current: number, prior: number) =>
          prior !== 0 ? ((current - prior) / Math.abs(prior)) * 100 : (current !== 0 ? 100 : 0);

        result.variance = {
          revenue: { dollarChange: dollar(rev1, rev0), percentChange: pct(rev1, rev0) },
          expenses: { dollarChange: dollar(exp1, exp0), percentChange: pct(exp1, exp0) },
          netIncome: { dollarChange: dollar(ni1, ni0), percentChange: pct(ni1, ni0) }
        };

        const lineItems: Array<{
          accountNo: string;
          accountName: string;
          section: string;
          amountPeriod0: number;
          amountPeriod1: number;
          varianceDollar: number;
          variancePercent: number;
        }> = [];
        const byAccount = new Map<string, { amount0: number; amount1: number }>();

        for (const section of [
          { key: "revenue", accounts: fullStatements[0].sections.revenue.accounts },
          { key: "operatingExpenses", accounts: fullStatements[0].sections.operatingExpenses.accounts }
        ]) {
          for (const line of section.accounts) {
            byAccount.set(line.accountId, { amount0: line.amount, amount1: 0 });
          }
        }
        for (const section of [
          { key: "revenue", accounts: fullStatements[1].sections.revenue.accounts },
          { key: "operatingExpenses", accounts: fullStatements[1].sections.operatingExpenses.accounts }
        ]) {
          for (const line of section.accounts) {
            const prev = byAccount.get(line.accountId);
            if (prev) prev.amount1 = line.amount;
            else byAccount.set(line.accountId, { amount0: 0, amount1: line.amount });
          }
        }

        const accountInfo = new Map<string, { accountNo: string; accountName: string; section: string }>();
        for (const s of [
          { section: "Revenue", accounts: fullStatements[0].sections.revenue.accounts },
          { section: "Operating Expenses", accounts: fullStatements[0].sections.operatingExpenses.accounts }
        ]) {
          for (const line of s.accounts) {
            accountInfo.set(line.accountId, { accountNo: line.accountNo, accountName: line.accountName, section: s.section });
          }
        }
        for (const s of [
          { section: "Operating Expenses", accounts: fullStatements[1].sections.operatingExpenses.accounts },
          { section: "Revenue", accounts: fullStatements[1].sections.revenue.accounts }
        ]) {
          for (const line of s.accounts) {
            if (!accountInfo.has(line.accountId)) {
              accountInfo.set(line.accountId, { accountNo: line.accountNo, accountName: line.accountName, section: s.section });
            }
          }
        }

        for (const [accountId, amounts] of byAccount) {
          const info = accountInfo.get(accountId) || { accountNo: "", accountName: "", section: "" };
          const prior = amounts.amount0;
          const current = amounts.amount1;
          const varianceDollar = current - prior;
          const variancePercent = prior !== 0 ? (varianceDollar / Math.abs(prior)) * 100 : (current !== 0 ? 100 : 0);
          lineItems.push({
            accountNo: info.accountNo,
            accountName: info.accountName,
            section: info.section,
            amountPeriod0: prior,
            amountPeriod1: current,
            varianceDollar,
            variancePercent
          });
        }
        lineItems.sort((a, b) => a.section.localeCompare(b.section) || a.accountNo.localeCompare(b.accountNo));
        result.lineItems = lineItems;
      }

      return result;
    } catch (error) {
      console.error("Error getting comparative income statement:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to get comparative income statement. Please try again.");
    }
  }

  /**
   * Get comprehensive detailed income statement with all transaction details
   */
  static async getComprehensiveDetailedIncomeStatement(params: IncomeStatementParams): Promise<any> {
    try {
      const incomeStatement = await this.generateIncomeStatement(params);

      // Get detailed accounts with all transaction information
      const detailedRevenue = await this.addAccountDetails(incomeStatement.sections.revenue.accounts, params);
      const detailedExpenses = await this.addAccountDetails(incomeStatement.sections.operatingExpenses.accounts, params);

      // Get currency information for filtering
      const currency = params.currencyId 
        ? await prisma.currency.findUnique({ where: { id: params.currencyId } })
        : await prisma.currency.findFirst({ where: { isActive: true } });

      if (!currency) {
        throw new Error("No active currency found");
      }

      // Get all journal entries for the period for complete overview
      // Exclude journal entries linked to voided/reversed cashbook entries
      const allJournalEntries = await prisma.journalEntry.findMany({
        where: {
          transactionDate: {
            gte: params.startDate,
            lte: params.endDate
          },
          status: "POSTED",
          currencyId: currency.id,
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
        },
        include: {
          currency: true,
          createdBy: true,
          journalEntryLines: {
            include: {
              chartOfAccount: true
            }
          },
          expenses: {
            include: {
              vendor: true,
              category: true,
              currency: true
            }
          },
          invoices: {
            include: {
              customer: true,
              currency: true
            }
          }
        },
        orderBy: {
          transactionDate: 'desc'
        }
      });

      // Calculate summary statistics
      const summaryStats = {
        totalJournalEntries: allJournalEntries.length,
        totalTransactions: allJournalEntries.reduce((sum, je) => sum + je.journalEntryLines.length, 0),
        // Calculate totals using Decimal arithmetic - NO ROUNDING
        totalDebitAmount: (() => {
          let total = new Decimal(0);
          for (const je of allJournalEntries) {
            for (const line of je.journalEntryLines) {
              total = total.plus(line.debitAmount);
            }
          }
          return total.toNumber();
        })(),
        totalCreditAmount: (() => {
          let total = new Decimal(0);
          for (const je of allJournalEntries) {
            for (const line of je.journalEntryLines) {
              total = total.plus(line.creditAmount);
            }
          }
          return total.toNumber();
        })(),
        totalVatAmount: (() => {
          let total = new Decimal(0);
          for (const je of allJournalEntries) {
            for (const line of je.journalEntryLines) {
              if (line.vatAmount) {
                total = total.plus(line.vatAmount);
              }
            }
          }
          return total.toNumber();
        })(),
        revenueAccounts: detailedRevenue.length,
        expenseAccounts: detailedExpenses.length,
        uniqueVendors: new Set(allJournalEntries.flatMap(je => je.expenses.map(e => e.vendor.id))).size,
        uniqueCustomers: new Set(allJournalEntries.flatMap(je => je.invoices.map(i => i.customer.id))).size
      };

      // Group journal entries by type for better organization
      const journalEntriesByType = {
        expenses: allJournalEntries.filter(je => je.expenses.length > 0),
        invoices: allJournalEntries.filter(je => je.invoices.length > 0),
        other: allJournalEntries.filter(je => je.expenses.length === 0 && je.invoices.length === 0)
      };

      return {
        period: incomeStatement.period,
        currency: incomeStatement.currency,
        generatedAt: new Date(),
        summary: {
          revenue: {
            total: incomeStatement.sections.revenue.total,
            accountCount: incomeStatement.sections.revenue.accounts.length,
            accounts: detailedRevenue
          },
          expenses: {
            total: incomeStatement.sections.operatingExpenses.total,
            accountCount: incomeStatement.sections.operatingExpenses.accounts.length,
            accounts: detailedExpenses
          },
          netIncome: incomeStatement.totals.netIncome
        },
        statistics: summaryStats,
        detailedTransactions: {
          byType: journalEntriesByType,
          allEntries: allJournalEntries.map(je => ({
            id: je.id,
            transactionDate: je.transactionDate,
            referenceNumber: je.referenceNumber,
            description: je.description,
            status: je.status,
            totalAmount: parseFloat(je.totalAmount.toString()),
            currency: {
              id: je.currency.id,
              code: je.currency.code,
              name: je.currency.name
            },
            createdBy: {
              id: je.createdBy.id,
              firstName: je.createdBy.firstName,
              lastName: je.createdBy.lastName,
              email: je.createdBy.email
            },
            expenses: je.expenses.map(expense => ({
              id: expense.id,
              description: expense.description,
              amount: parseFloat(expense.amount.toString()),
              vatAmount: expense.vatAmount ? parseFloat(expense.vatAmount.toString()) : 0,
              totalAmount: parseFloat(expense.totalAmount.toString()),
              receiptNumber: expense.receiptNumber,
              isTaxable: expense.isTaxable,
              paymentMethod: expense.paymentMethod,
              status: expense.status,
              vendor: {
                id: expense.vendor.id,
                name: expense.vendor.name,
                email: expense.vendor.email,
                phone: expense.vendor.phone
              },
              category: {
                id: expense.category.id,
                name: expense.category.name
              }
            })),
            invoices: je.invoices.map(invoice => ({
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              description: invoice.description,
              amount: parseFloat(invoice.amount.toString()),
              vatAmount: invoice.vatAmount ? parseFloat(invoice.vatAmount.toString()) : 0,
              totalAmount: parseFloat(invoice.totalAmount.toString()),
              isTaxable: invoice.isTaxable,
              status: invoice.status,
              customer: {
                id: invoice.customer.id,
                name: invoice.customer.name,
                email: invoice.customer.email,
                phone: invoice.customer.phone
              },
              items: invoice.items || []
            })),
            lines: je.journalEntryLines.map(line => ({
              id: line.id,
              description: line.description,
              debitAmount: new Decimal(line.debitAmount).toNumber(),
              creditAmount: new Decimal(line.creditAmount).toNumber(),
              vatAmount: line.vatAmount ? new Decimal(line.vatAmount).toNumber() : 0,
              account: {
                id: line.chartOfAccount.id,
                accountNo: line.chartOfAccount.accountNo,
                accountName: line.chartOfAccount.accountName,
                accountType: line.chartOfAccount.accountType,
                financialStatement: line.chartOfAccount.financialStatement
              }
            }))
          }))
        }
      };
    } catch (error) {
      console.error("Error getting comprehensive detailed income statement:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to get comprehensive detailed income statement. Please try again.");
    }
  }

  /**
   * Generate detailed vertical income statement following traditional format
   */
  static async getVerticalIncomeStatement(params: IncomeStatementParams): Promise<any> {
    try {
      const { startDate, endDate, currencyId } = params;

      // Get currency information
      const currency = currencyId 
        ? await prisma.currency.findUnique({ where: { id: currencyId } })
        : await prisma.currency.findFirst({ where: { isActive: true } });

      if (!currency) {
        throw new Error("No active currency found");
      }

      // Get all posted journal entries for the period
      // Exclude journal entries linked to voided/reversed cashbook entries
      const journalEntries = await prisma.journalEntry.findMany({
        where: {
          transactionDate: {
            gte: startDate,
            lte: endDate
          },
          status: "POSTED",
          currencyId: currency.id,
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
        },
        include: {
          journalEntryLines: {
            include: {
              chartOfAccount: true
            }
          }
        }
      });

      // Calculate account balances from journal entry lines
      const accountBalances = await this.calculateAccountBalances(journalEntries);

      // Build vertical income statement structure
      const verticalIncomeStatement = {
        period: {
          startDate,
          endDate
        },
        currency: {
          id: currency.id,
          code: currency.code,
          name: currency.name
        },
        generatedAt: new Date(),
        income: {
          sales: this.getAccountBalance(accountBalances, "Management Fees Income"), // Using actual account name
          salesReturns: this.getAccountBalance(accountBalances, "Sales Returns"),
          netSales: 0 // Will be calculated
        },
        costOfGoodsSold: {
          operatingStock: this.getAccountBalance(accountBalances, "Operating Stock"),
          purchases: this.getAccountBalance(accountBalances, "Purchases"),
          wages: this.getAccountBalance(accountBalances, "Salaries and Wages"), // Using actual account name
          carriageInward: this.getAccountBalance(accountBalances, "Carriage Inward"),
          directExpenses: this.getAccountBalance(accountBalances, "Direct Expenses"),
          closingStock: this.getAccountBalance(accountBalances, "Closing Stock"),
          netCostOfGoodsSold: 0 // Will be calculated
        },
        grossProfit: 0, // Will be calculated
        operatingExpenses: {
          administrativeExpenses: this.getAccountBalance(accountBalances, "Administrative Expenses"),
          financeExpenses: this.getAccountBalance(accountBalances, "Finance Expenses"),
          sellingExpenses: this.getAccountBalance(accountBalances, "Selling Expenses"),
          totalOperatingExpenses: 0 // Will be calculated
        },
        operatingProfit: 0, // Will be calculated
        nonOperatingItems: {
          nonOperatingIncome: this.getAccountBalance(accountBalances, "Non-operating Income"),
          nonOperatingExpenses: this.getAccountBalance(accountBalances, "Non-operating Expenses"),
          netProfitBeforeTax: 0 // Will be calculated
        },
        tax: {
          taxAmount: this.getAccountBalance(accountBalances, "Tax"),
          netProfitAfterTax: 0 // Will be calculated
        }
      };

      // Calculate Net Sales
      verticalIncomeStatement.income.netSales = 
        verticalIncomeStatement.income.sales - verticalIncomeStatement.income.salesReturns;

      // Calculate Net Cost of Goods Sold
      const cogsAdditions = 
        verticalIncomeStatement.costOfGoodsSold.purchases +
        verticalIncomeStatement.costOfGoodsSold.wages +
        verticalIncomeStatement.costOfGoodsSold.carriageInward +
        verticalIncomeStatement.costOfGoodsSold.directExpenses;

      verticalIncomeStatement.costOfGoodsSold.netCostOfGoodsSold = 
        verticalIncomeStatement.costOfGoodsSold.operatingStock +
        cogsAdditions -
        verticalIncomeStatement.costOfGoodsSold.closingStock;

      // Calculate Gross Profit
      verticalIncomeStatement.grossProfit = 
        verticalIncomeStatement.income.netSales - 
        verticalIncomeStatement.costOfGoodsSold.netCostOfGoodsSold;

      // Calculate Total Operating Expenses
      verticalIncomeStatement.operatingExpenses.totalOperatingExpenses = 
        verticalIncomeStatement.operatingExpenses.administrativeExpenses +
        verticalIncomeStatement.operatingExpenses.financeExpenses +
        verticalIncomeStatement.operatingExpenses.sellingExpenses;

      // Calculate Operating Profit
      verticalIncomeStatement.operatingProfit = 
        verticalIncomeStatement.grossProfit - 
        verticalIncomeStatement.operatingExpenses.totalOperatingExpenses;

      // Calculate Net Profit Before Tax
      verticalIncomeStatement.nonOperatingItems.netProfitBeforeTax = 
        verticalIncomeStatement.operatingProfit +
        verticalIncomeStatement.nonOperatingItems.nonOperatingIncome -
        verticalIncomeStatement.nonOperatingItems.nonOperatingExpenses;

      // Calculate Net Profit After Tax
      verticalIncomeStatement.tax.netProfitAfterTax = 
        verticalIncomeStatement.nonOperatingItems.netProfitBeforeTax -
        verticalIncomeStatement.tax.taxAmount;

      return verticalIncomeStatement;
    } catch (error) {
      console.error("Error generating vertical income statement:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to generate vertical income statement. Please try again.");
    }
  }

  /**
   * Helper method to get account balance by account name
   */
  private static getAccountBalance(accountBalances: IncomeStatementAccount[], accountName: string): number {
    // Try exact match first
    let account = accountBalances.find(acc => 
      acc.accountName.toLowerCase() === accountName.toLowerCase()
    );
    
    // If not found, try partial match
    if (!account) {
      account = accountBalances.find(acc => 
        acc.accountName.toLowerCase().includes(accountName.toLowerCase()) ||
        accountName.toLowerCase().includes(acc.accountName.toLowerCase())
      );
    }
    
    // For revenue accounts, also check account type
    if (!account && (accountName.toLowerCase().includes('sales') || accountName.toLowerCase().includes('income') || accountName.toLowerCase().includes('revenue'))) {
      account = accountBalances.find(acc => acc.accountType === "Revenue");
    }
    
    // For expense accounts, also check account type
    if (!account && (accountName.toLowerCase().includes('expense') || accountName.toLowerCase().includes('cost'))) {
      account = accountBalances.find(acc => acc.accountType === "Expense");
    }
    
    return account ? account.netAmount : 0;
  }
}

export default IncomeStatementService; 