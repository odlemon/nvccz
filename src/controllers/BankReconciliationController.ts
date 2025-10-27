// @ts-nocheck
// Bank Reconciliation Controller
// Handles bank reconciliation endpoints

import { Request, Response } from "express";
import { ResponseHelper } from "../utils/responseHelper";
import BankReconciliationService from "../services/BankReconciliationService";

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
      const {
        bankId,
        statementDate,
        openingBalance,
        closingBalance,
        items
      } = req.body;
      
      if (!bankId || !statementDate || !openingBalance || !closingBalance || !items) {
        return ResponseHelper.badRequest(res, 'Missing required fields: bankId, statementDate, openingBalance, closingBalance, items');
      }
      
      const result = await BankReconciliationService.createBankStatement({
        bankId,
        statementDate: new Date(statementDate),
        openingBalance: parseFloat(openingBalance),
        closingBalance: parseFloat(closingBalance),
        items: items.map((item: any) => ({
          transactionDate: new Date(item.transactionDate),
          description: item.description,
          reference: item.reference,
          debitAmount: parseFloat(item.debitAmount),
          creditAmount: parseFloat(item.creditAmount),
          balance: parseFloat(item.balance)
        }))
      });
      
      if (result.success) {
        return ResponseHelper.success(res, 'Bank statement created successfully', result.statement);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in BankReconciliationController.createBankStatement:', error);
      return ResponseHelper.error(res, 'Failed to create bank statement', error.message);
    }
  }
  
  /**
   * Get reconciliation status
   * GET /api/cashbook/reconciliation/status/:bankId
   */
  static async getReconciliationStatus(req: Request, res: Response) {
    try {
      const { bankId } = req.params;
      
      const status = await BankReconciliationService.getReconciliationStatus(bankId);
      
      return ResponseHelper.success(res, 'Reconciliation status retrieved successfully', status);
      
    } catch (error: any) {
      console.error('Error in BankReconciliationController.getReconciliationStatus:', error);
      return ResponseHelper.error(res, 'Failed to get reconciliation status', error.message);
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
import { dbConnection } from '../utils/database';
const prisma = dbConnection.getPrismaClient();