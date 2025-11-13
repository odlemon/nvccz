// @ts-nocheck
import { PrismaClient, ChartOfAccounts, JournalEntryLine } from "@prisma/client";
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";

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

export interface IncomeStatementLine {
  accountId: string;
  accountNo: string;
  accountName: string;
  accountType: string;
  netAmount: number;
  amount: number;
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
      const currency = currencyId 
        ? await prisma.currency.findUnique({ where: { id: currencyId } })
        : await prisma.currency.findFirst({ where: { isActive: true } });

      if (!currency) {
        throw new Error("No active currency found");
      }

      // Get all posted journal entries for the period
      const journalEntries = await prisma.journalEntry.findMany({
        where: {
          transactionDate: {
            gte: startDate,
            lte: endDate
          },
          status: "POSTED",
          currencyId: currency.id
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

      const sections = this.buildIncomeStatementSections(accountBalances);

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
   * Build structured income statement sections aligned with standard presentation
   */
  private static buildIncomeStatementSections(accounts: IncomeStatementAccount[]) {
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
      if (account.financialStatement !== "Income Statement") {
        continue;
      }

      const accountNoValue = getAccountNoValue(account.accountNo);
      if (accountNoValue === 0) continue;

      const baseLine: IncomeStatementLine = {
        accountId: account.accountId,
        accountNo: account.accountNo,
        accountName: account.accountName,
        accountType: account.accountType,
        netAmount: account.netAmount,
        amount: account.netAmount
      };

      if (accountNoValue >= 4000 && accountNoValue <= 4099) {
        // Core revenue accounts (credits positive)
        revenueSection.accounts.push(baseLine);
        revenueSection.total += baseLine.amount;
        continue;
      }

      if (accountNoValue >= 4100 && accountNoValue <= 4199) {
        // Contra revenue / returns
        const line: IncomeStatementLine = {
          ...baseLine,
          amount: baseLine.amount * -1
        };
        returnsAccounts.push(line);
        revenueSection.total += line.amount;
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
        account.totalDebits += parseFloat(line.debitAmount.toString());
        account.totalCredits += parseFloat(line.creditAmount.toString());
      }
    }

    // Calculate net amounts based on account type
    for (const account of accountBalances.values()) {
      if (account.accountType === "Revenue") {
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
      : await prisma.currency.findFirst({ where: { isActive: true } });

    if (!currency) {
      throw new Error("No active currency found");
    }

    for (const account of accounts) {
      // Get all transactions for this account in the period with complete details
      const transactions = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: account.accountId,
          journalEntry: {
            transactionDate: {
              gte: params.startDate,
              lte: params.endDate
            },
            status: "POSTED",
            currencyId: currency.id
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
          debitAmount: parseFloat(transaction.debitAmount.toString()),
          creditAmount: parseFloat(transaction.creditAmount.toString()),
          vatAmount: transaction.vatAmount ? parseFloat(transaction.vatAmount.toString()) : 0,
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
        totalDebitAmount: transactions.reduce((sum, t) => sum + parseFloat(t.debitAmount.toString()), 0),
        totalCreditAmount: transactions.reduce((sum, t) => sum + parseFloat(t.creditAmount.toString()), 0),
        totalVatAmount: transactions.reduce((sum, t) => sum + (t.vatAmount ? parseFloat(t.vatAmount.toString()) : 0), 0)
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
   * Get income statement for multiple periods (comparative)
   */
  static async getComparativeIncomeStatement(periods: IncomeStatementParams[]): Promise<any> {
    try {
      const comparativeData = [];

      for (const period of periods) {
        const incomeStatement = await this.generateIncomeStatement(period);
        comparativeData.push({
          period: incomeStatement.period,
          revenue: incomeStatement.revenue.total,
          expenses: incomeStatement.expenses.total,
          netIncome: incomeStatement.netIncome,
          currency: incomeStatement.currency
        });
      }

      return {
        periods: comparativeData,
        currency: comparativeData[0]?.currency,
        generatedAt: new Date()
      };
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
      const detailedRevenue = await this.addAccountDetails(incomeStatement.revenue.accounts, params);
      const detailedExpenses = await this.addAccountDetails(incomeStatement.expenses.accounts, params);

      // Get currency information for filtering
      const currency = params.currencyId 
        ? await prisma.currency.findUnique({ where: { id: params.currencyId } })
        : await prisma.currency.findFirst({ where: { isActive: true } });

      if (!currency) {
        throw new Error("No active currency found");
      }

      // Get all journal entries for the period for complete overview
      const allJournalEntries = await prisma.journalEntry.findMany({
        where: {
          transactionDate: {
            gte: params.startDate,
            lte: params.endDate
          },
          status: "POSTED",
          currencyId: currency.id
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
        totalDebitAmount: allJournalEntries.reduce((sum, je) => 
          sum + je.journalEntryLines.reduce((lineSum, line) => lineSum + parseFloat(line.debitAmount.toString()), 0), 0),
        totalCreditAmount: allJournalEntries.reduce((sum, je) => 
          sum + je.journalEntryLines.reduce((lineSum, line) => lineSum + parseFloat(line.creditAmount.toString()), 0), 0),
        totalVatAmount: allJournalEntries.reduce((sum, je) => 
          sum + je.journalEntryLines.reduce((lineSum, line) => lineSum + (line.vatAmount ? parseFloat(line.vatAmount.toString()) : 0), 0), 0),
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
            total: incomeStatement.revenue.total,
            accountCount: incomeStatement.revenue.accounts.length,
            accounts: detailedRevenue
          },
          expenses: {
            total: incomeStatement.expenses.total,
            accountCount: incomeStatement.expenses.accounts.length,
            accounts: detailedExpenses
          },
          netIncome: incomeStatement.netIncome
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
              debitAmount: parseFloat(line.debitAmount.toString()),
              creditAmount: parseFloat(line.creditAmount.toString()),
              vatAmount: line.vatAmount ? parseFloat(line.vatAmount.toString()) : 0,
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
      const journalEntries = await prisma.journalEntry.findMany({
        where: {
          transactionDate: {
            gte: startDate,
            lte: endDate
          },
          status: "POSTED",
          currencyId: currency.id
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