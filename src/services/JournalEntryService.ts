// @ts-nocheck
import { PrismaClient, Prisma, JournalEntry, JournalEntryLine, ChartOfAccounts } from "@prisma/client";
import { prisma } from "../utils/database";
import {
  prismaCashbookEntrySnapshotSelect,
  prismaExpenseSnapshotSelect,
  prismaInvoiceSnapshotSelect,
  prismaPurchaseInvoiceSnapshotSelect,
  prismaRevenueSnapshotSelect
} from "../config/accountingSnapshotResponseSelect";
import VATService from "./VATService";
import { Decimal } from "@prisma/client/runtime/library";
import AuditService from "./AuditService";
import {
  assignNextAuditIdAndCreateJournal,
  createJournalEntryWithAuditSequence,
} from "./AuditTrailSequenceService";
import {
  computeManualJournalZigEquivalence,
  hasMixedRecordedCurrencies,
  zigTotalsBalanced,
  type ZigLineBreakdown,
} from "../utils/manualJournalZigEquivalence";
import PeriodLockService from "./PeriodLockService";
import { userHasEffectivePermission, isModulePrivilegedUser } from "../config/cfoModulePermissions";

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
    /** When set, amounts on this line are in this currency (multi-currency manual journals). */
    currencyId?: string;
  }>;
  createdById: string;
  /** Marks this journal as a Group Consolidation elimination entry (see ConsolidatedReportService.getConsolidationSummary). Manual tagging only — no automated matching engine exists. */
  isEliminationEntry?: boolean;
  /** Optional: for system audit log (user and IP) */
  ipAddress?: string | null;
  userAgent?: string | null;
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
  /** When set, skips Zimrate in Prisma middleware for this journal entry create. */
  usdZwgRateSnapshot?: number;
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
  /** When set, Dr this bank’s GL (must match currencyId). Otherwise first active bank in that currency. */
  paymentBankId?: string;
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
  /** Dr this bank’s GL for cash/bank sales (must match currencyId). */
  paymentBankId?: string;
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

/** Balanced JE line summary for APIs (same currency on all lines — no implicit USD/ZWL 1:1). */
export type DoubleEntryLineSummary = {
  accountNo: string;
  accountName: string;
  side: "DR" | "CR";
  amount: number;
  currencyCode: string;
};

/** Thrown when the API refuses to change amounts or lines on a posted (or voided) journal — use a reversing entry instead. */
export class JournalEntryImmutableError extends Error {
  constructor() {
    super(
      "Posted and voided journal entries cannot be modified. Create a new reversing journal entry to correct amounts; the audit trail is preserved."
    );
    this.name = "JournalEntryImmutableError";
  }
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

  private static async validateManualJournalEconomics(
    currencyId: string,
    journalEntryLines: CreateManualJournalEntryParams["journalEntryLines"]
  ): Promise<{
    totalAmountForHeader: Decimal;
    zigEquivalence?: { zigDebitTotal: string; zigCreditTotal: string; lines: ZigLineBreakdown[] };
  }> {
    const totalDebits = journalEntryLines.reduce((sum, line) => sum + line.debitAmount, 0);
    const totalCredits = journalEntryLines.reduce((sum, line) => sum + line.creditAmount, 0);

    const currencyIds = [
      ...new Set(
        [currencyId, ...journalEntryLines.map((l) => l.currencyId).filter(Boolean) as string[]]
      ),
    ];
    const currencies = await prisma.currency.findMany({
      where: { id: { in: currencyIds } },
      select: { id: true, code: true },
    });
    const idToCode = new Map(currencies.map((c) => [c.id, c.code]));

    if (!idToCode.has(currencyId)) {
      throw new Error("Invalid journal currencyId");
    }
    for (const line of journalEntryLines) {
      if (line.currencyId && !idToCode.has(line.currencyId)) {
        throw new Error(`Invalid journal line currencyId: ${line.currencyId}`);
      }
    }

    const mixed = hasMixedRecordedCurrencies(currencyId, journalEntryLines, idToCode);
    let zigEquivalence:
      | { zigDebitTotal: string; zigCreditTotal: string; lines: ZigLineBreakdown[] }
      | undefined;

    if (mixed) {
      const zig = await computeManualJournalZigEquivalence(
        prisma,
        currencyId,
        journalEntryLines,
        idToCode
      );
      if (!zigTotalsBalanced(zig.zigDebitTotal, zig.zigCreditTotal)) {
        throw new Error(
          `ZiG debits and credits must balance (tolerance 0.05). ZiG DR ${zig.zigDebitTotal.toFixed(3)} vs CR ${zig.zigCreditTotal.toFixed(3)}`
        );
      }
      zigEquivalence = {
        zigDebitTotal: zig.zigDebitTotal.toFixed(3),
        zigCreditTotal: zig.zigCreditTotal.toFixed(3),
        lines: zig.lines,
      };
    } else if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new Error("Total debits must equal total credits");
    }

