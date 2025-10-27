// @ts-nocheck
// Contra Entry Service
// Handles contra entry configuration and generation

import { prisma } from '../utils/database';
import { ResponseHelper } from '../utils/responseHelper';

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

      return ResponseHelper.success(contraConfig, 'Contra entry configuration updated successfully');
    } catch (error) {
      console.error('Error configuring contra entry:', error);
      return ResponseHelper.error('Failed to configure contra entry', error);
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

      return ResponseHelper.success(configs, 'Contra entry configurations retrieved successfully');
    } catch (error) {
      console.error('Error getting contra entry configs:', error);
      return ResponseHelper.error('Failed to get contra entry configurations', error);
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
        return ResponseHelper.error('Cashbook entry not found');
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
        return ResponseHelper.error('No contra configuration found for this entry type');
      }

      // Generate contra entry based on configuration
      let contraEntry;
      if (contraConfig.contraType === 'DETAILED') {
        // Create detailed contra entry
        contraEntry = await prisma.contraEntry.create({
          data: {
            cashbookEntryId: cashbookEntryId,
            contraType: 'DETAILED',
            description: `Contra for ${cashbookEntry.description}`,
            amount: cashbookEntry.amount,
            debitAccountId: cashbookEntry.type === 'RECEIPT' ? cashbookEntry.bankId : cashbookEntry.glAccountId,
            creditAccountId: cashbookEntry.type === 'RECEIPT' ? cashbookEntry.glAccountId : cashbookEntry.bankId,
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
            debitAccountId: cashbookEntry.type === 'RECEIPT' ? cashbookEntry.bankId : cashbookEntry.glAccountId,
            creditAccountId: cashbookEntry.type === 'RECEIPT' ? cashbookEntry.glAccountId : cashbookEntry.bankId,
            createdById: createdById
          }
        });
      }

      return ResponseHelper.success(contraEntry, 'Contra entry generated successfully');
    } catch (error) {
      console.error('Error generating contra entry:', error);
      return ResponseHelper.error('Failed to generate contra entry', error);
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

      return ResponseHelper.success(contraEntries, 'Contra entries retrieved successfully');
    } catch (error) {
      console.error('Error getting contra entries:', error);
      return ResponseHelper.error('Failed to get contra entries', error);
    }
  }
}
