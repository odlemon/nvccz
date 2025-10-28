// @ts-nocheck
import { PrismaClient, Decimal } from '@prisma/client';
import { prisma } from '../utils/database';

export interface ReversalRequest {
  transactionId: string;
  reason: string;
  description?: string;
  reverseDate?: Date;
}

export interface ReversalResult {
  success: boolean;
  message: string;
  data?: {
    originalTransactionId: string;
    reversalTransactionId: string;
    reversalAmount: Decimal;
    reversalDate: Date;
    reason: string;
  };
}

export class TransactionReversalService {
  
  /**
   * Reverse a posted transaction
   */
  static async reverseTransaction(
    reversalRequest: ReversalRequest, 
    userId: string
  ): Promise<ReversalResult> {
    try {
      
      // Get the original transaction
      const originalTransaction = await prisma.cashbookEntry.findUnique({
        where: { id: reversalRequest.transactionId },
        include: {
          bank: true,
          customer: true,
          vendor: true,
          glAccount: true,
          batch: true
        }
      });
      
      if (!originalTransaction) {
        return { success: false, message: 'Transaction not found' };
      }
      
      if (originalTransaction.status !== 'POSTED') {
        return { success: false, message: 'Only posted transactions can be reversed' };
      }
      
      // Check if transaction is already reversed
      const existingReversal = await prisma.cashbookEntry.findFirst({
        where: {
          originalTransactionId: reversalRequest.transactionId,
          type: originalTransaction.type === 'RECEIPT' ? 'PAYMENT' : 'RECEIPT'
        }
      });
      
      if (existingReversal) {
        return { success: false, message: 'Transaction has already been reversed' };
      }
      
      // Check period lockout
      const transactionDate = new Date(originalTransaction.transactionDate);
      const isPeriodLocked = await this.isPeriodLocked(transactionDate);
      
      if (isPeriodLocked) {
        return { success: false, message: 'Cannot reverse transaction in locked period' };
      }
      
      // Create reversal transaction
      const reversalDate = reversalRequest.reverseDate || new Date();
      
      const reversalTransaction = await prisma.cashbookEntry.create({
        data: {
          bankId: originalTransaction.bankId,
          transactionDate: reversalDate,
          type: originalTransaction.type === 'RECEIPT' ? 'PAYMENT' : 'RECEIPT',
          amount: originalTransaction.amount,
          description: `REVERSAL: ${originalTransaction.description}`,
          reference: `REV-${originalTransaction.reference}`,
          counterpartyType: originalTransaction.counterpartyType,
          glAccountId: originalTransaction.glAccountId,
          customerId: originalTransaction.customerId,
          vendorId: originalTransaction.vendorId,
          vatCode: originalTransaction.vatCode,
          projectCode: originalTransaction.projectCode,
          discount: originalTransaction.discount,
          status: 'POSTED',
          batchId: originalTransaction.batchId,
          originalTransactionId: reversalRequest.transactionId,
          reversalReason: reversalRequest.reason,
          reversalDescription: reversalRequest.description,
          createdById: userId,
          postedAt: new Date(),
          postedById: userId
        }
      });
      
      // Create reversal journal entry
      const reversalJournalEntryId = await this.createReversalJournalEntry(
        originalTransaction, 
        reversalTransaction, 
        userId
      );
      
      // Link reversal transaction to journal entry if one was created
      if (reversalJournalEntryId) {
        await prisma.cashbookEntry.update({
          where: { id: reversalTransaction.id },
          data: { journalEntryId: reversalJournalEntryId }
        });
      }
      
      // Update original transaction status
      await prisma.cashbookEntry.update({
        where: { id: reversalRequest.transactionId },
        data: { 
          status: 'REVERSED',
          reversedAt: new Date(),
          reversedById: userId
        }
      });
      
      // Create audit trail
      await this.createReversalAuditTrail(
        originalTransaction, 
        reversalTransaction, 
        userId, 
        reversalRequest.reason
      );
      
      console.log(`✅ Transaction reversed: ${reversalRequest.transactionId} -> ${reversalTransaction.id}${reversalJournalEntryId ? ' (with journal entry)' : ' (without journal entry)'}`);
      
      return {
        success: true,
        message: reversalJournalEntryId 
          ? 'Transaction successfully reversed with journal entry'
          : 'Transaction successfully reversed (original had no journal entry)',
        data: {
          originalTransactionId: reversalRequest.transactionId,
          reversalTransactionId: reversalTransaction.id,
          reversalAmount: reversalTransaction.amount,
          reversalDate: reversalDate,
          reason: reversalRequest.reason,
          hasJournalEntry: !!reversalJournalEntryId
        }
      };
      
    } catch (error: any) {
      console.error('❌ Error reversing transaction:', error.message);
      return { success: false, message: `Failed to reverse transaction: ${error.message}` };
    }
  }
  
  /**
   * Create reversal journal entry
   */
  private static async createReversalJournalEntry(
    originalTransaction: any, 
    reversalTransaction: any, 
    userId: string
  ): Promise<string | null> {
    try {
      
      // Get the original journal entry by cashbook entry ID
      const originalJournalEntry = await prisma.journalEntry.findFirst({
        where: {
          cashbookEntryId: originalTransaction.id
        },
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
          }
        }
      });
      
      if (!originalJournalEntry) {
        console.warn('⚠️ No journal entry found for original transaction');
        return null;
      }
      