    const totalAmountForHeader = mixed
      ? (zigEquivalence ? new Decimal(zigEquivalence.zigDebitTotal) : new Decimal(0))
      : new Decimal(totalDebits);

    return { totalAmountForHeader, zigEquivalence };
  }

  private static async assertNoPostingToReportingBuckets(
    chartOfAccountIds: string[],
    context: string
  ): Promise<void> {
    const ids = [...new Set(chartOfAccountIds.filter(Boolean))];
    if (ids.length === 0) return;
    const accounts = await prisma.chartOfAccounts.findMany({
      where: { id: { in: ids } },
      select: { id: true, accountNo: true, accountName: true },
    });
    const bad = accounts.filter((a) => a.accountNo === "1000");
    if (bad.length > 0) {
      const a = bad[0];
      throw new Error(
        `${context}: ${a.accountNo} ${a.accountName} is a reporting bucket and cannot be used as a posting account. Select a specific bank/cash GL instead.`
      );
    }
  }

  /**
   * Replace header and lines of a **PENDING** manual journal only.
   * Posted/voided journals throw {@link JournalEntryImmutableError} (ledger immutability).
   */
  static async updatePendingJournalEntry(
    journalEntryId: string,
    params: CreateManualJournalEntryParams,
    performedById?: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<{
    success: true;
    journalEntry: JournalEntry;
    journalEntryLines: JournalEntryLine[];
    zigEquivalence?: { zigDebitTotal: string; zigCreditTotal: string; lines: ZigLineBreakdown[] };
  }> {
    const existing = await prisma.journalEntry.findUnique({
      where: { id: journalEntryId },
      include: { journalEntryLines: true },
    });

    if (!existing) {
      throw new Error("Journal entry not found");
    }
    if (existing.status === "POSTED" || existing.status === "VOID") {
      throw new JournalEntryImmutableError();
    }
    if (existing.status !== "PENDING") {
      throw new Error(`Cannot update journal entry with status ${existing.status}`);
    }

    const {
      transactionDate,
      referenceNumber,
      description,
      currencyId,
      journalEntryLines,
      createdById,
    } = params;

    await this.assertNoPostingToReportingBuckets(
      journalEntryLines.map((l) => l.chartOfAccountId),
      "Manual journal update rejected"
    );

    if (referenceNumber !== existing.referenceNumber) {
      const clash = await prisma.journalEntry.findUnique({ where: { referenceNumber } });
      if (clash && clash.id !== journalEntryId) {
        throw new Error("Reference number already in use");
      }
    }

    const { totalAmountForHeader, zigEquivalence } = await this.validateManualJournalEconomics(
      currencyId,
      journalEntryLines
    );

    const beforeSnapshot = {
      journalEntry: existing,
      journalEntryLines: existing.journalEntryLines,
    };

    const result = await prisma.$transaction(
      async (tx) => {
        await tx.journalEntryLine.deleteMany({ where: { journalEntryId } });
        const journalEntry = await tx.journalEntry.update({
          where: { id: journalEntryId },
          data: {
            transactionDate,
            referenceNumber,
            description,
            totalAmount: totalAmountForHeader,
            currencyId,
            updatedAt: new Date(),
          },
        });
        const createdLines: JournalEntryLine[] = [];
        for (const line of journalEntryLines) {
          const journalEntryLine = await tx.journalEntryLine.create({
            data: {
              journalEntryId,
              chartOfAccountId: line.chartOfAccountId,
              debitAmount: new Decimal(line.debitAmount),
              creditAmount: new Decimal(line.creditAmount),
              description: line.description,
              createdAt: new Date(),
            },
          });
          createdLines.push(journalEntryLine);
        }
        return { journalEntry, journalEntryLines: createdLines };
      },
      { maxWait: 60_000, timeout: 60_000 }
    );

    for (let i = 0; i < journalEntryLines.length; i++) {
      const line = journalEntryLines[i];
      const row = result.journalEntryLines[i];
      if (line.currencyId && row?.id) {
        await prisma.$executeRaw`
          UPDATE journal_entry_lines
          SET recorded_currency_id = ${line.currencyId}
          WHERE id = ${row.id}
        `;
      }
    }

    const finalLines = result.journalEntryLines.map((row, i) => ({
      ...row,
      recordedCurrencyId: journalEntryLines[i].currencyId ?? null,
    })) as JournalEntryLine[];

    await AuditService.log({
      userId: performedById ?? createdById,
      action: "UPDATE",
      entityType: "JournalEntry",
      entityId: journalEntryId,
      oldValues: beforeSnapshot,
      newValues: { journalEntry: result.journalEntry, journalEntryLines: finalLines },
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    });

    return {
      success: true,
      journalEntry: result.journalEntry,
      journalEntryLines: finalLines,
      ...(zigEquivalence ? { zigEquivalence } : {}),
    };
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
        createdById,
        isEliminationEntry,
        ipAddress,
        userAgent,
      } = params;

      await this.assertNoPostingToReportingBuckets(
        journalEntryLines.map((l) => l.chartOfAccountId),
        "Manual journal rejected"
      );

      const { totalAmountForHeader, zigEquivalence } = await this.validateManualJournalEconomics(
        currencyId,
        journalEntryLines
      );

      const result = await prisma.$transaction(
        async (tx) => {
        const journalEntry = await assignNextAuditIdAndCreateJournal(tx as Prisma.TransactionClient, {
          transactionDate,
          referenceNumber,
          description,
          totalAmount: totalAmountForHeader,
          currencyId,
          status: "PENDING",
          createdById,
          ...(isEliminationEntry ? { isEliminationEntry: true } : {}),
        });

        const createdLines = [];
        for (const line of journalEntryLines) {
          const journalEntryLine = await tx.journalEntryLine.create({
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
        return { journalEntry, journalEntryLines: createdLines };
      },
        { maxWait: 60_000, timeout: 60_000 }
      );

      for (let i = 0; i < journalEntryLines.length; i++) {
        const line = journalEntryLines[i];
        const row = result.journalEntryLines[i];
        if (line.currencyId && row?.id) {
          await prisma.$executeRaw`
            UPDATE journal_entry_lines
            SET recorded_currency_id = ${line.currencyId}
            WHERE id = ${row.id}
          `;
        }
      }
      const createdLines = result.journalEntryLines.map((row, i) => ({
        ...row,
        recordedCurrencyId: journalEntryLines[i].currencyId ?? null,
      })) as any[];

      const { journalEntry } = result;

      // System audit log: CREATE with user and IP when provided
      await AuditService.log({
        userId: createdById,
        action: "CREATE",
        entityType: "JournalEntry",
        entityId: journalEntry.id,
        newValues: {
          id: journalEntry.id,
          referenceNumber: journalEntry.referenceNumber,
          description: journalEntry.description,
          createdById: journalEntry.createdById
        },
        ipAddress: ipAddress ?? undefined,
        userAgent: userAgent ?? undefined,
      });

      return {
        success: true,
        journalEntry,
        journalEntryLines: createdLines,
        message: "Manual journal entry created successfully",
        ...(zigEquivalence ? { zigEquivalence } : {}),
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

      // Generate unique reference number with timestamp and receipt number
      const timestamp = Date.now();
      const receiptSuffix = receiptNumber ? `-${receiptNumber.substring(0, 20)}` : '';
      const referenceNumber = `EXP-${timestamp}${receiptSuffix}`;
      
      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate,
        referenceNumber: referenceNumber,
        description: `Expense: ${description}`,
        totalAmount: new Decimal(totalAmount),
        currencyId,
        status: "PENDING",
        createdById
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
      // Generate unique reference number with timestamp to avoid conflicts
      const timestamp = Date.now();
      const invoiceSuffix = invoiceNumber ? `-${invoiceNumber.substring(0, 20)}` : '';
      const referenceNumber = `VENDOR-PAY-${timestamp}${invoiceSuffix}`;
      console.log(`   Reference: ${referenceNumber}`);
      console.log(`   Status: POSTED (immediately posted)`);
      
      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate,
        referenceNumber,
        description: description || `Payment to vendor for invoice ${invoiceNumber}`,
        totalAmount: new Decimal(paymentAmount),
        currencyId,
        status: "POSTED",
        createdById
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

      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate,
        referenceNumber: JournalEntryService.generateReferenceNumber(),
        description: `REVERSAL: ${description}`,
        totalAmount: new Decimal(totalAmount),
        currencyId,
        status: "PENDING",
        createdById
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
        createdById,
        paymentBankId,
      } = params;

      const revenueAccount = await this.getRevenueAccount(categoryId);
      const vatOutputAccount = await this.getVATOutputAccount();
      const debitAccount = await this.resolveProceedsDebitAccount(
        paymentMethod,
        currencyId,
        paymentBankId
      );

      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate,
        referenceNumber: JournalEntryService.generateReferenceNumber(),
        description: `REVERSAL: ${description}`,
        totalAmount: new Decimal(totalAmount),
        currencyId,
        status: "PENDING",
        createdById
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
            vatAmount: new Decimal(0),
            recordedCurrencyId: currencyId,
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
              vatAmount: new Decimal(vatAmount),
              recordedCurrencyId: currencyId,
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
            vatAmount: new Decimal(0),
            recordedCurrencyId: currencyId,
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
      "Marketing": "5060",                  // Account 5060: Marketing Expense (alias)
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
    // Prefer explicit petty cash / cash-on-hand accounts and NEVER auto-select 1000 (reporting bucket).
    const cashAccount =
      (await prisma.chartOfAccounts.findFirst({
        where: { accountNo: { in: ["1010", "1030", "CASH-001"] }, isActive: true },
        orderBy: { accountNo: "asc" },
      })) ??
      (await prisma.chartOfAccounts.findFirst({
        where: {
          isActive: true,
          accountNo: { not: "1000" },
          OR: [{ accountName: { contains: "Petty" } }, { accountName: { contains: "Cash" } }],
        },
        orderBy: { accountNo: "asc" },
      }));

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
   * Get a Bank posting account (bank-linked GL if available; never use 1000 reporting bucket).
   */
  private static async getBankAccount(): Promise<ChartOfAccounts> {
    const bank = await prisma.bank.findFirst({
      where: { isActive: true, glAccountId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { glAccountId: true },
    });
    if (bank?.glAccountId) {
      const coa = await prisma.chartOfAccounts.findUnique({ where: { id: bank.glAccountId } });
      if (coa) return coa;
    }

    const fallback = await prisma.chartOfAccounts.findFirst({
      where: {
        accountNo: { not: "1000" },
        OR: [
          { accountNo: "1100" },
          { accountName: { contains: "Bank" } },
          { accountName: { contains: "Cash" } }
        ],
        isActive: true,
      },
      orderBy: { accountNo: "asc" },
    });
    if (!fallback) {
      throw new Error("No bank/cash account found in chart of accounts (and no active bank.glAccountId set).");
    }
    return fallback;
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

    return Math.abs(totalDebits - totalCredits) < 0.0001; // Sub-cent OK when lines use DECIMAL(15,3)
  }

  /** API-friendly balanced lines (one currency code for the whole entry). */
  static async summarizeDoubleEntryLines(
    result: JournalEntryResult,
    currencyCode: string
  ): Promise<DoubleEntryLineSummary[]> {
    const ids = [...new Set(result.journalEntryLines.map((l) => l.chartOfAccountId))];
    if (ids.length === 0) return [];
    const accounts = await prisma.chartOfAccounts.findMany({ where: { id: { in: ids } } });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return result.journalEntryLines.map((l) => {
      const coa = byId.get(l.chartOfAccountId);
      const dr = Number(l.debitAmount);
      const cr = Number(l.creditAmount);
      return {
        accountNo: coa?.accountNo ?? "",
        accountName: coa?.accountName ?? "",
        side: dr > 0.0001 ? "DR" : "CR",
        amount: dr > 0.0001 ? dr : cr,
        currencyCode,
      };
    });
  }

  /**
   * Cash/bank receipt GL in the same currency as the sale (avoids debiting a USD GL for a ZWL/ZWG amount).
   */
  private static async resolveProceedsDebitAccount(
    paymentMethod: string,
    currencyId: string,
    paymentBankId?: string
  ): Promise<ChartOfAccounts> {
    if (paymentMethod === "CREDIT") {
      return await this.getAccountsReceivableAccount();
    }

    if (paymentBankId) {
      const bank = await prisma.bank.findUnique({
        where: { id: paymentBankId },
        include: { glAccount: true },
      });
      if (!bank?.glAccount) {
        throw new Error("paymentBankId: bank not found or has no GL account linked.");
      }
      if (bank.currencyId !== currencyId) {
        const exp = await prisma.currency.findUnique({
          where: { id: currencyId },
          select: { code: true },
        });
        throw new Error(
          `paymentBankId: bank currency must match transaction currency (${exp?.code ?? currencyId}).`
        );
      }
      return bank.glAccount;
    }

    const baseWhere = {
      isActive: true,
      currencyId,
      glAccountId: { not: null },
    };

    if (paymentMethod === "CASH") {
      const petty = await prisma.bank.findFirst({
        where: {
          ...baseWhere,
          OR: [
            { name: { contains: "Petty" } },
            { name: { contains: "petty" } },
            { name: { contains: "Cash" } },
            { name: { contains: "cash" } },
          ],
        },
        include: { glAccount: true },
        orderBy: { name: "asc" },
      });
      if (petty?.glAccount) return petty.glAccount;
    }

    const anyBank = await prisma.bank.findFirst({
      where: baseWhere,
      include: { glAccount: true },
      orderBy: { name: "asc" },
    });
    if (anyBank?.glAccount) return anyBank.glAccount;

    const cur = await prisma.currency.findUnique({
      where: { id: currencyId },
      select: { code: true },
    });
    throw new Error(
      `No bank with GL in currency ${cur?.code ?? currencyId}. ` +
        `Configure a bank in this currency (or pass paymentBankId) so the cash/bank debit matches the sale — not a default chart account in another currency.`
    );
  }

  /**
   * Get journal entry with its lines
   * Include transaction paymentMethod and attach it to each line
   */
  static async getJournalEntryWithLines(journalEntryId: string): Promise<JournalEntryResult | null> {
    const journalEntry = await prisma.journalEntry.findUnique({
      where: { id: journalEntryId },
      include: {
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
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
        // Include related transactions with full details
        expenses: {
          select: {
            id: true,
            receiptNumber: true,
            amount: true,
            vatAmount: true,
            totalAmount: true,
            description: true,
            transactionDate: true,
            status: true,
            paymentMethod: true,
            isTaxable: true,
            ...prismaExpenseSnapshotSelect,
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
          }
        },
        revenues: {
          select: {
            id: true,
            amount: true,
            vatAmount: true,
            totalAmount: true,
            description: true,
            transactionDate: true,
            status: true,
            paymentMethod: true,
            isTaxable: true,
            ...prismaRevenueSnapshotSelect,
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
          }
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            amount: true,
            vatAmount: true,
            totalAmount: true,
            description: true,
            transactionDate: true,
            status: true,
            isTaxable: true,
            paymentMethod: true,
            ...prismaInvoiceSnapshotSelect,
            customer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        cashbookEntries: {
          select: {
            id: true,
            type: true,
            amount: true,
            description: true,
            reference: true,
            transactionDate: true,
            status: true,
            reversedAt: true,
            ...prismaCashbookEntrySnapshotSelect,
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
          }
        }
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

    // Security / audit UAT: explicit full user id + ISO created time; CreatedBy mirrors createdById
    const je = journalEntry as any;
    const createdAtIso =
      je.createdAt instanceof Date ? je.createdAt.toISOString() : new Date(je.createdAt).toISOString();

    return {
      journalEntry: {
        ...je,
        paymentMethod,
        CreatedBy: je.createdById,
        createdAtIso,
        createdByUserId: je.createdById
      },
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
  static async getJournalEntriesByDateRange(
    startDate: Date,
    endDate: Date,
    status?: 'POSTED' | 'PENDING' | 'VOID' | 'ALL' | 'POSTED_AND_PENDING',
    currencyId?: string,
    pagination?: { limit: number; offset: number }
  ): Promise<any[] | { entries: any[]; total: number; limit: number; offset: number }> {
    const andConditions: any[] = [
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
    ];
    if (currencyId) {
      andConditions.unshift({ currencyId });
    }

    const whereClause: any = {
      transactionDate: {
        gte: startDate,
        lte: endDate
      },
      AND: andConditions
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

    // Exclude journal entries linked to voided/reversed cashbook entries
    whereClause.cashbookEntries = {
      none: {
        OR: [
          { status: 'VOIDED' },
          { reversedAt: { not: null } } // Reversed entries have reversedAt set
        ]
      }
    };

    let totalForPagination: number | undefined;
    if (pagination) {
      totalForPagination = await prisma.journalEntry.count({ where: whereClause });
    }

    const entries = await prisma.journalEntry.findMany({
      where: whereClause,
      ...(pagination
        ? { skip: pagination.offset, take: Math.min(Math.max(1, pagination.limit), 500) }
        : {}),
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
        // Include related transactions with full details
        expenses: {
          select: {
            id: true,
            receiptNumber: true,
            amount: true,
            vatAmount: true,
            totalAmount: true,
            description: true,
            transactionDate: true,
            status: true,
            paymentMethod: true,
            isTaxable: true,
            ...prismaExpenseSnapshotSelect,
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
          }
        },
        revenues: {
          select: {
            id: true,
            amount: true,
            vatAmount: true,
            totalAmount: true,
            description: true,
            transactionDate: true,
            status: true,
            paymentMethod: true,
            isTaxable: true,
            ...prismaRevenueSnapshotSelect,
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
          }
        },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            amount: true,
            vatAmount: true,
            totalAmount: true,
            description: true,
            transactionDate: true,
            status: true,
            isTaxable: true,
            paymentMethod: true,
            ...prismaInvoiceSnapshotSelect,
            customer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        // Vendor bills (accounts payable): surfaced separately from sales `invoices`
        purchaseInvoices: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            paymentDate: true,
            ...prismaPurchaseInvoiceSnapshotSelect,
            vendor: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        // Include cashbook entries with full transaction details
        cashbookEntries: {
          select: {
            id: true,
            type: true,
            amount: true,
            description: true,
            reference: true,
            transactionDate: true,
            status: true,
            reversedAt: true,
            ...prismaCashbookEntrySnapshotSelect,
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
          }
        }
      },
      /** Newest business dates first; `createdAt` breaks ties so order is not insertion/ID-dependent. */
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    });

    // Additional client-side filter to ensure no voided/reversed entries slip through
    const filteredEntries = entries.filter(entry => {
      if (currencyId && (entry as any).currencyId !== currencyId) {
        return false;
      }
      // If journal entry is linked to cashbook entries, check their status
      if (entry.cashbookEntries && entry.cashbookEntries.length > 0) {
        const hasVoidedOrReversed = entry.cashbookEntries.some(
          cb => cb.status === 'VOIDED' || cb.reversedAt !== null
        );
        if (hasVoidedOrReversed) {
          return false;
        }
      }
      // Exclude reversal entries by reference number
      if (entry.referenceNumber && (entry.referenceNumber.startsWith('VR-') || entry.referenceNumber.startsWith('REV-'))) {
        return false;
      }
      return true;
    });

    // Attach paymentMethod to each line for each entry
    const mapped = filteredEntries.map((entry: any) => {
      const cashbookPaymentMethod = (() => {
        const cb = entry.cashbookEntries?.[0];
        if (!cb) return null;
        const bankName = String(cb.bank?.name ?? '').toLowerCase();
        // Heuristic: most deployments model petty cash as a "bank" row with name containing Cash/Petty.
        if (bankName.includes('petty') || bankName.includes('cash')) return 'CASH';
        return 'BANK';
      })();

      const paymentMethod =
        (entry.expenses?.[0]?.paymentMethod) ||
        (entry.revenues?.[0]?.paymentMethod) ||
        (entry.invoices?.[0]?.paymentMethod) ||
        cashbookPaymentMethod ||
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

    // Defensive sort: always list by accounting date (newest first), not creation order.
    mapped.sort((a: any, b: any) => {
      const tb = new Date(b.transactionDate).getTime();
      const ta = new Date(a.transactionDate).getTime();
      if (tb !== ta) return tb - ta;
      const cb = new Date(b.createdAt).getTime();
      const ca = new Date(a.createdAt).getTime();
      return cb - ca;
    });

    if (pagination && totalForPagination !== undefined) {
      const take = Math.min(Math.max(1, pagination.limit), 500);
      return {
        entries: mapped,
        total: totalForPagination,
        limit: take,
        offset: pagination.offset,
      };
    }

    return mapped;
  }

  /**
   * Post a journal entry (change status from PENDING to POSTED)
   */
  static async postJournalEntry(
    journalEntryId: string,
    performedById?: string,
    options?: { userPermissions?: Array<{ name: string; value: boolean }>; user?: unknown }
  ): Promise<JournalEntry> {
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

      // Posting is the checker half of maker-checker: it must be gated the same way regardless of
      // which module's UI calls this (Accounting's own approval queue, or another module's shortcut
      // to it) — a permission-only check here would still let the preparer approve their own entry.
      const actingUser = options?.user;
      if (!isModulePrivilegedUser(actingUser) && !userHasEffectivePermission(actingUser, "manage_ledger")) {
        throw new Error("You do not have authority to post journal entries to the general ledger.");
      }
      if (
        !isModulePrivilegedUser(actingUser) &&
        performedById &&
        journalEntry.createdById &&
        performedById === journalEntry.createdById
      ) {
        throw new Error("The preparer of a journal entry cannot also post it. An independent reviewer must post this entry.");
      }

      // Validate that the journal entry is balanced
      if (!this.validateJournalEntryBalance(journalEntry.journalEntryLines)) {
        throw new Error("Journal entry is not balanced. Debits must equal credits.");
      }

      await PeriodLockService.assertModuleDateOpen({
        moduleCode: "GL",
        accountingDate: journalEntry.transactionDate,
        userId: performedById ?? journalEntry.createdById,
        source: "API",
        actionType: "POST_JOURNAL",
        userPermissions: options?.userPermissions,
        user: options?.user,
      });

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
   * Creates a reversing journal entry if the original was POSTED
   * Comprehensive audit log includes original transaction details, void timestamp, user ID, and reversing journal entry reference
   */
  static async voidJournalEntry(journalEntryId: string, performedById?: string): Promise<JournalEntry> {
    try {
      // Fetch complete journal entry with lines for comprehensive audit trail
      const journalEntry = await prisma.journalEntry.findUnique({
        where: { id: journalEntryId },
        include: {
          journalEntryLines: {
            include: {
              chartOfAccount: true
            }
          },
          currency: true
        }
      });

      if (!journalEntry) {
        throw new Error("Journal entry not found");
      }

      if (journalEntry.status === "VOID") {
        throw new Error("Journal entry is already voided");
      }

      const originalStatus = journalEntry.status;
      const voidTimestamp = new Date();
      const userId = performedById ?? journalEntry.createdById;

      // Create reversing journal entry if original was POSTED
      let reversalJournalEntry = null;
      if (originalStatus === "POSTED" && journalEntry.journalEntryLines && journalEntry.journalEntryLines.length > 0) {
        try {
          reversalJournalEntry = await createJournalEntryWithAuditSequence({
            transactionDate: voidTimestamp,
            referenceNumber: `VR-${journalEntry.referenceNumber}`,
            description: `REVERSAL of Journal Entry ${journalEntry.referenceNumber}: ${journalEntry.description}`,
            totalAmount: journalEntry.totalAmount,
            currencyId: journalEntry.currencyId,
            status: "POSTED",
            createdById: userId
          });

          // Create reversal journal entry lines (opposite debits/credits)
          for (const line of journalEntry.journalEntryLines) {
            await prisma.journalEntryLine.create({
              data: {
                journalEntryId: reversalJournalEntry.id,
                chartOfAccountId: line.chartOfAccountId,
                debitAmount: line.creditAmount, // Swap: original credit becomes debit
                creditAmount: line.debitAmount, // Swap: original debit becomes credit
                description: `REVERSAL: ${line.description}`,
                vatAmount: line.vatAmount || null
              }
            });
          }

          console.log(`✅ Reversing journal entry created: ${reversalJournalEntry.referenceNumber}`);
        } catch (reversalError: any) {
          console.error("❌ Error creating reversing journal entry:", reversalError);
          // Don't fail the void if reversal fails - log it
        }
      }

      // Update the status to VOID
      const updatedJournalEntry = await prisma.journalEntry.update({
        where: { id: journalEntryId },
        data: {
          status: "VOID",
          updatedAt: voidTimestamp
        }
      });

      // Comprehensive audit log with all required fields:
      // 1. Original transaction details (complete)
      // 2. Date/time of void
      // 3. User ID who performed the void
      // 4. Reference to Reversing Journal ID
      await AuditService.log({
        userId: userId,
        action: "VOID",
        entityType: "JournalEntry",
        entityId: journalEntryId,
        oldValues: {
          // Complete original transaction details
          journalEntry: {
            id: journalEntry.id,
            referenceNumber: journalEntry.referenceNumber,
            description: journalEntry.description,
            transactionDate: journalEntry.transactionDate,
            totalAmount: journalEntry.totalAmount,
            currencyId: journalEntry.currencyId,
            status: originalStatus,
            createdAt: journalEntry.createdAt,
            createdById: journalEntry.createdById
          },
          journalEntryLines: journalEntry.journalEntryLines.map(line => ({
            id: line.id,
            chartOfAccountId: line.chartOfAccountId,
            chartOfAccountName: line.chartOfAccount?.accountName,
            debitAmount: line.debitAmount,
            creditAmount: line.creditAmount,
            description: line.description,
            vatAmount: line.vatAmount
          }))
        },
        newValues: {
          // Updated transaction with void status
          journalEntry: {
            id: updatedJournalEntry.id,
            referenceNumber: updatedJournalEntry.referenceNumber,
            status: updatedJournalEntry.status,
            updatedAt: updatedJournalEntry.updatedAt
          },
          // Audit trail metadata
          voidDetails: {
            voidedAt: voidTimestamp.toISOString(),
            voidedBy: userId,
            originalStatus: originalStatus,
            reversalJournalEntry: reversalJournalEntry ? {
              id: reversalJournalEntry.id,
              referenceNumber: reversalJournalEntry.referenceNumber,
              description: reversalJournalEntry.description,
              transactionDate: reversalJournalEntry.transactionDate
            } : null
          }
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
   * Create a journal entry for an invoice transaction.
   * @param tx When provided, all writes use the transaction client (no audit log here — caller commits then audits).
   */
  static async createInvoiceJournalEntry(
    params: CreateInvoiceJournalEntryParams,
    tx?: Prisma.TransactionClient
  ): Promise<JournalEntryResult> {
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
        createdById,
        usdZwgRateSnapshot
      } = params;

      const db = tx ?? prisma;
      const skipAudit = !!tx;

      const [incomeAccount, vatOutputAccount, debitAccount] = await Promise.all([
        JournalEntryService.getIncomeAccount(),
        JournalEntryService.getVATOutputAccount(),
        JournalEntryService.getAccountsReceivableAccount()
      ]);

      const manualJeSnap =
        usdZwgRateSnapshot != null && Number.isFinite(Number(usdZwgRateSnapshot))
          ? new Decimal(usdZwgRateSnapshot)
          : undefined;

      const invoiceJeData = {
        transactionDate,
        referenceNumber: JournalEntryService.generateReferenceNumber(),
        description: `Invoice: ${description}`,
        totalAmount: new Decimal(totalAmount),
        currencyId,
        status: "PENDING" as const,
        createdById,
        ...(manualJeSnap != null ? { usdZwgRateSnapshot: manualJeSnap } : {})
      };
      const journalEntry = skipAudit
        ? await assignNextAuditIdAndCreateJournal(db as Prisma.TransactionClient, invoiceJeData)
        : await createJournalEntryWithAuditSequence(invoiceJeData);

      if (!skipAudit) {
        await AuditService.log({
          userId: createdById,
          action: "CREATE",
          entityType: "JournalEntry",
          entityId: journalEntry.id,
          newValues: journalEntry
        });
      }

      // Create journal entry lines for double-entry bookkeeping
      const journalEntryLines: JournalEntryLine[] = [];

      // 1. Debit Accounts Receivable
      journalEntryLines.push(
        await db.journalEntryLine.create({
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
        await db.journalEntryLine.create({
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
          await db.journalEntryLine.create({
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

      const [incomeAccount, vatOutputAccount, debitAccount] = await Promise.all([
        JournalEntryService.getIncomeAccount(),
        JournalEntryService.getVATOutputAccount(),
        JournalEntryService.getAccountsReceivableAccount()
      ]);

      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate,
        referenceNumber: JournalEntryService.generateReferenceNumber(),
        description: `REVERSAL: Invoice ${invoiceNumber || description}`,
        totalAmount: new Decimal(totalAmount),
        currencyId,
        status: "PENDING",
        createdById
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
        createdById,
        paymentBankId,
      } = params;

      let debitAccount: ChartOfAccounts;
      if (paymentMethod === "CREDIT") {
        debitAccount = await this.getCreditCardReceivableAccount();
      } else {
        debitAccount = await this.resolveProceedsDebitAccount(
          paymentMethod,
          currencyId,
          paymentBankId
        );
      }

      const creditAccount = await JournalEntryService.getAccountsReceivableAccount();

      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate,
        referenceNumber: JournalEntryService.generateReferenceNumber(),
        description: `Payment: ${description}`,
        totalAmount: new Decimal(totalAmount),
        currencyId,
        status: "PENDING",
        createdById
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
            vatAmount: new Decimal(0),
            recordedCurrencyId: currencyId,
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
            vatAmount: new Decimal(0),
            recordedCurrencyId: currencyId,
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
   * Get Accounts Receivable / Debtors Control (prefer GL 1200 — same as cashbook and control-account sync).
   */
  private static async getAccountsReceivableAccount(): Promise<ChartOfAccounts> {
    try {
      const by1200 = await prisma.chartOfAccounts.findFirst({
        where: { accountNo: "1200", isActive: true },
      });
      if (by1200) {
        return by1200;
      }

      const debtorsControl = await prisma.chartOfAccounts.findFirst({
        where: {
          accountType: "Current Asset",
          OR: [
            { accountName: { contains: "Debtors Control" } },
            { accountName: { contains: "Trade Debtors" } },
          ],
          isActive: true,
        },
      });
      if (debtorsControl) {
        return debtorsControl;
      }

      const accountsReceivableAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          accountType: "Current Asset",
          accountName: { contains: "Accounts Receivable" },
          isActive: true,
        },
      });

      if (!accountsReceivableAccount) {
        throw new Error(
          "Debtors Control / Accounts Receivable not found (configure GL 1200 or a Current Asset named Accounts Receivable)."
        );
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
        createdById,
        paymentBankId,
      } = params;

      const revenueAccount = await this.getRevenueAccount(categoryId || "");
      const vatOutputAccount = await this.getVATOutputAccount();
      const debitAccount = await this.resolveProceedsDebitAccount(
        paymentMethod,
        currencyId,
        paymentBankId
      );

      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate,
        referenceNumber: JournalEntryService.generateReferenceNumber(),
        description: `Revenue: ${description}`,
        totalAmount: new Decimal(totalAmount),
        currencyId,
        status: "PENDING",
        createdById
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
            vatAmount: new Decimal(0),
            recordedCurrencyId: currencyId,
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
            vatAmount: new Decimal(0),
            recordedCurrencyId: currencyId,
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
              vatAmount: new Decimal(vatAmount),
              recordedCurrencyId: currencyId,
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

}

export default JournalEntryService; 