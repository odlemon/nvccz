// @ts-nocheck
// controllers/ChartOfAccountsController.ts

import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/authenticate";
import { ResponseHelper } from "../utils/responseHelper";

import { prisma } from '../utils/database';

export class ChartOfAccountsController {
  /**
   * Validate that account number range matches account type
   * Account Number Ranges:
   * - 1000s = Assets (Current Asset, Fixed Asset, Long-Term Asset, Contra-Asset)
   * - 2000s = Liabilities (Current Liability, Long-Term Liability)
   * - 3000s = Equity
   * - 4000s = Revenue (Revenue, Income)
   * - 5000s = Expenses (Expense)
   */
  private static validateAccountNumberType(accountNo: string, accountType: string): { valid: boolean; message?: string } {
    // Extract first digit of account number
    const firstDigit = accountNo.charAt(0);
    
    // Define valid account types for each number range
    const accountTypeMappings: { [key: string]: string[] } = {
      '1': ['Current Asset', 'Fixed Asset', 'Long-Term Asset', 'Contra-Asset'],
      '2': ['Current Liability', 'Long-Term Liability'],
      '3': ['Equity'],
      '4': ['Revenue', 'Income'],
      '5': ['Expense']
    };

    // Check if first digit is valid (1-5)
    if (!['1', '2', '3', '4', '5'].includes(firstDigit)) {
      return {
        valid: false,
        message: `Invalid account number range. Account numbers must start with 1-5 (1000s=Assets, 2000s=Liabilities, 3000s=Equity, 4000s=Revenue, 5000s=Expenses).`
      };
    }

    // Check if account type matches the number range
    const validTypesForRange = accountTypeMappings[firstDigit];
    if (!validTypesForRange.includes(accountType)) {
      const expectedTypes = validTypesForRange.join(', ');
      const rangeDescription = {
        '1': '1000s (Assets)',
        '2': '2000s (Liabilities)',
        '3': '3000s (Equity)',
        '4': '4000s (Revenue)',
        '5': '5000s (Expenses)'
      }[firstDigit];
      
      return {
        valid: false,
        message: `Account number conflict: Account number "${accountNo}" is in the ${rangeDescription} range, but Account Type "${accountType}" is selected. Valid account types for ${rangeDescription} are: ${expectedTypes}`
      };
    }

    return { valid: true };
  }

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

      // Validate that account number range matches account type
      const accountNumberValidation = this.validateAccountNumberType(accountNo, accountType);
      if (!accountNumberValidation.valid) {
        return ResponseHelper.badRequest(res, accountNumberValidation.message || "Account number range does not match account type");
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

      // Validate that account number range matches account type (if either is being updated)
      const accountNoToValidate = accountNo || existingAccount.accountNo;
      const accountTypeToValidate = accountType || existingAccount.accountType;
      const accountNumberValidation = this.validateAccountNumberType(accountNoToValidate, accountTypeToValidate);
      if (!accountNumberValidation.valid) {
        return ResponseHelper.badRequest(res, accountNumberValidation.message || "Account number range does not match account type");
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