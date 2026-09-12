// @ts-nocheck
import { PrismaClient, Decimal } from '@prisma/client';
import { prisma } from '../utils/database';
import AuditService from './AuditService';
import { assignNextAuditIdAndCreateJournal } from './AuditTrailSequenceService';
import PeriodLockService from './PeriodLockService';

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

      if (!fromBank.glAccountId || !toBank.glAccountId) {
        return {
          success: false,
          message: 'Both bank accounts must have a GL account linked (chart of accounts).'
        };
      }

      if (fromBank.currencyId !== toBank.currencyId) {
        return {
          success: false,
          message: 'Internal transfers are only supported between banks in the same currency (e.g. both ZIG).'
        };
      }

      // Check period lockout
      const isPeriodLocked = await this.isPeriodLocked(transferRequest.transferDate);
      if (isPeriodLocked) {
        return { success: false, message: 'Cannot create transfer in locked period' };
      }
      
      // Generate reference if not provided or if it's a placeholder
      const reference = (transferRequest.reference && transferRequest.reference !== 'string') 
        ? transferRequest.reference 
        : await this.generateTransferReference();
      
      console.log(`🔢 Transfer reference: ${reference}`);
      console.log(`📝 Transfer description: ${transferRequest.description}`);
      console.log(`💰 Transfer amount: ${transferRequest.amount}`);
      console.log(`📅 Transfer date: ${transferRequest.transferDate}`);
      
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
      
      // Create audit trail (non-critical, don't fail if this fails)
      try {
        await this.createTransferAuditTrail(transfer, userId);
      } catch (auditError: any) {
        console.warn('⚠️ Failed to create audit trail (non-critical):', auditError.message);
      }
      
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
      
      // Provide more specific error messages
      if (error.message.includes('Unique constraint failed') && error.message.includes('referenceNumber_key')) {
        return { 
          success: false, 
          message: 'Transfer creation failed due to reference number conflict. Please try again.' 
        };
      } else if (error.message.includes('Cannot transfer to the same bank account')) {
        return { 
          success: false, 
          message: 'Cannot transfer to the same bank account. Please select different accounts.' 
        };
      } else if (error.message.includes('bank account not found')) {
        return { 
          success: false, 
          message: 'One or both bank accounts not found. Please verify account selection.' 
        };
      } else if (error.message.includes('locked period')) {
        return { 
          success: false, 
          message: 'Cannot create transfer in locked period. Please contact administrator.' 
        };
      } else {
        return { 
          success: false, 
          message: `Failed to create transfer: ${error.message}` 
        };
      }
    }
  }
  
  /**
   * One balanced journal for an internal bank-to-bank move (no P&L).
   * Dr destination bank GL (e.g. 1150 Petty Cash), Cr source bank GL (e.g. 1100 Savings).
   * Previously two JEs duplicated Dr/Cr and netted to zero on the GL — fixed here.
   *
   * CashbookEntry.journalEntryId is @unique, so only the OUT line is linked to this JE.
   */
  private static async createTransferJournalEntries(
    fromTransaction: any,
    toTransaction: any,
    fromBank: any,
    toBank: any,
    userId: string
  ): Promise<void> {
    const maxRetries = 3;
    let attempts = 0;
    const amount = new Decimal(fromTransaction.amount.toString());

    while (attempts < maxRetries) {
      try {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000);
        const ref = `TR-${timestamp}-${random}`;

        // Default interactive transaction timeout (5s) is too low under load / remote DB; same as createJournalEntryWithAuditSequence.
        const journalEntry = await prisma.$transaction(
          async (tx) => {
            const je = await assignNextAuditIdAndCreateJournal(tx, {
              transactionDate: fromTransaction.transactionDate,
              referenceNumber: ref,
              description: `Internal transfer: ${fromBank.name} → ${toBank.name}`,
              totalAmount: amount,
              currencyId: fromBank.currencyId,
              status: 'POSTED',
              createdById: userId,
            });

            await tx.journalEntryLine.create({
              data: {
                journalEntryId: je.id,
                chartOfAccountId: toBank.glAccountId,
                description: `Transfer in — ${toBank.name}`,
                debitAmount: amount,
                creditAmount: new Decimal(0),
              },
            });

            await tx.journalEntryLine.create({
              data: {
                journalEntryId: je.id,
                chartOfAccountId: fromBank.glAccountId,
                description: `Transfer out — ${fromBank.name}`,
                debitAmount: new Decimal(0),
                creditAmount: amount,
              },
            });

            await tx.cashbookEntry.update({
              where: { id: fromTransaction.id },
              data: { journalEntryId: je.id },
            });

            return je;
          },
          { maxWait: 60000, timeout: 120000 }
        );

        await AuditService.log({
          userId,
          action: 'CREATE',
          entityType: 'JournalEntry',
          entityId: journalEntry.id,
          newValues: {
            id: journalEntry.id,
            referenceNumber: journalEntry.referenceNumber,
            description: journalEntry.description,
            createdById: journalEntry.createdById,
            auditTrailSequenceNumber: journalEntry.auditTrailSequenceNumber
          }
        });

        console.log(`✅ Transfer journal entry created: ${journalEntry.id} (Dr to-bank GL, Cr from-bank GL)`);
        return;
      } catch (error: any) {
        attempts++;
        console.error(`❌ Error creating transfer journal entries (attempt ${attempts}):`, error.message);

        if (error.message.includes('Unique constraint failed') && error.message.includes('referenceNumber_key')) {
          if (attempts < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            continue;
          }
          throw new Error(
            `Failed to create journal entries after ${maxRetries} attempts due to reference number conflicts`
          );
        }
        throw error;
      }
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
   * Generate transfer reference with retry logic for uniqueness
   */
  private static async generateTransferReference(): Promise<string> {
    const maxRetries = 5;
    let attempts = 0;
    
    console.log('🔢 Starting transfer reference generation...');
    
    while (attempts < maxRetries) {
      try {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000); // Increased randomness
        const reference = `TR-${timestamp}-${random}`;
        
        console.log(`🔍 Checking reference: ${reference} (attempt ${attempts + 1})`);
        
        // Check if this reference already exists
        const existingTransfer = await prisma.cashbookTransfer.findFirst({
          where: { reference: reference }
        });
        
        if (!existingTransfer) {
          console.log(`✅ Unique reference generated: ${reference}`);
          return reference;
        }
        
        attempts++;
        console.log(`⚠️ Reference ${reference} already exists, retrying... (attempt ${attempts})`);
        
        // Add small delay to ensure different timestamp
        await new Promise(resolve => setTimeout(resolve, 10));
        
      } catch (error: any) {
        console.error('❌ Error generating transfer reference:', error.message);
        attempts++;
        
        if (attempts >= maxRetries) {
          // Fallback to UUID-based reference
          const fallbackRef = `TR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          console.log(`🔄 Using fallback reference: ${fallbackRef}`);
          return fallbackRef;
        }
      }
    }
    
    // Final fallback
    const finalRef = `TR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`🔄 Using final fallback reference: ${finalRef}`);
    return finalRef;
  }
  
  /**
   * Check if period is locked
   */
  private static async isPeriodLocked(transferDate: Date): Promise<boolean> {
    try {
      return await PeriodLockService.isLegacyCashbookMonthLocked(transferDate);
    } catch (error: any) {
      console.error("❌ Error checking period lockout:", error.message);
      return false;
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
    dateTo?: Date,
    currencyId?: string
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

      if (currencyId) {
        whereClause.OR = [
          { fromBank: { currencyId } },
          { toBank: { currencyId } }
        ];
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

