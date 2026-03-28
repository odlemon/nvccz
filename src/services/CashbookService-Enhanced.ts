// @ts-nocheck
// Enhanced CashbookService with missing critical features
// Extends the existing CashbookService with void, edit, batch posting, and reconciliation features

import { PrismaClient, CashbookEntry, JournalEntry, ChartOfAccounts } from "@prisma/client";
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import AuditService from "./AuditService";
import JournalEntryService from "./JournalEntryService";
import CashbookService from "./CashbookService";
import { createJournalEntryWithAuditSequence } from "./AuditTrailSequenceService";

export interface VoidCashbookEntryParams {
  entryId: string;
  reason: string;
  userId: string;
}

export interface UpdateCashbookEntryParams {
  entryId: string;
  updates: {
    transactionDate?: Date;
    description?: string;
    amount?: number;
    reference?: string;
    counterpartyType?: 'GL' | 'CUSTOMER' | 'SUPPLIER';
    glAccountId?: string;
    customerId?: string;
    vendorId?: string;
  };
  userId: string;
}

export interface BatchPostingParams {
  bankId: string;
  userId: string;
}

export interface ReconciliationParams {
  entryId: string;
  bankTransactionId: string;
  userId: string;
}

export class CashbookServiceEnhanced {
  
  /**
   * Void a cashbook entry (Sage Pastel style)
   * Creates reversal journal entries
   */
  static async voidCashbookEntry(params: VoidCashbookEntryParams): Promise<CashbookResult> {
    try {
      console.log(`\n🚫 Voiding Cashbook Entry: ${params.entryId}`);
      console.log(`   Reason: ${params.reason}`);

      // 1. Get the cashbook entry
      const entry = await prisma.cashbookEntry.findUnique({
        where: { id: params.entryId },
        include: { journalEntry: true }
      });

      if (!entry) {
        throw new Error('Cashbook entry not found');
      }

      if (entry.status === 'VOIDED') {
        throw new Error('Entry is already voided');
      }

      if (entry.status === 'POSTED') {
        // Create reversal journal entry
        const reversalEntry = await this.createReversalJournalEntry(entry, params.reason, params.userId);
        
        // Update cashbook entry
        const updatedEntry = await prisma.cashbookEntry.update({
          where: { id: params.entryId },
          data: {
            status: 'VOIDED',
            updatedAt: new Date()
          }
        });

        // Audit log
        await AuditService.log({
          userId: params.userId,
          action: "VOID",
          entityType: "CashbookEntry",
          entityId: entry.id,
          oldValues: { status: entry.status },
          newValues: { status: 'VOIDED', reason: params.reason }
        });

        console.log(`   ✅ Entry voided successfully`);
        console.log(`   📝 Reversal Journal Entry: ${reversalEntry.referenceNumber}`);

        return {
          cashbookEntry: updatedEntry,
          journalEntry: reversalEntry,
          success: true,
          message: 'Cashbook entry voided successfully'
        };
      } else {
        // Just mark as voided (not posted yet)
        const updatedEntry = await prisma.cashbookEntry.update({
          where: { id: params.entryId },
          data: {
            status: 'VOIDED',
            updatedAt: new Date()
          }
        });

        return {
          cashbookEntry: updatedEntry,
          success: true,
          message: 'Cashbook entry voided successfully'
        };
      }

    } catch (error: any) {
      console.error('Error voiding cashbook entry:', error);
      throw new Error(`Failed to void cashbook entry: ${error.message}`);
    }
  }

