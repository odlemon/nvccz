// @ts-nocheck
// Sage Pastel Cashbook Controller
// Handles API endpoints for cashbook operations

import { Request, Response } from "express";
import { CashbookService } from "../services/CashbookService";
import ResponseHelper from "../utils/responseHelper";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export class CashbookController {
  
  /**
   * Create a cash receipt
   * POST /api/cashbook/receipts
   */
  static async createReceipt(req: AuthRequest, res: Response) {
    try {
      const {
        bankId,
        transactionDate,
        description,
        amount,
        reference,
        counterpartyType,
        glAccountId,
        customerId,
        supplierId
      } = req.body;

      // Validation
      if (!bankId || !transactionDate || !description || !amount || !counterpartyType) {
        return ResponseHelper.badRequest(res, 'Missing required fields');
      }

      if (counterpartyType === 'GL' && !glAccountId) {
        return ResponseHelper.badRequest(res, 'GL account ID required for GL transactions');
      }
      if (counterpartyType === 'CUSTOMER' && !customerId) {
        return ResponseHelper.badRequest(res, 'Customer ID required for customer transactions');
      }
      if (counterpartyType === 'SUPPLIER' && !supplierId) {
        return ResponseHelper.badRequest(res, 'Supplier ID required for supplier transactions');
      }

      const result = await CashbookService.createCashReceipt({
        bankId,
        transactionDate: new Date(transactionDate),
        description,
        amount: parseFloat(amount),
        reference,
        counterpartyType,
        glAccountId,
        customerId,
        supplierId,
        createdById: req.user!.id
      });

      return ResponseHelper.created(res, 'Cash receipt created successfully', result);

    } catch (error: any) {
      console.error('Error in CashbookController.createReceipt:', error);
      return ResponseHelper.error(res, 'Failed to create cash receipt', error.message);
    }
  }

  /**
   * Create a cash payment
   * POST /api/cashbook/payments
   */
  static async createPayment(req: AuthRequest, res: Response) {
    try {
      const {
        bankId,
        transactionDate,
        description,
        amount,
        reference,
        counterpartyType,
        glAccountId,
        customerId,
        supplierId
      } = req.body;

      // Validation
      if (!bankId || !transactionDate || !description || !amount || !counterpartyType) {
        return ResponseHelper.badRequest(res, 'Missing required fields');
      }

      if (counterpartyType === 'GL' && !glAccountId) {
        return ResponseHelper.badRequest(res, 'GL account ID required for GL transactions');
      }
      if (counterpartyType === 'CUSTOMER' && !customerId) {
        return ResponseHelper.badRequest(res, 'Customer ID required for customer transactions');
      }
      if (counterpartyType === 'SUPPLIER' && !supplierId) {
        return ResponseHelper.badRequest(res, 'Supplier ID required for supplier transactions');
      }

      const result = await CashbookService.createCashPayment({
        bankId,
        transactionDate: new Date(transactionDate),
        description,
        amount: parseFloat(amount),
        reference,
        counterpartyType,
        glAccountId,
        customerId,
        supplierId,
        createdById: req.user!.id
      });

      return ResponseHelper.created(res, 'Cash payment created successfully', result);

    } catch (error: any) {
      console.error('Error in CashbookController.createPayment:', error);
      return ResponseHelper.error(res, 'Failed to create cash payment', error.message);
    }
  }

  /**
   * Get cash position for a bank account
   * GET /api/cashbook/:bankId/position
   */
  static async getCashPosition(req: AuthRequest, res: Response) {
    try {
      const { bankId } = req.params;

      const position = await CashbookService.getCashPosition(bankId);
      return ResponseHelper.success(res, 'Cash position retrieved successfully', position);

    } catch (error: any) {
      console.error('Error in CashbookController.getCashPosition:', error);
      return ResponseHelper.error(res, 'Failed to get cash position', error.message);
    }
  }

  /**
   * Get cashbook entries for a bank
   * GET /api/cashbook/:bankId/entries
   */
  static async getCashbookEntries(req: AuthRequest, res: Response) {
    try {
      const { bankId } = req.params;
      const { type, status, startDate, endDate } = req.query;

      const filters: any = {};
      if (type) filters.type = type;
      if (status) filters.status = status;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const entries = await CashbookService.getCashbookEntries(bankId, filters);
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
  static async getBanks(req: AuthRequest, res: Response) {
    try {
      const { dbConnection } = require('../utils/database');
      const prisma = dbConnection.getPrismaClient();

      const banks = await prisma.bank.findMany({
        where: { isActive: true },
        include: {
          glAccount: true,
          currency: true,
          _count: {
            select: {
              cashbookEntries: {
                where: { status: 'POSTED' }
              }
            }
          }
        },
        orderBy: { name: 'asc' }
      });

      return ResponseHelper.success(res, 'Banks retrieved successfully', banks);

    } catch (error: any) {
      console.error('Error in CashbookController.getBanks:', error);
      return ResponseHelper.error(res, 'Failed to get banks', error.message);
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

      const { dbConnection } = require('../utils/database');
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
          supplier: true,
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
          counterparty: entry.customer?.name || entry.supplier?.name || entry.glAccount?.accountName,
          bank: entry.bank.name
        }))
      };

      return ResponseHelper.success(res, 'Cash flow report generated successfully', report);

    } catch (error: any) {
      console.error('Error in CashbookController.getCashFlowReport:', error);
      return ResponseHelper.error(res, 'Failed to generate cash flow report', error.message);
    }
  }
}
