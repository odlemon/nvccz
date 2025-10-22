// @ts-nocheck
// Sage Pastel Cashbook Controller
// Handles cashbook operations (receipts and payments)

import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ResponseHelper } from "../utils/responseHelper";
import { dbConnection } from "../utils/database";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

export default class CashbookController {
  /**
   * Create a cash receipt
   * POST /api/cashbook/receipts
   */
  static async createReceipt(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }

      const {
        bankId,
        transactionDate,
        description,
        amount,
        reference,
        counterpartyType,
        glAccountId,
        customerId,
        vendorId
      } = req.body;

      // Validate required fields
      if (!bankId || !transactionDate || !description || !amount || !counterpartyType) {
        return ResponseHelper.badRequest(res, 'Missing required fields');
      }

      // Map VENDOR to SUPPLIER for backward compatibility
      const mappedCounterpartyType = counterpartyType === 'VENDOR' ? 'SUPPLIER' : counterpartyType;

      const prisma = dbConnection.getPrismaClient();

      // Create cash receipt using CashbookService
      const { CashbookService } = await import("../services/CashbookService");
      
      const result = await CashbookService.createCashReceipt({
        bankId,
        transactionDate: new Date(transactionDate),
        description,
        amount: parseFloat(amount),
        reference,
        counterpartyType: mappedCounterpartyType,
        glAccountId,
        customerId,
        vendorId,
        createdById: userId
      });

