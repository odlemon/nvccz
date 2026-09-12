// @ts-nocheck
// Contra Entry Service
// Handles contra entry configuration and generation

import { prisma } from '../utils/database';

export default class ContraEntryService {
  
  /**
   * Configure contra entry settings
   */
  static async configureContraEntry(data: {
    entryType: string;
    glAccountId: string;
    contraType: 'DETAILED' | 'SUMMARY';
    isEnabled: boolean;
    createdById: string;
  }) {
    try {
      
      // Check if configuration already exists
      const existingConfig = await prisma.contraEntryConfig.findFirst({
        where: {
          entryType: data.entryType,
          glAccountId: data.glAccountId
        }
      });

      let contraConfig;
      if (existingConfig) {
        // Update existing configuration
        contraConfig = await prisma.contraEntryConfig.update({
          where: { id: existingConfig.id },
          data: {
            contraType: data.contraType,
            isEnabled: data.isEnabled,
            updatedAt: new Date()
          }
        });
      } else {
        // Create new configuration
        contraConfig = await prisma.contraEntryConfig.create({
          data: {
            entryType: data.entryType,
            glAccountId: data.glAccountId,
            contraType: data.contraType,
            isEnabled: data.isEnabled,
            createdById: data.createdById
          }
        });
      }

      return {
        success: true,
        message: 'Contra entry configuration updated successfully',
        data: contraConfig
      };
    } catch (error) {
      console.error('Error configuring contra entry:', error);
      return {
        success: false,
        message: 'Failed to configure contra entry',
        error: error.message
      };
    }
  }

  /**
   * List contra entries (optional filter by cashbook bank currency)
   */
  static async listAllContraEntries(currencyId?: string, limit: number = 200) {
    try {
      const where: any = {};
      if (currencyId) {
        where.cashbookEntry = { bank: { currencyId } };
      }
      const entries = await prisma.contraEntry.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          cashbookEntry: {
            include: {
              bank: { include: { currency: true } }
            }
          },
          debitAccount: { select: { id: true, accountNo: true, accountName: true } },
          creditAccount: { select: { id: true, accountNo: true, accountName: true } }
        }
      });
      return {
        success: true,
        message: 'Contra entries retrieved successfully',
        data: entries
      };
    } catch (error: any) {
      console.error('Error listing contra entries:', error);
      return {
        success: false,
        message: 'Failed to list contra entries',
        error: error.message
      };
    }
  }

  /**
   * Get contra entry configurations
   */
  static async getContraEntryConfigs(filters: {
    entryType?: string;
    glAccountId?: string;
    isEnabled?: boolean;
  } = {}) {
    try {
      
      const configs = await prisma.contraEntryConfig.findMany({
        where: {
          ...(filters.entryType && { entryType: filters.entryType }),
          ...(filters.glAccountId && { glAccountId: filters.glAccountId }),
          ...(filters.isEnabled !== undefined && { isEnabled: filters.isEnabled })
        },
        include: {
          glAccount: {
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
              email: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return {
        success: true,
        message: 'Contra entry configurations retrieved successfully',
        data: configs
      };
    } catch (error) {
      console.error('Error getting contra entry configs:', error);
      return {
        success: false,
        message: 'Failed to get contra entry configurations',
        error: error.message
      };
    }
  }

  /**
   * Generate contra entry for cashbook transaction
   */
  static async generateContraEntry(cashbookEntryId: string, createdById: string) {
    try {
      
      // Get cashbook entry with related data
      const cashbookEntry = await prisma.cashbookEntry.findUnique({
        where: { id: cashbookEntryId },
        include: {
          bank: true,
          customer: true,
          vendor: true,
          glAccount: true
        }
      });

      if (!cashbookEntry) {
        return {
          success: false,
          message: 'Cashbook entry not found'
        };
      }

      // Get contra configuration
      const contraConfig = await prisma.contraEntryConfig.findFirst({
        where: {
          entryType: cashbookEntry.type,
          glAccountId: cashbookEntry.glAccountId,
          isEnabled: true
        }
      });

      if (!contraConfig) {
        return {
          success: false,
          message: 'No contra configuration found for this entry type'
        };
      }

      // Generate contra entry based on configuration
      const bankGlId = cashbookEntry.bank?.glAccountId;
      if (!bankGlId || !cashbookEntry.glAccountId) {
        return {
          success: false,
          message: 'Bank and counterparty GL accounts are required to generate a contra entry',
        };
      }

      let contraEntry;
      if (contraConfig.contraType === 'DETAILED') {
        // Create detailed contra entry
        contraEntry = await prisma.contraEntry.create({
          data: {
            cashbookEntryId: cashbookEntryId,
            contraType: 'DETAILED',
            description: `Contra for ${cashbookEntry.description}`,
            amount: cashbookEntry.amount,
            debitAccountId: cashbookEntry.type === 'RECEIPT' ? bankGlId : cashbookEntry.glAccountId,
            creditAccountId: cashbookEntry.type === 'RECEIPT' ? cashbookEntry.glAccountId : bankGlId,
            createdById: createdById
          }
        });
      } else {
        // Create summary contra entry
        contraEntry = await prisma.contraEntry.create({
          data: {
            cashbookEntryId: cashbookEntryId,
            contraType: 'SUMMARY',
            description: `Summary contra for ${cashbookEntry.description}`,
            amount: cashbookEntry.amount,
            debitAccountId: cashbookEntry.type === 'RECEIPT' ? bankGlId : cashbookEntry.glAccountId,
            creditAccountId: cashbookEntry.type === 'RECEIPT' ? cashbookEntry.glAccountId : bankGlId,
            createdById: createdById
          }
        });
      }

      return {
        success: true,
        message: 'Contra entry generated successfully',
        data: contraEntry
      };
    } catch (error) {
      console.error('Error generating contra entry:', error);
      return {
        success: false,
        message: 'Failed to generate contra entry',
        error: error.message
      };
    }
  }

  /**
   * Get contra entries for a cashbook entry
   */
  static async getContraEntries(cashbookEntryId: string) {
    try {
      
      const contraEntries = await prisma.contraEntry.findMany({
        where: { cashbookEntryId },
        include: {
          debitAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true
            }
          },
          creditAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true
            }
          },
          createdBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return {
        success: true,
        message: 'Contra entries retrieved successfully',
        data: contraEntries
      };
    } catch (error) {
      console.error('Error getting contra entries:', error);
      return {
        success: false,
        message: 'Failed to get contra entries',
        error: error.message
      };
    }
  }
}
