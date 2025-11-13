// @ts-nocheck
// Bank Reconciliation Controller
// Handles bank reconciliation endpoints

import { Request, Response } from "express";
import { ResponseHelper } from "../utils/responseHelper";
import BankReconciliationService from "../services/BankReconciliationService";
import { BankReconciliationEngineService } from "../services/BankReconciliationEngineService";
import { Decimal } from "@prisma/client";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

export default class BankReconciliationController {
  
  /**
   * Create bank statement
   * POST /api/cashbook/reconciliation/statements
   */
  static async createBankStatement(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const {
        bankId,
        statementDate,
        openingBalance,
        closingBalance,
        confidenceThreshold
      } = req.body || {};

      let { items } = req.body || {};

      if (!bankId || !statementDate || openingBalance === undefined || closingBalance === undefined || !items) {
        return ResponseHelper.badRequest(
          res,
          "Missing required fields: bankId, statementDate, openingBalance, closingBalance, items"
        );
      }

      if (typeof items === "string") {
        try {
          items = JSON.parse(items);
        } catch {
          return ResponseHelper.badRequest(res, "items must be a valid JSON array");
        }
      }

      if (!Array.isArray(items) || items.length === 0) {
        return ResponseHelper.badRequest(res, "items must contain at least one statement line");
      }

      const parsedItems = items.map((rawItem: any, index: number) => {
        if (!rawItem.transactionDate || !rawItem.description) {
          throw new Error(`Statement item at index ${index} missing transactionDate or description`);
        }

        const debitAmount = rawItem.debitAmount !== undefined ? Number(rawItem.debitAmount) : 0;
        const creditAmount = rawItem.creditAmount !== undefined ? Number(rawItem.creditAmount) : 0;

        const hasDebit = !Number.isNaN(debitAmount) && debitAmount !== 0;
        const hasCredit = !Number.isNaN(creditAmount) && creditAmount !== 0;

        if (!hasDebit && !hasCredit) {
          throw new Error(`Statement item at index ${index} must have either a debitAmount or creditAmount`);
        }

        const amount = hasCredit ? Math.abs(creditAmount) : Math.abs(debitAmount);

        return {
          transactionDate: new Date(rawItem.transactionDate),
          description: rawItem.description,
          reference: rawItem.reference ?? null,
          debitAmount: hasDebit ? Math.abs(debitAmount) : 0,
          creditAmount: hasCredit ? Math.abs(creditAmount) : 0,
          balance: rawItem.balance !== undefined ? Number(rawItem.balance) : null,
          amount,
          direction: hasCredit ? "CREDIT" : "DEBIT"
        };
      });

      const totalDebits = parsedItems.reduce((sum, item) => sum + item.debitAmount, 0);
      const totalCredits = parsedItems.reduce((sum, item) => sum + item.creditAmount, 0);

      const confidenceThresholdValue =
        confidenceThreshold !== undefined && !Number.isNaN(Number(confidenceThreshold))
          ? Number(confidenceThreshold)
          : 90;

      const reconciliation = await prisma.bankReconciliation.create({
        data: {
          fileName: req.file?.originalname ?? `manual-upload-${Date.now()}.json`,
          fileUrl: req.file?.path ?? "manual-entry",
          status: "PROCESSING",
          totalTransactions: parsedItems.length,
          matchedCount: 0,
          unmatchedCount: parsedItems.length,
          confidenceThreshold: new Decimal(confidenceThresholdValue),
          notes: JSON.stringify({
            bankId,
            statementDate,
            openingBalance: Number(openingBalance),
            closingBalance: Number(closingBalance),
            totalDebits,
            totalCredits
          }),
          createdById: userId ?? "system"
        }
      });

      await prisma.bankTransaction.createMany({
        data: parsedItems.map(item => ({
          reconciliationId: reconciliation.id,
          transactionDate: item.transactionDate,
          description: item.description,
          reference: item.reference,
          amount: new Decimal(item.amount),
          isMatched: false,
          notes: JSON.stringify({
            debitAmount: item.debitAmount,
            creditAmount: item.creditAmount,
            balance: item.balance,
            direction: item.direction
          })
        }))
      });

      const summary = await BankReconciliationEngineService.runReconciliation(
        reconciliation.id,
        userId ?? "system",
        confidenceThresholdValue
      );

      const updatedReconciliation = await prisma.bankReconciliation.findUnique({
        where: { id: reconciliation.id },
        include: {
          bankTransactions: {
            orderBy: { transactionDate: "asc" },
            include: {
              reconciliationResults: true
            }
          },
          reconciliationResults: {
            include: {
              journalEntry: {
                include: {
                  journalEntryLines: {
                    include: {
                      chartOfAccount: true
                    }
                  },
                  currency: true
                }
              }
            }
          },
          reconciliationAuditTrails: {
            orderBy: { createdAt: "desc" }
          }
        }
      });

      return ResponseHelper.success(res, "Bank reconciliation processed successfully", {
        reconciliation: updatedReconciliation,
        summary
      });
    } catch (error: any) {
      console.error('Error in BankReconciliationController.createBankStatement:', error);
      return ResponseHelper.error(res, 'Failed to create bank reconciliation', error.message);
    }
  }
  
  /**
   * Get reconciliation status
   * GET /api/cashbook/reconciliation/status/:bankId
   */
  static async getReconciliationStatus(req: Request, res: Response) {
    try {
      const { status, page = "1", limit = "10" } = req.query;

      const where: any = {};
      if (status && typeof status === "string") {
        where.status = status;
      }

      const pageNumber = Number(page) > 0 ? Number(page) : 1;
      const pageSize = Number(limit) > 0 ? Number(limit) : 10;
      const skip = (pageNumber - 1) * pageSize;

      const [total, reconciliations] = await prisma.$transaction([
        prisma.bankReconciliation.count({ where }),
        prisma.bankReconciliation.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
          include: {
            reconciliationResults: true
          }
        })
      ]);

      return ResponseHelper.success(res, 'Reconciliations retrieved successfully', {
        reconciliations,
        pagination: {
          page: pageNumber,
          limit: pageSize,
          total,
          pages: Math.ceil(total / pageSize)
        }
      });
    } catch (error: any) {
      console.error('Error in BankReconciliationController.getReconciliationStatus:', error);
      return ResponseHelper.error(res, 'Failed to get reconciliation status', error.message);
    }
  }

  /**
   * Get reconciliation by ID with transaction details
   * GET /api/accounting/bank-reconciliation/{id}
   */
  static async getReconciliationById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        return ResponseHelper.badRequest(res, "Reconciliation ID is required");
      }

      const reconciliation = await prisma.bankReconciliation.findUnique({
        where: { id },
        include: {
          bankTransactions: {
            orderBy: { transactionDate: "asc" },
            include: {
              reconciliationResults: {
                include: {
                  journalEntry: {
                    include: {
                      journalEntryLines: {
                        include: { chartOfAccount: true }
                      },
                      currency: true
                    }
                  }
                }
              }
            }
          },
          reconciliationResults: {
            include: {
              bankTransaction: true,
              journalEntry: {
                include: {
                  journalEntryLines: {
                    include: { chartOfAccount: true }
                  },
                  currency: true
                }
              }
            }
          },
          reconciliationAuditTrails: {
            orderBy: { createdAt: "desc" },
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
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!reconciliation) {
        return ResponseHelper.notFound(res, "Reconciliation not found");
      }

      return ResponseHelper.success(res, "Reconciliation retrieved successfully", reconciliation);
    } catch (error: any) {
      console.error("Error in BankReconciliationController.getReconciliationById:", error);
      return ResponseHelper.error(res, "Failed to get reconciliation", error.message);
    }
  }
  
  /**
   * Get reconciliation summary statistics
   * GET /api/accounting/bank-reconciliation/summary
   */
  static async getReconciliationSummary(req: Request, res: Response) {
    try {
      const summary = await BankReconciliationEngineService.getSummaryStatistics();
      return ResponseHelper.success(res, 'Reconciliation summary retrieved successfully', summary);
    } catch (error: any) {
      console.error('Error in BankReconciliationController.getReconciliationSummary:', error);
      return ResponseHelper.error(res, 'Failed to get reconciliation summary', error.message);
    }
  }

  /**
   * Perform automatic matching
   * POST /api/cashbook/reconciliation/match/:statementId
   */
  static async performAutomaticMatching(req: Request, res: Response) {
    try {
      const { statementId } = req.params;
      
      const result = await BankReconciliationService.performAutomaticMatching(statementId);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Automatic matching completed successfully', result);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in BankReconciliationController.performAutomaticMatching:', error);
      return ResponseHelper.error(res, 'Failed to perform automatic matching', error.message);
    }
  }
  
  /**
   * Get potential matches for a bank transaction
   * GET /api/accounting/bank-reconciliation/transactions/:bankTransactionId/matches
   */
  static async getTransactionMatches(req: Request, res: Response) {
    try {
      const { bankTransactionId } = req.params;
      const limitParam = req.query?.limit as string | undefined;
      const limit = limitParam ? parseInt(limitParam, 10) : 10;

      if (!bankTransactionId) {
        return ResponseHelper.badRequest(res, 'Bank transaction ID is required');
      }

      const matches = await BankReconciliationEngineService.getPotentialMatches(
        bankTransactionId,
        Number.isNaN(limit) ? 10 : limit
      );

      return ResponseHelper.success(res, 'Potential matches retrieved successfully', matches);
    } catch (error: any) {
      console.error('Error in BankReconciliationController.getTransactionMatches:', error);
      return ResponseHelper.error(res, 'Failed to get potential matches', error.message);
    }
  }

  /**
   * Get reconciliation mismatches
   * GET /api/cashbook/reconciliation/mismatches/:statementId
   */
  static async getReconciliationMismatches(req: Request, res: Response) {
    try {
      const { statementId } = req.params;
      
      const mismatches = await BankReconciliationService.getReconciliationMismatches(statementId);
      
      return ResponseHelper.success(res, 'Reconciliation mismatches retrieved successfully', mismatches);
      
    } catch (error: any) {
      console.error('Error in BankReconciliationController.getReconciliationMismatches:', error);
      return ResponseHelper.error(res, 'Failed to get reconciliation mismatches', error.message);
    }
  }
  
  /**
   * Get unmatched bank transactions for manual review
   * GET /api/accounting/bank-reconciliation/:reconciliationId/unmatched
   */
  static async getUnmatchedTransactions(req: Request, res: Response) {
    try {
      const { reconciliationId } = req.params;
      const minAmountParam = req.query?.minAmount as string | undefined;
      const minAmount = minAmountParam ? parseFloat(minAmountParam) : 5;

      if (!reconciliationId) {
        return ResponseHelper.badRequest(res, 'Reconciliation ID is required');
      }

      const transactions = await BankReconciliationEngineService.getUnmatchedTransactions(
        reconciliationId,
        Number.isNaN(minAmount) ? 5 : minAmount
      );

      return ResponseHelper.success(res, 'Unmatched transactions retrieved successfully', transactions);
    } catch (error: any) {
      console.error('Error in BankReconciliationController.getUnmatchedTransactions:', error);
      return ResponseHelper.error(res, 'Failed to get unmatched transactions', error.message);
    }
  }

  /**
   * Resolve mismatch
   * POST /api/cashbook/reconciliation/mismatches/:mismatchId/resolve
   */
  static async resolveMismatch(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { mismatchId } = req.params;
      const { type, transactionId, notes } = req.body;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      if (!type || !['MATCH_TRANSACTION', 'CREATE_TRANSACTION', 'IGNORE'].includes(type)) {
        return ResponseHelper.badRequest(res, 'Resolution type must be MATCH_TRANSACTION, CREATE_TRANSACTION, or IGNORE');
      }
      
      const result = await BankReconciliationService.resolveMismatch(mismatchId, {
        type: type as 'MATCH_TRANSACTION' | 'CREATE_TRANSACTION' | 'IGNORE',
        transactionId,
        notes
      }, userId);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Mismatch resolved successfully');
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in BankReconciliationController.resolveMismatch:', error);
      return ResponseHelper.error(res, 'Failed to resolve mismatch', error.message);
    }
  }
  
  /**
   * Mark transaction as reconciled
   * POST /api/cashbook/reconciliation/mark/:transactionId
   */
  static async markTransactionReconciled(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { transactionId } = req.params;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const result = await BankReconciliationService.markTransactionReconciled(transactionId, userId);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Transaction marked as reconciled successfully');
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in BankReconciliationController.markTransactionReconciled:', error);
      return ResponseHelper.error(res, 'Failed to mark transaction as reconciled', error.message);
    }
  }
  
  /**
   * Complete reconciliation
   * POST /api/cashbook/reconciliation/complete/:statementId
   */
  static async completeReconciliation(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { statementId } = req.params;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const result = await BankReconciliationService.completeReconciliation(statementId, userId);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Reconciliation completed successfully');
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in BankReconciliationController.completeReconciliation:', error);
      return ResponseHelper.error(res, 'Failed to complete reconciliation', error.message);
    }
  }
  
  /**
   * Get reconciliation report
   * GET /api/cashbook/reconciliation/report/:statementId
   */
  static async getReconciliationReport(req: Request, res: Response) {
    try {
      const { statementId } = req.params;
      
      // Get statement details
      const statement = await prisma.bankStatement.findUnique({
        where: { id: statementId },
        include: {
          bank: {
            include: { currency: true }
          },
          items: {
            include: {
              matchedTransaction: {
                include: {
                  lineItems: {
                    include: {
                      contraGlAccount: true
                    }
                  }
                }
              }
            }
          },
          mismatches: {
            where: { isResolved: false }
          }
        }
      });
      
      if (!statement) {
        return ResponseHelper.notFound(res, 'Bank statement not found');
      }
      
      const report = {
        statementId: statement.id,
        bankName: statement.bank.name,
        statementDate: statement.statementDate,
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
        totalItems: statement.items.length,
        matchedItems: statement.items.filter(item => item.isMatched).length,
        unmatchedItems: statement.items.filter(item => !item.isMatched).length,
        totalMismatches: statement.mismatches.length,
        isReconciled: statement.isReconciled,
        reconciledAt: statement.reconciledAt
      };
      
      return ResponseHelper.success(res, 'Reconciliation report retrieved successfully', report);
      
    } catch (error: any) {
      console.error('Error in BankReconciliationController.getReconciliationReport:', error);
      return ResponseHelper.error(res, 'Failed to get reconciliation report', error.message);
    }
  }
}

// Import prisma for direct database access
import { PrismaClient } from '@prisma/client';
import { prisma } from '../utils/database';