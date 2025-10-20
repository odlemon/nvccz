// @ts-nocheck
import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authenticate';
import { BankReconciliationService } from '../services/BankReconciliationService';
import { ResponseHelper } from '../utils/responseHelper';

export class BankReconciliationController {
  async uploadBankStatement(req: AuthRequest, res: Response) {
    try {
      const file = req.file;
      const { accountId, statementDate, openingBalance, closingBalance, transactions } = req.body;

      // Check if it's JSON input first (has required JSON fields)
      if (accountId && statementDate && openingBalance !== undefined && closingBalance !== undefined && transactions) {
        // JSON input path
        const result = await BankReconciliationService.createBankStatementFromJSON({
          accountId,
          statementDate: new Date(statementDate),
          openingBalance: parseFloat(openingBalance),
          closingBalance: parseFloat(closingBalance),
          transactions: Array.isArray(transactions) ? transactions : [],
          createdById: req.user!.id
        });
        
        return ResponseHelper.success(res, 'Bank statement created from JSON successfully', result);
      } else if (file) {
        // File upload path
        const result = await BankReconciliationService.uploadAndProcessBankStatement(file, req.user!.id);
        return ResponseHelper.created(res, 'Bank statement uploaded and processed successfully', result);
      } else {
        return ResponseHelper.badRequest(res, 'Either file upload or JSON data required');
      }
    } catch (error: any) {
      // Surface full error where possible for easier debugging in non-prod
      const errMsg = error?.message || String(error);
      const details = error?.stack || undefined;
      console.error('BankReconciliationController.uploadBankStatement error:', errMsg, details);
      return ResponseHelper.error(res, 'Failed to upload bank statement', errMsg);
    }
  }

  async getReconciliations(req: AuthRequest, res: Response) {
    try {
      const filters = req.query;
      const result = await BankReconciliationService.getReconciliations(req.user!.id, filters);
      return ResponseHelper.success(res, 'Reconciliations retrieved successfully', result);
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to retrieve reconciliations', error.message);
    }
  }

  async getReconciliationById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const reconciliation = await BankReconciliationService.getReconciliationById(id);
      
      if (!reconciliation) {
        return ResponseHelper.notFound(res, 'Reconciliation not found');
      }
      
