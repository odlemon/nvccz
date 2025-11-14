// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../utils/database";
import { CashFlowParams, CashFlowStatement, CashFlowActivity, CashFlowAccount } from "./types";
import { CashFlowCategorizationService } from "./CashFlowCategorizationService";
import { CashFlowBalanceService } from "./CashFlowBalanceService";

export class CashFlowCalculationService {
  /**
   * Generate cash flow statement for a specific period
   */
  async generateCashFlowStatement(params: CashFlowParams): Promise<CashFlowStatement> {
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
    const accountBalances = await CashFlowBalanceService.calculateAccountBalances(journalEntries);

    // Categorize accounts by cash flow activity
    const categorizedAccounts = CashFlowCategorizationService.categorizeAccountsByCashFlow(accountBalances);

    // Calculate cash flow activities
    const operatingActivities = this.calculateOperatingActivities(categorizedAccounts);
    const investingActivities = this.calculateInvestingActivities(categorizedAccounts);
    const financingActivities = this.calculateFinancingActivities(categorizedAccounts);

    // Calculate net cash flow
    const netCashFlow = operatingActivities.total + investingActivities.total + financingActivities.total;

    // Get beginning and ending cash balances
    const cashBalances = await CashFlowBalanceService.getCashBalances(startDate, endDate, currency.id);
    const beginningCashBalance = cashBalances.beginning;
    const endingCashBalance = beginningCashBalance + netCashFlow;

    const presentation = this.buildPresentation({
      accounts: categorizedAccounts,
      revenueAccounts: operatingActivities.accounts,
      netCashFlow,
      beginningCashBalance,
      endingCashBalance
    });

    return {
      period: {
        startDate,
        endDate
      },
      operatingActivities,
      investingActivities,
      financingActivities,
      netCashFlow,
      beginningCashBalance,
      endingCashBalance,
      currency: {
        id: currency.id,
        code: currency.code,
        name: currency.name
      },
      generatedAt: new Date(),
      presentation
    };
  }

  /**
   * Calculate operating activities
   */
  private calculateOperatingActivities(accounts: CashFlowAccount[]): CashFlowActivity {
    const operatingAccounts = accounts.filter(account => account.cashFlowCategory === "Operating");
    
    let total = 0;
    
    for (const account of operatingAccounts) {
      if (account.accountType === "Revenue") {
        // Revenue increases cash flow
        total += account.netAmount;
      } else if (account.accountType === "Expense") {
        // Expenses decrease cash flow
        total -= account.netAmount;
      } else if (account.accountType === "Asset") {
        // Changes in current assets affect cash flow
        // Increase in asset = decrease in cash
        total -= account.netAmount;
      } else if (account.accountType === "Liability") {
        // Changes in current liabilities affect cash flow
        // Increase in liability = increase in cash
        total += account.netAmount;
      }
    }

    return {
      accounts: operatingAccounts,
      total,
      description: "Cash flows from operating activities"
    };
  }

  /**
   * Calculate investing activities
   */
  private calculateInvestingActivities(accounts: CashFlowAccount[]): CashFlowActivity {
    const investingAccounts = accounts.filter(account => account.cashFlowCategory === "Investing");
    
    let total = 0;
    
    for (const account of investingAccounts) {
      if (account.accountType === "Asset") {
        // Purchase of assets = cash outflow
        total -= account.netAmount;
      } else if (account.accountType === "Revenue") {
        // Investment income = cash inflow
        total += account.netAmount;
      }
    }

    return {
      accounts: investingAccounts,
      total,
      description: "Cash flows from investing activities"
    };
  }

  /**
   * Calculate financing activities
   */
  private calculateFinancingActivities(accounts: CashFlowAccount[]): CashFlowActivity {
    const financingAccounts = accounts.filter(account => account.cashFlowCategory === "Financing");
    
    let total = 0;
    
    for (const account of financingAccounts) {
      if (account.accountType === "Liability") {
        // Increase in debt = cash inflow
        total += account.netAmount;
      } else if (account.accountType === "Equity") {
        // Capital contribution = cash inflow
        total += account.netAmount;
      } else if (account.accountType === "Asset" && account.accountName.toLowerCase().includes("cash")) {
        // Cash account changes
        total += account.netAmount;
      }
    }

    return {
      accounts: financingAccounts,
      total,
      description: "Cash flows from financing activities"
    };
  }

