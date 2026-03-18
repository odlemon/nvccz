// @ts-nocheck
import { PrismaClient, Decimal } from '@prisma/client';
import { prisma } from '../utils/database';

export interface EntryTypeRequest {
  name: string;
  description: string;
  transactionType: 'RECEIPT' | 'PAYMENT';
  counterpartyType: 'GL' | 'CUSTOMER' | 'SUPPLIER' | 'ANY';
  defaultGlAccountId?: string;
  isActive: boolean;
  requiresProjectCode: boolean;
  requiresReference: boolean;
  autoGenerateReference: boolean;
  referencePrefix?: string;
  debitCreditLogic: 'AUTO' | 'MANUAL';
  defaultDebitCredit: 'DEBIT' | 'CREDIT';
}

export interface EntryTypeResult {
  success: boolean;
  message: string;
  data?: any;
}

export class EntryTypeService {
  
  /**
   * Create a new entry type
   */
  static async createEntryType(
    entryTypeRequest: EntryTypeRequest, 
    userId: string
  ): Promise<EntryTypeResult> {
    try {
      
      // Check if entry type with same name already exists
      const existingEntryType = await prisma.cashbookEntryTypeConfig.findFirst({
        where: {
          name: entryTypeRequest.name,
          transactionType: entryTypeRequest.transactionType
        }
      });
      
      if (existingEntryType) {
        return { 
          success: false, 
          message: `Entry type '${entryTypeRequest.name}' already exists for ${entryTypeRequest.transactionType} transactions` 
        };
      }
      
      // Validate GL account if provided
      if (entryTypeRequest.defaultGlAccountId) {
        const glAccount = await prisma.chartOfAccounts.findUnique({
          where: { id: entryTypeRequest.defaultGlAccountId }
        });
        
        if (!glAccount) {
          return { success: false, message: 'Default GL account not found' };
        }
      }
      
      // Create entry type
      const entryType = await prisma.cashbookEntryTypeConfig.create({
        data: {
          name: entryTypeRequest.name,
          description: entryTypeRequest.description,
          transactionType: entryTypeRequest.transactionType,
          counterpartyType: entryTypeRequest.counterpartyType,
          defaultGlAccountId: entryTypeRequest.defaultGlAccountId,
          isActive: entryTypeRequest.isActive,
          requiresProjectCode: entryTypeRequest.requiresProjectCode,
          requiresReference: entryTypeRequest.requiresReference,
          autoGenerateReference: entryTypeRequest.autoGenerateReference,
          referencePrefix: entryTypeRequest.referencePrefix,
          debitCreditLogic: entryTypeRequest.debitCreditLogic,
          defaultDebitCredit: entryTypeRequest.defaultDebitCredit,
          createdById: userId
        }
      });
      
      console.log(`✅ Entry type created: ${entryType.id} - ${entryType.name}`);
      
      return {
        success: true,
        message: 'Entry type created successfully',
        data: entryType
      };
      
    } catch (error: any) {
      console.error('❌ Error creating entry type:', error.message);
      return { success: false, message: `Failed to create entry type: ${error.message}` };
    }
  }
  
  /**
   * Get all entry types
   */
  static async getEntryTypes(
    transactionType?: 'RECEIPT' | 'PAYMENT',
    isActive?: boolean,
    currencyId?: string
  ): Promise<EntryTypeResult> {
    try {
      
      let whereClause: any = {};
      
      if (transactionType) {
        whereClause.transactionType = transactionType;
      }
      
      if (isActive !== undefined) {
        whereClause.isActive = isActive;
      }

      if (currencyId) {
        const used = await prisma.cashbookEntry.groupBy({
          by: ['entryTypeId'],
          where: { bank: { currencyId }, entryTypeId: { not: null } }
        });
        const ids = used.map((e) => e.entryTypeId).filter(Boolean) as string[];
        if (ids.length === 0) {
          return { success: true, data: [], message: 'No entry types for this currency' };
        }
        whereClause.id = { in: ids };
      }
      
      const entryTypes = await prisma.cashbookEntryTypeConfig.findMany({
        where: whereClause,
        include: {
          defaultGlAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true,
              accountType: true
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
        },
        orderBy: [
          { transactionType: 'asc' },
          { name: 'asc' }
        ]
      });
      
      return {
        success: true,
        data: entryTypes,
        message: `Found ${entryTypes.length} entry type(s)`
      };
      
    } catch (error: any) {
      console.error('❌ Error getting entry types:', error.message);
      return { success: false, message: `Failed to get entry types: ${error.message}` };
    }
  }
  
