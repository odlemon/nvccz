// @ts-nocheck
// controllers/ChartOfAccountsController.ts

import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/authenticate";
import { sendSuccessResponse, sendErrorResponse } from "../utils/responseHelper";

const prisma = new PrismaClient();

export class ChartOfAccountsController {
  /**
   * Create a new chart of accounts entry
   */
  static async createChartOfAccounts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { accountCode, accountName, accountType, parentId, isActive = true } = req.body;

      // Validate required fields
      if (!accountCode || !accountName || !accountType) {
        return sendErrorResponse(res, 400, "Account code, account name, and account type are required");
      }

      // Validate account type
      const validAccountTypes = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
      if (!validAccountTypes.includes(accountType)) {
        return sendErrorResponse(res, 400, "Invalid account type. Must be one of: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE");
      }

      // Check if account code already exists
      const existingAccount = await prisma.chartOfAccounts.findUnique({
        where: { accountCode }
      });

      if (existingAccount) {
        return sendErrorResponse(res, 409, "Account code already exists");
      }

      // If parentId is provided, validate it exists
      if (parentId) {
        const parentAccount = await prisma.chartOfAccounts.findUnique({
          where: { id: parentId }
        });

        if (!parentAccount) {
          return sendErrorResponse(res, 400, "Parent account not found");
        }
      }

      // Create the chart of accounts entry
      const chartOfAccounts = await prisma.chartOfAccounts.create({
        data: {
          accountCode,
          accountName,
          accountType,
          parentId: parentId || null,
          isActive
        }
      });

      return sendSuccessResponse(res, 201, "Chart of accounts entry created successfully", chartOfAccounts);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all chart of accounts with optional filtering
   */
  static async getAllChartOfAccounts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { accountType, isActive, parentId } = req.query;

      // Build where clause for filtering
      const where: any = {};

      if (accountType) {
        where.accountType = accountType;
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      if (parentId) {
        where.parentId = parentId;
      }

      const chartOfAccounts = await prisma.chartOfAccounts.findMany({
        where,
        orderBy: [
          { accountType: 'asc' },
          { accountCode: 'asc' }
        ]
      });

      return sendSuccessResponse(res, 200, "Chart of accounts retrieved successfully", chartOfAccounts);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get chart of accounts by ID
   */
  static async getChartOfAccountsById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const chartOfAccounts = await prisma.chartOfAccounts.findUnique({
        where: { id }
      });

      if (!chartOfAccounts) {
        return sendErrorResponse(res, 404, "Chart of accounts not found");
      }

      return sendSuccessResponse(res, 200, "Chart of accounts retrieved successfully", chartOfAccounts);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update chart of accounts
   */
  static async updateChartOfAccounts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { accountCode, accountName, accountType, parentId, isActive } = req.body;

      // Check if chart of accounts exists
      const existingAccount = await prisma.chartOfAccounts.findUnique({
        where: { id }
      });

      if (!existingAccount) {
        return sendErrorResponse(res, 404, "Chart of accounts not found");
      }

      // Validate account type if provided
      if (accountType) {
        const validAccountTypes = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
        if (!validAccountTypes.includes(accountType)) {
          return sendErrorResponse(res, 400, "Invalid account type. Must be one of: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE");
        }
      }

      // Check if account code already exists (if changing account code)
      if (accountCode && accountCode !== existingAccount.accountCode) {
        const duplicateAccount = await prisma.chartOfAccounts.findUnique({
          where: { accountCode }
        });

        if (duplicateAccount) {
          return sendErrorResponse(res, 409, "Account code already exists");
        }
      }

      // If parentId is provided, validate it exists and is not the same as the current account
      if (parentId !== undefined) {
        if (parentId === id) {
          return sendErrorResponse(res, 400, "Account cannot be its own parent");
        }

        if (parentId) {
          const parentAccount = await prisma.chartOfAccounts.findUnique({
            where: { id: parentId }
          });

          if (!parentAccount) {
            return sendErrorResponse(res, 400, "Parent account not found");
          }
        }
      }

      // Update the chart of accounts entry
      const updatedChartOfAccounts = await prisma.chartOfAccounts.update({
        where: { id },
        data: {
          ...(accountCode && { accountCode }),
          ...(accountName && { accountName }),
          ...(accountType && { accountType }),
          ...(parentId !== undefined && { parentId: parentId || null }),
          ...(isActive !== undefined && { isActive })
        }
      });

      return sendSuccessResponse(res, 200, "Chart of accounts updated successfully", updatedChartOfAccounts);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete chart of accounts
   */
  static async deleteChartOfAccounts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // Check if chart of accounts exists
      const existingAccount = await prisma.chartOfAccounts.findUnique({
        where: { id }
      });

      if (!existingAccount) {
        return sendErrorResponse(res, 404, "Chart of accounts not found");
      }

      // Check if account has children
      const childrenCount = await prisma.chartOfAccounts.count({
        where: { parentId: id }
      });

      if (childrenCount > 0) {
        return sendErrorResponse(res, 400, "Cannot delete account with child accounts. Please reassign or delete child accounts first.");
      }

      // Check if account is used in journal entries
      const journalEntryLinesCount = await prisma.journalEntryLine.count({
        where: { chartOfAccountId: id }
      });

      if (journalEntryLinesCount > 0) {
        return sendErrorResponse(res, 400, "Cannot delete account that is used in journal entries. Please reassign or delete related journal entries first.");
      }

      // Delete the chart of accounts entry
      await prisma.chartOfAccounts.delete({
        where: { id }
      });

      return sendSuccessResponse(res, 200, "Chart of accounts deleted successfully");
    } catch (error) {
      next(error);
    }
  }
} 