// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { BankStatementUploadService } from './BankStatementUploadService';
import { BankReconciliationEngineService } from './BankReconciliationEngineService';
import { Decimal } from 'decimal.js';

const prisma = new PrismaClient();

interface ReconciliationWithDetails {
  id: string;
  fileName: string;
  fileUrl: string;
  status: string;
  totalTransactions: number;
  matchedCount: number;
  unmatchedCount: number;
  confidenceThreshold: number; // Changed from Decimal to number
  overallAccuracy: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  bankTransactions: Array<{
    id: string;
    description: string;
    amount: Decimal;
    transactionDate: Date;
    reference: string | null;
    isMatched: boolean;
    confidenceScore: number | null;
    matchedJournalEntryId: string | null;
    notes: string | null;
  }>;
  reconciliationResults: Array<{
    id: string;
    matchType: string;
    confidenceScore: number;
    status: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
  }>;
}

interface ReconciliationSummary {
  totalReconciliations: number;
  completedReconciliations: number;
  pendingReconciliations: number;
  failedReconciliations: number;
  totalTransactions: number;
  matchedTransactions: number;
  unmatchedTransactions: number;
  averageAccuracy: number | null;
}

export class BankReconciliationService {
  static async uploadAndProcessBankStatement(
    file: Express.Multer.File, 
    userId: string
  ): Promise<any> {
    try {
      // Step 1: Upload file to S3 and create reconciliation record
      const uploadResult = await BankStatementUploadService.uploadBankStatement(file, userId);
      
      // Step 2: Parse and store transactions
      const transactions = await BankStatementUploadService.parseCSVFile(file.buffer);
      const storedCount = await BankStatementUploadService.storeTransactions(
        uploadResult.reconciliationId, 
        transactions
      );
      
      // Step 3: Run reconciliation engine
      const summary = await BankReconciliationEngineService.runReconciliation(
        uploadResult.reconciliationId, 
        userId
      );
      
      return {
        reconciliationId: uploadResult.reconciliationId,
        fileName: uploadResult.fileName,
        totalTransactions: storedCount,
        matchedCount: summary.matchedCount,
        unmatchedCount: summary.unmatchedCount,
        overallAccuracy: summary.overallAccuracy
      };
    } catch (error) {
      console.error('Error in uploadAndProcessBankStatement:', error);
      throw error;
    }
  }

