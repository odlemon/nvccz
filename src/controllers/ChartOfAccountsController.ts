// @ts-nocheck
// controllers/ChartOfAccountsController.ts

import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/authenticate";
import { ResponseHelper } from "../utils/responseHelper";

import { prisma } from '../utils/database';
import { naturalBalanceForAccountType } from '../utils/chartOfAccountsNaturalBalance';
import { validateChartAccountNumberForType } from '../utils/chartOfAccountsNumberRange';
import { bulkImportChartOfAccountsFromBuffer } from '../services/ChartOfAccountsBulkValidateService';

export class ChartOfAccountsController {
  /**
   * POST /api/accounting/chart-of-accounts/bulk-import — validate CSV; on success create all accounts in one transaction.
   * Row numbers: line 1 = header, line 2 = first data row (Excel-style).
   */
  static async bulkImportChartOfAccounts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file?.buffer?.length) {
        return ResponseHelper.badRequest(res, 'file is required (multipart field name: file, CSV)');
      }

      const result = await bulkImportChartOfAccountsFromBuffer(file.buffer);

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          message: 'Bulk GL import failed validation; file rejected. Fix row errors and re-upload.',
          data: {
            totalDataRows: result.totalDataRows,
            rowsWithErrors: result.rowErrors.length,
            rowErrors: result.rowErrors,
            reportLines: result.reportLines,
          },
          timestamp: new Date().toISOString(),
        });
      }

      return ResponseHelper.created(
        res,
        `Created ${result.createdCount} chart of accounts.`,
        {
          totalDataRows: result.totalDataRows,
          createdCount: result.createdCount,
          accounts: result.created,
        }
      );
    } catch (error: any) {
      console.error('bulkImportChartOfAccounts:', error);
      return ResponseHelper.error(res, error?.message || 'Failed to bulk import chart of accounts', undefined, 500);
    }
  }

  /**
   * Create a new chart of accounts entry
   */
  static async createChartOfAccounts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { accountNo, accountName, accountType, financialStatement, notes, parentId, isActive = true, naturalBalance: bodyNaturalBalance } = req.body;

      // Validate required fields
      if (!accountNo || !accountName || !accountType || !financialStatement) {
        return ResponseHelper.badRequest(res, "Account number, account name, account type, and financial statement are required");
      }

      // Validate account type
      const validAccountTypes = ["Current Asset", "Fixed Asset", "Long-Term Asset", "Contra-Asset", "Current Liability", "Long-Term Liability", "Equity", "Revenue", "Expense", "Income"];
      if (!validAccountTypes.includes(accountType)) {
        return ResponseHelper.badRequest(res, "Invalid account type. Must be one of: Current Asset, Fixed Asset, Long-Term Asset, Contra-Asset, Current Liability, Long-Term Liability, Equity, Revenue, Expense, Income");
      }

      const expectedNaturalBalance = naturalBalanceForAccountType(accountType);
      if (bodyNaturalBalance != null && bodyNaturalBalance !== '' && bodyNaturalBalance !== expectedNaturalBalance) {
        return ResponseHelper.badRequest(
          res,
          `Natural balance for "${accountType}" is ${expectedNaturalBalance} and cannot be changed.`
        );
      }

      const accountNumberValidation = validateChartAccountNumberForType(accountNo, accountType);
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
      const { accountType, isActive, parentId, forPosting } = req.query;

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

      // Reporting bucket: keep visible in COA list, but exclude from "posting" pickers.
      // Frontend should call: GET /api/accounting/chart-of-accounts?forPosting=true
      if (forPosting === 'true') {
        where.NOT = [{ accountNo: '1000' }];
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
      const { accountNo, accountName, accountType, financialStatement, notes, parentId, isActive, naturalBalance: bodyNaturalBalance } = req.body || {};

      const updatableKeys = ["accountNo", "accountName", "accountType", "financialStatement", "notes", "parentId", "isActive", "naturalBalance"];
      const hasUpdatableField = updatableKeys.some((k) => req.body != null && Object.prototype.hasOwnProperty.call(req.body, k));
      if (!hasUpdatableField) {
        return ResponseHelper.validationError(
          res,
          "No updatable fields provided. Send at least one of: accountNo, accountName, accountType, financialStatement, notes, parentId, isActive."
        );
      }

      // Check if chart of accounts exists
      const existingAccount = await prisma.chartOfAccounts.findUnique({
        where: { id }
      });

      if (!existingAccount) {
        return ResponseHelper.notFound(res, "Chart of accounts not found");
      }

      const typeForNaturalBalance = accountType || existingAccount.accountType;
      const expectedNaturalBalance = naturalBalanceForAccountType(typeForNaturalBalance);
      if (bodyNaturalBalance != null && bodyNaturalBalance !== '' && bodyNaturalBalance !== expectedNaturalBalance) {
        return ResponseHelper.badRequest(
          res,
          `Natural balance for "${typeForNaturalBalance}" is ${expectedNaturalBalance} and cannot be changed.`
        );
      }

      // Validate account type if provided
      if (accountType) {
        const validAccountTypes = ["Current Asset", "Fixed Asset", "Long-Term Asset", "Contra-Asset", "Current Liability", "Long-Term Liability", "Equity", "Revenue", "Expense", "Income"];
        if (!validAccountTypes.includes(accountType)) {
          return ResponseHelper.badRequest(res, "Invalid account type. Must be one of: Current Asset, Fixed Asset, Long-Term Asset, Contra-Asset, Current Liability, Long-Term Liability, Equity, Revenue, Expense, Income");
        }
      }

      const typeChanging = Boolean(accountType && accountType !== existingAccount.accountType);
      const financialStatementChanging = Boolean(
        financialStatement && financialStatement !== existingAccount.financialStatement
      );

      if (typeChanging || financialStatementChanging) {
        const journalLineCount = await prisma.journalEntryLine.count({
          where: { chartOfAccountId: id },
        });
        if (journalLineCount > 0) {
          if (typeChanging) {
            return ResponseHelper.conflict(
              res,
              `Cannot change account type from "${existingAccount.accountType}" to "${accountType}" because this account has ${journalLineCount} journal line(s). ` +
                `Reclassifying would misstate historical profit and loss and balance sheet reporting. ` +
                `Create a new chart account and post a transfer journal if reclassification is required.`
            );
          }
          return ResponseHelper.conflict(
            res,
            `Cannot change financial statement classification because this account has ${journalLineCount} journal line(s). ` +
              `Historical statements would no longer tie to the original presentation. ` +
              `Create a new account and transfer balances if presentation must change.`
          );
        }
      }

      // Validate that account number range matches account type (if either is being updated)
      const accountNoToValidate = accountNo || existingAccount.accountNo;
      const accountTypeToValidate = accountType || existingAccount.accountType;
      const accountNumberValidation = validateChartAccountNumberForType(accountNoToValidate, accountTypeToValidate);
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