  /**
   * Get cash flow statement summary (high-level totals only)
   */
  async getCashFlowStatementSummary(params: CashFlowParams): Promise<any> {
    const cashFlowStatement = await this.generateCashFlowStatement(params);

    return {
      period: cashFlowStatement.period,
      operatingActivities: {
        total: cashFlowStatement.operatingActivities.total,
        accountCount: cashFlowStatement.operatingActivities.accounts.length
      },
      investingActivities: {
        total: cashFlowStatement.investingActivities.total,
        accountCount: cashFlowStatement.investingActivities.accounts.length
      },
      financingActivities: {
        total: cashFlowStatement.financingActivities.total,
        accountCount: cashFlowStatement.financingActivities.accounts.length
      },
      netCashFlow: cashFlowStatement.netCashFlow,
      beginningCashBalance: cashFlowStatement.beginningCashBalance,
      endingCashBalance: cashFlowStatement.endingCashBalance,
      currency: cashFlowStatement.currency,
      generatedAt: cashFlowStatement.generatedAt
    };
  }

  /**
   * Get cash flow statement for multiple periods (comparative)
   */
  async getComparativeCashFlowStatement(periods: CashFlowParams[]): Promise<any> {
    const comparativeData = [];

    for (const period of periods) {
      const cashFlowStatement = await this.generateCashFlowStatement(period);
      comparativeData.push({
        period: cashFlowStatement.period,
        operatingActivities: cashFlowStatement.operatingActivities.total,
        investingActivities: cashFlowStatement.investingActivities.total,
        financingActivities: cashFlowStatement.financingActivities.total,
        netCashFlow: cashFlowStatement.netCashFlow,
        beginningCashBalance: cashFlowStatement.beginningCashBalance,
        endingCashBalance: cashFlowStatement.endingCashBalance,
        currency: cashFlowStatement.currency
      });
    }

    return {
      periods: comparativeData,
      currency: comparativeData[0]?.currency,
      generatedAt: new Date()
    };
  }

  /**
   * Get detailed cash flow statement with transaction breakdown
   */
  async getDetailedCashFlowStatement(params: CashFlowParams): Promise<any> {
    const cashFlowStatement = await this.generateCashFlowStatement(params);

    // Add additional details for each account
    const detailedOperating = await this.addAccountDetails(cashFlowStatement.operatingActivities.accounts, params);
    const detailedInvesting = await this.addAccountDetails(cashFlowStatement.investingActivities.accounts, params);
    const detailedFinancing = await this.addAccountDetails(cashFlowStatement.financingActivities.accounts, params);

    return {
      ...cashFlowStatement,
      operatingActivities: {
        ...cashFlowStatement.operatingActivities,
        accounts: detailedOperating
      },
      investingActivities: {
        ...cashFlowStatement.investingActivities,
        accounts: detailedInvesting
      },
      financingActivities: {
        ...cashFlowStatement.financingActivities,
        accounts: detailedFinancing
      }
    };
  }

