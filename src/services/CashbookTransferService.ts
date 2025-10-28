// @ts-nocheck
import { PrismaClient, Decimal } from '@prisma/client';
import { prisma } from '../utils/database';

export interface TransferRequest {
  fromBankId: string;
  toBankId: string;
  amount: Decimal;
  transferDate: Date;
  description: string;
  reference?: string;
  projectCode?: string;
}

export interface TransferResult {
  success: boolean;
  message: string;
  data?: {
    transferId: string;
    fromTransactionId: string;
    toTransactionId: string;
    amount: Decimal;
    transferDate: Date;
  };
}

export class CashbookTransferService {
  
  /**
   * Create a transfer between cashbooks
   */
  static async createTransfer(
    transferRequest: TransferRequest, 
    userId: string
  ): Promise<TransferResult> {
    try {
      
      // Validate banks
      const fromBank = await prisma.bank.findUnique({
        where: { id: transferRequest.fromBankId }
      });
      
      const toBank = await prisma.bank.findUnique({
        where: { id: transferRequest.toBankId }
      });
      
      if (!fromBank) {
        return { success: false, message: 'Source bank account not found' };
      }
      
      if (!toBank) {
        return { success: false, message: 'Destination bank account not found' };
      }
      
      if (fromBank.id === toBank.id) {
        return { success: false, message: 'Cannot transfer to the same bank account' };
      }
      
      // Check if banks are active
      if (!fromBank.isActive) {
        return { success: false, message: 'Source bank account is not active' };
      }
      
      if (!toBank.isActive) {
        return { success: false, message: 'Destination bank account is not active' };
      }
      
      // Check period lockout
      const isPeriodLocked = await this.isPeriodLocked(transferRequest.transferDate);
      if (isPeriodLocked) {
        return { success: false, message: 'Cannot create transfer in locked period' };
      }
      
      // Generate reference if not provided
      const reference = transferRequest.reference || await this.generateTransferReference();
      
      // Create transfer record
      const transfer = await prisma.cashbookTransfer.create({
        data: {
          fromBankId: transferRequest.fromBankId,
          toBankId: transferRequest.toBankId,
          amount: transferRequest.amount,
          transferDate: transferRequest.transferDate,
          description: transferRequest.description,
          reference: reference,
          projectCode: transferRequest.projectCode,
          status: 'POSTED',
          createdById: userId,
          postedAt: new Date(),
          postedById: userId
        }
      });
      
      // Create outgoing transaction (from source bank)
      const fromTransaction = await prisma.cashbookEntry.create({
        data: {
          bankId: transferRequest.fromBankId,
          transactionDate: transferRequest.transferDate,
          type: 'PAYMENT',
          amount: transferRequest.amount,
          description: `TRANSFER OUT: ${transferRequest.description}`,
          reference: `${reference}-OUT`,
          counterpartyType: 'GL',
          glAccountId: toBank.glAccountId, // Credit destination bank's GL account
          status: 'POSTED',
          transferId: transfer.id,
          createdById: userId,
          postedAt: new Date(),
          postedById: userId
        }
      });
      
      // Create incoming transaction (to destination bank)
      const toTransaction = await prisma.cashbookEntry.create({
        data: {
          bankId: transferRequest.toBankId,
          transactionDate: transferRequest.transferDate,
          type: 'RECEIPT',
          amount: transferRequest.amount,
          description: `TRANSFER IN: ${transferRequest.description}`,
          reference: `${reference}-IN`,
          counterpartyType: 'GL',
          glAccountId: fromBank.glAccountId, // Debit source bank's GL account
          status: 'POSTED',
          transferId: transfer.id,
          createdById: userId,
          postedAt: new Date(),
          postedById: userId
        }
      });
      
      // Create journal entries for both transactions
      await this.createTransferJournalEntries(
        fromTransaction, 
        toTransaction, 
        fromBank, 
        toBank, 
        userId
      );
      
      // Create audit trail
      await this.createTransferAuditTrail(transfer, userId);
      
      console.log(`✅ Transfer created: ${transfer.id} - ${transferRequest.amount} from ${fromBank.name} to ${toBank.name}`);
      
      return {
        success: true,
        message: 'Transfer created successfully',
        data: {
          transferId: transfer.id,
          fromTransactionId: fromTransaction.id,
          toTransactionId: toTransaction.id,
          amount: transferRequest.amount,
          transferDate: transferRequest.transferDate
        }
      };
      
    } catch (error: any) {
      console.error('❌ Error creating transfer:', error.message);
      return { success: false, message: `Failed to create transfer: ${error.message}` };
    }
  }
  
