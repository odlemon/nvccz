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
      // Step 1: Create reconciliation record WITHOUT uploading to S3
      const timestamp = Date.now();
      const fileName = `${timestamp}-${file.originalname}`;
      const reconciliation = await prisma.bankReconciliation.create({
        data: {
          fileName: file.originalname,
          // Mark as inline upload to avoid any external storage dependency
          fileUrl: 'inline_upload',
          status: 'PENDING',
          createdById: userId
        }
      });

      // Step 2: Parse CSV content from the in-memory buffer and store transactions
      const transactions = await BankStatementUploadService.parseCSVFile(file.buffer);
      const storedCount = await BankStatementUploadService.storeTransactions(
        reconciliation.id,
        transactions
      );

      // Step 3: Run reconciliation engine
      const summary = await BankReconciliationEngineService.runReconciliation(
        reconciliation.id,
        userId
      );

      return {
        reconciliationId: reconciliation.id,
        fileName: fileName,
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

  /**
   * Manual reconciliation
   */
  static async manualReconcile(statementLineId: string, journalEntryId: string, userId: string): Promise<void> {
    try {
      // Get statement line
      const statementLine = await prisma.bankTransaction.findUnique({
        where: { id: statementLineId }
      });

      if (!statementLine) {
        throw new Error('Bank statement line not found');
      }

      // Get journal entry
      const journalEntry = await prisma.journalEntry.findUnique({
        where: { id: journalEntryId }
      });

      if (!journalEntry) {
        throw new Error('Journal entry not found');
      }

      // Create manual reconciliation result
      await prisma.reconciliationResult.create({
        data: {
          reconciliationId: statementLine.reconciliationId!,
          bankTransactionId: statementLineId,
          journalEntryId: journalEntryId,
          matchType: 'MANUAL',
          matchScore: 100,
          isApproved: true,
          approvedBy: userId,
          approvedAt: new Date()
        }
      });

      // Update statement line status
      await prisma.bankTransaction.update({
        where: { id: statementLineId },
        data: { status: 'RECONCILED' }
      });

      // Audit log
      await AuditService.log({
        userId,
        action: 'CREATE',
        entityType: 'ReconciliationResult',
        entityId: statementLineId,
        newValues: { journalEntryId, matchType: 'MANUAL' }
      });
    } catch (error) {
      console.error('Error in manual reconciliation:', error);
      throw error;
    }
  }

  /**
   * Create journal entry from bank statement
   */
  static async createJournalFromBankStatement(statementLineId: string, accountId: string, userId: string): Promise<string> {
    try {
      const statementLine = await prisma.bankTransaction.findUnique({
        where: { id: statementLineId }
      });

      if (!statementLine) {
        throw new Error('Bank statement line not found');
      }

      // Create journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          entryDate: statementLine.transactionDate,
          description: `Bank Statement: ${statementLine.description}`,
          reference: statementLine.reference,
          status: 'POSTED',
          createdById: userId
        }
      });

      // Create journal entry lines
      if (statementLine.amount > 0) {
        // Credit entry
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            accountId: accountId,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(statementLine.amount),
            description: statementLine.description
          }
        });

        // Debit bank account
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            accountId: statementLine.accountId,
            debitAmount: new Decimal(statementLine.amount),
            creditAmount: new Decimal(0),
            description: statementLine.description
          }
        });
      } else {
        // Debit entry
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            accountId: accountId,
            debitAmount: new Decimal(Math.abs(statementLine.amount)),
            creditAmount: new Decimal(0),
            description: statementLine.description
          }
        });

        // Credit bank account
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            accountId: statementLine.accountId,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(Math.abs(statementLine.amount)),
            description: statementLine.description
          }
        });
      }

      // Update statement line status
      await prisma.bankTransaction.update({
        where: { id: statementLineId },
        data: { status: 'RECONCILED' }
      });

      // Audit log
      await AuditService.log({
        userId,
        action: 'CREATE',
        entityType: 'JournalEntry',
        entityId: journalEntry.id,
        newValues: { source: 'BANK_STATEMENT', statementLineId }
      });

      return journalEntry.id;
    } catch (error) {
      console.error('Error creating journal entry from bank statement:', error);
      throw error;
    }
  }

  /**
   * Generate reconciliation report
   */
  static async generateReconciliationReport(reconciliationId: string): Promise<{
    reconciliation: any;
    summary: {
      totalTransactions: number;
      matchedTransactions: number;
      unmatchedTransactions: number;
      matchRate: number;
    };
    details: Array<{
      transactionId: string;
      description: string;
      amount: number;
      matchStatus: string;
      journalEntryId?: string;
    }>;
  }> {
    try {
      const reconciliation = await prisma.bankReconciliation.findUnique({
        where: { id: reconciliationId },
        include: {
          bankTransactions: true,
          reconciliationResults: {
            include: {
              bankTransaction: true,
              journalEntry: true
            }
          }
        }
      });

      if (!reconciliation) {
        throw new Error('Reconciliation not found');
      }

      const totalTransactions = reconciliation.bankTransactions.length;
      const matchedTransactions = reconciliation.reconciliationResults.length;
      const unmatchedTransactions = totalTransactions - matchedTransactions;
      const matchRate = totalTransactions > 0 ? (matchedTransactions / totalTransactions) * 100 : 0;

      const details = reconciliation.bankTransactions.map(transaction => {
        const result = reconciliation.reconciliationResults.find(r => r.bankTransactionId === transaction.id);
        return {
          transactionId: transaction.id,
          description: transaction.description,
          amount: Number(transaction.amount),
          matchStatus: result ? 'MATCHED' : 'UNMATCHED',
          journalEntryId: result?.journalEntryId
        };
      });

      return {
        reconciliation,
        summary: {
          totalTransactions,
          matchedTransactions,
          unmatchedTransactions,
          matchRate
        },
        details
      };
    } catch (error) {
      console.error('Error generating reconciliation report:', error);
      throw error;
    }
  }

  /**
   * Create bank statement from JSON data
   */
  static async createBankStatementFromJSON(params: {
    accountId: string;
    statementDate: Date;
    openingBalance: number;
    closingBalance: number;
    transactions: Array<{
      transactionDate: string;
      description: string;
      amount: number;
      reference?: string;
      type?: 'DEBIT' | 'CREDIT';
    }>;
    createdById: string;
  }): Promise<{
    statementId: string;
    importedCount: number;
    message: string;
  }> {
    try {
      const { accountId, statementDate, openingBalance, closingBalance, transactions, createdById } = params;

      // Create bank reconciliation record
      const bankReconciliation = await prisma.bankReconciliation.create({
        data: {
          fileName: `JSON_Statement_${statementDate}`,
          fileUrl: 'json_upload',
          status: 'PENDING',
          totalTransactions: transactions.length,
          matchedCount: 0,
          unmatchedCount: transactions.length,
          createdById
        }
      });

      let importedCount = 0;

      // Create bank transactions for each transaction
      for (const transaction of transactions) {
        await prisma.bankTransaction.create({
          data: {
            reconciliationId: bankReconciliation.id,
            transactionDate: new Date(transaction.transactionDate),
            description: transaction.description,
            amount: new Decimal(transaction.amount),
            reference: transaction.reference || '',
            isMatched: false,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
        importedCount++;
      }

      return {
        statementId: bankReconciliation.id,
        importedCount,
        message: `Bank reconciliation created with ${importedCount} transactions`
      };
    } catch (error: any) {
      console.error('Error creating bank statement from JSON:', error);
      throw new Error(`Failed to create bank statement from JSON: ${error.message}`);
    }
  }

  /**
   * Import bank statement from file
   */
  static async importBankStatement(
    file: Buffer, 
    format: 'CSV' | 'OFX' | 'QIF', 
    accountId: string, 
    userId: string
  ): Promise<{
    importedCount: number;
    errors: Array<{ line: number; error: string }>;
  }> {
    try {
      let importedCount = 0;
      const errors: Array<{ line: number; error: string }> = [];

      if (format === 'CSV') {
        const csvContent = file.toString('utf-8');
        const lines = csvContent.split('\n');
        
        for (let i = 1; i < lines.length; i++) { // Skip header
          try {
            const [date, description, amount, reference] = lines[i].split(',');
            
            if (!date || !description || !amount) {
              errors.push({ line: i + 1, error: 'Missing required fields' });
              continue;
            }

            await prisma.bankTransaction.create({
              data: {
                accountId,
                transactionDate: new Date(date),
                description: description.trim(),
                amount: new Decimal(parseFloat(amount)),
                reference: reference?.trim() || '',
                status: 'PENDING',
                createdById: userId
              }
            });

            importedCount++;
          } catch (error) {
            errors.push({ line: i + 1, error: `Parse error: ${error}` });
          }
        }
      }

      // TODO: Implement OFX and QIF formats
      if (format === 'OFX' || format === 'QIF') {
        throw new Error(`${format} format not yet implemented`);
      }

      return { importedCount, errors };
    } catch (error) {
      console.error('Error importing bank statement:', error);
      throw error;
    }
  }
} 