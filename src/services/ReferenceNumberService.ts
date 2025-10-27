// @ts-nocheck
// Reference Number Service
// Handles auto-increment reference numbers for cashbook transactions

import { PrismaClient } from '@prisma/client';
import { prisma } from '../utils/database';

export interface ReferenceNumberConfig {
  id: string;
  type: 'RECEIPT' | 'PAYMENT' | 'BATCH';
  prefix: string;
  currentNumber: number;
  incrementBy: number;
  resetPeriod: 'DAILY' | 'MONTHLY' | 'YEARLY' | 'NEVER';
  lastResetDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NextReferenceResult {
  referenceNumber: string;
  config: ReferenceNumberConfig;
  success: boolean;
  message: string;
}

export class ReferenceNumberService {
  
  /**
   * Get next reference number for transaction type
   */
  static async getNextReference(type: 'RECEIPT' | 'PAYMENT' | 'BATCH'): Promise<NextReferenceResult> {
    try {
      console.log(`🔢 Getting next reference number for type: ${type}`);
      
      // Get or create reference configuration
      let config = await prisma.referenceNumberConfig.findFirst({
        where: { type, isActive: true }
      });
      
      if (!config) {
        // Create default configuration
        config = await this.createDefaultConfig(type);
      }
      
      // Check if reset is needed
      const shouldReset = this.shouldResetNumber(config);
      if (shouldReset) {
        config = await this.resetReferenceNumber(config.id);
      }
      
      // Generate next number
      const nextNumber = config.currentNumber + config.incrementBy;
      const referenceNumber = `${config.prefix}${nextNumber.toString().padStart(6, '0')}`;
      
      // Update current number
      await prisma.referenceNumberConfig.update({
        where: { id: config.id },
        data: { currentNumber: nextNumber }
      });
      
      console.log(`✅ Generated reference: ${referenceNumber}`);
      
      return {
        referenceNumber,
        config,
        success: true,
        message: 'Reference number generated successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error getting next reference:', error.message);
      return {
        referenceNumber: '',
        config: null,
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Configure reference number settings
   */
  static async configureReference(config: {
    type: 'RECEIPT' | 'PAYMENT' | 'BATCH';
    prefix: string;
    currentNumber: number;
    incrementBy: number;
    resetPeriod: 'DAILY' | 'MONTHLY' | 'YEARLY' | 'NEVER';
  }): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`⚙️ Configuring reference number for type: ${config.type}`);
      
      // Check if config exists
      const existingConfig = await prisma.referenceNumberConfig.findFirst({
        where: { type: config.type }
      });
      
      if (existingConfig) {
        // Update existing config
        await prisma.referenceNumberConfig.update({
          where: { id: existingConfig.id },
          data: {
            prefix: config.prefix,
            currentNumber: config.currentNumber,
            incrementBy: config.incrementBy,
            resetPeriod: config.resetPeriod,
            lastResetDate: new Date()
          }
        });
        
        console.log(`✅ Updated reference config for ${config.type}`);
      } else {
        // Create new config
        await prisma.referenceNumberConfig.create({
          data: {
            type: config.type,
            prefix: config.prefix,
            currentNumber: config.currentNumber,
            incrementBy: config.incrementBy,
            resetPeriod: config.resetPeriod,
            lastResetDate: new Date(),
            isActive: true
          }
        });
        
        console.log(`✅ Created reference config for ${config.type}`);
      }
      
      return {
        success: true,
        message: 'Reference number configuration updated successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error configuring reference:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Get reference number settings
   */
  static async getReferenceSettings(): Promise<ReferenceNumberConfig[]> {
    try {
      console.log('📋 Getting reference number settings...');
      
      const configs = await prisma.referenceNumberConfig.findMany({
        where: { isActive: true },
        orderBy: { type: 'asc' }
      });
      
      console.log(`✅ Retrieved ${configs.length} reference configurations`);
      return configs;
      
    } catch (error: any) {
      console.error('❌ Error getting reference settings:', error.message);
      return [];
    }
  }
  
  /**
   * Reset reference number for specific type
   */
  static async resetReferenceNumber(configId: string): Promise<ReferenceNumberConfig> {
    try {
      console.log(`🔄 Resetting reference number for config: ${configId}`);
      
      const config = await prisma.referenceNumberConfig.update({
        where: { id: configId },
        data: {
          currentNumber: 0,
          lastResetDate: new Date()
        }
      });
      
      console.log(`✅ Reset reference number for ${config.type}`);
      return config;
      
    } catch (error: any) {
      console.error('❌ Error resetting reference number:', error.message);
      throw error;
    }
  }
  
  /**
   * Validate reference number format
   */
  static async validateReference(reference: string, type: 'RECEIPT' | 'PAYMENT' | 'BATCH'): Promise<{
    isValid: boolean;
    message: string;
  }> {
    try {
      // Check if reference already exists
      const existingTransaction = await prisma.cashbookTransaction.findFirst({
        where: { reference }
      });
      
      if (existingTransaction) {
        return {
          isValid: false,
          message: 'Reference number already exists'
        };
      }
      
      // Get config for type
      const config = await prisma.referenceNumberConfig.findFirst({
        where: { type, isActive: true }
      });
      
      if (!config) {
        return {
          isValid: true,
          message: 'No validation config found'
        };
      }
      
      // Check format
      const expectedPrefix = config.prefix;
      if (!reference.startsWith(expectedPrefix)) {
        return {
          isValid: false,
          message: `Reference must start with ${expectedPrefix}`
        };
      }
      
      return {
        isValid: true,
        message: 'Reference number is valid'
      };
      
    } catch (error: any) {
      console.error('❌ Error validating reference:', error.message);
      return {
        isValid: false,
        message: error.message
      };
    }
  }
  
  // Private helper methods
  
  private static async createDefaultConfig(type: 'RECEIPT' | 'PAYMENT' | 'BATCH'): Promise<ReferenceNumberConfig> {
    const defaultConfigs = {
      RECEIPT: { prefix: 'REC', incrementBy: 1, resetPeriod: 'YEARLY' },
      PAYMENT: { prefix: 'PAY', incrementBy: 1, resetPeriod: 'YEARLY' },
      BATCH: { prefix: 'BAT', incrementBy: 1, resetPeriod: 'YEARLY' }
    };
    
    const config = defaultConfigs[type];
    
    const created = await prisma.referenceNumberConfig.create({
      data: {
        type,
        prefix: config.prefix,
        currentNumber: 0,
        incrementBy: config.incrementBy,
        resetPeriod: config.resetPeriod,
        lastResetDate: new Date(),
        isActive: true
      }
    });
    
    console.log(`✅ Created default config for ${type}: ${config.prefix}`);
    return created;
  }
  
  private static shouldResetNumber(config: ReferenceNumberConfig): boolean {
    if (config.resetPeriod === 'NEVER') return false;
    
    const now = new Date();
    const lastReset = new Date(config.lastResetDate);
    
    switch (config.resetPeriod) {
      case 'DAILY':
        return now.getDate() !== lastReset.getDate() || 
               now.getMonth() !== lastReset.getMonth() || 
               now.getFullYear() !== lastReset.getFullYear();
      
      case 'MONTHLY':
        return now.getMonth() !== lastReset.getMonth() || 
               now.getFullYear() !== lastReset.getFullYear();
      
      case 'YEARLY':
        return now.getFullYear() !== lastReset.getFullYear();
      
      default:
        return false;
    }
  }
}

export default ReferenceNumberService;


