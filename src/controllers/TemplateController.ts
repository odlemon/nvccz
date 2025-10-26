// @ts-nocheck
// Template Controller
// Handles template management endpoints

import { Request, Response } from "express";
import { ResponseHelper } from "../utils/responseHelper";
import TemplateService from "../services/TemplateService";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

export default class TemplateController {
  
  /**
   * Create template
   * POST /api/cashbook/templates
   */
  static async createTemplate(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const {
        name,
        description,
        projectCode,
        glAccountId,
        vatCode
      } = req.body;
      
      if (!name || !description) {
        return ResponseHelper.badRequest(res, 'Name and description are required');
      }
      
      const result = await TemplateService.createTemplate({
        name,
        description,
        projectCode,
        glAccountId,
        vatCode,
        createdById: userId
      });
      
      if (result.success) {
        return ResponseHelper.success(res, 'Template created successfully', result.template);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in TemplateController.createTemplate:', error);
      return ResponseHelper.error(res, 'Failed to create template', error.message);
    }
  }
  
  /**
   * Get templates
   * GET /api/cashbook/templates
   */
  static async getTemplates(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const templates = await TemplateService.getTemplates(userId);
      
      return ResponseHelper.success(res, 'Templates retrieved successfully', templates);
      
    } catch (error: any) {
      console.error('Error in TemplateController.getTemplates:', error);
      return ResponseHelper.error(res, 'Failed to get templates', error.message);
    }
  }
  
  /**
   * Get template by ID
   * GET /api/cashbook/templates/:id
   */
  static async getTemplate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const template = await TemplateService.getTemplateById(id);
      
      if (!template) {
        return ResponseHelper.notFound(res, 'Template not found');
      }
      
      return ResponseHelper.success(res, 'Template retrieved successfully', template);
      
    } catch (error: any) {
      console.error('Error in TemplateController.getTemplate:', error);
      return ResponseHelper.error(res, 'Failed to get template', error.message);
    }
  }
  
  /**
   * Update template
   * PUT /api/cashbook/templates/:id
   */
  static async updateTemplate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const result = await TemplateService.updateTemplate(id, updates);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Template updated successfully');
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in TemplateController.updateTemplate:', error);
      return ResponseHelper.error(res, 'Failed to update template', error.message);
    }
  }
  
  /**
   * Delete template
   * DELETE /api/cashbook/templates/:id
   */
  static async deleteTemplate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const result = await TemplateService.deleteTemplate(id);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Template deleted successfully');
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in TemplateController.deleteTemplate:', error);
      return ResponseHelper.error(res, 'Failed to delete template', error.message);
    }
  }
  
  /**
   * Search templates
   * GET /api/cashbook/templates/search
   */
  static async searchTemplates(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { q } = req.query;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      if (!q) {
        return ResponseHelper.badRequest(res, 'Search query is required');
      }
      
      const templates = await TemplateService.searchTemplates(userId, q as string);
      
      return ResponseHelper.success(res, 'Templates search completed', templates);
      
    } catch (error: any) {
      console.error('Error in TemplateController.searchTemplates:', error);
      return ResponseHelper.error(res, 'Failed to search templates', error.message);
    }
  }
  
  /**
   * Get frequently used templates
   * GET /api/cashbook/templates/frequent
   */
  static async getFrequentTemplates(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { limit = 10 } = req.query;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const templates = await TemplateService.getFrequentlyUsedTemplates(userId, parseInt(limit as string));
      
      return ResponseHelper.success(res, 'Frequently used templates retrieved successfully', templates);
      
    } catch (error: any) {
      console.error('Error in TemplateController.getFrequentTemplates:', error);
      return ResponseHelper.error(res, 'Failed to get frequent templates', error.message);
    }
  }
  
  /**
   * Apply template to transaction
   * POST /api/cashbook/templates/:id/apply
   */
  static async applyTemplate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const transactionData = req.body;
      
      const result = await TemplateService.applyTemplate(id, transactionData);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Template applied successfully', result.transaction);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in TemplateController.applyTemplate:', error);
      return ResponseHelper.error(res, 'Failed to apply template', error.message);
    }
  }
}


