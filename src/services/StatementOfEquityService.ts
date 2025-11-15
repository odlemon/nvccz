// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "decimal.js";
import { IncomeStatementService } from "./IncomeStatementService";

export interface StatementOfEquityParams {
  startDate: Date;
  endDate: Date;
  currencyId?: string;
}

export interface EquityTransaction {
  id: string;
  date: string;
  reference: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  netAmount: number;
  source: string; // "CASHBOOK", "INVOICE", "EXPENSE", "MANUAL_ENTRY", "CLOSING_ENTRY", etc.
  sourceTransaction: any; // Actual transaction details (cashbook entry, invoice, expense, etc.)
  journalEntryId: string;
  journalEntryStatus: string;
}

export interface EquityAccountLine {
  accountId: string;
  accountNo: string;
  accountName: string;
  accountType: string;
  openingBalance: number;
  transactions: EquityTransaction[];
  netChange: number; // Sum of all transactions
  closingBalance: number;
}

export interface StatementOfEquity {
  period: {
    startDate: Date;
    endDate: Date;
  };
  openingEquity: number; // Total equity at start of period
  accounts: EquityAccountLine[];
  netIncome: number; // From Income Statement
  contributions: number; // Capital contributions during period
  distributions: number; // Dividends/distributions during period
  closingEquity: number; // Total equity at end of period
  currency: {
    id: string;
    code: string;
    name: string;
  };
  generatedAt: Date;
}

