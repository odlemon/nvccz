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
import { isModulePrivilegedUser } from '../config/cfoModulePermissions';
import {
  applyChartOfAccountsUpdate,
  hasChartOfAccountsUpdatableField,
} from '../services/ChartOfAccountsUpdateService';

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
   *
   * Privileged users (admin/CFO — see isModulePrivilegedUser in config/cfoModulePermissions.ts, the
   * same check ApprovalService uses to let admin/CFO act on procurement approvals) apply the change
   * directly and immediately, exactly as this endpoint always has.
   *
   * Everyone else does NOT get the change applied here. Instead the proposed change is routed through
   * the generic approval system (ApprovalRequest/Approval, stageType "MASTER_DATA_COA") and only
   * actually applied once a CFO approves it — see ApprovalService.updateEntityStatusAfterApproval.
   * Both paths call the same applyChartOfAccountsUpdate() (services/ChartOfAccountsUpdateService.ts)
   * so validation/mutation logic is not duplicated between them.
   */
  static async updateChartOfAccounts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const patch = req.body || {};

      if (isModulePrivilegedUser(req.user)) {
        const result = await applyChartOfAccountsUpdate(id, patch);
        if (!result.ok) {
          return ResponseHelper.error(res, result.message, undefined, result.status);
        }
        return ResponseHelper.success(res, "Chart of accounts updated successfully", result.data);
      }

      // Non-privileged caller: don't mutate anything here. Same "no fields sent" guard the direct
      // path uses, so we don't queue a pointless empty-change approval request.
      if (!hasChartOfAccountsUpdatableField(patch)) {
        return ResponseHelper.validationError(
          res,
          "No updatable fields provided. Send at least one of: accountNo, accountName, accountType, financialStatement, notes, parentId, isActive."
        );
      }

      const existingAccount = await prisma.chartOfAccounts.findUnique({ where: { id } });
      if (!existingAccount) {
        return ResponseHelper.notFound(res, "Chart of accounts not found");
      }

      const { ApprovalService } = await import('../services/ApprovalService');
      const approvalResult = await ApprovalService.createApprovalRequest({
        stageType: "MASTER_DATA_COA",
        entityId: id,
        entityData: patch,
        requestedById: req.user?.id,
        department: "Finance",
      });

      if (!approvalResult) {
        // No active MASTER_DATA_COA approval configuration/stage found (see
        // scripts/run-accounting-approval-configs-seed.ts). Fail closed rather than silently
        // applying the change for a non-privileged caller.
        return ResponseHelper.error(
          res,
          "Chart of accounts changes require CFO approval, but no approval workflow is configured. Contact an administrator.",
          undefined,
          503
        );
      }

      return ResponseHelper.success(
        res,
        "Change submitted for CFO approval",
        {
          status: "pending_approval",
          approvalRequestId: approvalResult.approvalRequest.id,
          chartOfAccountsId: id,
          proposedChanges: patch,
        },
        202
      );
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