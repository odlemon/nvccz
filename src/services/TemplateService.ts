// @ts-nocheck
// Template Service
// Handles repeated descriptions and projects for rapid batch entry

import { PrismaClient } from '@prisma/client';
import { dbConnection } from '../utils/database';

const prisma = dbConnection.getPrismaClient();

export interface CashbookTemplate {
  id: string;
  name: string;
  description: string;
  projectCode?: string;
  glAccountId?: string;
  vatCode?: string;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTemplateParams {
  name: string;
  description: string;
  projectCode?: string;
  glAccountId?: string;
  vatCode?: string;
  createdById: string;
}

export class TemplateService {
  
  /**
   * Create a new template
   */
  static async createTemplate(params: CreateTemplateParams): Promise<{
    template: CashbookTemplate;
    success: boolean;
    message: string;
  }> {
    try {
      console.log(`📝 Creating template: ${params.name}`);
      
      const template = await prisma.cashbookTemplate.create({
        data: {
          name: params.name,
          description: params.description,
          projectCode: params.projectCode,
          glAccountId: params.glAccountId,
          vatCode: params.vatCode,
          isActive: true,
          createdById: params.createdById
        }
      });
      
      console.log(`✅ Template created: ${template.id}`);
      
      return {
        template,
        success: true,
        message: 'Template created successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error creating template:', error.message);
      return {
        template: null,
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Get all templates for user
   */
  static async getTemplates(userId: string): Promise<CashbookTemplate[]> {
    try {
      console.log(`📋 Getting templates for user: ${userId}`);
      
      const templates = await prisma.cashbookTemplate.findMany({
        where: { 
          createdById: userId,
          isActive: true 
        },
        include: {
          glAccount: {
            select: {
              accountNo: true,
              accountName: true,
              accountType: true
            }
          }
        },
        orderBy: { name: 'asc' }
      });
      
      console.log(`✅ Retrieved ${templates.length} templates`);
      return templates;
      
    } catch (error: any) {
      console.error('❌ Error getting templates:', error.message);
      return [];
    }
  }
  
  /**
   * Get template by ID
   */
  static async getTemplateById(templateId: string): Promise<CashbookTemplate | null> {
    try {
      console.log(`📋 Getting template: ${templateId}`);
      
      const template = await prisma.cashbookTemplate.findUnique({
        where: { id: templateId },
        include: {
          glAccount: {
            select: {
              accountNo: true,
              accountName: true,
              accountType: true
            }
          }
        }
      });
      
      if (template) {
        console.log(`✅ Template found: ${template.name}`);
      } else {
        console.log(`❌ Template not found: ${templateId}`);
      }
      
      return template;
      
    } catch (error: any) {
      console.error('❌ Error getting template:', error.message);
      return null;
    }
  }
  
  /**
   * Update template
   */
  static async updateTemplate(templateId: string, updates: {
    name?: string;
    description?: string;
    projectCode?: string;
    glAccountId?: string;
    vatCode?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`📝 Updating template: ${templateId}`);
      
      await prisma.cashbookTemplate.update({
        where: { id: templateId },
        data: {
          ...updates,
          updatedAt: new Date()
        }
      });
      
      console.log(`✅ Template updated: ${templateId}`);
      
      return {
        success: true,
        message: 'Template updated successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error updating template:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Delete template
   */
  static async deleteTemplate(templateId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🗑️ Deleting template: ${templateId}`);
      
      await prisma.cashbookTemplate.update({
        where: { id: templateId },
        data: { isActive: false }
      });
      
      console.log(`✅ Template deleted: ${templateId}`);
      
      return {
        success: true,
        message: 'Template deleted successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error deleting template:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Search templates by description or project
   */
  static async searchTemplates(userId: string, searchTerm: string): Promise<CashbookTemplate[]> {
    try {
      console.log(`🔍 Searching templates: ${searchTerm}`);
      
      const templates = await prisma.cashbookTemplate.findMany({
        where: {
          createdById: userId,
          isActive: true,
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
            { projectCode: { contains: searchTerm, mode: 'insensitive' } }
          ]
        },
        include: {
          glAccount: {
            select: {
              accountNo: true,
              accountName: true,
              accountType: true
            }
          }
        },
        orderBy: { name: 'asc' }
      });
      
      console.log(`✅ Found ${templates.length} matching templates`);
      return templates;
      
    } catch (error: any) {
      console.error('❌ Error searching templates:', error.message);
      return [];
    }
  }
  
  /**
   * Get frequently used templates
   */
  static async getFrequentlyUsedTemplates(userId: string, limit: number = 10): Promise<CashbookTemplate[]> {
    try {
      console.log(`⭐ Getting frequently used templates for user: ${userId}`);
      
      // Get templates that have been used in transactions
      const usedTemplates = await prisma.cashbookTransaction.groupBy({
        by: ['description'],
        _count: { id: true },
        where: {
          createdById: userId,
          status: 'POSTED'
        },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      
      // Get template details for frequently used descriptions
      const templates = [];
      for (const usedTemplate of usedTemplates) {
        const template = await prisma.cashbookTemplate.findFirst({
          where: {
            createdById: userId,
            isActive: true,
            description: usedTemplate.description
          },
          include: {
            glAccount: {
              select: {
                accountNo: true,
                accountName: true,
                accountType: true
              }
            }
          }
          });
        
        if (template) {
          templates.push(template);
        }
      }
      
      console.log(`✅ Found ${templates.length} frequently used templates`);
      return templates;
      
    } catch (error: any) {
      console.error('❌ Error getting frequently used templates:', error.message);
      return [];
    }
  }
  
  /**
   * Apply template to transaction
   */
  static async applyTemplate(templateId: string, transactionData: {
    bankId: string;
    transactionDate: Date;
    amount: number;
    reference?: string;
    counterpartyType: 'GL' | 'CUSTOMER' | 'SUPPLIER';
    glAccountId?: string;
    customerId?: string;
    vendorId?: string;
    createdById: string;
  }): Promise<{
    transaction: any;
    success: boolean;
    message: string;
  }> {
    try {
      console.log(`📝 Applying template: ${templateId}`);
      
      const template = await this.getTemplateById(templateId);
      if (!template) {
        return {
          transaction: null,
          success: false,
          message: 'Template not found'
        };
      }
      
      // Create transaction with template data
      const transaction = await prisma.cashbookTransaction.create({
        data: {
          bankId: transactionData.bankId,
          transactionDate: transactionData.transactionDate,
          transactionType: 'RECEIPT', // Default to receipt, can be changed
          totalAmount: transactionData.amount,
          reference: transactionData.reference,
          description: template.description,
          status: 'DRAFT',
          counterpartyType: transactionData.counterpartyType,
          glAccountId: template.glAccountId || transactionData.glAccountId,
          customerId: transactionData.customerId,
          vendorId: transactionData.vendorId,
          createdById: transactionData.createdById
        }
      });
      
      console.log(`✅ Template applied to transaction: ${transaction.id}`);
      
      return {
        transaction,
        success: true,
        message: 'Template applied successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error applying template:', error.message);
      return {
        transaction: null,
        success: false,
        message: error.message
      };
    }
  }
}

export default TemplateService;


