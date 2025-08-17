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

export interface CreateInvoiceJournalEntryParams {
  customerId: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  currencyId: string;
  transactionDate: Date;
  description: string;
  invoiceNumber?: string;
  isTaxable: boolean;
  createdById: string;
}

export interface CreateInvoicePaymentJournalEntryParams {
  invoiceId: string;
  amount: number;
  currencyId: string;
  transactionDate: Date;
  description: string;
  paymentMethod: string;
  createdById: string;
}

export interface CreateRevenueJournalEntryParams {
  sourceId: string;
  categoryId?: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  currencyId: string;
  transactionDate: Date;
  description: string;
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
          referenceNumber: JournalEntryService.generateReferenceNumber(),
          description: `Expense: ${description}`,
          totalAmount: new Decimal(totalAmount),
          currencyId,
          status: "PENDING", // Default to PENDING, must be posted manually
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
          referenceNumber: JournalEntryService.generateReferenceNumber(),
          description: `REVERSAL: ${description}`,
          totalAmount: new Decimal(totalAmount),
          currencyId,
          status: "PENDING", // Default to PENDING, must be posted manually
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
   * Create a reversal journal entry to cancel out an original revenue entry
   * This creates the opposite entries: Debit revenue, Debit VAT Output, Credit Bank
   */
  static async createReversalRevenueJournalEntry(params: CreateRevenueJournalEntryParams): Promise<JournalEntryResult> {
    try {
      const {
        sourceId,
        categoryId,
        amount,
        vatAmount,
        totalAmount,
        currencyId,
        transactionDate,
        description,
        isTaxable,
        paymentMethod = "BANK",
        createdById
      } = params;

      const revenueAccount = await this.getRevenueAccount(categoryId);
      const vatOutputAccount = await this.getVATOutputAccount();
      const debitAccount = await this.getDebitAccount(paymentMethod);

      // Create the reversal journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate,
          referenceNumber: JournalEntryService.generateReferenceNumber(),
          description: `REVERSAL: ${description}`,
          totalAmount: new Decimal(totalAmount),
          currencyId,
          status: "PENDING", // Default to PENDING, must be posted manually
          createdById
        }
      });

      // Create reversal journal entry lines (opposite of original)
      const journalEntryLines: JournalEntryLine[] = [];

      // 1. Debit the revenue account (opposite of credit)
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: revenueAccount.id,
            debitAmount: new Decimal(amount),
            creditAmount: new Decimal(0),
            description: `REVERSAL - Revenue: ${description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      // 2. If taxable, debit VAT Output account (opposite of credit)
      if (isTaxable && vatAmount > 0) {
        journalEntryLines.push(
          await prisma.journalEntryLine.create({
            data: {
              journalEntryId: journalEntry.id,
              chartOfAccountId: vatOutputAccount.id,
              debitAmount: new Decimal(vatAmount),
              creditAmount: new Decimal(0),
              description: `REVERSAL - VAT Output: ${description}`,
              vatAmount: new Decimal(vatAmount)
            }
          })
        );
      }

      // 3. Credit the debit account (opposite of debit - Cash decreases)
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: debitAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(totalAmount),
            description: `REVERSAL - ${debitAccount.accountName}: ${description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      return {
        journalEntry,
        journalEntryLines
      };
    } catch (error) {
      console.error("Error creating reversal revenue journal entry:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to create reversal revenue journal entry. Please try again.");
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
        accountType: "Expense",
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
   * Get the Bank Account (use Cash and Cash Equivalents since it includes bank balances)
   */
  private static async getBankAccount(): Promise<ChartOfAccounts> {
    const bankAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        accountName: {
          contains: "Cash and Cash Equivalents"
        },
        isActive: true
      }
    });

    if (!bankAccount) {
      throw new Error("No Cash and Cash Equivalents account found in chart of accounts");
    }

    return bankAccount;
  }

  /**
   * Get the Credit Card Receivable Account (use Accounts Receivable for credit payments)
   */
  private static async getCreditCardReceivableAccount(): Promise<ChartOfAccounts> {
    const creditCardAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        accountName: {
          contains: "Accounts Receivable"
        },
        isActive: true
      }
    });

    if (!creditCardAccount) {
      throw new Error("No Accounts Receivable account found in chart of accounts");
    }

    return creditCardAccount;
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

  /**
   * Post a journal entry (change status from PENDING to POSTED)
   */
  static async postJournalEntry(journalEntryId: string): Promise<JournalEntry> {
    try {
      // Get the journal entry with its lines
      const journalEntry = await prisma.journalEntry.findUnique({
        where: { id: journalEntryId },
        include: {
          journalEntryLines: true
        }
      });

      if (!journalEntry) {
        throw new Error("Journal entry not found");
      }

      if (journalEntry.status === "POSTED") {
        throw new Error("Journal entry is already posted");
      }

      if (journalEntry.status === "VOID") {
        throw new Error("Cannot post a voided journal entry");
      }

      // Validate that the journal entry is balanced
      if (!this.validateJournalEntryBalance(journalEntry.journalEntryLines)) {
        throw new Error("Journal entry is not balanced. Debits must equal credits.");
      }

      // Update the status to POSTED
      const updatedJournalEntry = await prisma.journalEntry.update({
        where: { id: journalEntryId },
        data: {
          status: "POSTED",
          updatedAt: new Date()
        }
      });

      return updatedJournalEntry;
    } catch (error) {
      console.error("Error posting journal entry:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to post journal entry. Please try again.");
    }
  }

  /**
   * Void a journal entry (change status to VOID)
   */
  static async voidJournalEntry(journalEntryId: string): Promise<JournalEntry> {
    try {
      const journalEntry = await prisma.journalEntry.findUnique({
        where: { id: journalEntryId }
      });

      if (!journalEntry) {
        throw new Error("Journal entry not found");
      }

      if (journalEntry.status === "VOID") {
        throw new Error("Journal entry is already voided");
      }

      // Update the status to VOID
      const updatedJournalEntry = await prisma.journalEntry.update({
        where: { id: journalEntryId },
        data: {
          status: "VOID",
          updatedAt: new Date()
        }
      });

      return updatedJournalEntry;
    } catch (error) {
      console.error("Error voiding journal entry:", error);
      if (error instanceof Error) throw error;
      throw new Error("Failed to void journal entry. Please try again.");
    }
  }

  /**
   * Create a journal entry for an invoice transaction
   */
  static async createInvoiceJournalEntry(params: CreateInvoiceJournalEntryParams): Promise<JournalEntryResult> {
    try {
      const {
        customerId,
        amount,
        vatAmount,
        totalAmount,
        currencyId,
        transactionDate,
        description,
        invoiceNumber,
        isTaxable,
        createdById
      } = params;

      const incomeAccount = await JournalEntryService.getIncomeAccount();
      const vatOutputAccount = await JournalEntryService.getVATOutputAccount();
      const debitAccount = await JournalEntryService.getAccountsReceivableAccount();

      // Create the journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate,
          referenceNumber: JournalEntryService.generateReferenceNumber(),
          description: `Invoice: ${description}`,
          totalAmount: new Decimal(totalAmount),
          currencyId,
          status: "PENDING", // Default to PENDING, must be posted manually
          createdById
        }
      });

      // Create journal entry lines for double-entry bookkeeping
      const journalEntryLines: JournalEntryLine[] = [];

      // 1. Debit Accounts Receivable
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: debitAccount.id,
            debitAmount: new Decimal(totalAmount),
            creditAmount: new Decimal(0),
            description: `Invoice: ${description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      // 2. Credit the income account
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: incomeAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(amount),
            description: `Invoice: ${description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      // 3. If taxable, credit VAT Output account
      if (isTaxable && vatAmount > 0) {
        journalEntryLines.push(
          await prisma.journalEntryLine.create({
            data: {
              journalEntryId: journalEntry.id,
              chartOfAccountId: vatOutputAccount.id,
              debitAmount: new Decimal(0),
              creditAmount: new Decimal(vatAmount),
              description: `VAT Output: ${description}`,
              vatAmount: new Decimal(vatAmount)
            }
          })
        );
      }

      return {
        journalEntry,
        journalEntryLines
      };
    } catch (error: any) {
      console.error("Error creating invoice journal entry:", error);
      throw error; // Return the actual error instead of wrapping it
    }
  }

  /**
   * Create a reversal journal entry for an invoice transaction
   */
  static async createReversalInvoiceJournalEntry(params: CreateInvoiceJournalEntryParams): Promise<JournalEntryResult> {
    try {
      const {
        customerId,
        amount,
        vatAmount,
        totalAmount,
        currencyId,
        transactionDate,
        description,
        invoiceNumber,
        isTaxable,
        createdById
      } = params;

      const incomeAccount = await JournalEntryService.getIncomeAccount();
      const vatOutputAccount = await JournalEntryService.getVATOutputAccount();
      const debitAccount = await JournalEntryService.getAccountsReceivableAccount();

      // Create the reversal journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate,
          referenceNumber: JournalEntryService.generateReferenceNumber(),
          description: `REVERSAL: Invoice ${invoiceNumber || description}`,
          totalAmount: new Decimal(totalAmount),
          currencyId,
          status: "PENDING",
          createdById
        }
      });

      // Create reversal journal entry lines (opposite of original)
      const journalEntryLines: JournalEntryLine[] = [];

      // 1. Credit Accounts Receivable (opposite of debit)
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: debitAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(totalAmount),
            description: `REVERSAL: Invoice ${invoiceNumber || description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      // 2. Debit the income account (opposite of credit)
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: incomeAccount.id,
            debitAmount: new Decimal(amount),
            creditAmount: new Decimal(0),
            description: `REVERSAL: Invoice ${invoiceNumber || description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      // 3. If taxable, debit VAT Output account (opposite of credit)
      if (isTaxable && vatAmount > 0) {
        journalEntryLines.push(
          await prisma.journalEntryLine.create({
            data: {
              journalEntryId: journalEntry.id,
              chartOfAccountId: vatOutputAccount.id,
              debitAmount: new Decimal(vatAmount),
              creditAmount: new Decimal(0),
              description: `REVERSAL: VAT Output ${invoiceNumber || description}`,
              vatAmount: new Decimal(vatAmount)
            }
          })
        );
      }

      return {
        journalEntry,
        journalEntryLines
      };
    } catch (error: any) {
      console.error("Error creating reversal invoice journal entry:", error);
      throw error; // Return the actual error instead of wrapping it
    }
  }

  /**
   * Create a payment journal entry for an invoice (when customer pays)
   * Dr Cash/Bank, Cr Accounts Receivable
   */
  static async createInvoicePaymentJournalEntry(params: CreateInvoicePaymentJournalEntryParams): Promise<JournalEntryResult> {
    try {
      const {
        invoiceId,
        amount,
        currencyId,
        transactionDate,
        description,
        paymentMethod,
        createdById
      } = params;

      // Get the appropriate debit account based on payment method
      let debitAccount: ChartOfAccounts;
      switch (paymentMethod) {
        case "CASH":
          debitAccount = await this.getCashAccount();
          break;
        case "BANK":
          debitAccount = await this.getBankAccount();
          break;
        case "CREDIT":
          debitAccount = await this.getCreditCardReceivableAccount();
          break;
        default:
          throw new Error(`Invalid payment method: ${paymentMethod}`);
      }

      const creditAccount = await JournalEntryService.getAccountsReceivableAccount();

      // Create the journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate,
          referenceNumber: JournalEntryService.generateReferenceNumber(),
          description: `Payment: ${description}`,
          totalAmount: new Decimal(amount),
          currencyId,
          status: "PENDING", // Default to PENDING, must be posted manually
          createdById
        }
      });

      // Create journal entry lines for double-entry bookkeeping
      const journalEntryLines: JournalEntryLine[] = [];

      // 1. Debit Cash/Bank/Credit Card Receivable account
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: debitAccount.id,
            debitAmount: new Decimal(amount),
            creditAmount: new Decimal(0),
            description: `Payment: ${description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      // 2. Credit Accounts Receivable
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: creditAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(amount),
            description: `Payment: ${description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      return {
        journalEntry,
        journalEntryLines
      };
    } catch (error: any) {
      console.error("Error creating invoice payment journal entry:", error);
      throw error; // Return the actual error instead of wrapping it
    }
  }

  /**
   * Get income account for invoice category
   */
  private static async getIncomeAccount(): Promise<ChartOfAccounts> {
    try {
      // Look for a Management Fees Income account first (as per requirements)
      let incomeAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          accountType: "Revenue",
          accountName: {
            contains: "Management Fees"
          },
          isActive: true
        }
      });

      // If no Management Fees account, get any Revenue account
      if (!incomeAccount) {
        incomeAccount = await prisma.chartOfAccounts.findFirst({
          where: {
            accountType: "Revenue",
            isActive: true
          }
        });
      }

      if (!incomeAccount) {
        throw new Error("No income/revenue account found in chart of accounts");
      }

      return incomeAccount;
    } catch (error: any) {
      console.error("Error getting income account:", error);
      throw error; // Return the actual error instead of wrapping it
    }
  }

  /**
   * Get VAT Output account
   */
  private static async getVATOutputAccount(): Promise<ChartOfAccounts> {
    try {
          const vatOutputAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        accountType: "Current Liability",
        accountName: {
          contains: "VAT Output"
        },
        isActive: true
      }
    });

      if (!vatOutputAccount) {
        throw new Error("VAT Output account not found in chart of accounts");
      }

      return vatOutputAccount;
    } catch (error: any) {
      console.error("Error getting VAT Output account:", error);
      throw error; // Return the actual error instead of wrapping it
    }
  }

  /**
   * Get Accounts Receivable account
   */
  private static async getAccountsReceivableAccount(): Promise<ChartOfAccounts> {
    try {
      const accountsReceivableAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          accountType: "Current Asset",
          accountName: {
            contains: "Accounts Receivable"
          },
          isActive: true
        }
      });

      if (!accountsReceivableAccount) {
        throw new Error("Accounts Receivable account not found in chart of accounts");
      }

      return accountsReceivableAccount;
    } catch (error: any) {
      console.error("Error getting Accounts Receivable account:", error);
      throw error; // Return the actual error instead of wrapping it
    }
  }

  /**
   * Create a journal entry for a revenue transaction
   * Dr Cash/Bank (payment method), Cr Revenue, Cr VAT Output (if taxable)
   */
  static async createRevenueJournalEntry(params: CreateRevenueJournalEntryParams): Promise<JournalEntryResult> {
    try {
      const {
        sourceId,
        categoryId,
        amount,
        vatAmount,
        totalAmount,
        currencyId,
        transactionDate,
        description,
        isTaxable,
        paymentMethod = "BANK",
        createdById
      } = params;

      const revenueAccount = await this.getRevenueAccount(categoryId || "");
      const vatOutputAccount = await this.getVATOutputAccount();
      const debitAccount = await this.getDebitAccount(paymentMethod);

      // Create the journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate,
          referenceNumber: JournalEntryService.generateReferenceNumber(),
          description: `Revenue: ${description}`,
          totalAmount: new Decimal(totalAmount),
          currencyId,
          status: "PENDING", // Default to PENDING, must be posted manually
          createdById
        }
      });

      // Create journal entry lines for double-entry bookkeeping
      const journalEntryLines: JournalEntryLine[] = [];

      // 1. Debit the cash/bank account (payment method)
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: debitAccount.id,
            debitAmount: new Decimal(totalAmount),
            creditAmount: new Decimal(0),
            description: `Revenue payment: ${description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      // 2. Credit the revenue account
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: revenueAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(amount),
            description: `Revenue: ${description}`,
            vatAmount: new Decimal(0)
          }
        })
      );

      // 3. Credit VAT Output account if taxable
      if (isTaxable && vatAmount > 0) {
        journalEntryLines.push(
          await prisma.journalEntryLine.create({
            data: {
              journalEntryId: journalEntry.id,
              chartOfAccountId: vatOutputAccount.id,
              debitAmount: new Decimal(0),
              creditAmount: new Decimal(vatAmount),
              description: `VAT Output: ${description}`,
              vatAmount: new Decimal(vatAmount)
            }
          })
        );
      }

      // Validate that the journal entry balances
      if (!this.validateJournalEntryBalance(journalEntryLines)) {
        throw new Error("Journal entry does not balance");
      }

      return {
        journalEntry,
        journalEntryLines
      };
    } catch (error: any) {
      console.error("Error creating revenue journal entry:", error);
      throw error;
    }
  }

  /**
   * Get revenue account for revenue category (categoryId is optional)
   */
  private static async getRevenueAccount(categoryId?: string): Promise<ChartOfAccounts> {
    try {
      // For now, use the same logic as getIncomeAccount since revenue categories
      // will map to revenue accounts in the chart of accounts
      let revenueAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          accountType: "Revenue",
          accountName: {
            contains: "Management Fees"
          },
          isActive: true
        }
      });

      // If no Management Fees account, get any Revenue account
      if (!revenueAccount) {
        revenueAccount = await prisma.chartOfAccounts.findFirst({
          where: {
            accountType: "Revenue",
            isActive: true
          }
        });
      }

      if (!revenueAccount) {
        throw new Error("No revenue account found in chart of accounts");
      }

      return revenueAccount;
    } catch (error: any) {
      console.error("Error getting revenue account:", error);
      throw error;
    }
  }

  /**
   * Get the appropriate debit account based on payment method
   */
  private static async getDebitAccount(paymentMethod: string): Promise<ChartOfAccounts> {
    switch (paymentMethod) {
      case "CASH":
        return await this.getCashAccount();
      case "BANK":
        return await this.getBankAccount();
      case "CREDIT":
        return await this.getAccountsReceivableAccount();
      default:
        throw new Error(`Invalid payment method: ${paymentMethod}`);
    }
  }
}

export default JournalEntryService; 