export class StatementOfEquityService {
  /**
   * Generate Statement of Equity for a specific period
   */
  static async generateStatementOfEquity(params: StatementOfEquityParams): Promise<StatementOfEquity> {
    try {
      const { startDate, endDate, currencyId } = params;

      console.log("\n📊 Generating Statement of Equity");
      console.log(`   Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

      // Get currency information
      const currency = currencyId 
        ? await prisma.currency.findUnique({ where: { id: currencyId } })
        : await prisma.currency.findFirst({ where: { isDefault: true, isActive: true } });

      if (!currency) {
        throw new Error("No active currency found");
      }

      // Get all equity accounts (3000-3999 range)
      const equityAccounts = await prisma.chartOfAccounts.findMany({
        where: {
          accountType: "Equity",
          isActive: true,
          accountNo: {
            gte: "3000",
            lt: "4000"
          }
        },
        orderBy: {
          accountNo: 'asc'
        }
      });

      console.log(`   Found ${equityAccounts.length} equity account(s)`);

      // Calculate opening balances (before startDate)
      const openingStartDate = new Date(0);
      const openingEndDate = new Date(startDate);
      openingEndDate.setHours(0, 0, 0, 0);

      const openingJournalLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: {
            in: equityAccounts.map(acc => acc.id)
          },
          journalEntry: {
            transactionDate: {
              lt: openingEndDate
            },
            status: "POSTED",
            currencyId: currency.id,
            NOT: {
              cashbookEntries: {
                some: {
                  OR: [
                    { status: 'VOIDED' },
                    { reversedAt: { not: null } }
                  ]
                }
              }
            },
            AND: [
              { referenceNumber: { not: { startsWith: 'VR-' } } },
              { referenceNumber: { not: { startsWith: 'REV-' } } }
            ]
          }
        },
        include: {
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

      // Get period transactions (within startDate to endDate)
      const periodStartDate = new Date(startDate);
      periodStartDate.setHours(0, 0, 0, 0);
      const periodEndDate = new Date(endDate);
      periodEndDate.setHours(23, 59, 59, 999);

      const periodJournalLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: {
            in: equityAccounts.map(acc => acc.id)
          },
          journalEntry: {
            transactionDate: {
              gte: periodStartDate,
              lte: periodEndDate
            },
            status: "POSTED",
            currencyId: currency.id,
            NOT: {
              cashbookEntries: {
                some: {
                  OR: [
                    { status: 'VOIDED' },
                    { reversedAt: { not: null } }
                  ]
                }
              }
            },
            AND: [
              { referenceNumber: { not: { startsWith: 'VR-' } } },
              { referenceNumber: { not: { startsWith: 'REV-' } } }
            ]
          }
        },
        include: {
          journalEntry: {
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
          }
        }
      });

      // Calculate opening balances
      const openingBalances = new Map<string, number>();
      for (const account of equityAccounts) {
        openingBalances.set(account.id, 0);
      }

      for (const line of openingJournalLines) {
        if (!line.chartOfAccountId) continue;
        const current = openingBalances.get(line.chartOfAccountId) || 0;
        // Equity accounts: Credits increase, Debits decrease
        const change = new Decimal(line.creditAmount || 0).minus(line.debitAmount || 0).toNumber();
        openingBalances.set(line.chartOfAccountId, current + change);
      }

      // Build account lines with transaction breakdowns
      const accountLines: EquityAccountLine[] = [];
      let totalOpeningEquity = 0;
      let totalContributions = 0;
      let totalDistributions = 0;

      for (const account of equityAccounts) {
        const openingBalance = openingBalances.get(account.id) || 0;
        totalOpeningEquity += openingBalance;

        // Get transactions for this account in the period
        const accountTransactions: EquityTransaction[] = [];
        let netChange = 0;

        for (const line of periodJournalLines) {
          if (line.chartOfAccountId !== account.id) continue;

          // Determine source and get actual transaction details
          let source = "MANUAL_ENTRY";
          let sourceTransaction: any = null;

          if (line.journalEntry.cashbookEntries && line.journalEntry.cashbookEntries.length > 0) {
            source = "CASHBOOK";
            const cashbookEntry = line.journalEntry.cashbookEntries[0];
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
          } else if (line.journalEntry.invoices && line.journalEntry.invoices.length > 0) {
            source = "INVOICE";
            const invoice = line.journalEntry.invoices[0];
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
          } else if (line.journalEntry.expenses && line.journalEntry.expenses.length > 0) {
            source = "EXPENSE";
            const expense = line.journalEntry.expenses[0];
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
          } else if (line.journalEntry.revenues && line.journalEntry.revenues.length > 0) {
            source = "REVENUE";
            const revenue = line.journalEntry.revenues[0];
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
          } else if (line.journalEntry.referenceNumber?.includes("CLOSING") || 
                     line.journalEntry.referenceNumber?.includes("CLOSE")) {
            source = "CLOSING_ENTRY";
            sourceTransaction = {
              id: line.journalEntry.id,
              referenceNumber: line.journalEntry.referenceNumber,
              description: line.journalEntry.description,
              transactionDate: line.journalEntry.transactionDate,
              status: line.journalEntry.status
            };
          } else {
            // Manual entry - use journal entry details
            sourceTransaction = {
              id: line.journalEntry.id,
              referenceNumber: line.journalEntry.referenceNumber,
              description: line.journalEntry.description,
              transactionDate: line.journalEntry.transactionDate,
              status: line.journalEntry.status
            };
          }

          // Equity accounts: Credits increase, Debits decrease
          const debitAmt = new Decimal(line.debitAmount || 0).toNumber();
          const creditAmt = new Decimal(line.creditAmount || 0).toNumber();
          const netAmt = creditAmt - debitAmt;

          // Track contributions (typically Share Capital increases)
          if (account.accountNo === "3000" && netAmt > 0) {
            totalContributions += netAmt;
          }

          // Track distributions (typically Retained Earnings decreases or dividends)
          if (netAmt < 0) {
            totalDistributions += Math.abs(netAmt);
          }

          accountTransactions.push({
            id: line.id,
            date: line.journalEntry.transactionDate.toISOString().split('T')[0],
            reference: line.journalEntry.referenceNumber || "",
            description: line.journalEntry.description || "",
            debitAmount: debitAmt,
            creditAmount: creditAmt,
            netAmount: netAmt,
            source: source,
            sourceTransaction: sourceTransaction,
            journalEntryId: line.journalEntry.id,
            journalEntryStatus: line.journalEntry.status
          });

          netChange += netAmt;
        }

        // Sort transactions by date
        accountTransactions.sort((a, b) => a.date.localeCompare(b.date));

        const closingBalance = openingBalance + netChange;

        accountLines.push({
          accountId: account.id,
          accountNo: account.accountNo,
          accountName: account.accountName,
          accountType: account.accountType,
          openingBalance: openingBalance,
          transactions: accountTransactions,
          netChange: netChange,
          closingBalance: closingBalance
        });
      }

      // Get Net Income from Income Statement
      let netIncome = 0;
      try {
        const incomeStatement = await IncomeStatementService.generateIncomeStatement({
          startDate: periodStartDate,
          endDate: periodEndDate,
          currencyId: currency.id
        });
        netIncome = incomeStatement.totals.netIncome;
      } catch (error) {
        console.warn("⚠️  Could not fetch Income Statement for net income:", error);
      }

      // Calculate closing equity
      const totalClosingEquity = totalOpeningEquity + netIncome + totalContributions - totalDistributions;

      return {
        period: {
          startDate: periodStartDate,
          endDate: periodEndDate
        },
        openingEquity: totalOpeningEquity,
        accounts: accountLines,
        netIncome: netIncome,
        contributions: totalContributions,
        distributions: totalDistributions,
        closingEquity: totalClosingEquity,
        currency: {
          id: currency.id,
          code: currency.code,
          name: currency.name
        },
        generatedAt: new Date()
      };
    } catch (error) {
      console.error("Error generating statement of equity:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to generate statement of equity. Please try again.");
    }
  }
}

