// @ts-nocheck
import { Request, Response } from 'express';
import { StatementOfAccountService } from '../services/StatementOfAccountService';
import { PrismaClient } from '@prisma/client';

import { prisma } from '../utils/database';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export class StatementOfAccountController {
  /**
   * Generate all customer statements
   */
  static async generateAllCustomerStatements(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { statementDate } = req.body;

      if (!statementDate) {
        res.status(400).json({
          error: 'Missing required field: statementDate'
        });
        return;
      }

      const statements = await StatementOfAccountService.generateAllCustomerStatements({
        statementDate: new Date(statementDate),
        generatedById: userId
      });

      res.status(201).json({
        success: true,
        message: 'All customer statements generated successfully',
        data: statements
      });
    } catch (error: any) {
      console.error('Error generating all customer statements:', error);
      res.status(500).json({
        error: 'Failed to generate all customer statements',
        details: error.message
      });
    }
  }

  /**
   * Generate customer statement of account
   */
  static async generateCustomerStatement(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { customerId } = req.params;
      const { statementDate, currencyId } = req.body;

      // Validation
      if (!statementDate || !currencyId) {
        res.status(400).json({
          error: 'Missing required fields: statementDate, currencyId'
        });
        return;
      }

      const statement = await StatementOfAccountService.generateCustomerStatement({
        customerId,
        statementDate: new Date(statementDate),
        currencyId,
        generatedById: userId
      });

      res.status(201).json({
        success: true,
        message: 'Customer statement generated successfully',
        data: statement
      });
    } catch (error: any) {
      console.error('Error generating customer statement:', error);
      res.status(500).json({
        error: 'Failed to generate customer statement',
        details: error.message
      });
    }
  }

  /**
   * Generate all vendor statements
   */
  static async generateAllVendorStatements(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { statementDate } = req.body;

      if (!statementDate) {
        res.status(400).json({
          error: 'Missing required field: statementDate'
        });
        return;
      }

      const statements = await StatementOfAccountService.generateAllVendorStatements({
        statementDate: new Date(statementDate),
        generatedById: userId
      });

      res.status(201).json({
        success: true,
        message: 'All vendor statements generated successfully',
        data: statements
      });
    } catch (error: any) {
      console.error('Error generating all vendor statements:', error);
      res.status(500).json({
        error: 'Failed to generate all vendor statements',
        details: error.message
      });
    }
  }

  /**
   * Generate vendor statement of account
   */
  static async generateVendorStatement(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { vendorId } = req.params;
      const { statementDate, currencyId } = req.body;

      // Validation
      if (!statementDate || !currencyId) {
        res.status(400).json({
          error: 'Missing required fields: statementDate, currencyId'
        });
        return;
      }

      const statement = await StatementOfAccountService.generateVendorStatement({
        vendorId,
        statementDate: new Date(statementDate),
        currencyId,
        generatedById: userId
      });

      res.status(201).json({
        success: true,
        message: 'Vendor statement generated successfully',
        data: statement
      });
    } catch (error: any) {
      console.error('Error generating vendor statement:', error);
      res.status(500).json({
        error: 'Failed to generate vendor statement',
        details: error.message
      });
    }
  }

  /**
   * Get statement by ID
   */
  static async getStatement(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const statement = await StatementOfAccountService.getStatement(id);

      res.json({
        success: true,
        data: statement
      });
    } catch (error: any) {
      console.error('Error getting statement:', error);
      res.status(500).json({
        error: 'Failed to get statement',
        details: error.message
      });
    }
  }

  /**
   * Get statements with filtering
   */
  static async getStatements(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        customerId,
        vendorId,
        statementType,
        page = 1,
        limit = 10
      } = req.query;

      const result = await StatementOfAccountService.getStatements({
        customerId: customerId as string,
        vendorId: vendorId as string,
        statementType: statementType as string,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting statements:', error);
      res.status(500).json({
        error: 'Failed to get statements',
        details: error.message
      });
    }
  }

  /**
   * Get all customer statements
   */
  static async getAllCustomerStatements(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 10 } = req.query;

      const result = await StatementOfAccountService.getStatements({
        page: Number(page),
        limit: Number(limit),
        type: 'CUSTOMER'
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting all customer statements:', error);
      res.status(500).json({
        error: 'Failed to get all customer statements',
        details: error.message
      });
    }
  }

  /**
   * Get customer statements
   */
  static async getCustomerStatements(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { customerId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const result = await StatementOfAccountService.getStatements({
        customerId,
        statementType: 'CUSTOMER',
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting customer statements:', error);
      res.status(500).json({
        error: 'Failed to get customer statements',
        details: error.message
      });
    }
  }

  /**
   * Get all vendor statements
   */
  static async getAllVendorStatements(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 10 } = req.query;

      const result = await StatementOfAccountService.getStatements({
        page: Number(page),
        limit: Number(limit),
        type: 'VENDOR'
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting all vendor statements:', error);
      res.status(500).json({
        error: 'Failed to get all vendor statements',
        details: error.message
      });
    }
  }

  /**
   * Get vendor statements
   */
  static async getVendorStatements(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { vendorId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const result = await StatementOfAccountService.getStatements({
        vendorId,
        statementType: 'VENDOR',
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting vendor statements:', error);
      res.status(500).json({
        error: 'Failed to get vendor statements',
        details: error.message
      });
    }
  }

  /**
   * Delete statement
   */
  static async deleteStatement(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;

      await StatementOfAccountService.deleteStatement(id, userId);

      res.json({
        success: true,
        message: 'Statement deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting statement:', error);
      res.status(500).json({
        error: 'Failed to delete statement',
        details: error.message
      });
    }
  }

  /**
   * Get statement dashboard data
   */
  static async getStatementDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const [
        totalStatements,
        customerStatements,
        vendorStatements,
        recentStatements
      ] = await Promise.all([
        prisma.statementOfAccount.count(),
        prisma.statementOfAccount.count({ where: { statementType: 'CUSTOMER' } }),
        prisma.statementOfAccount.count({ where: { statementType: 'VENDOR' } }),
        prisma.statementOfAccount.findMany({
          orderBy: { statementDate: 'desc' },
          take: 10,
          include: {
            customer: {
              select: {
                name: true,
                email: true
              }
            },
            vendor: {
              select: {
                name: true,
                email: true
              }
            },
            currency: {
              select: {
                code: true,
                symbol: true
              }
            },
            generatedBy: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          totalStatements,
          customerStatements,
          vendorStatements,
          recentStatements
        }
      });
    } catch (error: any) {
      console.error('Error getting statement dashboard:', error);
      res.status(500).json({
        error: 'Failed to get statement dashboard',
        details: error.message
      });
    }
  }

  /**
   * Format statement
   */
  static async formatStatement(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { statementId } = req.params;

      if (!statementId) {
        res.status(400).json({
          error: 'Missing required parameter: statementId'
        });
        return;
      }

      const statement = await StatementOfAccountService.getStatement(statementId);
      const formattedStatement = await StatementOfAccountService.formatStatement(statement);

      res.json({
        success: true,
        data: formattedStatement
      });
    } catch (error: any) {
      console.error('Error formatting statement:', error);
      res.status(500).json({
        error: 'Failed to format statement',
        details: error.message
      });
    }
  }

  /**
   * Email statement
   */
  static async emailStatement(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { customerId, statementId } = req.params;

      if (!customerId || !statementId) {
        res.status(400).json({
          error: 'Missing required parameters: customerId, statementId'
        });
        return;
      }

      await StatementOfAccountService.emailStatement(customerId, statementId);

      res.json({
        success: true,
        message: 'Statement email sent successfully'
      });
    } catch (error: any) {
      console.error('Error emailing statement:', error);
      res.status(500).json({
        error: 'Failed to email statement',
        details: error.message
      });
    }
  }
}