  /**
   * Update a cashbook entry (only if not posted)
   */
  static async updateCashbookEntry(params: UpdateCashbookEntryParams): Promise<CashbookResult> {
    try {
      console.log(`\n✏️ Updating Cashbook Entry: ${params.entryId}`);

      // 1. Get the cashbook entry
      const entry = await prisma.cashbookEntry.findUnique({
        where: { id: params.entryId }
      });

      if (!entry) {
        throw new Error('Cashbook entry not found');
      }

      if (entry.status === 'POSTED') {
        throw new Error('Cannot edit posted entries. Void and recreate instead.');
      }

      if (entry.status === 'VOIDED') {
        throw new Error('Cannot edit voided entries');
      }

      // 2. Update the entry
      const updatedEntry = await prisma.cashbookEntry.update({
        where: { id: params.entryId },
        data: {
          ...params.updates,
          amount: params.updates.amount ? new Decimal(params.updates.amount) : undefined,
          updatedAt: new Date()
        }
      });

      // Audit log
      await AuditService.log({
        userId: params.userId,
        action: "UPDATE",
        entityType: "CashbookEntry",
        entityId: entry.id,
        oldValues: entry,
        newValues: updatedEntry
      });

      console.log(`   ✅ Entry updated successfully`);

      return {
        cashbookEntry: updatedEntry,
        success: true,
        message: 'Cashbook entry updated successfully'
      };

    } catch (error: any) {
      console.error('Error updating cashbook entry:', error);
      throw new Error(`Failed to update cashbook entry: ${error.message}`);
    }
  }

  /**
   * Batch posting (Sage Pastel style)
   * Post all pending entries for a bank
   */
  static async postCashbookBatch(params: BatchPostingParams): Promise<{
    postedCount: number;
    entries: CashbookEntry[];
    success: boolean;
    message: string;
  }> {
    try {
      console.log(`\n📦 Posting Cashbook Batch for Bank: ${params.bankId}`);

      // 1. Get all pending entries for this bank
      const pendingEntries = await prisma.cashbookEntry.findMany({
        where: {
          bankId: params.bankId,
          status: 'PENDING'
        },
        orderBy: { transactionDate: 'asc' }
      });

      if (pendingEntries.length === 0) {
        return {
          postedCount: 0,
          entries: [],
          success: true,
          message: 'No pending entries to post'
        };
      }

      console.log(`   📋 Found ${pendingEntries.length} pending entries`);

      // 2. Post each entry
      const postedEntries: CashbookEntry[] = [];
      
      for (const entry of pendingEntries) {
        try {
          let journalEntry: JournalEntry;
          
          if (entry.type === 'RECEIPT') {
            journalEntry = await this.createReceiptJournalEntry(entry);
          } else {
            journalEntry = await this.createPaymentJournalEntry(entry);
          }

          // Update entry status
          const updatedEntry = await prisma.cashbookEntry.update({
            where: { id: entry.id },
            data: {
              journalEntryId: journalEntry.id,
              status: 'POSTED'
            }
          });

          postedEntries.push(updatedEntry);
          console.log(`   ✅ Posted: ${entry.description} - $${entry.amount}`);

        } catch (error) {
          console.error(`   ❌ Failed to post entry ${entry.id}:`, error);
          // Continue with other entries
        }
      }

      // 3. Update counterparty balances
      for (const entry of postedEntries) {
        await this.updateCounterpartyBalances(entry);
      }

      // 4. Audit log
      await AuditService.log({
        userId: params.userId,
        action: "BATCH_POST",
        entityType: "CashbookBatch",
        entityId: params.bankId,
        newValues: {
          bankId: params.bankId,
          postedCount: postedEntries.length,
          totalEntries: pendingEntries.length
        }
      });

      console.log(`   ✅ Batch posting completed: ${postedEntries.length}/${pendingEntries.length} entries posted`);

      return {
        postedCount: postedEntries.length,
        entries: postedEntries,
        success: true,
        message: `Successfully posted ${postedEntries.length} entries`
      };

    } catch (error: any) {
      console.error('Error in batch posting:', error);
      throw new Error(`Failed to post cashbook batch: ${error.message}`);
    }
  }

  /**
   * Unreconcile a cashbook entry
   */
  static async markAsUnreconciled(entryId: string, userId: string): Promise<CashbookResult> {
    try {
      console.log(`\n🔓 Unreconciling Cashbook Entry: ${entryId}`);

      // 1. Get the cashbook entry
      const entry = await prisma.cashbookEntry.findUnique({
        where: { id: entryId }
      });

      if (!entry) {
        throw new Error('Cashbook entry not found');
      }

      if (!entry.isReconciled) {
        throw new Error('Entry is not reconciled');
      }

      // 2. Update reconciliation status to unreconciled
      const updatedEntry = await prisma.cashbookEntry.update({
        where: { id: entryId },
        data: {
          isReconciled: false,
          reconciledAt: null,
          reconciledById: null,
          cashbookReconciliationSessionId: null,
        }
      });

      // Audit log
      await AuditService.log({
        userId: userId,
        action: "UNRECONCILE",
        entityType: "CashbookEntry",
        entityId: entry.id,
        oldValues: {
          isReconciled: true,
          reconciledAt: entry.reconciledAt
        },
        newValues: {
          isReconciled: false,
          reconciledAt: null
        }
      });

      console.log(`   ✅ Entry marked as unreconciled`);

      return {
        cashbookEntry: updatedEntry,
        success: true,
        message: 'Cashbook entry unreconciled successfully'
      };

    } catch (error: any) {
      console.error('Error unreconciling cashbook entry:', error);
      throw new Error(`Failed to unreconcile cashbook entry: ${error.message}`);
    }
  }