  static async getReconciliations(
    userId: string, 
    filters: any = {}
  ): Promise<{ reconciliations: ReconciliationWithDetails[]; total: number }> {
    try {
      const where: any = {
        createdById: userId
      };

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.startDate) {
        where.createdAt = {
          ...where.createdAt,
          gte: new Date(filters.startDate)
        };
      }

      if (filters.endDate) {
        where.createdAt = {
          ...where.createdAt,
          lte: new Date(filters.endDate)
        };
      }

      const page = parseInt(filters.page) || 1;
      const limit = parseInt(filters.limit) || 10;
      const skip = (page - 1) * limit;

      const [reconciliations, total] = await Promise.all([
        prisma.bankReconciliation.findMany({
          where,
          include: {
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            bankTransactions: {
              select: {
                id: true,
                description: true,
                amount: true,
                transactionDate: true,
                reference: true,
                isMatched: true,
                confidenceScore: true,
                matchedJournalEntryId: true,
                notes: true
              }
            },
            reconciliationResults: {
              include: {
                createdBy: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.bankReconciliation.count({ where })
      ]);

      // Convert Decimal to number for confidenceThreshold
      const reconciliationsWithNumberThreshold = reconciliations.map(reconciliation => ({
        ...reconciliation,
        confidenceThreshold: Number(reconciliation.confidenceThreshold)
      }));

      return { reconciliations: reconciliationsWithNumberThreshold, total };
    } catch (error) {
      console.error('Error getting reconciliations:', error);
      throw error;
    }
  }

  static async getReconciliationById(id: string): Promise<ReconciliationWithDetails | null> {
    try {
      const reconciliation = await prisma.bankReconciliation.findUnique({
        where: { id },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          bankTransactions: {
            select: {
              id: true,
              description: true,
              amount: true,
              transactionDate: true,
              reference: true,
              isMatched: true,
              confidenceScore: true,
              matchedJournalEntryId: true,
              notes: true
            }
          },
          reconciliationResults: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!reconciliation) return null;

      // Convert Decimal to number for confidenceThreshold
      return {
        ...reconciliation,
        confidenceThreshold: Number(reconciliation.confidenceThreshold)
      };
    } catch (error) {
      console.error('Error getting reconciliation by ID:', error);
      throw error;
    }
  }

  static async getReconciliationSummary(): Promise<ReconciliationSummary> {
    try {
      const [
        totalReconciliations,
        completedReconciliations,
        pendingReconciliations,
        failedReconciliations,
        totalTransactions,
        matchedTransactions,
        unmatchedTransactions,
        averageAccuracy
      ] = await Promise.all([
        prisma.bankReconciliation.count(),
        prisma.bankReconciliation.count({ where: { status: 'COMPLETED' } }),
        prisma.bankReconciliation.count({ where: { status: 'PENDING' } }),
        prisma.bankReconciliation.count({ where: { status: 'FAILED' } }),
        prisma.bankTransaction.count(),
        prisma.bankTransaction.count({ where: { isMatched: true } }),
        prisma.bankTransaction.count({ where: { isMatched: false } }),
        prisma.bankReconciliation.aggregate({
          _avg: { overallAccuracy: true }
        })
      ]);

      return {
        totalReconciliations,
        completedReconciliations,
        pendingReconciliations,
        failedReconciliations,
        totalTransactions,
        matchedTransactions,
        unmatchedTransactions,
        averageAccuracy: averageAccuracy._avg.overallAccuracy ? Number(averageAccuracy._avg.overallAccuracy) : null
      };
    } catch (error) {
      console.error('Error getting reconciliation summary:', error);
      throw error;
    }
  }

  static async getUnmatchedTransactions(
    reconciliationId: string, 
    minAmount: number = 5.00
  ): Promise<any[]> {
    try {
      return await BankReconciliationEngineService.getUnmatchedTransactions(reconciliationId, minAmount);
    } catch (error) {
      console.error('Error getting unmatched transactions:', error);
      throw error;
    }
  }

  static async getPotentialMatches(
    bankTransactionId: string, 
    limit: number = 10
  ): Promise<any[]> {
    try {
      return await BankReconciliationEngineService.getPotentialMatches(bankTransactionId, limit);
    } catch (error) {
      console.error('Error getting potential matches:', error);
      throw error;
    }
  }

  static async approveManualMatch(
    reconciliationId: string, 
    bankTransactionId: string, 
    journalEntryId: string, 
    userId: string
  ): Promise<void> {
    try {
      await BankReconciliationEngineService.approveManualMatch(
        reconciliationId, 
        bankTransactionId, 
        journalEntryId, 
        userId
      );
    } catch (error) {
      console.error('Error approving manual match:', error);
      throw error;
    }
  }

  static async rejectReconciliationResult(
    reconciliationResultId: string, 
    userId: string, 
    reason?: string
  ): Promise<void> {
    try {
      await prisma.reconciliationResult.update({
        where: { id: reconciliationResultId },
        data: {
          status: 'REJECTED',
          notes: reason || 'Rejected by user'
        }
      });

      // Create audit trail entry
      await prisma.reconciliationAuditTrail.create({
        data: {
          reconciliationId: (await prisma.reconciliationResult.findUnique({
            where: { id: reconciliationResultId }
          }))!.reconciliationId,
          action: 'REJECT',
          details: {
            reconciliationResultId,
            reason: reason || 'Rejected by user',
            userId
          },
          createdById: userId
        }
      });
    } catch (error) {
      console.error('Error rejecting reconciliation result:', error);
      throw error;
    }
  }

  static async getAuditTrail(reconciliationId: string): Promise<any[]> {
    try {
      return await prisma.reconciliationAuditTrail.findMany({
        where: { reconciliationId },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      console.error('Error getting audit trail:', error);
      throw error;
    }
  }

  static async deleteReconciliation(reconciliationId: string, userId: string): Promise<void> {
    try {
      // Soft delete - mark as DELETED
      await prisma.bankReconciliation.update({
        where: { id: reconciliationId },
        data: { status: 'DELETED' }
      });

      // Create audit trail entry
      await prisma.reconciliationAuditTrail.create({
        data: {
          reconciliationId,
          action: 'DELETE',
          details: {
            reconciliationId,
            userId
          },
          createdById: userId
        }
      });
    } catch (error) {
      console.error('Error deleting reconciliation:', error);
      throw error;
    }
  }
} 