  /**
   * Add transaction details for each account
   */
  private async addAccountDetails(accounts: CashFlowAccount[], params: CashFlowParams): Promise<any[]> {
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
   * Get comprehensive detailed cash flow statement with all transaction details
   */
  async getComprehensiveDetailedCashFlowStatement(params: CashFlowParams): Promise<any> {
    const cashFlowStatement = await this.generateCashFlowStatement(params);

    // Get detailed accounts with all transaction information
    const detailedOperating = await this.addAccountDetails(cashFlowStatement.operatingActivities.accounts, params);
    const detailedInvesting = await this.addAccountDetails(cashFlowStatement.investingActivities.accounts, params);
    const detailedFinancing = await this.addAccountDetails(cashFlowStatement.financingActivities.accounts, params);

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
      operatingAccounts: detailedOperating.length,
      investingAccounts: detailedInvesting.length,
      financingAccounts: detailedFinancing.length,
      uniqueVendors: new Set(allJournalEntries.flatMap(je => je.expenses.map(e => e.vendor.id))).size,
      uniqueCustomers: new Set(allJournalEntries.flatMap(je => je.invoices.map(i => i.customer.id))).size
    };

    // Group journal entries by cash flow category for better organization
    const journalEntriesByCategory = {
      operating: allJournalEntries.filter(je => 
        je.journalEntryLines.some(line => 
          CashFlowCategorizationService.categorizeAccountsByCashFlow([{
            accountId: line.chartOfAccount.id,
            accountNo: line.chartOfAccount.accountNo,
            accountName: line.chartOfAccount.accountName,
            accountType: line.chartOfAccount.accountType,
            financialStatement: line.chartOfAccount.financialStatement,
            totalDebits: 0,
            totalCredits: 0,
            netAmount: 0,
            cashFlowCategory: ""
          }])[0].cashFlowCategory === "Operating"
        )
      ),
      investing: allJournalEntries.filter(je => 
        je.journalEntryLines.some(line => 
          CashFlowCategorizationService.categorizeAccountsByCashFlow([{
            accountId: line.chartOfAccount.id,
            accountNo: line.chartOfAccount.accountNo,
            accountName: line.chartOfAccount.accountName,
            accountType: line.chartOfAccount.accountType,
            financialStatement: line.chartOfAccount.financialStatement,
            totalDebits: 0,
            totalCredits: 0,
            netAmount: 0,
            cashFlowCategory: ""
          }])[0].cashFlowCategory === "Investing"
        )
      ),
      financing: allJournalEntries.filter(je => 
        je.journalEntryLines.some(line => 
          CashFlowCategorizationService.categorizeAccountsByCashFlow([{
            accountId: line.chartOfAccount.id,
            accountNo: line.chartOfAccount.accountNo,
            accountName: line.chartOfAccount.accountName,
            accountType: line.chartOfAccount.accountType,
            financialStatement: line.chartOfAccount.financialStatement,
            totalDebits: 0,
            totalCredits: 0,
            netAmount: 0,
            cashFlowCategory: ""
          }])[0].cashFlowCategory === "Financing"
        )
      )
    };

    return {
      period: cashFlowStatement.period,
      currency: cashFlowStatement.currency,
      generatedAt: new Date(),
      summary: {
        operatingActivities: {
          total: cashFlowStatement.operatingActivities.total,
          accountCount: cashFlowStatement.operatingActivities.accounts.length,
          accounts: detailedOperating
        },
        investingActivities: {
          total: cashFlowStatement.investingActivities.total,
          accountCount: cashFlowStatement.investingActivities.accounts.length,
          accounts: detailedInvesting
        },
        financingActivities: {
          total: cashFlowStatement.financingActivities.total,
          accountCount: cashFlowStatement.financingActivities.accounts.length,
          accounts: detailedFinancing
        },
        netCashFlow: cashFlowStatement.netCashFlow,
        beginningCashBalance: cashFlowStatement.beginningCashBalance,
        endingCashBalance: cashFlowStatement.endingCashBalance
      },
      statistics: summaryStats,
      detailedTransactions: {
        byCategory: journalEntriesByCategory,
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
  }

  private buildPresentation({
    accounts,
    netCashFlow,
    beginningCashBalance,
    endingCashBalance
  }: {
    accounts: CashFlowAccount[];
    netCashFlow: number;
    beginningCashBalance: number;
    endingCashBalance: number;
  }) {
    const accountNoValue = (accountNo: string) => {
      const numeric = parseInt(accountNo, 10);
      return Number.isNaN(numeric) ? 0 : numeric;
    };

    const sumAccounts = (filter: (account: CashFlowAccount) => boolean) =>
      accounts.filter(filter).reduce((sum, account) => sum + account.netAmount, 0);

    const cashReceiptsCustomers = sumAccounts(
      account =>
        account.accountType === "Revenue" &&
        accountNoValue(account.accountNo) >= 4000 &&
        accountNoValue(account.accountNo) <= 4099
    );

    const cashPaidGeneralOperating = sumAccounts(account => {
      const no = account.accountNo;
      return (
        ["5000", "5010", "5020", "5040", "5050", "5060", "5070", "5080", "5090"].includes(no)
      );
    });

    const cashPaidWages = sumAccounts(account => account.accountNo === "5030");

    const cashPaidInterest = sumAccounts(account =>
      account.accountName.toLowerCase().includes("interest")
    );

    const cashPaidIncomeTaxes = sumAccounts(account =>
      account.accountName.toLowerCase().includes("tax") ||
      (accountNoValue(account.accountNo) >= 6100 && accountNoValue(account.accountNo) <= 6199)
    );

    const depreciationAndAmortization = sumAccounts(account =>
      account.accountName.toLowerCase().includes("depreciation") ||
      account.accountName.toLowerCase().includes("amortization")
    );

    const changeInInventory = sumAccounts(account =>
      account.accountName.toLowerCase().includes("inventory")
    );

    const changeInOperatingAssetsRaw = sumAccounts(account => {
      const value = accountNoValue(account.accountNo);
      return (
        account.accountType === "Asset" &&
        !account.accountName.toLowerCase().includes("cash") &&
        value >= 1200 &&
        value < 1500 &&
        !account.accountName.toLowerCase().includes("inventory")
      );
    });
    const changeInOperatingAssets = -changeInOperatingAssetsRaw;

    const changeInOperatingLiabilities = sumAccounts(account => {
      const value = accountNoValue(account.accountNo);
      return account.accountType === "Liability" && value >= 2000 && value < 3000;
    });

    const receiptsTotal = cashReceiptsCustomers;
    const paymentsTotal =
      -cashPaidGeneralOperating - cashPaidWages - cashPaidInterest - cashPaidIncomeTaxes;

    const netIncomeOperating = receiptsTotal + paymentsTotal;
    const additionsTotal = depreciationAndAmortization;
    const adjustmentsTotal =
      -changeInInventory + changeInOperatingAssets + changeInOperatingLiabilities;

    const totalOperating =
      netIncomeOperating + additionsTotal + adjustmentsTotal;

    const propertyAccounts = accounts.filter(account => {
      const value = accountNoValue(account.accountNo);
      return value >= 1100 && value < 1500 && account.accountType === "Asset";
    });

    let purchaseProperty = 0;
    let saleProperty = 0;
    for (const account of propertyAccounts) {
      if (account.netAmount > 0) {
        purchaseProperty += account.netAmount;
      } else if (account.netAmount < 0) {
        saleProperty += Math.abs(account.netAmount);
      }
    }

    const investmentAccounts = accounts.filter(account => {
      const value = accountNoValue(account.accountNo);
      return value >= 1500 && value < 1600;
    });

    let purchaseInvestments = 0;
    let saleInvestments = 0;
    for (const account of investmentAccounts) {
      if (account.netAmount > 0) {
        purchaseInvestments += account.netAmount;
      } else if (account.netAmount < 0) {
        saleInvestments += Math.abs(account.netAmount);
      }
    }

    const totalInvesting =
      saleProperty +
      saleInvestments -
      purchaseProperty -
      purchaseInvestments;

    const loanAccounts = accounts.filter(account => account.accountNo === "2200");
    let newBankLoans = 0;
    let repaymentBankLoans = 0;
    for (const account of loanAccounts) {
      if (account.netAmount > 0) {
        newBankLoans += account.netAmount;
      } else if (account.netAmount < 0) {
        repaymentBankLoans += Math.abs(account.netAmount);
      }
    }

    const equityAccounts = accounts.filter(account => account.accountNo === "3000");
    let proceedsCommonStock = 0;
    let dividends = 0;
    for (const account of equityAccounts) {
      if (account.netAmount > 0) {
        proceedsCommonStock += account.netAmount;
      } else if (account.netAmount < 0) {
        dividends += Math.abs(account.netAmount);
      }
    }

    const dividendExpenseAccounts = accounts.filter(account =>
      account.accountName.toLowerCase().includes("dividend")
    );
    for (const account of dividendExpenseAccounts) {
      if (account.netAmount > 0) {
        dividends += account.netAmount;
      }
    }

    const totalFinancing =
      newBankLoans +
      proceedsCommonStock -
      repaymentBankLoans -
      dividends;

    return {
      operating: {
        label: "Operating Activities",
        cashReceipts: [
          { label: "Customers", amount: receiptsTotal }
        ],
        cashPayments: [
          { label: "General operating and admin expenses", amount: -cashPaidGeneralOperating },
          { label: "Wage expenses", amount: -cashPaidWages },
          { label: "Interest", amount: -cashPaidInterest },
          { label: "Income taxes", amount: -cashPaidIncomeTaxes }
        ],
        additions: [
          { label: "Other operations", amount: 0 },
          { label: "Depreciation and amortization", amount: depreciationAndAmortization }
        ],
        adjustments: [
          { label: "Change in inventory", amount: -changeInInventory },
          { label: "Change in operating assets", amount: changeInOperatingAssets },
          { label: "Change in operating liabilities", amount: changeInOperatingLiabilities }
        ],
        total: totalOperating
      },
      investing: {
        label: "Investing Activities",
        cashReceipts: [
          { label: "Sale of property and equipment", amount: saleProperty },
          { label: "Collection of loans", amount: 0 },
          { label: "Proceeds from disposal of investments", amount: saleInvestments }
        ],
        cashPayments: [
          { label: "Purchase of property and equipment", amount: -purchaseProperty },
          { label: "Loans to others", amount: 0 },
          { label: "Purchase of investments", amount: -purchaseInvestments }
        ],
        total: totalInvesting
      },
      financing: {
        label: "Financing Activities",
        cashReceipts: [
          { label: "New bank loans", amount: newBankLoans },
          { label: "Proceeds from issuing common stock", amount: proceedsCommonStock }
        ],
        cashPayments: [
          { label: "Repayment of bank loans", amount: -repaymentBankLoans },
          { label: "Dividends", amount: -dividends }
        ],
        total: totalFinancing
      },
      netChangeInCash: totalOperating + totalInvesting + totalFinancing,
      beginningCashBalance,
      endingCashBalance
    };
  }
} 