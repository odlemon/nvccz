// @ts-nocheck
import { Request, Response } from 'express';
import { EntryTypeService } from '../services/EntryTypeService';
import { ResponseHelper } from '../utils/responseHelper';

export class EntryTypeController {
  
  /**
   * Create a new entry type
   */
  static async createEntryType(req: Request, res: Response): Promise<void> {
    try {
      const {
        name,
        description,
        transactionType,
        counterpartyType,
        defaultGlAccountId,
        isActive,
        requiresProjectCode,
        requiresReference,
        autoGenerateReference,
        referencePrefix,
        debitCreditLogic,
        defaultDebitCredit
      } = req.body;
      
      const userId = (req as any).user?.id;
      
      if (!name) {
        ResponseHelper.badRequest(res, 'Entry type name is required');
        return;
      }
      
      if (!transactionType) {
        ResponseHelper.badRequest(res, 'Transaction type is required');
        return;
      }
      
      if (!counterpartyType) {
        ResponseHelper.badRequest(res, 'Counterparty type is required');
        return;
      }
      
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }
      
      const entryTypeRequest = {
        name,
        description,
        transactionType,
        counterpartyType,
        defaultGlAccountId,
        isActive: isActive !== undefined ? isActive : true,
        requiresProjectCode: requiresProjectCode || false,
        requiresReference: requiresReference || false,
        autoGenerateReference: autoGenerateReference || false,
        referencePrefix,
        debitCreditLogic: debitCreditLogic || 'AUTO',
        defaultDebitCredit: defaultDebitCredit || 'DEBIT'
      };
      
      const result = await EntryTypeService.createEntryType(entryTypeRequest, userId);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in createEntryType:', error.message);
      ResponseHelper.internalError(res, 'Failed to create entry type');
    }
  }
  
  /**
   * Get all entry types
   */
  static async getEntryTypes(req: Request, res: Response): Promise<void> {
    try {
      const transactionType = req.query.transactionType as 'RECEIPT' | 'PAYMENT';
      const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
      
      const result = await EntryTypeService.getEntryTypes(transactionType, isActive);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in getEntryTypes:', error.message);
      ResponseHelper.internalError(res, 'Failed to get entry types');
    }
  }
  
  /**
   * Get entry type by ID
   */
  static async getEntryType(req: Request, res: Response): Promise<void> {
    try {
      const { entryTypeId } = req.params;
      
      if (!entryTypeId) {
        ResponseHelper.badRequest(res, 'Entry type ID is required');
        return;
      }
      
      const result = await EntryTypeService.getEntryType(entryTypeId);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in getEntryType:', error.message);
      ResponseHelper.internalError(res, 'Failed to get entry type');
    }
  }
  
  /**
   * Update entry type
   */
  static async updateEntryType(req: Request, res: Response): Promise<void> {
    try {
      const { entryTypeId } = req.params;
      const updateData = req.body;
      const userId = (req as any).user?.id;
      
      if (!entryTypeId) {
        ResponseHelper.badRequest(res, 'Entry type ID is required');
        return;
      }
      
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }
      
      const result = await EntryTypeService.updateEntryType(entryTypeId, updateData, userId);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in updateEntryType:', error.message);
      ResponseHelper.internalError(res, 'Failed to update entry type');
    }
  }
  
  /**
   * Delete entry type
   */
  static async deleteEntryType(req: Request, res: Response): Promise<void> {
    try {
      const { entryTypeId } = req.params;
      const userId = (req as any).user?.id;
      
      if (!entryTypeId) {
        ResponseHelper.badRequest(res, 'Entry type ID is required');
        return;
      }
      
      if (!userId) {
        ResponseHelper.unauthorized(res, 'User not authenticated');
        return;
      }
      
      const result = await EntryTypeService.deleteEntryType(entryTypeId, userId);
      
      if (result.success) {
        ResponseHelper.success(res, null, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in deleteEntryType:', error.message);
      ResponseHelper.internalError(res, 'Failed to delete entry type');
    }
  }
  
  /**
   * Get entry types for transaction creation
   */
  static async getEntryTypesForTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { transactionType } = req.params;
      const counterpartyType = req.query.counterpartyType as 'GL' | 'CUSTOMER' | 'SUPPLIER';
      
      if (!transactionType) {
        ResponseHelper.badRequest(res, 'Transaction type is required');
        return;
      }
      
      if (!['RECEIPT', 'PAYMENT'].includes(transactionType)) {
        ResponseHelper.badRequest(res, 'Transaction type must be RECEIPT or PAYMENT');
        return;
      }
      
      const result = await EntryTypeService.getEntryTypesForTransaction(
        transactionType as 'RECEIPT' | 'PAYMENT',
        counterpartyType
      );
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in getEntryTypesForTransaction:', error.message);
      ResponseHelper.internalError(res, 'Failed to get entry types for transaction');
    }
  }
  
  /**
   * Get entry type statistics
   */
  static async getEntryTypeStatistics(req: Request, res: Response): Promise<void> {
    try {
      const result = await EntryTypeService.getEntryTypeStatistics();
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in getEntryTypeStatistics:', error.message);
      ResponseHelper.internalError(res, 'Failed to get entry type statistics');
    }
  }
  
  /**
   * Validate entry type configuration
   */
  static async validateEntryTypeConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const { entryTypeId } = req.params;
      
      if (!entryTypeId) {
        ResponseHelper.badRequest(res, 'Entry type ID is required');
        return;
      }
      
      const result = await EntryTypeService.validateEntryTypeConfiguration(entryTypeId);
      
      if (result.success) {
        ResponseHelper.success(res, result.data, result.message);
      } else {
        ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('❌ Error in validateEntryTypeConfiguration:', error.message);
      ResponseHelper.internalError(res, 'Failed to validate entry type configuration');
    }
  }
}