  /**
   * Create journal entries for transfer
   */
  private static async createTransferJournalEntries(
    fromTransaction: any,
    toTransaction: any,
    fromBank: any,
    toBank: any,
    userId: string
  ): Promise<void> {
    try {
      
      // Create journal entry for outgoing transaction
      const fromJournalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate: fromTransaction.transactionDate,
          referenceNumber: `TR-${fromTransaction.reference}`,
          description: `Transfer out to ${toBank.name}`,
          totalAmount: fromTransaction.amount,
          currencyId: fromBank.currencyId,
          status: 'POSTED',
          createdById: userId
        }
      });
      
      // Create journal entry lines for outgoing transaction
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: fromJournalEntry.id,
          chartOfAccountId: fromBank.glAccountId,
          description: `Transfer out to ${toBank.name}`,
          debitAmount: fromTransaction.amount,
          creditAmount: new Decimal(0)
        }
      });
      
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: fromJournalEntry.id,
          chartOfAccountId: toBank.glAccountId,
          description: `Transfer out to ${toBank.name}`,
          debitAmount: new Decimal(0),
          creditAmount: fromTransaction.amount
        }
      });
      
      // Create journal entry for incoming transaction
      const toJournalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate: toTransaction.transactionDate,
          referenceNumber: `TR-${toTransaction.reference}`,
          description: `Transfer in from ${fromBank.name}`,
          totalAmount: toTransaction.amount,
          currencyId: toBank.currencyId,
          status: 'POSTED',
          createdById: userId
        }
      });
      
      // Create journal entry lines for incoming transaction
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: toJournalEntry.id,
          chartOfAccountId: toBank.glAccountId,
          description: `Transfer in from ${fromBank.name}`,
          debitAmount: toTransaction.amount,
          creditAmount: new Decimal(0)
        }
      });
      
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: toJournalEntry.id,
          chartOfAccountId: fromBank.glAccountId,
          description: `Transfer in from ${fromBank.name}`,
          debitAmount: new Decimal(0),
          creditAmount: toTransaction.amount
        }
      });
      
      console.log(`✅ Transfer journal entries created: ${fromJournalEntry.id}, ${toJournalEntry.id}`);
      
    } catch (error: any) {
      console.error('❌ Error creating transfer journal entries:', error.message);
      throw error;
    }
  }
  
  /**
   * Create transfer audit trail
   */
  private static async createTransferAuditTrail(transfer: any, userId: string): Promise<void> {
    try {
      
      await prisma.auditLog.create({
        data: {
          entityType: 'CASHBOOK_TRANSFER',
          entityId: transfer.id,
          action: 'CREATED',
          oldValues: {},
          newValues: {
            fromBankId: transfer.fromBankId,
            toBankId: transfer.toBankId,
            amount: transfer.amount.toString(),
            description: transfer.description,
            reference: transfer.reference
          },
          userId: userId
        }
      });
      
    } catch (error: any) {
      console.error('❌ Error creating transfer audit trail:', error.message);
      // Don't throw error as this is not critical
    }
  }
  
  /**
   * Generate transfer reference
   */
  private static async generateTransferReference(): Promise<string> {
    try {
      
      // Get the last transfer reference
      const lastTransfer = await prisma.cashbookTransfer.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { reference: true }
      });
      
      let nextNumber = 1;
      if (lastTransfer?.reference) {
        const match = lastTransfer.reference.match(/TR-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }
      
      return `TR-${nextNumber.toString().padStart(6, '0')}`;
      
    } catch (error: any) {
      console.error('❌ Error generating transfer reference:', error.message);
      return `TR-${Date.now()}`;
    }
  }
  
  /**
   * Check if period is locked
   */
  private static async isPeriodLocked(transferDate: Date): Promise<boolean> {
    try {
      
      const year = transferDate.getFullYear();
      const month = transferDate.getMonth() + 1;
      
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
      return false; // Allow transfer if we can't check lockout
    }
  }
  
  /**
   * Get transfer details
   */
  static async getTransfer(transferId: string): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      
      const transfer = await prisma.cashbookTransfer.findUnique({
        where: { id: transferId },
        include: {
          fromBank: true,
          toBank: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          transactions: {
            include: {
              bank: true
            }
          }
        }
      });
      
      if (!transfer) {
        return { success: false, message: 'Transfer not found' };
      }
      
      return {
        success: true,
        data: transfer,
        message: 'Transfer retrieved successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error getting transfer:', error.message);
      return { success: false, message: `Failed to get transfer: ${error.message}` };
    }
  }
  
  /**
   * List transfers for a user
   */
  static async listTransfers(
    userId: string,
    page: number = 1,
    limit: number = 50,
    fromBankId?: string,
    toBankId?: string,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      
      const offset = (page - 1) * limit;
      
      let whereClause: any = {
        createdById: userId
      };
      
      if (fromBankId) {
        whereClause.fromBankId = fromBankId;
      }
      
      if (toBankId) {
        whereClause.toBankId = toBankId;
      }
      
      if (dateFrom || dateTo) {
        whereClause.transferDate = {};
        if (dateFrom) {
          whereClause.transferDate.gte = dateFrom;
        }
        if (dateTo) {
          whereClause.transferDate.lte = dateTo;
        }
      }
      
      const transfers = await prisma.cashbookTransfer.findMany({
        where: whereClause,
        include: {
          fromBank: true,
          toBank: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit
      });
      
      const total = await prisma.cashbookTransfer.count({
        where: whereClause
      });
      
      return {
        success: true,
        data: {
          transfers: transfers,
          pagination: {
            page: page,
            limit: limit,
            total: total,
            pages: Math.ceil(total / limit)
          }
        },
        message: `Found ${transfers.length} transfer(s)`
      };
      
    } catch (error: any) {
      console.error('❌ Error listing transfers:', error.message);
      return { success: false, message: `Failed to list transfers: ${error.message}` };
    }
  }
  
  /**
   * Get transfer summary
   */
  static async getTransferSummary(
    userId: string,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<{ success: boolean; data?: any; message: string }> {
    try {
      
      let whereClause: any = {
        createdById: userId
      };
      
      if (dateFrom || dateTo) {
        whereClause.transferDate = {};
        if (dateFrom) {
          whereClause.transferDate.gte = dateFrom;
        }
        if (dateTo) {
          whereClause.transferDate.lte = dateTo;
        }
      }
      
      const transfers = await prisma.cashbookTransfer.findMany({
        where: whereClause,
        select: {
          amount: true,
          transferDate: true,
          fromBankId: true,
          toBankId: true
        }
      });
      
      const totalTransfers = transfers.length;
      const totalAmount = transfers.reduce((sum, transfer) => 
        sum.add(transfer.amount), new Decimal(0)
      );
      
      // Group by bank
      const bankSummary = transfers.reduce((acc, transfer) => {
        const fromBankId = transfer.fromBankId;
        const toBankId = transfer.toBankId;
        
        if (!acc[fromBankId]) {
          acc[fromBankId] = { out: new Decimal(0), in: new Decimal(0) };
        }
        if (!acc[toBankId]) {
          acc[toBankId] = { out: new Decimal(0), in: new Decimal(0) };
        }
        
        acc[fromBankId].out = acc[fromBankId].out.add(transfer.amount);
        acc[toBankId].in = acc[toBankId].in.add(transfer.amount);
        
        return acc;
      }, {} as any);
      
      return {
        success: true,
        data: {
          totalTransfers: totalTransfers,
          totalAmount: totalAmount,
          bankSummary: bankSummary
        },
        message: 'Transfer summary retrieved successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error getting transfer summary:', error.message);
      return { success: false, message: `Failed to get transfer summary: ${error.message}` };
    }
  }
}

