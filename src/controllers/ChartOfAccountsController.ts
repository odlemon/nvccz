// @ts-nocheck
// controllers/ChartOfAccountsController.ts

import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/authenticate";
import { ResponseHelper } from "../utils/responseHelper";

import { dbConnection } from '../utils/database';
const prisma = dbConnection.getPrismaClient();

export class ChartOfAccountsController {
  /**
   * Create a new chart of accounts entry
   */
  static async createChartOfAccounts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { accountNo, accountName, accountType, financialStatement, notes, parentId, isActive = true } = req.body;

      // Validate required fields
      if (!accountNo || !accountName || !accountType || !financialStatement) {
        return ResponseHelper.badRequest(res, "Account number, account name, account type, and financial statement are required");
      }

      // Validate account type
      const validAccountTypes = ["Current Asset", "Fixed Asset", "Long-Term Asset", "Contra-Asset", "Current Liability", "Long-Term Liability", "Equity", "Revenue", "Expense", "Income"];
      if (!validAccountTypes.includes(accountType)) {
        return ResponseHelper.badRequest(res, "Invalid account type. Must be one of: Current Asset, Fixed Asset, Long-Term Asset, Contra-Asset, Current Liability, Long-Term Liability, Equity, Revenue, Expense, Income");
      }

      // Validate financial statement
      const validFinancialStatements = ["Balance Sheet", "Income Statement", "Cash Flow / Tracking", "Income Statement / Cash Flow"];
      if (!validFinancialStatements.includes(financialStatement)) {
        return ResponseHelper.badRequest(res, "Invalid financial statement. Must be one of: Balance Sheet, Income Statement, Cash Flow / Tracking, Income Statement / Cash Flow");
      }

      // Check if account number already exists
      const existingAccount = await prisma.chartOfAccounts.findUnique({
        where: { accountNo }
      });

      if (existingAccount) {
        return ResponseHelper.conflict(res, "Account number already exists");
      }

      // If parentId is provided, validate it exists
      if (parentId) {
        const parentAccount = await prisma.chartOfAccounts.findUnique({
          where: { id: parentId }
        });

        if (!parentAccount) {
          return ResponseHelper.badRequest(res, "Parent account not found");
        }
      }

      // Create the chart of accounts entry
      const chartOfAccounts = await prisma.chartOfAccounts.create({
        data: {
          accountNo,
          accountName,
          accountType,
          financialStatement,
          notes,
          parentId: parentId || null,
          isActive
        }
      });