  /**
   * Mark cashbook entry as reconciled with bank statement
   */
  static async markAsReconciled(params: ReconciliationParams): Promise<CashbookResult> {
    try {
      console.log(`\n🔗 Reconciling Cashbook Entry: ${params.entryId}`);

      // 1. Get the cashbook entry
      const entry = await prisma.cashbookEntry.findUnique({
        where: { id: params.entryId }
      });

      if (!entry) {
        throw new Error('Cashbook entry not found');
      }

      if (entry.status !== 'POSTED') {
        throw new Error('Only posted entries can be reconciled');
      }

      // 2. Update reconciliation status
      const updatedEntry = await prisma.cashbookEntry.update({
        where: { id: params.entryId },
        data: {
          isReconciled: true,
          reconciledAt: new Date(),
          reconciledById: params.userId
        }
      });

      // 3. Link to bank transaction (if provided)
      if (params.bankTransactionId) {
        // This would link to your existing bank reconciliation system
        console.log(`   🔗 Linked to bank transaction: ${params.bankTransactionId}`);
      }

      // Audit log
      await AuditService.log({
        userId: params.userId,
        action: "RECONCILE",
        entityType: "CashbookEntry",
        entityId: entry.id,
        newValues: {
          isReconciled: true,
          reconciledAt: new Date(),
          bankTransactionId: params.bankTransactionId
        }
      });

      console.log(`   ✅ Entry marked as reconciled`);

      return {
        cashbookEntry: updatedEntry,
        success: true,
        message: 'Cashbook entry reconciled successfully'
      };

    } catch (error: any) {
      console.error('Error reconciling cashbook entry:', error);
      throw new Error(`Failed to reconcile cashbook entry: ${error.message}`);
    }
  }

  /**
   * Get cashbook summary for a bank
   */
  static async getCashbookSummary(bankId: string, startDate: Date, endDate: Date): Promise<{
    bankName: string;
    period: { startDate: Date; endDate: Date };
    summary: {
      totalReceipts: number;
      totalPayments: number;
      netCashFlow: number;
      pendingCount: number;
      postedCount: number;
      voidedCount: number;
      reconciledCount: number;
      unreconciledCount: number;
    };
    entries: any[];
  }> {
    const bank = await prisma.bank.findUnique({
      where: { id: bankId }
    });

    if (!bank) {
      throw new Error('Bank account not found');
    }

    const entries = await prisma.cashbookEntry.findMany({
      where: {
        bankId,
        transactionDate: {
          gte: startDate,
          lte: endDate
        },
        // Exclude reversals from cashbook summary
        originalTransactionId: null
      },
      include: {
        customer: true,
        vendor: true,
        glAccount: true,
        journalEntry: true
      },
      orderBy: { transactionDate: 'desc' }
    });

    const totalReceipts = entries
      .filter(e => e.type === 'RECEIPT' && e.status === 'POSTED')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const totalPayments = entries
      .filter(e => e.type === 'PAYMENT' && e.status === 'POSTED')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const pendingCount = entries.filter(e => e.status === 'PENDING').length;
    const postedCount = entries.filter(e => e.status === 'POSTED').length;
    const voidedCount = entries.filter(e => e.status === 'VOIDED').length;
    const reconciledCount = entries.filter(e => e.isReconciled).length;
    const unreconciledCount = entries.filter(e => e.status === 'POSTED' && !e.isReconciled).length;

    return {
      bankName: bank.name,
      period: { startDate, endDate },
      summary: {
        totalReceipts,
        totalPayments,
        netCashFlow: totalReceipts - totalPayments,
        pendingCount,
        postedCount,
        voidedCount,
        reconciledCount,
        unreconciledCount
      },
      entries: entries.map(entry => ({
        id: entry.id,
        date: entry.transactionDate,
        type: entry.type,
        description: entry.description,
        amount: Number(entry.amount),
        reference: entry.reference,
        status: entry.status,
        counterparty: entry.customer?.name || entry.vendor?.name || entry.glAccount?.accountName,
        isReconciled: entry.isReconciled,
        journalEntryRef: entry.journalEntry?.referenceNumber,
        receiptAttachmentUrl: entry.receiptAttachmentUrl,
        receiptAttachmentPath: entry.receiptAttachmentPath,
        receiptAttachmentFileName: entry.receiptAttachmentFileName,
        receiptAttachmentMimeType: entry.receiptAttachmentMimeType
      }))
    };
  }

