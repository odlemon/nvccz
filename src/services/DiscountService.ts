// @ts-nocheck
// Discount Service
// Handles settlement discounts for customers and suppliers

import { PrismaClient } from '@prisma/client';
import { prisma } from '../utils/database';

export interface DiscountConfig {
  id: string;
  entityType: 'CUSTOMER' | 'SUPPLIER';
  entityId: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  minAmount?: number;
  maxAmount?: number;
  validFrom: Date;
  validTo?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalculateDiscountParams {
  entityType: 'CUSTOMER' | 'SUPPLIER';
  entityId: string;
  amount: number;
  transactionDate: Date;
}

export interface DiscountResult {
  discountAmount: number;
  netAmount: number;
  discountConfig: DiscountConfig;
  success: boolean;
  message: string;
}

export class DiscountService {
  
  /**
   * Calculate discount for customer or supplier
   */
  static async calculateDiscount(params: CalculateDiscountParams): Promise<DiscountResult> {
    try {
      console.log(`💰 Calculating discount for ${params.entityType}: ${params.entityId}`);
      
      // Get active discount configuration
      const discountConfig = await prisma.discountConfig.findFirst({
        where: {
          entityType: params.entityType,
          entityId: params.entityId,
          isActive: true,
          validFrom: { lte: params.transactionDate },
          OR: [
            { validTo: null },
            { validTo: { gte: params.transactionDate } }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });
      
      if (!discountConfig) {
        return {
          discountAmount: 0,
          netAmount: params.amount,
          discountConfig: null,
          success: true,
          message: 'No discount configuration found'
        };
      }
      
      // Check amount limits
      if (discountConfig.minAmount && params.amount < discountConfig.minAmount) {
        return {
          discountAmount: 0,
          netAmount: params.amount,
          discountConfig,
          success: true,
          message: 'Amount below minimum for discount'
        };
      }
      
      if (discountConfig.maxAmount && params.amount > discountConfig.maxAmount) {
        return {
          discountAmount: 0,
          netAmount: params.amount,
          discountConfig,
          success: true,
          message: 'Amount above maximum for discount'
        };
      }
      
      // Calculate discount
      let discountAmount = 0;
      
      if (discountConfig.discountType === 'PERCENTAGE') {
        discountAmount = params.amount * (discountConfig.discountValue / 100);
      } else if (discountConfig.discountType === 'FIXED') {
        discountAmount = Math.min(discountConfig.discountValue, params.amount);
      }
      
      const netAmount = params.amount - discountAmount;
      
      console.log(`✅ Discount calculated: $${discountAmount} (${discountConfig.discountType})`);
      
      return {
        discountAmount,
        netAmount,
        discountConfig,
        success: true,
        message: 'Discount calculated successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error calculating discount:', error.message);
      return {
        discountAmount: 0,
        netAmount: params.amount,
        discountConfig: null,
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Get discount configuration for customer
   */
  static async getCustomerDiscount(customerId: string): Promise<DiscountConfig[]> {
    try {
      console.log(`📋 Getting discount config for customer: ${customerId}`);
      
      const discounts = await prisma.discountConfig.findMany({
        where: {
          entityType: 'CUSTOMER',
          entityId: customerId,
          isActive: true
        },
        orderBy: { createdAt: 'desc' }
      });
      
      console.log(`✅ Found ${discounts.length} discount configurations`);
      return discounts;
      
    } catch (error: any) {
      console.error('❌ Error getting customer discount:', error.message);
      return [];
    }
  }
  
  /**
   * Get discount configuration for supplier
   */
  static async getSupplierDiscount(supplierId: string): Promise<DiscountConfig[]> {
    try {
      console.log(`📋 Getting discount config for supplier: ${supplierId}`);
      
      const discounts = await prisma.discountConfig.findMany({
        where: {
          entityType: 'SUPPLIER',
          entityId: supplierId,
          isActive: true
        },
        orderBy: { createdAt: 'desc' }
      });
      
      console.log(`✅ Found ${discounts.length} discount configurations`);
      return discounts;
      
    } catch (error: any) {
      console.error('❌ Error getting supplier discount:', error.message);
      return [];
    }
  }
  
  /**
   * Create discount configuration
   */
  static async createDiscountConfig(config: {
    entityType: 'CUSTOMER' | 'SUPPLIER';
    entityId: string;
    discountType: 'PERCENTAGE' | 'FIXED';
    discountValue: number;
    minAmount?: number;
    maxAmount?: number;
    validFrom: Date;
    validTo?: Date;
  }): Promise<{ discountConfig: DiscountConfig; success: boolean; message: string }> {
    try {
      console.log(`📝 Creating discount config for ${config.entityType}: ${config.entityId}`);
      
      const discountConfig = await prisma.discountConfig.create({
        data: {
          entityType: config.entityType,
          entityId: config.entityId,
          discountType: config.discountType,
          discountValue: config.discountValue,
          minAmount: config.minAmount,
          maxAmount: config.maxAmount,
          validFrom: config.validFrom,
          validTo: config.validTo,
          isActive: true
        }
      });
      
      console.log(`✅ Discount config created: ${discountConfig.id}`);
      
      return {
        discountConfig,
        success: true,
        message: 'Discount configuration created successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error creating discount config:', error.message);
      return {
        discountConfig: null,
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Update discount configuration
   */
  static async updateDiscountConfig(discountId: string, updates: {
    discountType?: 'PERCENTAGE' | 'FIXED';
    discountValue?: number;
    minAmount?: number;
    maxAmount?: number;
    validFrom?: Date;
    validTo?: Date;
    isActive?: boolean;
  }): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`📝 Updating discount config: ${discountId}`);
      
      await prisma.discountConfig.update({
        where: { id: discountId },
        data: {
          ...updates,
          updatedAt: new Date()
        }
      });
      
      console.log(`✅ Discount config updated: ${discountId}`);
      
      return {
        success: true,
        message: 'Discount configuration updated successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error updating discount config:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Delete discount configuration
   */
  static async deleteDiscountConfig(discountId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🗑️ Deleting discount config: ${discountId}`);
      
      await prisma.discountConfig.update({
        where: { id: discountId },
        data: { isActive: false }
      });
      
      console.log(`✅ Discount config deleted: ${discountId}`);
      
      return {
        success: true,
        message: 'Discount configuration deleted successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error deleting discount config:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Get all discount configurations
   */
  static async getAllDiscountConfigs(): Promise<DiscountConfig[]> {
    try {
      console.log('📋 Getting all discount configurations...');
      
      const discounts = await prisma.discountConfig.findMany({
        where: { isActive: true },
        include: {
          customer: {
            select: { name: true, email: true }
          },
          vendor: {
            select: { name: true, email: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      console.log(`✅ Retrieved ${discounts.length} discount configurations`);
      return discounts;
      
    } catch (error: any) {
      console.error('❌ Error getting all discount configs:', error.message);
      return [];
    }
  }
  
  /**
   * Get discount summary for reporting
   */
  static async getDiscountSummary(dateFrom: Date, dateTo: Date): Promise<{
    totalDiscounts: number;
    totalAmount: number;
    byEntityType: { [key: string]: number };
    byDiscountType: { [key: string]: number };
  }> {
    try {
      console.log(`📊 Getting discount summary from ${dateFrom} to ${dateTo}`);
      
      // Get transactions with discounts in date range
      const transactions = await prisma.cashbookTransaction.findMany({
        where: {
          transactionDate: {
            gte: dateFrom,
            lte: dateTo
          },
          status: 'POSTED'
        },
        include: {
          lineItems: {
            where: {
              discount: { gt: 0 }
            }
          }
        }
      });
      
      let totalDiscounts = 0;
      let totalAmount = 0;
      const byEntityType = { CUSTOMER: 0, SUPPLIER: 0 };
      const byDiscountType = { PERCENTAGE: 0, FIXED: 0 };
      
      for (const transaction of transactions) {
        for (const lineItem of transaction.lineItems) {
          if (lineItem.discount && lineItem.discount > 0) {
            totalDiscounts++;
            totalAmount += Number(lineItem.discount);
            
            // Count by entity type
            if (transaction.counterpartyType === 'CUSTOMER') {
              byEntityType.CUSTOMER += Number(lineItem.discount);
            } else if (transaction.counterpartyType === 'SUPPLIER') {
              byEntityType.SUPPLIER += Number(lineItem.discount);
            }
          }
        }
      }
      
      console.log(`✅ Discount summary: ${totalDiscounts} discounts, $${totalAmount.toFixed(2)} total`);
      
      return {
        totalDiscounts,
        totalAmount,
        byEntityType,
        byDiscountType
      };
      
    } catch (error: any) {
      console.error('❌ Error getting discount summary:', error.message);
      return {
        totalDiscounts: 0,
        totalAmount: 0,
        byEntityType: {},
        byDiscountType: {}
      };
    }
  }
}

export default DiscountService;