      return ResponseHelper.created(res, "Chart of accounts entry created successfully", chartOfAccounts);
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
          { accountNo: 'asc' }
        ]
      });

      return ResponseHelper.success(res, "Chart of accounts retrieved successfully", chartOfAccounts);
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
        return ResponseHelper.notFound(res, "Chart of accounts not found");
      }

      return ResponseHelper.success(res, "Chart of accounts retrieved successfully", chartOfAccounts);
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
      const { accountNo, accountName, accountType, financialStatement, notes, parentId, isActive } = req.body;

      // Check if chart of accounts exists
      const existingAccount = await prisma.chartOfAccounts.findUnique({
        where: { id }
      });

      if (!existingAccount) {
        return ResponseHelper.notFound(res, "Chart of accounts not found");
      }

      // Validate account type if provided
      if (accountType) {
        const validAccountTypes = ["Current Asset", "Fixed Asset", "Long-Term Asset", "Contra-Asset", "Current Liability", "Long-Term Liability", "Equity", "Revenue", "Expense", "Income"];
        if (!validAccountTypes.includes(accountType)) {
          return ResponseHelper.badRequest(res, "Invalid account type. Must be one of: Current Asset, Fixed Asset, Long-Term Asset, Contra-Asset, Current Liability, Long-Term Liability, Equity, Revenue, Expense, Income");
        }
      }

      // Validate financial statement if provided
      if (financialStatement) {
        const validFinancialStatements = ["Balance Sheet", "Income Statement", "Cash Flow / Tracking", "Income Statement / Cash Flow"];
        if (!validFinancialStatements.includes(financialStatement)) {
          return ResponseHelper.badRequest(res, "Invalid financial statement. Must be one of: Balance Sheet, Income Statement, Cash Flow / Tracking, Income Statement / Cash Flow");
        }
      }

      // Check if account number already exists (if changing account number)
      if (accountNo && accountNo !== existingAccount.accountNo) {
        const duplicateAccount = await prisma.chartOfAccounts.findUnique({
          where: { accountNo }
        });

        if (duplicateAccount) {
          return ResponseHelper.conflict(res, "Account number already exists");
        }
      }

      // If parentId is provided, validate it exists and is not the same as the current account
      if (parentId !== undefined) {
        if (parentId === id) {
          return ResponseHelper.badRequest(res, "Account cannot be its own parent");
        }

        if (parentId) {
          const parentAccount = await prisma.chartOfAccounts.findUnique({
            where: { id: parentId }
          });

          if (!parentAccount) {
            return ResponseHelper.badRequest(res, "Parent account not found");
          }
        }
      }

      // Update the chart of accounts entry
      const updatedChartOfAccounts = await prisma.chartOfAccounts.update({
        where: { id },
        data: {
          ...(accountNo && { accountNo }),
          ...(accountName && { accountName }),
          ...(accountType && { accountType }),
          ...(financialStatement && { financialStatement }),
          ...(notes !== undefined && { notes }),
          ...(parentId !== undefined && { parentId: parentId || null }),
          ...(isActive !== undefined && { isActive })
        }
      });

      return ResponseHelper.success(res, "Chart of accounts updated successfully", updatedChartOfAccounts);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all chart of accounts with their detailed journal entry lines
   */
  static async getAllChartOfAccountsWithJournalEntryLines(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { accountType, isActive, parentId, includeInactive = false } = req.query;

      // Build where clause for filtering
      const where: any = {};

      if (accountType) {
        where.accountType = accountType;
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      } else if (!includeInactive) {
        where.isActive = true;
      }

      if (parentId) {
        where.parentId = parentId;
      }

      const chartOfAccounts = await prisma.chartOfAccounts.findMany({
        where,
        include: {
          parent: {
            select: {
              id: true,
              accountNo: true,
              accountName: true,
              accountType: true
            }
          },
          children: {
            select: {
              id: true,
              accountNo: true,
              accountName: true,
              accountType: true,
              isActive: true
            }
          },
          journalEntryLines: {
            include: {
              journalEntry: {
                select: {
                  id: true,
                  referenceNumber: true,
                  transactionDate: true,
                  description: true,
                  totalAmount: true,
                  status: true,
                  currency: {
                    select: {
                      code: true,
                      symbol: true
                    }
                  }
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          },
          _count: {
            select: {
              journalEntryLines: true,
              children: true
            }
          }
        },
        orderBy: [
          { accountType: 'asc' },
          { accountNo: 'asc' }
        ]
      });

      // Calculate summary statistics for each account
      const enrichedChartOfAccounts = chartOfAccounts.map(account => {
        const totalDebits = account.journalEntryLines.reduce((sum, line) => 
          sum + parseFloat(line.debitAmount.toString()), 0
        );
        const totalCredits = account.journalEntryLines.reduce((sum, line) => 
          sum + parseFloat(line.creditAmount.toString()), 0
        );
        const netBalance = totalDebits - totalCredits;

        return {
          ...account,
          summary: {
            totalDebits,
            totalCredits,
            netBalance,
            transactionCount: account.journalEntryLines.length,
            lastTransactionDate: account.journalEntryLines.length > 0 
              ? account.journalEntryLines[0].createdAt 
              : null
          }
        };
      });

      return ResponseHelper.success(res, "Chart of accounts with journal entry lines retrieved successfully", enrichedChartOfAccounts);
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
        return ResponseHelper.notFound(res, "Chart of accounts not found");
      }

      // Check if account has children
      const childrenCount = await prisma.chartOfAccounts.count({
        where: { parentId: id }
      });

      if (childrenCount > 0) {
        return ResponseHelper.badRequest(res, "Cannot delete account with child accounts. Please reassign or delete child accounts first.");
      }

      // Check if account is used in journal entries
      const journalEntryLinesCount = await prisma.journalEntryLine.count({
        where: { chartOfAccountId: id }
      });

      if (journalEntryLinesCount > 0) {
        return ResponseHelper.badRequest(res, "Cannot delete account that is used in journal entries. Please reassign or delete related journal entries first.");
      }

      // Delete the chart of accounts entry
      await prisma.chartOfAccounts.delete({
        where: { id }
      });

      return ResponseHelper.success(res, "Chart of accounts deleted successfully");
    } catch (error) {
      next(error);
    }
  }
} 