      // Create reversal journal entry
      const reversalJournalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate: reversalTransaction.transactionDate,
          referenceNumber: `REV-${originalJournalEntry.referenceNumber}`,
          description: `Reversal of ${originalJournalEntry.description}`,
          totalAmount: originalJournalEntry.totalAmount,
          currencyId: originalJournalEntry.currencyId,
          status: 'POSTED',
          createdById: userId
        }
      });
      
      // Create reversal journal entry lines (swap debit/credit)
      for (const line of originalJournalEntry.journalEntryLines) {
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: reversalJournalEntry.id,
            chartOfAccountId: line.chartOfAccountId,
            description: `REV: ${line.description}`,
            debitAmount: line.creditAmount, // Swap debit/credit
            creditAmount: line.debitAmount,
            createdById: userId
          }
        });
      }
      
      console.log(`✅ Reversal journal entry created: ${reversalJournalEntry.id}`);
      return reversalJournalEntry.id;
      
    } catch (error: any) {
      console.error('❌ Error creating reversal journal entry:', error.message);
      throw error;
    }
  }
  
  /**
   * Create reversal audit trail
   */
  private static async createReversalAuditTrail(
    originalTransaction: any, 
    reversalTransaction: any, 
    userId: string, 
    reason: string
  ): Promise<void> {
    try {
      
      await prisma.auditTrail.create({
        data: {
          entityType: 'CASHBOOK_ENTRY',
          entityId: originalTransaction.id,
          action: 'REVERSED',
          oldValues: {
            status: originalTransaction.status,
            amount: originalTransaction.amount.toString(),
            description: originalTransaction.description
          },
          newValues: {
            status: 'REVERSED',
            reversalTransactionId: reversalTransaction.id,
            reversalReason: reason
          },
          userId: userId,
          timestamp: new Date(),
          description: `Transaction reversed: ${reason}`
        }
      });
      
    } catch (error: any) {
      console.error('❌ Error creating reversal audit trail:', error.message);
      // Don't throw error as this is not critical
    }
  }
  
  /**
   * Check if period is locked
   */
  private static async isPeriodLocked(transactionDate: Date): Promise<boolean> {
    try {
      
      const year = transactionDate.getFullYear();
      const month = transactionDate.getMonth() + 1;
      
      const lockout = await prisma.periodLockout.findFirst({
        where: {
          year: year,
          month: month,
          isLocked: true
        }
      });
      
      return !!lockout;
      
    } catch (error: any) {
      console.error('❌ Error checking period lockout:', error.message);
      return false; // Allow reversal if we can't check lockout
    }
  }
  
  /**
   * Get reversal history for a transaction
   */
  static async getReversalHistory(transactionId: string): Promise<{ success: boolean; data?: any[]; message: string }> {
    try {
      
      const reversals = await prisma.cashbookEntry.findMany({
        where: { originalTransactionId: transactionId },
        include: {
          bank: true,
          customer: true,
          vendor: true,
          glAccount: true
        },
        orderBy: { createdAt: 'desc' }
      });
      
      return {
        success: true,
        data: reversals,
        message: `Found ${reversals.length} reversal(s)`
      };
      
    } catch (error: any) {
      console.error('❌ Error getting reversal history:', error.message);
      return { success: false, message: `Failed to get reversal history: ${error.message}` };
    }
  }
  
  /**
   * Get all reversals for a user
   */
  static async getAllReversals(
    userId: string, 
    page: number = 1, 
    limit: number = 50
  ): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      
      const offset = (page - 1) * limit;
      
      const reversals = await prisma.cashbookEntry.findMany({
        where: { 
          originalTransactionId: { not: null },
          createdById: userId
        },
        include: {
          bank: true,
          customer: true,
          vendor: true,
          glAccount: true,
          originalTransaction: {
            include: {
              bank: true,
              customer: true,
              vendor: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit
      });
      
      const total = await prisma.cashbookEntry.count({
        where: { 
          originalTransactionId: { not: null },
          createdById: userId
        }
      });
      
      return {
        success: true,
        data: {
          reversals: reversals,
          pagination: {
            page: page,
            limit: limit,
            total: total,
            pages: Math.ceil(total / limit)
          }
        },
        message: `Found ${reversals.length} reversal(s)`
      };
      
    } catch (error: any) {
      console.error('❌ Error getting all reversals:', error.message);
      return { success: false, message: `Failed to get reversals: ${error.message}` };
    }
  }
  
  /**
   * Check if transaction can be reversed
   */
  static async canReverseTransaction(transactionId: string): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      
      const transaction = await prisma.cashbookEntry.findUnique({
        where: { id: transactionId },
        include: {
          bank: true,
          batch: true
        }
      });
      
      if (!transaction) {
        return { success: false, message: 'Transaction not found' };
      }
      
      if (transaction.status !== 'POSTED') {
        return { 
          success: false, 
          message: 'Only posted transactions can be reversed',
          data: { canReverse: false, reason: 'Not posted' }
        };
      }
      
      // Check if already reversed
      const existingReversal = await prisma.cashbookEntry.findFirst({
        where: { originalTransactionId: transactionId }
      });
      
      if (existingReversal) {
        return { 
          success: false, 
          message: 'Transaction has already been reversed',
          data: { canReverse: false, reason: 'Already reversed' }
        };
      }
      
      // Check period lockout
      const transactionDate = new Date(transaction.transactionDate);
      const isPeriodLocked = await this.isPeriodLocked(transactionDate);
      
      if (isPeriodLocked) {
        return { 
          success: false, 
          message: 'Cannot reverse transaction in locked period',
          data: { canReverse: false, reason: 'Period locked' }
        };
      }
      
      return {
        success: true,
        data: { canReverse: true, reason: 'OK' },
        message: 'Transaction can be reversed'
      };
      
    } catch (error: any) {
      console.error('❌ Error checking if transaction can be reversed:', error.message);
      return { success: false, message: `Failed to check reversal eligibility: ${error.message}` };
    }
  }
}