  /**
   * Get entry type by ID
   */
  static async getEntryType(entryTypeId: string): Promise<EntryTypeResult> {
    try {
      
      const entryType = await prisma.cashbookEntryTypeConfig.findUnique({
        where: { id: entryTypeId },
        include: {
          defaultGlAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true,
              accountType: true
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
      
      if (!entryType) {
        return { success: false, message: 'Entry type not found' };
      }
      
      return {
        success: true,
        data: entryType,
        message: 'Entry type retrieved successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error getting entry type:', error.message);
      return { success: false, message: `Failed to get entry type: ${error.message}` };
    }
  }
  
  /**
   * Update entry type
   */
  static async updateEntryType(
    entryTypeId: string, 
    updateData: Partial<EntryTypeRequest>, 
    userId: string
  ): Promise<EntryTypeResult> {
    try {
      
      // Check if entry type exists
      const existingEntryType = await prisma.cashbookEntryTypeConfig.findUnique({
        where: { id: entryTypeId }
      });
      
      if (!existingEntryType) {
        return { success: false, message: 'Entry type not found' };
      }
      
      // Check for name conflicts if name is being updated
      if (updateData.name && updateData.name !== existingEntryType.name) {
        const conflictingEntryType = await prisma.cashbookEntryTypeConfig.findFirst({
          where: {
            name: updateData.name,
            transactionType: updateData.transactionType || existingEntryType.transactionType,
            id: { not: entryTypeId }
          }
        });
        
        if (conflictingEntryType) {
          return { 
            success: false, 
            message: `Entry type '${updateData.name}' already exists for ${updateData.transactionType || existingEntryType.transactionType} transactions` 
          };
        }
      }
      
      // Validate GL account if provided
      if (updateData.defaultGlAccountId) {
        const glAccount = await prisma.chartOfAccounts.findUnique({
          where: { id: updateData.defaultGlAccountId }
        });
        
        if (!glAccount) {
          return { success: false, message: 'Default GL account not found' };
        }
      }
      
      // Update entry type
      const updatedEntryType = await prisma.cashbookEntryTypeConfig.update({
        where: { id: entryTypeId },
        data: {
          ...updateData,
          updatedAt: new Date(),
          updatedById: userId
        },
        include: {
          defaultGlAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true,
              accountType: true
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
      
      console.log(`✅ Entry type updated: ${entryTypeId} - ${updatedEntryType.name}`);
      
      return {
        success: true,
        message: 'Entry type updated successfully',
        data: updatedEntryType
      };
      
    } catch (error: any) {
      console.error('❌ Error updating entry type:', error.message);
      return { success: false, message: `Failed to update entry type: ${error.message}` };
    }
  }
  
  /**
   * Delete entry type
   */
  static async deleteEntryType(entryTypeId: string, userId: string): Promise<EntryTypeResult> {
    try {
      
      // Check if entry type exists
      const existingEntryType = await prisma.cashbookEntryTypeConfig.findUnique({
        where: { id: entryTypeId }
      });
      
      if (!existingEntryType) {
        return { success: false, message: 'Entry type not found' };
      }
      
      // Check if entry type is being used in transactions
      const transactionCount = await prisma.cashbookEntry.count({
        where: { entryTypeId: entryTypeId }
      });
      
      if (transactionCount > 0) {
        return { 
          success: false, 
          message: `Cannot delete entry type. It is being used in ${transactionCount} transaction(s)` 
        };
      }
      
      // Delete entry type
      await prisma.cashbookEntryTypeConfig.delete({
        where: { id: entryTypeId }
      });
      
      console.log(`✅ Entry type deleted: ${entryTypeId} - ${existingEntryType.name}`);
      
      return {
        success: true,
        message: 'Entry type deleted successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error deleting entry type:', error.message);
      return { success: false, message: `Failed to delete entry type: ${error.message}` };
    }
  }
  
  /**
   * Get entry types for transaction creation
   */
  static async getEntryTypesForTransaction(
    transactionType: 'RECEIPT' | 'PAYMENT',
    counterpartyType?: 'GL' | 'CUSTOMER' | 'SUPPLIER'
  ): Promise<EntryTypeResult> {
    try {
      
      let whereClause: any = {
        transactionType: transactionType,
        isActive: true
      };
      
      if (counterpartyType) {
        whereClause.OR = [
          { counterpartyType: counterpartyType },
          { counterpartyType: 'ANY' }
        ];
      }
      
      const entryTypes = await prisma.cashbookEntryTypeConfig.findMany({
        where: whereClause,
        include: {
          defaultGlAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true,
              accountType: true
            }
          }
        },
        orderBy: { name: 'asc' }
      });
      
      return {
        success: true,
        data: entryTypes,
        message: `Found ${entryTypes.length} entry type(s) for ${transactionType} transactions`
      };
      
    } catch (error: any) {
      console.error('❌ Error getting entry types for transaction:', error.message);
      return { success: false, message: `Failed to get entry types: ${error.message}` };
    }
  }
  
  /**
   * Get entry type statistics
   */
  static async getEntryTypeStatistics(): Promise<EntryTypeResult> {
    try {
      
      const totalEntryTypes = await prisma.cashbookEntryTypeConfig.count();
      const activeEntryTypes = await prisma.cashbookEntryTypeConfig.count({
        where: { isActive: true }
      });
      
      const receiptEntryTypes = await prisma.cashbookEntryTypeConfig.count({
        where: { transactionType: 'RECEIPT', isActive: true }
      });
      
      const paymentEntryTypes = await prisma.cashbookEntryTypeConfig.count({
        where: { transactionType: 'PAYMENT', isActive: true }
      });
      
      const glEntryTypes = await prisma.cashbookEntryTypeConfig.count({
        where: { counterpartyType: 'GL', isActive: true }
      });
      
      const customerEntryTypes = await prisma.cashbookEntryTypeConfig.count({
        where: { counterpartyType: 'CUSTOMER', isActive: true }
      });
      
      const supplierEntryTypes = await prisma.cashbookEntryTypeConfig.count({
        where: { counterpartyType: 'SUPPLIER', isActive: true }
      });
      
      const anyEntryTypes = await prisma.cashbookEntryTypeConfig.count({
        where: { counterpartyType: 'ANY', isActive: true }
      });
      
      return {
        success: true,
        data: {
          total: totalEntryTypes,
          active: activeEntryTypes,
          inactive: totalEntryTypes - activeEntryTypes,
          byTransactionType: {
            receipt: receiptEntryTypes,
            payment: paymentEntryTypes
          },
          byCounterpartyType: {
            gl: glEntryTypes,
            customer: customerEntryTypes,
            supplier: supplierEntryTypes,
            any: anyEntryTypes
          }
        },
        message: 'Entry type statistics retrieved successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error getting entry type statistics:', error.message);
      return { success: false, message: `Failed to get entry type statistics: ${error.message}` };
    }
  }
  
  /**
   * Validate entry type configuration
   */
  static async validateEntryTypeConfiguration(entryTypeId: string): Promise<EntryTypeResult> {
    try {
      
      const entryType = await prisma.cashbookEntryTypeConfig.findUnique({
        where: { id: entryTypeId },
        include: {
          defaultGlAccount: true
        }
      });
      
      if (!entryType) {
        return { success: false, message: 'Entry type not found' };
      }
      
      const issues: string[] = [];
      
      // Check if default GL account is active
      if (entryType.defaultGlAccountId && entryType.defaultGlAccount) {
        if (!entryType.defaultGlAccount.isActive) {
          issues.push('Default GL account is not active');
        }
      }
      
      // Check if reference prefix is provided when auto-generate is enabled
      if (entryType.autoGenerateReference && !entryType.referencePrefix) {
        issues.push('Reference prefix is required when auto-generate reference is enabled');
      }
      
      // Check if counterparty type matches transaction type logic
      if (entryType.transactionType === 'RECEIPT' && entryType.counterpartyType === 'SUPPLIER') {
        issues.push('Receipt transactions should not use SUPPLIER counterparty type');
      }
      
      if (entryType.transactionType === 'PAYMENT' && entryType.counterpartyType === 'CUSTOMER') {
        issues.push('Payment transactions should not use CUSTOMER counterparty type');
      }
      
      return {
        success: true,
        data: {
          entryTypeId: entryTypeId,
          isValid: issues.length === 0,
          issues: issues,
          warnings: []
        },
        message: issues.length === 0 ? 'Entry type configuration is valid' : 'Entry type configuration has issues'
      };
      
    } catch (error: any) {
      console.error('❌ Error validating entry type configuration:', error.message);
      return { success: false, message: `Failed to validate entry type configuration: ${error.message}` };
    }
  }
}
