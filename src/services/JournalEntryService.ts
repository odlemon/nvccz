// @ts-nocheck
import { PrismaClient, JournalEntry, JournalEntryLine, ChartOfAccounts } from "@prisma/client";
import { dbConnection } from "../utils/database";
import VATService from "./VATService";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = dbConnection.getPrismaClient();

export interface CreateExpenseJournalEntryParams {
  vendorId: string;
  categoryId: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  currencyId: string;
  transactionDate: Date;
  description: string;
  receiptNumber?: string;
  isTaxable: boolean;
  paymentMethod?: "CASH" | "BANK" | "CREDIT";
  createdById: string;
}

export interface JournalEntryResult {
  journalEntry: JournalEntry;
  journalEntryLines: JournalEntryLine[];
}

export class JournalEntryService {
  /**
   * Generate a unique reference number for journal entries
   */
  private static generateReferenceNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `JE-${timestamp}-${random}`;
  }

  /**
   * Create a journal entry for an expense transaction
   */
  static async createExpenseJournalEntry(params: CreateExpenseJournalEntryParams): Promise<JournalEntryResult> {
    try {
      const {
        vendorId,
        categoryId,
        amount,
        vatAmount,
        totalAmount,
        currencyId,
        transactionDate,
        description,
        receiptNumber,
        isTaxable,
        paymentMethod = "BANK",
        createdById
      } = params;

      const expenseAccount = await this.getExpenseAccount(categoryId);
      const vatInputAccount = await this.getVATInputAccount();
      const creditAccount = await this.getCreditAccount(paymentMethod);

      // Create the journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate,
          referenceNumber: this.generateReferenceNumber(),
          description: `Expense: ${description}`,
          totalAmount: new Decimal(totalAmount),
          currencyId,
          status: "POSTED",
          createdById
        }
      });

      // Create journal entry lines for double-entry bookkeeping
      const journalEntryLines: JournalEntryLine[] = [];

      // 1. Debit the expense account
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: expenseAccount.id,
            debitAmount: new Decimal(amount),
            creditAmount: new Decimal(0),
            description: `Expense: ${description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      // 2. If taxable, debit VAT Input account
      if (isTaxable && vatAmount > 0) {
        journalEntryLines.push(
          await prisma.journalEntryLine.create({
            data: {
              journalEntryId: journalEntry.id,
              chartOfAccountId: vatInputAccount.id,
              debitAmount: new Decimal(vatAmount),
              creditAmount: new Decimal(0),
              description: `VAT Input: ${description}`,
              vatAmount: new Decimal(vatAmount)
            }
          })
        );
      }

      // 3. Credit the appropriate account based on payment method
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: creditAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(totalAmount),
            description: `${creditAccount.accountName}: ${description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      return {
        journalEntry,
        journalEntryLines
      };
    } catch (error) {
      console.error("Error creating journal entry:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to create journal entry. Please try again.");
    }
  }

  /**
   * Create a reversal journal entry to cancel out an original expense entry
   * This creates the opposite entries: Credit expense, Credit VAT Input, Debit Bank
   */
  static async createReversalJournalEntry(params: CreateExpenseJournalEntryParams): Promise<JournalEntryResult> {
    try {
      const {
        vendorId,
        categoryId,
        amount,
        vatAmount,
        totalAmount,
        currencyId,
        transactionDate,
        description,
        receiptNumber,
        isTaxable,
        paymentMethod = "BANK",
        createdById
      } = params;

      const expenseAccount = await this.getExpenseAccount(categoryId);
      const vatInputAccount = await this.getVATInputAccount();
      const creditAccount = await this.getCreditAccount(paymentMethod);

      // Create the reversal journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate,
          referenceNumber: this.generateReferenceNumber(),
          description: `REVERSAL: ${description}`,
          totalAmount: new Decimal(totalAmount),
          currencyId,
          status: "POSTED",
          createdById
        }
      });

      // Create reversal journal entry lines (opposite of original)
      const journalEntryLines: JournalEntryLine[] = [];

      // 1. Credit the expense account (opposite of debit)
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: expenseAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(amount),
            description: `REVERSAL - Expense: ${description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      // 2. If taxable, credit VAT Input account (opposite of debit)
      if (isTaxable && vatAmount > 0) {
        journalEntryLines.push(
          await prisma.journalEntryLine.create({
            data: {
              journalEntryId: journalEntry.id,
              chartOfAccountId: vatInputAccount.id,
              debitAmount: new Decimal(0),
              creditAmount: new Decimal(vatAmount),
              description: `REVERSAL - VAT Input: ${description}`,
              vatAmount: new Decimal(vatAmount)
            }
          })
        );
      }

      // 3. Debit the credit account (opposite of credit - Cash increases)
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: creditAccount.id,
            debitAmount: new Decimal(totalAmount),
            creditAmount: new Decimal(0),
            description: `REVERSAL - ${creditAccount.accountName}: ${description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      return {
        journalEntry,
        journalEntryLines
      };
    } catch (error) {
      console.error("Error creating reversal journal entry:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to create reversal journal entry. Please try again.");
    }
  }

  /**
   * Get the expense account based on the category
   */
  private static async getExpenseAccount(categoryId: string): Promise<ChartOfAccounts> {
    // For now, we'll use a default expense account
    // In the future, this could be mapped based on category
    const expenseAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        accountType: "EXPENSE",
        isActive: true
      }
    });

    if (!expenseAccount) {
      throw new Error("No active expense account found in chart of accounts");
    }

    return expenseAccount;
  }

  /**
   * Get the VAT Input account
   */
  private static async getVATInputAccount(): Promise<ChartOfAccounts> {
    const vatInputAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        accountName: {
          contains: "VAT Input"
        },
        isActive: true
      }
    });

    if (!vatInputAccount) {
      throw new Error("No VAT Input account found in chart of accounts");
    }

    return vatInputAccount;
  }

  /**
   * Get the appropriate credit account based on payment method
   */
  private static async getCreditAccount(paymentMethod: string): Promise<ChartOfAccounts> {
    switch (paymentMethod) {
      case "CASH":
        return await this.getCashAccount();
      case "BANK":
        return await this.getBankAccount();
      case "CREDIT":
        return await this.getAccountsPayableAccount();
      default:
        throw new Error(`Invalid payment method: ${paymentMethod}`);
    }
  }

  /**
   * Get the Cash Account
   */
  private static async getCashAccount(): Promise<ChartOfAccounts> {
    const cashAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        accountName: {
          contains: "Cash"
        },
        isActive: true
      }
    });

    if (!cashAccount) {
      throw new Error("No Cash Account found in chart of accounts");
    }

    return cashAccount;
  }

  /**
   * Get the Accounts Payable Account
   */
  private static async getAccountsPayableAccount(): Promise<ChartOfAccounts> {
    const accountsPayableAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        accountName: {
          contains: "Accounts Payable"
        },
        isActive: true
      }
    });

    if (!accountsPayableAccount) {
      throw new Error("No Accounts Payable Account found in chart of accounts");
    }

    return accountsPayableAccount;
  }

  /**
   * Get the Bank Account
   */
  private static async getBankAccount(): Promise<ChartOfAccounts> {
    const bankAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        accountName: {
          contains: "Bank Account"
        },
        isActive: true
      }
    });

    if (!bankAccount) {
      throw new Error("No Bank Account found in chart of accounts");
    }

    return bankAccount;
  }

  /**
   * Validate that a journal entry is balanced (debits = credits)
   */
  static validateJournalEntryBalance(journalEntryLines: JournalEntryLine[]): boolean {
    const totalDebits = journalEntryLines.reduce((sum, line) => sum + parseFloat(line.debitAmount.toString()), 0);
    const totalCredits = journalEntryLines.reduce((sum, line) => sum + parseFloat(line.creditAmount.toString()), 0);
    
    return Math.abs(totalDebits - totalCredits) < 0.01; // Allow for small rounding differences
  }

  /**
   * Get journal entry with its lines
   */
  static async getJournalEntryWithLines(journalEntryId: string): Promise<JournalEntryResult | null> {
    const journalEntry = await prisma.journalEntry.findUnique({
      where: { id: journalEntryId },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      }
    });

    if (!journalEntry) return null;

    return {
      journalEntry,
      journalEntryLines: journalEntry.journalEntryLines
    };
  }

  /**
   * Get all journal entries for a date range
   */
  static async getJournalEntriesByDateRange(startDate: Date, endDate: Date): Promise<JournalEntry[]> {
    return await prisma.journalEntry.findMany({
      where: {
        transactionDate: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        },
        currency: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: {
        transactionDate: 'desc'
      }
    });
  }
}

export default JournalEntryService; 