// @ts-nocheck
import { PrismaClient, JournalEntry, JournalEntryLine, ChartOfAccounts } from "@prisma/client";
import { prisma } from "../utils/database";
import VATService from "./VATService";
import { Decimal } from "@prisma/client/runtime/library";
import AuditService from "./AuditService";

export interface CreateExpenseJournalEntryParams {
  vendorId: string;
  categoryName: string; // Changed from categoryId to categoryName
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

export interface CreateManualJournalEntryParams {
  transactionDate: Date;
  referenceNumber: string;
  description: string;
  currencyId: string;
  journalEntryLines: Array<{
    chartOfAccountId: string;
    debitAmount: number;
    creditAmount: number;
    description: string;
  }>;
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
  vatAmount?: number; // VAT amount in payment currency
  totalAmount: number; // Total amount in payment currency
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

export interface CreateVendorPaymentJournalEntryParams {
  vendorId: string;
  invoiceId: string;
  invoiceNumber: string;
  paymentAmount: number;
  currencyId: string;
  transactionDate: Date;
  description: string;
  paymentMethod: "CASH" | "BANK";
  bankAccountId?: string; // Specific bank account (e.g., ZIG account)
  paymentReference?: string; // Bank transaction reference
  notes?: string;
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
   * Create a manual journal entry
   */
  static async createManualJournalEntry(params: CreateManualJournalEntryParams): Promise<JournalEntryResult> {
    try {
      const {
        transactionDate,
        referenceNumber,
        description,
        currencyId,
        journalEntryLines,
        createdById
      } = params;

      // Validate that debits equal credits
      const totalDebits = journalEntryLines.reduce((sum, line) => sum + line.debitAmount, 0);
      const totalCredits = journalEntryLines.reduce((sum, line) => sum + line.creditAmount, 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error("Total debits must equal total credits");
      }

      // Create the journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate,
          referenceNumber,
          description,
          totalAmount: new Decimal(totalDebits),
          currencyId,
          status: "PENDING",
          createdById
        }
      });