      return ResponseHelper.success(res, 'Reconciliation retrieved successfully', reconciliation);
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to retrieve reconciliation', error.message);
    }
  }

  async getReconciliationSummary(req: AuthRequest, res: Response) {
    try {
      const summary = await BankReconciliationService.getReconciliationSummary();
      return ResponseHelper.success(res, 'Reconciliation summary retrieved successfully', summary);
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to retrieve reconciliation summary', error.message);
    }
  }

  async getUnmatchedTransactions(req: AuthRequest, res: Response) {
    try {
      const { reconciliationId } = req.params;
      const { minAmount = 5.00 } = req.query;
      
      const transactions = await BankReconciliationService.getUnmatchedTransactions(
        reconciliationId, 
        parseFloat(minAmount as string)
      );
      
      return ResponseHelper.success(res, 'Unmatched transactions retrieved successfully', transactions);
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to retrieve unmatched transactions', error.message);
    }
  }

  async getPotentialMatches(req: AuthRequest, res: Response) {
    try {
      const { bankTransactionId } = req.params;
      const { limit = 10 } = req.query;
      
      const matches = await BankReconciliationService.getPotentialMatches(
        bankTransactionId, 
        parseInt(limit as string)
      );
      
      return ResponseHelper.success(res, 'Potential matches retrieved successfully', matches);
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to retrieve potential matches', error.message);
    }
  }

  async approveManualMatch(req: AuthRequest, res: Response) {
    try {
      const { reconciliationId, bankTransactionId, journalEntryId } = req.body;
      
      if (!reconciliationId || !bankTransactionId || !journalEntryId) {
        return ResponseHelper.badRequest(res, 'Missing required fields: reconciliationId, bankTransactionId, journalEntryId');
      }
      
      await BankReconciliationService.approveManualMatch(
        reconciliationId, 
        bankTransactionId, 
        journalEntryId, 
        req.user!.id
      );
      
      return ResponseHelper.success(res, 'Manual match approved successfully');
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to approve manual match', error.message);
    }
  }

  async rejectReconciliationResult(req: AuthRequest, res: Response) {
    try {
      const { reconciliationResultId } = req.params;
      const { reason } = req.body;
      
      await BankReconciliationService.rejectReconciliationResult(
        reconciliationResultId, 
        req.user!.id, 
        reason
      );
      
      return ResponseHelper.success(res, 'Reconciliation result rejected successfully');
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to reject reconciliation result', error.message);
    }
  }

  async getAuditTrail(req: AuthRequest, res: Response) {
    try {
      const { reconciliationId } = req.params;
      const auditTrail = await BankReconciliationService.getAuditTrail(reconciliationId);
      
      return ResponseHelper.success(res, 'Audit trail retrieved successfully', auditTrail);
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to retrieve audit trail', error.message);
    }
  }

  async deleteReconciliation(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await BankReconciliationService.deleteReconciliation(id, req.user!.id);
      
      return ResponseHelper.success(res, 'Reconciliation deleted successfully');
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to delete reconciliation', error.message);
    }
  }

  async manualReconcile(req: AuthRequest, res: Response) {
    try {
      const { statementLineId, journalEntryId } = req.body;
      
      if (!statementLineId || !journalEntryId) {
        return ResponseHelper.badRequest(res, 'Missing required fields: statementLineId, journalEntryId');
      }

      await BankReconciliationService.manualReconcile(statementLineId, journalEntryId, req.user!.id);
      
      return ResponseHelper.success(res, 'Manual reconciliation completed successfully');
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to perform manual reconciliation', error.message);
    }
  }

  async createJournalFromBankStatement(req: AuthRequest, res: Response) {
    try {
      const { statementLineId, accountId } = req.body;
      
      if (!statementLineId || !accountId) {
        return ResponseHelper.badRequest(res, 'Missing required fields: statementLineId, accountId');
      }

      const journalEntryId = await BankReconciliationService.createJournalFromBankStatement(
        statementLineId, 
        accountId, 
        req.user!.id
      );
      
      return ResponseHelper.success(res, 'Journal entry created from bank statement', { journalEntryId });
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to create journal entry from bank statement', error.message);
    }
  }

  async generateReconciliationReport(req: AuthRequest, res: Response) {
    try {
      const { reconciliationId } = req.params;
      
      const report = await BankReconciliationService.generateReconciliationReport(reconciliationId);
      
      return ResponseHelper.success(res, 'Reconciliation report generated successfully', report);
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to generate reconciliation report', error.message);
    }
  }

  async importBankStatement(req: AuthRequest, res: Response) {
    try {
      const file = req.file;
      const { format, accountId, statementDate, openingBalance, closingBalance, transactions } = req.body;

      // Check if it's JSON input first (has required JSON fields)
      if (accountId && statementDate && openingBalance !== undefined && closingBalance !== undefined && transactions) {
        // JSON input path
        const result = await BankReconciliationService.createBankStatementFromJSON({
          accountId,
          statementDate: new Date(statementDate),
          openingBalance: parseFloat(openingBalance),
          closingBalance: parseFloat(closingBalance),
          transactions: Array.isArray(transactions) ? transactions : [],
          createdById: req.user!.id
        });
        
        return ResponseHelper.success(res, 'Bank statement created from JSON successfully', result);
      } else if (file) {
        // File upload path
        if (!format || !accountId) {
          return ResponseHelper.badRequest(res, 'Missing required fields: format, accountId');
        }

        if (!['CSV', 'OFX', 'QIF'].includes(format)) {
          return ResponseHelper.badRequest(res, 'Invalid format. Must be CSV, OFX, or QIF');
        }

        const result = await BankReconciliationService.importBankStatement(
          file.buffer, 
          format, 
          accountId, 
          req.user!.id
        );
        
        return ResponseHelper.success(res, 'Bank statement imported successfully', result);
      } else {
        return ResponseHelper.badRequest(res, 'Either file upload or JSON data required');
      }
    } catch (error: any) {
      return ResponseHelper.error(res, 'Failed to import bank statement', error.message);
    }
  }
} 