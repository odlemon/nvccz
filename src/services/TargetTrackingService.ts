// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";

const prisma = dbConnection.getPrismaClient();

export interface ActualData {
  revenue: {
    amount: number;
    transactions: Array<{
      id: string;
      accountId: string;
      accountName: string;
      accountNo: string;
      amount: number;
      transactionDate: Date;
      description: string;
      referenceNumber: string;
    }>;
  };
  expenses: {
    amount: number;
    transactions: Array<{
      id: string;
      accountId: string;
      accountName: string;
      accountNo: string;
      amount: number;
      transactionDate: Date;
      description: string;
      referenceNumber: string;
    }>;
  };
  profit: {
    amount: number;
    dateRange: {
      earliestDate: Date | null;
      latestDate: Date | null;
    };
  };
}

export class TargetTrackingService {
  /**
   * Get actual revenue, expenses, and profit data for tracking
   */
  static async getActualData(): Promise<ActualData> {
    try {
      const [revenueData, expenseData] = await Promise.all([
        this.getRevenueData(),
        this.getExpenseData()
      ]);

      const profit = revenueData.amount - expenseData.amount;

      // Calculate overall date range for profit from all revenue and expense dates
      const allDates = [
        ...revenueData.transactionDates,
        ...expenseData.transactionDates
      ];

      const profitDateRange = {
        earliestDate: allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : null,
        latestDate: allDates.length > 0 ? new Date(Math.max(...allDates.map(d => d.getTime()))) : null
      };

      return {
        revenue: revenueData,
        expenses: expenseData,
        profit: {
          amount: profit,
          dateRange: profitDateRange
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to get actual data: ${error.message}`);
    }
  }

  /**
   * Get revenue data from journal entries
   */
  private static async getRevenueData(): Promise<{
    amount: number;
    transactions: Array<{
      id: string;
      accountId: string;
      accountName: string;
      accountNo: string;
      amount: number;
      transactionDate: Date;
      description: string;
      referenceNumber: string;
    }>;
    transactionDates: Date[];
  }> {
    // Get all posted journal entries for revenue accounts
    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        status: "POSTED"
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      }
    });

    const transactions: Array<{
      id: string;
      accountId: string;
      accountName: string;
      accountNo: string;
      amount: number;
      transactionDate: Date;
      description: string;
      referenceNumber: string;
    }> = [];

    let totalRevenue = 0;
    const transactionDates: Date[] = [];

    for (const journalEntry of journalEntries) {
      // Track all transaction dates for profit calculation
      transactionDates.push(journalEntry.transactionDate);
      
      for (const line of journalEntry.journalEntryLines) {
        // Revenue accounts: Credits increase revenue, Debits decrease revenue
        if (line.chartOfAccount.accountType === "Revenue" && 
            line.chartOfAccount.financialStatement === "Income Statement") {
          const creditAmount = parseFloat(line.creditAmount.toString());
          const debitAmount = parseFloat(line.debitAmount.toString());
          const netAmount = creditAmount - debitAmount;
          
          if (netAmount > 0) {
            totalRevenue += netAmount;

            transactions.push({
              id: journalEntry.id,
              accountId: line.chartOfAccount.id,
              accountName: line.chartOfAccount.accountName,
              accountNo: line.chartOfAccount.accountNo,
              amount: netAmount,
              transactionDate: journalEntry.transactionDate,
              description: journalEntry.description,
              referenceNumber: journalEntry.referenceNumber
            });
          }
        }
      }
    }

    return {
      amount: totalRevenue,
      transactions,
      transactionDates
    };
  }

  /**
   * Get expense data from journal entries
   */
  private static async getExpenseData(): Promise<{
    amount: number;
    transactions: Array<{
      id: string;
      accountId: string;
      accountName: string;
      accountNo: string;
      amount: number;
      transactionDate: Date;
      description: string;
      referenceNumber: string;
    }>;
    transactionDates: Date[];
  }> {
    // Get all posted journal entries for expense accounts
    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        status: "POSTED"
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      }
    });

    const transactions: Array<{
      id: string;
      accountId: string;
      accountName: string;
      accountNo: string;
      amount: number;
      transactionDate: Date;
      description: string;
      referenceNumber: string;
    }> = [];

    let totalExpenses = 0;
    const transactionDates: Date[] = [];

    for (const journalEntry of journalEntries) {
      // Track all transaction dates for profit calculation
      transactionDates.push(journalEntry.transactionDate);
      
      for (const line of journalEntry.journalEntryLines) {
        // Expense accounts: Debits increase expenses, Credits decrease expenses
        if (line.chartOfAccount.accountType === "Expense" && 
            line.chartOfAccount.financialStatement === "Income Statement") {
          const debitAmount = parseFloat(line.debitAmount.toString());
          const creditAmount = parseFloat(line.creditAmount.toString());
          const netAmount = debitAmount - creditAmount;
          
          if (netAmount > 0) {
            totalExpenses += netAmount;

            transactions.push({
              id: journalEntry.id,
              accountId: line.chartOfAccount.id,
              accountName: line.chartOfAccount.accountName,
              accountNo: line.chartOfAccount.accountNo,
              amount: netAmount,
              transactionDate: journalEntry.transactionDate,
              description: journalEntry.description,
              referenceNumber: journalEntry.referenceNumber
            });
          }
        }
      }
    }

    return {
      amount: totalExpenses,
      transactions,
      transactionDates
    };
  }

  /**
   * Get detailed transaction data for a specific type
   */
  static async getTransactionDetails(params: {
    type: "Revenue" | "Expenses";
  }): Promise<{
    transactions: Array<{
      id: string;
      date: Date;
      description: string;
      amount: number;
      accountName: string;
      accountNo: string;
      referenceNumber: string;
    }>;
    totalAmount: number;
  }> {
    try {
      const { type } = params;

      const journalEntries = await prisma.journalEntry.findMany({
        where: {
          status: "POSTED"
        },
        include: {
          journalEntryLines: {
            include: {
              chartOfAccount: true
            }
          }
        },
        orderBy: {
          transactionDate: "desc"
        }
      });

      const transactions: Array<{
        id: string;
        date: Date;
        description: string;
        amount: number;
        accountName: string;
        accountNo: string;
        referenceNumber: string;
      }> = [];

      let totalAmount = 0;

      for (const journalEntry of journalEntries) {
        for (const line of journalEntry.journalEntryLines) {
          const account = line.chartOfAccount;
          let isRelevant = false;
          let amount = 0;

          if (type === "Revenue") {
            isRelevant = account.accountType === "Revenue" && account.financialStatement === "Income Statement";
            if (isRelevant) {
              const creditAmount = parseFloat(line.creditAmount.toString());
              const debitAmount = parseFloat(line.debitAmount.toString());
              amount = creditAmount - debitAmount;
            }
          } else if (type === "Expenses") {
            isRelevant = account.accountType === "Expense" && account.financialStatement === "Income Statement";
            if (isRelevant) {
              const debitAmount = parseFloat(line.debitAmount.toString());
              const creditAmount = parseFloat(line.creditAmount.toString());
              amount = debitAmount - creditAmount;
            }
          }

          if (isRelevant && amount > 0) {
            transactions.push({
              id: journalEntry.id,
              date: journalEntry.transactionDate,
              description: journalEntry.description,
              amount,
              accountName: account.accountName,
              accountNo: account.accountNo,
              referenceNumber: journalEntry.referenceNumber
            });
            totalAmount += amount;
          }
        }
      }

      return {
        transactions,
        totalAmount
      };
    } catch (error: any) {
      throw new Error(`Failed to get transaction details: ${error.message}`);
    }
  }
}

export default TargetTrackingService;