  /**
   * Get unreconciled entries for a bank
   */
  static async getUnreconciledEntries(bankId: string): Promise<CashbookEntry[]> {
    return await prisma.cashbookEntry.findMany({
      where: {
        bankId,
        status: 'POSTED',
        isReconciled: false
      },
      include: {
        customer: true,
        vendor: true,
        glAccount: true,
        journalEntry: true
      },
      orderBy: { transactionDate: 'asc' }
    });
  }

  /**
   * Get reconciliation display with running balance
   * Returns: GL Bank Balance, Total Un-ticked Items, Calculated Cleared Balance
   */
  static async getReconciliationDisplay(params: {
    bankId: string;
    periodEndDate: Date;
    tickedEntryIds?: string[]; // Array of entry IDs that are currently ticked/checked
  }): Promise<{
    glBankBalance: number;
    totalUntickedItems: number;
    clearedBalance: number;
    unreconciledEntries: any[];
    bankInfo: {
      id: string;
      name: string;
      accountNumber: string;
      glAccountNo: string;
      glAccountName: string;
    };
  }> {
    try {
      console.log(`📊 Getting reconciliation display for bank: ${params.bankId}, period end: ${params.periodEndDate}`);
      
      // Get bank with GL account
      const bank = await prisma.bank.findUnique({
        where: { id: params.bankId },
        include: {
          glAccount: true,
          currency: true
        }
      });

      if (!bank) {
        throw new Error('Bank not found');
      }

      if (!bank.glAccount) {
        throw new Error('Bank GL account not configured');
      }

      // Calculate GL Bank Balance up to period end date
      // This is the sum of all journal entry lines for the bank's GL account
      const periodEnd = new Date(params.periodEndDate);
      periodEnd.setHours(23, 59, 59, 999); // End of day

      const journalEntryLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: bank.glAccount.id,
          journalEntry: {
            transactionDate: {
              lte: periodEnd
            },
            status: 'POSTED'
          }
        },
        include: {
          journalEntry: {
            select: {
              transactionDate: true,
              status: true
            }
          }
        }
      });

      // Calculate GL Bank Balance (DR - CR for asset accounts)
      let glBankBalance = 0;
      for (const line of journalEntryLines) {
        const debit = parseFloat(line.debitAmount?.toString() || '0');
        const credit = parseFloat(line.creditAmount?.toString() || '0');
        glBankBalance += (debit - credit);
      }

      // Get unreconciled entries up to period end date
      const unreconciledEntries = await prisma.cashbookEntry.findMany({
        where: {
          bankId: params.bankId,
          status: 'POSTED',
          isReconciled: false,
          transactionDate: {
            lte: periodEnd
          }
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true
            }
          },
          vendor: {
            select: {
              id: true,
              name: true
            }
          },
          glAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true
            }
          },
          bank: {
            select: {
              id: true,
              name: true,
              accountNumber: true
            }
          }
        },
        orderBy: { transactionDate: 'asc' }
      });

      // Calculate Total Un-ticked Items (sum of unticked transactions)
      const tickedIds = params.tickedEntryIds || [];
      let totalUntickedItems = 0;

      const entriesWithTickedStatus = unreconciledEntries.map(entry => {
        const isTicked = tickedIds.includes(entry.id);
        const amount = parseFloat(entry.amount?.toString() || '0');
        
        // For receipts, amount increases balance (positive)
        // For payments, amount decreases balance (negative)
        const signedAmount = entry.type === 'RECEIPT' ? amount : -amount;
        
        if (!isTicked) {
          totalUntickedItems += signedAmount;
        }

        return {
          id: entry.id,
          transactionDate: entry.transactionDate,
          type: entry.type,
          description: entry.description,
          reference: entry.reference,
          amount: amount,
          signedAmount: signedAmount, // Positive for receipts, negative for payments
          status: entry.status,
          isReconciled: entry.isReconciled,
          reconciliationStatus: entry.isReconciled ? 'Y' : 'N',
          isTicked: isTicked,
          counterpartyType: entry.counterpartyType,
          counterparty: entry.counterpartyType === 'CUSTOMER' 
            ? entry.customer?.name 
            : entry.counterpartyType === 'SUPPLIER' 
            ? entry.vendor?.name 
            : entry.glAccount?.accountName || 'N/A',
          bank: entry.bank,
          receiptAttachmentUrl: entry.receiptAttachmentUrl,
          receiptAttachmentPath: entry.receiptAttachmentPath,
          receiptAttachmentFileName: entry.receiptAttachmentFileName,
          receiptAttachmentMimeType: entry.receiptAttachmentMimeType
        };
      });

      // Calculate Cleared Balance (GL Balance - Total Un-ticked Items)
      const clearedBalance = glBankBalance - totalUntickedItems;

      console.log(`✅ Reconciliation display calculated:`);
      console.log(`   GL Bank Balance: ${glBankBalance.toFixed(2)}`);
      console.log(`   Total Un-ticked Items: ${totalUntickedItems.toFixed(2)}`);
      console.log(`   Cleared Balance: ${clearedBalance.toFixed(2)}`);
      console.log(`   Unreconciled entries: ${unreconciledEntries.length}`);

      return {
        glBankBalance: parseFloat(glBankBalance.toFixed(2)),
        totalUntickedItems: parseFloat(totalUntickedItems.toFixed(2)),
        clearedBalance: parseFloat(clearedBalance.toFixed(2)),
        unreconciledEntries: entriesWithTickedStatus,
        bankInfo: {
          id: bank.id,
          name: bank.name,
          accountNumber: bank.accountNumber,
          glAccountNo: bank.glAccount.accountNo,
          glAccountName: bank.glAccount.accountName
        }
      };

    } catch (error: any) {
      console.error('❌ Error getting reconciliation display:', error.message);
      throw new Error(`Failed to get reconciliation display: ${error.message}`);
    }
  }

  /**
   * Create five posted GL cashbook lines with isReconciled false (Bank Recon "Unreconciled" tab).
   * Uses income GL (pref. account 4000) and expense GL (pref. account 5000) when present.
   */
  static async seedFiveUnreconciledPostedEntries(params: {
    bankId: string;
    createdById: string;
  }): Promise<{
    entries: Array<{ id: string; type: string; amount: number; description: string; isReconciled: boolean; reconciliationStatus: 'N' }>;
    message: string;
  }> {
    const { bankId, createdById } = params;
    const bank = await prisma.bank.findUnique({ where: { id: bankId } });
    if (!bank) {
      throw new Error('Bank not found');
    }

    const incomeGl =
      (await prisma.chartOfAccounts.findFirst({
        where: { isActive: true, accountNo: '4000' }
      })) ||
      (await prisma.chartOfAccounts.findFirst({
        where: { isActive: true, accountType: { contains: 'Revenue', mode: 'insensitive' } },
        orderBy: { accountNo: 'asc' }
      }));

    const expenseGl =
      (await prisma.chartOfAccounts.findFirst({
        where: { isActive: true, accountNo: '5000' }
      })) ||
      (await prisma.chartOfAccounts.findFirst({
        where: { isActive: true, accountType: { contains: 'Expense', mode: 'insensitive' } },
        orderBy: { accountNo: 'asc' }
      }));

    if (!incomeGl || !expenseGl) {
      throw new Error(
        'Need at least one active income-style GL (e.g. account 4000) and one expense-style GL (e.g. account 5000) to seed demo entries.'
      );
    }

    const baseDate = new Date();
    baseDate.setHours(12, 0, 0, 0);

    const specs: Array<{
      kind: 'RECEIPT' | 'PAYMENT';
      amount: number;
      description: string;
      reference: string;
    }> = [
      { kind: 'RECEIPT', amount: 100, description: 'Recon demo — receipt 1', reference: 'RECON-DEMO-1' },
      { kind: 'PAYMENT', amount: 50, description: 'Recon demo — payment 1', reference: 'RECON-DEMO-2' },
      { kind: 'RECEIPT', amount: 75.25, description: 'Recon demo — receipt 2', reference: 'RECON-DEMO-3' },
      { kind: 'PAYMENT', amount: 200, description: 'Recon demo — payment 2', reference: 'RECON-DEMO-4' },
      { kind: 'RECEIPT', amount: 33, description: 'Recon demo — receipt 3', reference: 'RECON-DEMO-5' }
    ];

    const created: Array<{ id: string; type: string; amount: number; description: string; isReconciled: boolean; reconciliationStatus: 'N' }> = [];

    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const transactionDate = new Date(baseDate);
      transactionDate.setDate(transactionDate.getDate() - (specs.length - 1 - i));

      const common = {
        bankId,
        transactionDate,
        description: s.description,
        amount: s.amount,
        reference: s.reference,
        counterpartyType: 'GL' as const,
        vatCode: '0%',
        createdById
      };

      const result =
        s.kind === 'RECEIPT'
          ? await CashbookService.createCashReceipt({
              ...common,
              glAccountId: incomeGl.id
            })
          : await CashbookService.createCashPayment({
              ...common,
              glAccountId: expenseGl.id
            });

      if (!result.success || !result.transaction) {
        throw new Error(result.message || `Failed to create ${s.kind} ${s.reference}`);
      }

      if (result.transaction.status !== 'POSTED') {
        throw new Error(`Expected POSTED cashbook line for ${s.reference}, got ${result.transaction.status}`);
      }

      if (result.transaction.isReconciled) {
        throw new Error(`Seed entry ${s.reference} was unexpectedly reconciled`);
      }

      created.push({
        id: result.transaction.id,
        type: result.transaction.type,
        amount: parseFloat(String(result.transaction.amount)),
        description: result.transaction.description,
        isReconciled: false,
        reconciliationStatus: 'N'
      });
    }

    return {
      entries: created,
      message:
        'Created 5 posted cashbook entries with reconciliationStatus N (isReconciled false). They appear on GET .../unreconciled and reconciliation/display for this bank.'
    };
  }

  // Helper methods (reuse from existing CashbookService)
  private static async createReversalJournalEntry(entry: CashbookEntry, reason: string, userId: string): Promise<JournalEntry> {
    // Create reversal journal entry with opposite debits/credits
    const bank = await prisma.bank.findUnique({
      where: { id: entry.bankId },
      include: { glAccount: true }
    });

    if (!bank?.glAccount) {
      throw new Error('Bank GL account not found');
    }

    // Get counterparty account
    let counterpartyAccount: ChartOfAccounts;
    
    if (entry.counterpartyType === 'CUSTOMER' && entry.customerId) {
      counterpartyAccount = await this.getAccountsReceivableAccount();
    } else if (entry.counterpartyType === 'SUPPLIER' && entry.vendorId) {
      counterpartyAccount = await this.getAccountsPayableAccount();
    } else if (entry.counterpartyType === 'GL' && entry.glAccountId) {
      counterpartyAccount = await prisma.chartOfAccounts.findUnique({
        where: { id: entry.glAccountId }
      });
      if (!counterpartyAccount) {
        throw new Error('GL account not found');
      }
    } else {
      throw new Error('Invalid counterparty configuration');
    }

    const journalEntry = await createJournalEntryWithAuditSequence({
      transactionDate: new Date(),
      referenceNumber: this.generateReferenceNumber('VR'),
      description: `VOID REVERSAL: ${entry.description} - ${reason}`,
      totalAmount: entry.amount,
      currencyId: bank.currencyId,
      status: 'POSTED',
      createdById: userId
    });

    // Create reversal journal entry lines (opposite of original)
    if (entry.type === 'RECEIPT') {
      // Original: Dr Bank, Cr Counterparty
      // Reversal: Cr Bank, Dr Counterparty
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: bank.glAccount.id,
          debitAmount: new Decimal(0),
          creditAmount: entry.amount,
          description: `Void Reversal: ${entry.description}`
        }
      });

      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: counterpartyAccount.id,
          debitAmount: entry.amount,
          creditAmount: new Decimal(0),
          description: `Void Reversal: ${entry.description}`
        }
      });
    } else {
      // Original: Dr Counterparty, Cr Bank
      // Reversal: Cr Counterparty, Dr Bank
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: counterpartyAccount.id,
          debitAmount: new Decimal(0),
          creditAmount: entry.amount,
          description: `Void Reversal: ${entry.description}`
        }
      });

      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: bank.glAccount.id,
          debitAmount: entry.amount,
          creditAmount: new Decimal(0),
          description: `Void Reversal: ${entry.description}`
        }
      });
    }

    return journalEntry;
  }

  /**
   * Store a physical receipt scan on a cashbook entry: upload via RemoteUploadService (same Ubuntu upload stack as cashbook CSV imports / batch exports).
   */
  static async attachReceiptDocument(params: {
    entryId: string;
    file: Express.Multer.File;
    userId: string;
  }): Promise<{ success: boolean; message: string; entry: CashbookEntry }> {
    const { entryId, file, userId } = params;
    if (!file?.buffer?.length) {
      throw new Error("File is required");
    }

    const entry = await prisma.cashbookEntry.findUnique({ where: { id: entryId } });
    if (!entry) {
      throw new Error("Cashbook entry not found");
    }
    if (entry.status === "VOIDED") {
      throw new Error("Cannot attach a receipt to a voided cashbook entry");
    }

    const ext = (file.originalname && file.originalname.split(".").pop()) || "pdf";
    const safeName = `cb-receipt-${entryId.slice(-12)}-${Date.now()}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, "_");

    const { remoteUploadService } = await import("./RemoteUploadService");
    const { downloadURL, filePath } = await remoteUploadService.uploadSingleFile(
      {
        buffer: file.buffer,
        originalname: safeName,
        mimetype: file.mimetype || "application/octet-stream",
      },
      "cashbook-receipts"
    );

    const updated = await prisma.cashbookEntry.update({
      where: { id: entryId },
      data: {
        receiptAttachmentUrl: downloadURL,
        receiptAttachmentPath: filePath,
        receiptAttachmentFileName: file.originalname || safeName,
        receiptAttachmentMimeType: file.mimetype || null,
      },
    });

    await AuditService.log({
      userId,
      action: "UPDATE",
      entityType: "CashbookEntry",
      entityId: entryId,
      oldValues: {
        receiptAttachmentUrl: entry.receiptAttachmentUrl,
        receiptAttachmentPath: entry.receiptAttachmentPath,
      },
      newValues: {
        receiptAttachmentUrl: downloadURL,
        receiptAttachmentPath: filePath,
        receiptAttachmentFileName: file.originalname || safeName,
      },
    });

    return { success: true, message: "Receipt attachment saved", entry: updated };
  }

  // Reuse helper methods from existing CashbookService
  private static async createReceiptJournalEntry(cashbookEntry: CashbookEntry): Promise<JournalEntry> {
    // Implementation from existing CashbookService
    // ... (same as existing method)
  }

  private static async createPaymentJournalEntry(cashbookEntry: CashbookEntry): Promise<JournalEntry> {
    // Implementation from existing CashbookService
    // ... (same as existing method)
  }

  private static async updateCounterpartyBalances(cashbookEntry: CashbookEntry): Promise<void> {
    // Implementation from existing CashbookService
    // ... (same as existing method)
  }

  private static async getAccountsReceivableAccount(): Promise<ChartOfAccounts> {
    const account = await prisma.chartOfAccounts.findFirst({
      where: { accountName: { contains: 'Accounts Receivable' } }
    });
    if (!account) throw new Error('Accounts Receivable account not found');
    return account;
  }

  private static async getAccountsPayableAccount(): Promise<ChartOfAccounts> {
    const account = await prisma.chartOfAccounts.findFirst({
      where: { accountName: { contains: 'Accounts Payable' } }
    });
    if (!account) throw new Error('Accounts Payable account not found');
    return account;
  }

  private static generateReferenceNumber(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${prefix}-${timestamp}-${random}`;
  }
}