      return ResponseHelper.success(res, 'Cash receipt created successfully', result);

    } catch (error: any) {
      console.error('Error in CashbookController.createReceipt:', error);
      return ResponseHelper.error(res, 'Failed to create cash receipt', error.message);
    }
  }

  /**
   * Create a cash payment
   * POST /api/cashbook/payments
   */
  static async createPayment(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }

      const {
        bankId,
        transactionDate,
        description,
        amount,
        reference,
        counterpartyType,
        glAccountId,
        customerId,
        vendorId
      } = req.body;

      // Validate required fields
      if (!bankId || !transactionDate || !description || !amount || !counterpartyType) {
        return ResponseHelper.badRequest(res, 'Missing required fields');
      }

      // Map VENDOR to SUPPLIER for backward compatibility
      const mappedCounterpartyType = counterpartyType === 'VENDOR' ? 'SUPPLIER' : counterpartyType;

      const prisma = dbConnection.getPrismaClient();

      // Create cash payment using CashbookService
      const { CashbookService } = await import("../services/CashbookService");
      
      const result = await CashbookService.createCashPayment({
        bankId,
        transactionDate: new Date(transactionDate),
        description,
        amount: parseFloat(amount),
        reference,
        counterpartyType: mappedCounterpartyType,
        glAccountId,
        customerId,
        vendorId,
        createdById: userId
      });

      return ResponseHelper.success(res, 'Cash payment created successfully', result);

    } catch (error: any) {
      console.error('Error in CashbookController.createPayment:', error);
      return ResponseHelper.error(res, 'Failed to create cash payment', error.message);
    }
  }

  /**
   * Get cash position for a bank account
   * GET /api/cashbook/{bankId}/position
   */
  static async getCashPosition(req: Request, res: Response) {
    try {
      const { bankId } = req.params;

      if (!bankId) {
        return ResponseHelper.badRequest(res, 'Bank ID is required');
      }

      const prisma = dbConnection.getPrismaClient();

      // Get bank details
      const bank = await prisma.bank.findUnique({
        where: { id: bankId },
        include: { glAccount: true, currency: true }
      });

      if (!bank) {
        return ResponseHelper.notFound(res, 'Bank account not found');
      }

      // Get cashbook entries for this bank
      const entries = await prisma.cashbookEntry.findMany({
        where: { 
          bankId,
          status: 'POSTED'
        },
        orderBy: { transactionDate: 'asc' }
      });

      // Calculate totals
      const totalReceipts = entries
        .filter(e => e.type === 'RECEIPT')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const totalPayments = entries
        .filter(e => e.type === 'PAYMENT')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const currentBalance = totalReceipts - totalPayments;
      const unreconciledCount = entries.filter(e => !e.isReconciled).length;

      const position = {
        bankName: bank.name,
        openingBalance: 0, // Could be calculated from previous periods
        totalReceipts,
        totalPayments,
        currentBalance,
        unreconciledCount
      };

      return ResponseHelper.success(res, 'Cash position retrieved successfully', position);

    } catch (error: any) {
      console.error('Error in CashbookController.getCashPosition:', error);
      return ResponseHelper.error(res, 'Failed to get cash position', error.message);
    }
  }

  /**
   * Get cashbook entries for a bank account
   * GET /api/cashbook/{bankId}/entries
   */
  static async getCashbookEntries(req: Request, res: Response) {
    try {
      const { bankId } = req.params;
      const { type, status, startDate, endDate } = req.query;

      if (!bankId) {
        return ResponseHelper.badRequest(res, 'Bank ID is required');
      }

      const prisma = dbConnection.getPrismaClient();

      const where: any = { bankId };

      if (type) where.type = type;
      if (status) where.status = status;
      if (startDate || endDate) {
        where.transactionDate = {};
        if (startDate) where.transactionDate.gte = new Date(startDate as string);
        if (endDate) where.transactionDate.lte = new Date(endDate as string);
      }

      const entries = await prisma.cashbookEntry.findMany({
        where,
        include: {
          customer: true,
          vendor: true,
          glAccount: true,
          bank: true
        },
        orderBy: { transactionDate: 'desc' }
      });

      return ResponseHelper.success(res, 'Cashbook entries retrieved successfully', entries);

    } catch (error: any) {
      console.error('Error in CashbookController.getCashbookEntries:', error);
      return ResponseHelper.error(res, 'Failed to get cashbook entries', error.message);
    }
  }

  /**
   * Get all banks (cashbooks)
   * GET /api/cashbook/banks
   */
  static async getBanks(req: Request, res: Response) {
    try {
      const prisma = dbConnection.getPrismaClient();

      const banks = await prisma.bank.findMany({
        where: { isActive: true },
        include: {
          glAccount: true,
          currency: true
        },
        orderBy: { name: 'asc' }
      });

      return ResponseHelper.success(res, 'Banks retrieved successfully', banks);

    } catch (error: any) {
      console.error('Error in CashbookController.getBanks:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      return ResponseHelper.error(res, 'Failed to get banks', errorMessage);
    }
  }

  /**
   * Get cash flow report
   * GET /api/cashbook/reports/cashflow
   */
  static async getCashFlowReport(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, bankId } = req.query;

      if (!startDate || !endDate) {
        return ResponseHelper.badRequest(res, 'Start date and end date are required');
      }

      const prisma = dbConnection.getPrismaClient();

      const where: any = {
        transactionDate: {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string)
        },
        status: 'POSTED'
      };

      if (bankId) where.bankId = bankId;

      const entries = await prisma.cashbookEntry.findMany({
        where,
        include: {
          bank: { include: { glAccount: true } },
          customer: true,
          vendor: true,
          glAccount: true
        },
        orderBy: { transactionDate: 'asc' }
      });

      // Calculate totals
      const totalReceipts = entries
        .filter(e => e.type === 'RECEIPT')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const totalPayments = entries
        .filter(e => e.type === 'PAYMENT')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const netCashFlow = totalReceipts - totalPayments;

      const report = {
        period: {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        },
        summary: {
          totalReceipts,
          totalPayments,
          netCashFlow
        },
        entries: entries.map(entry => ({
          id: entry.id,
          date: entry.transactionDate,
          type: entry.type,
          description: entry.description,
          amount: Number(entry.amount),
          reference: entry.reference,
          counterparty: entry.customer?.name || entry.vendor?.name || entry.glAccount?.accountName,
          bank: entry.bank.name
        }))
      };

      return ResponseHelper.success(res, 'Cash flow report generated successfully', report);

    } catch (error: any) {
      console.error('Error in CashbookController.getCashFlowReport:', error);
      return ResponseHelper.error(res, 'Failed to generate cash flow report', error.message);
    }
  }

  /**
   * Get comprehensive cashbook vs bank reconciliation balance
   * GET /api/cashbook/balance-check
   */
  static async getBalanceCheck(req: AuthRequest, res: Response) {
    try {
      const { bankId, startDate, endDate } = req.query;
      const userId = (req as any).user?.id;

      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }

      if (!bankId) {
        return ResponseHelper.badRequest(res, 'Bank ID is required');
      }

      const prisma = dbConnection.getPrismaClient();

      // Get bank details
      const bank = await prisma.bank.findUnique({
        where: { id: bankId as string },
        include: { glAccount: true, currency: true }
      });

      if (!bank) {
        return ResponseHelper.notFound(res, 'Bank account not found');
      }

      // Date range (default to last 30 days if not provided)
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      // 1. CASHBOOK BALANCE
      const cashbookEntries = await prisma.cashbookEntry.findMany({
        where: {
          bankId: bankId as string,
          transactionDate: { gte: start, lte: end }
          // Removed status filter to include all entries
        },
        include: {
          customer: true,
          vendor: true,
          glAccount: true
        },
        orderBy: { transactionDate: 'asc' }
      });

      const cashbookReceipts = cashbookEntries
        .filter(e => e.type === 'RECEIPT')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const cashbookPayments = cashbookEntries
        .filter(e => e.type === 'PAYMENT')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const cashbookNet = cashbookReceipts - cashbookPayments;

      // Debug logging
      console.log(`Balance Check Debug:`);
      console.log(`  Bank ID: ${bankId}`);
      console.log(`  Date Range: ${start.toISOString()} to ${end.toISOString()}`);
      console.log(`  Cashbook Entries Found: ${cashbookEntries.length}`);
      console.log(`  Cashbook Receipts: ${cashbookReceipts}`);
      console.log(`  Cashbook Payments: ${cashbookPayments}`);

      // 2. BANK RECONCILIATION BALANCE
      // Get bank reconciliations through bank transactions that match our bank's GL account
      const bankReconciliations = await prisma.bankReconciliation.findMany({
        where: {
          createdAt: { gte: start, lte: end }
        },
        include: {
          bankTransactions: true,
          reconciliationResults: {
            include: {
              journalEntry: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Calculate bank statement totals
      let bankReceipts = 0;
      let bankPayments = 0;
      let matchedCount = 0;
      let unmatchedCount = 0;

      // Filter reconciliations that have transactions matching our bank's GL account
      const relevantReconciliations = bankReconciliations.filter(recon => {
        // Check if any of the reconciliation results match our bank's GL account
        return recon.reconciliationResults.some(result => 
          result.journalEntry?.journalEntryLines?.some(line => 
            line.chartOfAccountId === bank.glAccountId
          )
        );
      });

      for (const recon of relevantReconciliations) {
        for (const tx of recon.bankTransactions) {
          if (Number(tx.amount) > 0) {
            bankReceipts += Number(tx.amount);
          } else {
            bankPayments += Math.abs(Number(tx.amount));
          }
        }
        matchedCount += recon.reconciliationResults.length;
        unmatchedCount += recon.bankTransactions.length - recon.reconciliationResults.length;
      }

      const bankNet = bankReceipts - bankPayments;

      // 3. RECONCILIATION STATUS
      const reconciledEntries = cashbookEntries.filter(e => e.isReconciled);
      const unreconciledEntries = cashbookEntries.filter(e => !e.isReconciled);

      // 4. DIFFERENCES
      const receiptDifference = cashbookReceipts - bankReceipts;
      const paymentDifference = cashbookPayments - bankPayments;
      const netDifference = cashbookNet - bankNet;

      const balanceCheck = {
        bank: {
          id: bank.id,
          name: bank.name,
          accountNumber: bank.accountNumber,
          currency: bank.currency?.code || 'USD'
        },
        period: {
          startDate: start,
          endDate: end
        },
        cashbook: {
          totalReceipts: cashbookReceipts,
          totalPayments: cashbookPayments,
          netBalance: cashbookNet,
          entryCount: cashbookEntries.length,
          reconciledCount: reconciledEntries.length,
          unreconciledCount: unreconciledEntries.length
        },
        bankReconciliation: {
          totalReceipts: bankReceipts,
          totalPayments: bankPayments,
          netBalance: bankNet,
          reconciliationCount: relevantReconciliations.length,
          matchedTransactions: matchedCount,
          unmatchedTransactions: unmatchedCount
        },
        differences: {
          receiptDifference,
          paymentDifference,
          netDifference,
          isBalanced: Math.abs(netDifference) < 0.01 // Allow for small rounding differences
        },
        status: {
          isBalanced: Math.abs(netDifference) < 0.01,
          hasUnreconciledEntries: unreconciledEntries.length > 0,
          hasUnmatchedTransactions: unmatchedCount > 0,
          needsAttention: Math.abs(netDifference) >= 0.01 || unreconciledEntries.length > 0 || unmatchedCount > 0
        },
        summary: {
          message: Math.abs(netDifference) < 0.01 
            ? "✅ Cashbook and Bank Reconciliation are balanced" 
            : "⚠️ Differences detected - review required",
          recommendations: []
        }
      };

      // Add recommendations
      if (Math.abs(netDifference) >= 0.01) {
        balanceCheck.summary.recommendations.push("Review cashbook entries and bank transactions for discrepancies");
      }
      if (unreconciledEntries.length > 0) {
        balanceCheck.summary.recommendations.push(`${unreconciledEntries.length} cashbook entries need reconciliation`);
      }
      if (unmatchedCount > 0) {
        balanceCheck.summary.recommendations.push(`${unmatchedCount} bank transactions need matching`);
      }

      return ResponseHelper.success(res, 'Balance check completed successfully', balanceCheck);

    } catch (error: any) {
      console.error('Error in CashbookController.getBalanceCheck:', error);
      return ResponseHelper.error(res, 'Failed to perform balance check', error.message);
    }
  }
}