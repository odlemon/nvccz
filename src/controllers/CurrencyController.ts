// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";

export class CurrencyController {
  /**
   * Create a new currency
   */
  async createCurrency(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { code, name, symbol, isDefault } = req.body;

      // Validation
      if (!code || !name || !symbol) {
        res.status(400).json({
          success: false,
          message: "Code, name, and symbol are required"
        });
        return;
      }

      // Check if currency code already exists
      const existingCurrency = await prisma.currency.findUnique({
        where: { code: code.toUpperCase() }
      });

      if (existingCurrency) {
        return res.status(400).json({
          success: false,
          message: "Currency code already exists"
        });
      }

      // If setting as default, unset other defaults
      if (isDefault) {
        await prisma.currency.updateMany({
          where: { isDefault: true },
          data: { isDefault: false }
        });
      }

      const currency = await prisma.currency.create({
        data: {
          code: code.toUpperCase(),
          name,
          symbol,
          isDefault: isDefault || false
        }
      });

      res.status(201).json({
        success: true,
        message: "Currency created successfully",
        data: currency
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to create currency",
        error: error.message
      });
    }
  }

  /**
   * Get all currencies
   */
  async getCurrencies(req: AuthRequest, res: Response) {
    try {
      const { isActive, isDefault } = req.query;
      
      const where: any = {};
      
      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }
      
      if (isDefault !== undefined) {
        where.isDefault = isDefault === 'true';
      }

      const currencies = await prisma.currency.findMany({
        where,
        orderBy: [
          { isDefault: 'desc' },
          { code: 'asc' }
        ]
      });

      res.status(200).json({
        success: true,
        data: currencies
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch currencies",
        error: error.message
      });
    }
  }

  /**
   * Get currency by ID
   */
  async getCurrencyById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const currency = await prisma.currency.findUnique({
        where: { id }
      });

      if (!currency) {
        return res.status(404).json({
          success: false,
          message: "Currency not found"
        });
      }

      res.status(200).json({
        success: true,
        data: currency
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch currency",
        error: error.message
      });
    }
  }

  /**
   * Update currency
   */
  async updateCurrency(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { code, name, symbol, isActive, isDefault } = req.body;

      // Check if currency exists
      const existingCurrency = await prisma.currency.findUnique({
        where: { id }
      });

      if (!existingCurrency) {
        return res.status(404).json({
          success: false,
          message: "Currency not found"
        });
      }

      // If updating code, check if new code already exists
      if (code && code !== existingCurrency.code) {
        const codeExists = await prisma.currency.findUnique({
          where: { code: code.toUpperCase() }
        });

        if (codeExists) {
          return res.status(400).json({
            success: false,
            message: "Currency code already exists"
          });
        }
      }

      // If setting as default, unset other defaults
      if (isDefault) {
        await prisma.currency.updateMany({
          where: { 
            isDefault: true,
            id: { not: id }
          },
          data: { isDefault: false }
        });
      }

      const updateData: any = {};
      if (code) updateData.code = code.toUpperCase();
      if (name) updateData.name = name;
      if (symbol) updateData.symbol = symbol;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (isDefault !== undefined) updateData.isDefault = isDefault;

      const currency = await prisma.currency.update({
        where: { id },
        data: updateData
      });

      res.status(200).json({
        success: true,
        message: "Currency updated successfully",
        data: currency
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to update currency",
        error: error.message
      });
    }
  }

  /**
   * Delete currency (soft delete)
   */
  async deleteCurrency(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      // Check if currency exists
      const currency = await prisma.currency.findUnique({
        where: { id }
      });

      if (!currency) {
        return res.status(404).json({
          success: false,
          message: "Currency not found"
        });
      }

      // Check if currency is in use
      const expenseCount = await prisma.expense.count({
        where: { currencyId: id }
      });

      if (expenseCount > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete currency that is in use by expenses"
        });
      }

      // Soft delete by setting isActive to false
      await prisma.currency.update({
        where: { id },
        data: { isActive: false }
      });

      res.status(200).json({
        success: true,
        message: "Currency deleted successfully"
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to delete currency",
        error: error.message
      });
    }
  }

  /**
   * Get default currency
   */
  async getDefaultCurrency(req: AuthRequest, res: Response) {
    try {
      const currency = await prisma.currency.findFirst({
        where: { isDefault: true }
      });

      if (!currency) {
        return res.status(404).json({
          success: false,
          message: "No default currency found"
        });
      }

      res.status(200).json({
        success: true,
        data: currency
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch default currency",
        error: error.message
      });
    }
  }

  /**
   * Set default currency
   */
  async setDefaultCurrency(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      // Check if currency exists
      const currency = await prisma.currency.findUnique({
        where: { id }
      });

      if (!currency) {
        return res.status(404).json({
          success: false,
          message: "Currency not found"
        });
      }

      // Unset current default
      await prisma.currency.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      });

      // Set new default
      const updatedCurrency = await prisma.currency.update({
        where: { id },
        data: { isDefault: true }
      });

      res.status(200).json({
        success: true,
        message: "Default currency updated successfully",
        data: updatedCurrency
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to set default currency",
        error: error.message
      });
    }
  }
}

export const currencyController = new CurrencyController(); 