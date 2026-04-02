// @ts-nocheck
import { Request, Response } from "express";
import GLLedgerDetailService from "../services/GLLedgerDetailService";
import { ResponseHelper } from "../utils/responseHelper";
import { prisma } from "../utils/database";
import { parseDate } from "../utils/dateHelper";

export class GLLedgerDetailController {
  /**
   * Generate General Ledger Detail Report with Running Balance
   * GET /api/accounting/gl-ledger-detail?accountNo=1100&startDate=2025-01-01&endDate=2025-12-31&currencyId=...
   */
  static async generateGLLedgerDetail(req: Request, res: Response) {
    try {
      const { accountNo, startDate, endDate, currencyId, includeMultiCurrency } = req.query;

      if (!accountNo) {
        return ResponseHelper.badRequest(res, "Account number (accountNo) is required");
      }

      if (!startDate || !endDate) {
        return ResponseHelper.badRequest(
          res,
          "Start date and end date are required (format: YYYY-MM-DD)"
        );
      }

      const start = parseDate(startDate as string);
      const end = parseDate(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return ResponseHelper.badRequest(res, "Invalid date format. Use YYYY-MM-DD");
      }

      if (start > end) {
        return ResponseHelper.badRequest(res, "Start date must be before end date");
      }

      // Parse includeMultiCurrency (defaults to true if not provided)
      const includeMultiCurrencyFlag = includeMultiCurrency === 'false' ? false : true;

      const report = await GLLedgerDetailService.generateGLLedgerDetail({
        accountNo: accountNo as string,
        startDate: start,
        endDate: end,
        currencyId: currencyId as string | undefined,
        includeMultiCurrency: includeMultiCurrencyFlag
      });

      return ResponseHelper.success(res, "GL Detail report generated successfully", report);
    } catch (error: any) {
      console.error("Error generating GL Detail report:", error);
      return ResponseHelper.error(res, "Failed to generate GL Detail report", error.message);
    }
  }

  /**
   * Generate General Ledger Detail Report for a Bank Account
   * GET /api/accounting/gl-ledger-detail/bank/:bankId?startDate=2025-01-01&endDate=2025-12-31
   * 
   * This endpoint allows users to select a bank and automatically generates
   * the GL Detail report for that bank's GL account.
   */
  static async generateBankGLLedgerDetail(req: Request, res: Response) {
    try {
      const { bankId } = req.params;
      const { startDate, endDate, includeMultiCurrency } = req.query;

      if (!bankId) {
        return ResponseHelper.badRequest(res, "Bank ID is required");
      }

      // Get bank with GL account
      const bank = await prisma.bank.findUnique({
        where: { id: bankId },
        include: {
          glAccount: true,
          currency: true
        }
      });

      if (!bank) {
        return ResponseHelper.notFound(res, "Bank not found");
      }

      if (!bank.glAccount) {
        return ResponseHelper.badRequest(res, "Bank does not have a GL account configured");
      }

      // Use current period if dates not provided
      const today = new Date();
      const startOfYear = new Date(today.getFullYear(), 0, 1);
      const endOfYear = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);

      const start = startDate ? parseDate(startDate as string) : startOfYear;
      const end = endDate ? parseDate(endDate as string) : endOfYear;

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return ResponseHelper.badRequest(res, "Invalid date format. Use YYYY-MM-DD");
      }

      if (start > end) {
        return ResponseHelper.badRequest(res, "Start date must be before end date");
      }

      // Parse includeMultiCurrency (defaults to true if not provided)
      const includeMultiCurrencyFlag = includeMultiCurrency === 'false' ? false : true;

      // Generate GL Detail report using the bank's GL account
      const report = await GLLedgerDetailService.generateGLLedgerDetail({
        accountNo: bank.glAccount.accountNo,
        startDate: start,
        endDate: end,
        currencyId: bank.currencyId || undefined,
        includeMultiCurrency: includeMultiCurrencyFlag
      });

      // Add bank information to the response
      const bankReport = {
        ...report,
        bank: {
          id: bank.id,
          name: bank.name,
          accountNumber: bank.accountNumber,
          currency: {
            id: bank.currency?.id,
            code: bank.currency?.code,
            name: bank.currency?.name
          }
        }
      };

      return ResponseHelper.success(res, "Bank GL Detail report generated successfully", bankReport);
    } catch (error: any) {
      console.error("Error generating Bank GL Detail report:", error);
      return ResponseHelper.error(res, "Failed to generate Bank GL Detail report", error.message);
    }
  }
}

export default GLLedgerDetailController;