      // Create journal entry lines
      const createdLines = [];
      for (const line of journalEntryLines) {
        const journalEntryLine = await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: line.chartOfAccountId,
            debitAmount: new Decimal(line.debitAmount),
            creditAmount: new Decimal(line.creditAmount),
            description: line.description,
            createdAt: new Date()
          }
        });
        createdLines.push(journalEntryLine);
      }

      return {
        success: true,
        journalEntry,
        journalEntryLines: createdLines,
        message: "Manual journal entry created successfully"
      };
    } catch (error: any) {
      console.error("Error creating manual journal entry:", error);
      return {
        success: false,
        error: error.message || "Failed to create manual journal entry"
      };
    }
  }

  /**
   * Create a journal entry for an expense transaction
   */
  static async createExpenseJournalEntry(params: CreateExpenseJournalEntryParams): Promise<JournalEntryResult> {
    try {
      const {
        vendorId,
        categoryName,
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

      const expenseAccount = await this.getExpenseAccount(categoryName);
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

      // Audit: CREATE JournalEntry (Expense)
      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "JournalEntry",
        entityId: journalEntry.id,
        newValues: journalEntry,
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
   * Create a journal entry for vendor payment (Procurement Module)
   * This clears the Accounts Payable liability and reduces cash/bank balance
   * 
   * Journal Entry:
   *   Dr  Accounts Payable         $XXX
   *       Cr  Cash/Bank Account     $XXX
   */
  static async createVendorPaymentJournalEntry(params: CreateVendorPaymentJournalEntryParams): Promise<JournalEntryResult> {
    try {
      const {
        vendorId,
        invoiceId,
        invoiceNumber,
        paymentAmount,
        currencyId,
        transactionDate,
        description,
        paymentMethod,
        bankAccountId,
        paymentReference,
        notes,
        createdById
      } = params;

      console.log("\n╔════════════════════════════════════════════════════════════════╗");
      console.log("║  VENDOR PAYMENT JOURNAL ENTRY - CREATION STARTED               ║");
      console.log("╚════════════════════════════════════════════════════════════════╝");
      console.log(`📝 Invoice Number: ${invoiceNumber}`);
      console.log(`💰 Payment Amount: $${paymentAmount.toFixed(2)}`);
      console.log(`💳 Payment Method: ${paymentMethod}`);
      console.log(`📅 Transaction Date: ${transactionDate.toISOString().split('T')[0]}`);
      if (paymentReference) {
        console.log(`🔖 Payment Reference: ${paymentReference}`);
      }
      if (bankAccountId) {
        console.log(`🏦 Bank Account ID: ${bankAccountId}`);
      }
      console.log("");

      // Get Accounts Payable account
      console.log("🔍 Step 1: Retrieving Accounts Payable account...");
      const accountsPayableAccount = await this.getAccountsPayableAccount();
      console.log(`✅ Found: ${accountsPayableAccount.accountNo} - ${accountsPayableAccount.accountName}`);

      // Get the appropriate cash/bank account based on payment method
      console.log(`\n🔍 Step 2: Retrieving ${paymentMethod} account...`);
      let paymentAccount: ChartOfAccounts;
      
      if (bankAccountId) {
        // Use specific bank account if provided (e.g., ZIG account)
        const specificAccount = await prisma.chartOfAccounts.findUnique({
          where: { id: bankAccountId }
        });
        
        if (!specificAccount) {
          console.error(`❌ ERROR: Bank account with ID ${bankAccountId} not found`);
          throw new Error(`Bank account with ID ${bankAccountId} not found`);
        }
        
        paymentAccount = specificAccount;
        console.log(`✅ Using Specific Account: ${paymentAccount.accountNo} - ${paymentAccount.accountName}`);
      } else {
        // Use default based on payment method
        if (paymentMethod === "CASH") {
          paymentAccount = await this.getCashAccount();
        } else {
          paymentAccount = await this.getBankAccount();
        }
        console.log(`✅ Using Default Account: ${paymentAccount.accountNo} - ${paymentAccount.accountName}`);
      }

      console.log("\n📋 Step 3: Creating Journal Entry Header...");
      const referenceNumber = `VENDOR-PAY-${invoiceNumber}`;
      console.log(`   Reference: ${referenceNumber}`);
      console.log(`   Status: POSTED (immediately posted)`);
      
      // Create the journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate,
          referenceNumber,
          description: description || `Payment to vendor for invoice ${invoiceNumber}`,
          totalAmount: new Decimal(paymentAmount),
          currencyId,
          status: "POSTED", // Payment entries are immediately posted
          createdById
        }
      });
      console.log(`✅ Journal Entry Created: ID = ${journalEntry.id}`);

      // Audit: CREATE JournalEntry (Vendor Payment)
      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "JournalEntry",
        entityId: journalEntry.id,
        newValues: {
          ...journalEntry,
          invoiceId,
          vendorId,
          paymentReference,
          notes
        },
      });

      // Create journal entry lines for double-entry bookkeeping
      console.log("\n📊 Step 4: Creating Journal Entry Lines (Double-Entry)...");
      console.log("────────────────────────────────────────────────────────────────");
      const journalEntryLines: JournalEntryLine[] = [];

      // 1. Debit Accounts Payable (clear the liability)
      console.log(`\n   Line 1: DEBIT`);
      console.log(`   Account: ${accountsPayableAccount.accountNo} - ${accountsPayableAccount.accountName}`);
      console.log(`   Amount: $${paymentAmount.toFixed(2)}`);
      console.log(`   Effect: Clears vendor liability (reduces amount owed)`);
      
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: accountsPayableAccount.id,
            debitAmount: new Decimal(paymentAmount),
            creditAmount: new Decimal(0),
            description: `Clear liability: ${description || invoiceNumber}`,
            vatAmount: new Decimal(0)
          }
        })
      );
      console.log(`   ✅ Debit line created`);

      // 2. Credit Cash/Bank Account (reduce cash balance)
      console.log(`\n   Line 2: CREDIT`);
      console.log(`   Account: ${paymentAccount.accountNo} - ${paymentAccount.accountName}`);
      console.log(`   Amount: $${paymentAmount.toFixed(2)}`);
      console.log(`   Effect: Reduces cash/bank balance (money leaves account)`);
      
      journalEntryLines.push(
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: paymentAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(paymentAmount),
            description: `Payment via ${paymentAccount.accountName}${paymentReference ? ` - Ref: ${paymentReference}` : ''}`,
            vatAmount: new Decimal(0)
          }
        })
      );
      console.log(`   ✅ Credit line created`);

      // Verify balance
      console.log("\n⚖️  Step 5: Verifying Double-Entry Balance...");
      const totalDebits = journalEntryLines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
      const totalCredits = journalEntryLines.reduce((sum, line) => sum + Number(line.creditAmount), 0);
      const difference = Math.abs(totalDebits - totalCredits);

      console.log(`   Total Debits:  $${totalDebits.toFixed(2)}`);
      console.log(`   Total Credits: $${totalCredits.toFixed(2)}`);
      console.log(`   Difference:    $${difference.toFixed(2)}`);

      if (difference > 0.01) {
        console.error(`   ❌ ERROR: Entry is UNBALANCED!`);
        throw new Error(`Journal entry is unbalanced! Debits: ${totalDebits}, Credits: ${totalCredits}`);
      }
      console.log(`   ✅ Entry is BALANCED!`);

      console.log("\n╔════════════════════════════════════════════════════════════════╗");
      console.log("║  VENDOR PAYMENT JOURNAL ENTRY - CREATED SUCCESSFULLY           ║");
      console.log("╚════════════════════════════════════════════════════════════════╝");
      console.log(`📌 Reference Number: ${journalEntry.referenceNumber}`);
      console.log(`💰 Total Amount: $${paymentAmount.toFixed(2)}`);
      console.log(`📊 Status: POSTED`);
      console.log(`🆔 Journal Entry ID: ${journalEntry.id}`);
      console.log("");

      return {
        journalEntry,
        journalEntryLines
      };
    } catch (error) {
      console.error("\n╔════════════════════════════════════════════════════════════════╗");
      console.error("║  ❌ ERROR CREATING VENDOR PAYMENT JOURNAL ENTRY                ║");
      console.error("╚════════════════════════════════════════════════════════════════╝");
      console.error("Error details:", error);
      console.error("");
      if (error instanceof Error) throw error;
      throw new Error("Failed to create vendor payment journal entry. Please try again.");
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
        categoryName,
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

      const expenseAccount = await this.getExpenseAccount(categoryName);
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
   * Get the expense account based on the category name
   * Maps expense categories to specific chart of accounts for proper journal entries
   */
  private static async getExpenseAccount(categoryName: string): Promise<ChartOfAccounts> {
    // Hardcoded mapping of expense categories to chart of accounts
    // Updated to match actual chart of accounts
    const categoryAccountMapping: { [key: string]: string } = {
      "Salaries and Wages": "5030",        // Account 5030: Salaries and Wages
      "Travel and Accommodation": "5070",  // Account 5070: Travel Expense
      "Operations": "5090",                 // Account 5090: Other Operating Expenses
      "Branding and Marketing": "5060",     // Account 5060: Marketing Expense
      "Office Equipment": "1100"            // Account 1100: Office Equipment (Fixed Asset)
    };

    // Get the account number for this category
    const accountNumber = categoryAccountMapping[categoryName];
    
    if (!accountNumber) {
      // Fallback to default expense account if category not mapped
      console.warn(`No specific account mapping for category: ${categoryName}. Using default expense account.`);
      const defaultExpenseAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          accountType: "Expense",
          isActive: true
        }
      });

      if (!defaultExpenseAccount) {
        throw new Error("No active expense account found in chart of accounts");
      }

      return defaultExpenseAccount;
    }

    // Find the specific account for this category
    const expenseAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        accountNo: accountNumber,
        accountType: "Expense",
        isActive: true
      }
    });

    if (!expenseAccount) {
      throw new Error(`Expense account ${accountNumber} not found in chart of accounts`);
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
   * Include transaction paymentMethod and attach it to each line
   */
  static async getJournalEntryWithLines(journalEntryId: string): Promise<JournalEntryResult | null> {
    const journalEntry = await prisma.journalEntry.findUnique({
      where: { id: journalEntryId },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: {
              select: {
                id: true,
                accountNo: true,
                accountName: true,
                accountType: true
              }
            }
          }
        },
        // Include related transactions to infer payment method
        expenses: { select: { paymentMethod: true } },
        revenues: { select: { paymentMethod: true } },
        invoices: { select: { paymentMethod: true } }
      }
    });

    if (!journalEntry) return null;

    const paymentMethod =
      (journalEntry.expenses?.[0]?.paymentMethod) ||
      (journalEntry.revenues?.[0]?.paymentMethod) ||
      (journalEntry.invoices?.[0]?.paymentMethod) ||
      null;

    const journalEntryLines = journalEntry.journalEntryLines.map((line: any) => ({
      ...line,
      paymentMethod
    }));

    return {
      journalEntry: { ...journalEntry, paymentMethod },
      journalEntryLines
    } as any;
  }

  /**
   * Get all journal entries for a date range
   * Include paymentMethod from related transaction and surface it on each line
   * @param startDate - Start date for filtering
   * @param endDate - End date for filtering
   * @param status - Optional status filter (defaults to 'POSTED' only)
   */
  static async getJournalEntriesByDateRange(startDate: Date, endDate: Date, status?: 'POSTED' | 'PENDING' | 'VOID' | 'ALL' | 'POSTED_AND_PENDING'): Promise<any[]> {
    const whereClause: any = {
      transactionDate: {
        gte: startDate,
        lte: endDate
      }
    };

    // Handle different status filters
    if (!status || status === 'POSTED') {
      whereClause.status = 'POSTED';
    } else if (status === 'POSTED_AND_PENDING') {
      whereClause.status = {
        in: ['POSTED', 'PENDING']
      };
    } else if (status !== 'ALL') {
      whereClause.status = status;
    }
    // If status is 'ALL', don't add status filter

    const entries = await prisma.journalEntry.findMany({
      where: whereClause,
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: {
              select: {
                id: true,
                accountNo: true,
                accountName: true,
                accountType: true
              }
            }
          }
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        // Include related transactions to infer payment method
        expenses: { select: { paymentMethod: true } },
        revenues: { select: { paymentMethod: true } },
        invoices: { select: { paymentMethod: true } }
      },
      orderBy: {
        transactionDate: 'desc'
      }
    });

    // Attach paymentMethod to each line for each entry
    return entries.map((entry: any) => {
      const paymentMethod =
        (entry.expenses?.[0]?.paymentMethod) ||
        (entry.revenues?.[0]?.paymentMethod) ||
        (entry.invoices?.[0]?.paymentMethod) ||
        null;

      return {
        ...entry,
        paymentMethod,
        journalEntryLines: entry.journalEntryLines.map((line: any) => ({
          ...line,
          paymentMethod
        }))
      };
    });
  }

  /**
   * Post a journal entry (change status from PENDING to POSTED)
   */
  static async postJournalEntry(journalEntryId: string, performedById?: string): Promise<JournalEntry> {
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

      // Audit: POST journal entry
      await AuditService.log({
        userId: performedById ?? journalEntry.createdById,
        action: "POST",
        entityType: "JournalEntry",
        entityId: journalEntryId,
        oldValues: journalEntry,
        newValues: updatedJournalEntry,
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
  static async voidJournalEntry(journalEntryId: string, performedById?: string): Promise<JournalEntry> {
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

      // Audit: VOID journal entry
      await AuditService.log({
        userId: performedById ?? journalEntry.createdById,
        action: "VOID",
        entityType: "JournalEntry",
        entityId: journalEntryId,
        oldValues: journalEntry,
        newValues: updatedJournalEntry,
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

      // Audit: CREATE JournalEntry (Invoice)
      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "JournalEntry",
        entityId: journalEntry.id,
        newValues: journalEntry,
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
        vatAmount = 0,
        totalAmount,
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
          totalAmount: new Decimal(totalAmount),
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
            debitAmount: new Decimal(totalAmount),
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
            creditAmount: new Decimal(totalAmount),
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

      // Audit: CREATE JournalEntry (Revenue)
      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "JournalEntry",
        entityId: journalEntry.id,
        newValues: journalEntry,
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