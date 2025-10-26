// @ts-nocheck
// Comprehensive Cashbook Controller
// API endpoints for complete cashbook functionality

import { Request, Response } from "express";
import { ResponseHelper } from "../utils/responseHelper";
import CashbookService from "../services/CashbookService";
import { dbConnection } from "../utils/database";

const prisma = dbConnection.getPrismaClient();

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

export default class CashbookController {
  
  /**
   * Create Cash Receipt
   * POST /api/cashbook/receipts
   */
  static async createReceipt(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      
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
        vendorId,
        vatCode,
        projectCode,
        discount
      } = req.body;
      
      // Validate required fields
      if (!bankId || !transactionDate || !description || !amount || !counterpartyType) {
        return ResponseHelper.badRequest(res, 'Missing required fields: bankId, transactionDate, description, amount, counterpartyType');
      }
      
      // Validate counterparty type specific fields
      if (counterpartyType === 'GL' && !glAccountId) {
        return ResponseHelper.badRequest(res, 'glAccountId required for GL transactions');
      }
      if (counterpartyType === 'CUSTOMER' && !customerId) {
        return ResponseHelper.badRequest(res, 'customerId required for customer transactions');
      }
      if (counterpartyType === 'SUPPLIER' && !vendorId) {
        return ResponseHelper.badRequest(res, 'vendorId required for supplier transactions');
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
        vendorId,
        vatCode: vatCode || '15%',
        projectCode,
        discount: discount ? parseFloat(discount) : undefined,
        createdById: userId
      });
      
      if (result.success) {
        return ResponseHelper.success(res, 'Cash receipt created successfully', result);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in CashbookController.createReceipt:', error);
      return ResponseHelper.error(res, 'Failed to create cash receipt', error.message);
    }
  }
  
  /**
   * Create Cash Payment
   * POST /api/cashbook/payments
   */
  static async createPayment(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      
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
        vendorId,
        vatCode,
        projectCode,
        discount
      } = req.body;
      
      // Validate required fields
      if (!bankId || !transactionDate || !description || !amount || !counterpartyType) {
        return ResponseHelper.badRequest(res, 'Missing required fields: bankId, transactionDate, description, amount, counterpartyType');
      }
      
      // Validate counterparty type specific fields
      if (counterpartyType === 'GL' && !glAccountId) {
        return ResponseHelper.badRequest(res, 'glAccountId required for GL transactions');
      }
      if (counterpartyType === 'CUSTOMER' && !customerId) {
        return ResponseHelper.badRequest(res, 'customerId required for customer transactions');
      }
      if (counterpartyType === 'SUPPLIER' && !vendorId) {
        return ResponseHelper.badRequest(res, 'vendorId required for supplier transactions');
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
        vendorId,
        vatCode: vatCode || '15%',
        projectCode,
        discount: discount ? parseFloat(discount) : undefined,
        createdById: userId
      });
      
      if (result.success) {
        return ResponseHelper.success(res, 'Cash payment created successfully', result);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in CashbookController.createPayment:', error);
      return ResponseHelper.error(res, 'Failed to create cash payment', error.message);
    }
  }
  
  /**
   * Post Transaction to GL
   * POST /api/cashbook/transactions/:id/post
   */
  static async postTransaction(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { id } = req.params;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const result = await CashbookService.postTransaction(id, userId);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Transaction posted successfully', result);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in CashbookController.postTransaction:', error);
      return ResponseHelper.error(res, 'Failed to post transaction', error.message);
    }
  }
  
  /**
   * Create Batch
   * POST /api/cashbook/batches
   */
  static async createBatch(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { batchName } = req.body;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      if (!batchName) {
        return ResponseHelper.badRequest(res, 'Batch name is required');
      }
      
      const batchId = await CashbookService.createBatch(batchName, userId);
      
      return ResponseHelper.success(res, 'Batch created successfully', { batchId });
      
    } catch (error: any) {
      console.error('Error in CashbookController.createBatch:', error);
      return ResponseHelper.error(res, 'Failed to create batch', error.message);
    }
  }
  
  /**
   * Add Transaction to Batch
   * POST /api/cashbook/batches/:batchId/transactions/:transactionId
   */
  static async addTransactionToBatch(req: Request, res: Response) {
    try {
      const { batchId, transactionId } = req.params;
      
      await CashbookService.addTransactionToBatch(transactionId, batchId);
      
      return ResponseHelper.success(res, 'Transaction added to batch successfully');
      
    } catch (error: any) {
      console.error('Error in CashbookController.addTransactionToBatch:', error);
      return ResponseHelper.error(res, 'Failed to add transaction to batch', error.message);
    }
  }
  
  /**
   * Post Batch to GL
   * POST /api/cashbook/batches/:id/post
   */
  static async postBatch(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { id } = req.params;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const result = await CashbookService.postBatch(id, userId);
      
      if (result.success) {
        return ResponseHelper.success(res, 'Batch posted successfully', result);
      } else {
        return ResponseHelper.badRequest(res, result.message);
      }
      
    } catch (error: any) {
      console.error('Error in CashbookController.postBatch:', error);
      return ResponseHelper.error(res, 'Failed to post batch', error.message);
    }
  }
  
  /**
   * Get Cash Position
   * GET /api/cashbook/cash-position
   */
  static async getCashPosition(req: Request, res: Response) {
    try {
      const cashPosition = await CashbookService.getCashPosition();
      
      return ResponseHelper.success(res, 'Cash position retrieved successfully', cashPosition);
      
    } catch (error: any) {
      console.error('Error in CashbookController.getCashPosition:', error);
      return ResponseHelper.error(res, 'Failed to get cash position', error.message);
    }
  }
  
  /**
   * Get Cashbook Entries
   * GET /api/cashbook/entries
   */
  static async getCashbookEntries(req: Request, res: Response) {
    try {
      const {
        bankId,
        transactionType,
        status,
        dateFrom,
        dateTo,
        limit,
        offset
      } = req.query;
      
      const filters: any = {};
      
      if (bankId) filters.bankId = bankId as string;
      if (transactionType) filters.transactionType = transactionType as string;
      if (status) filters.status = status as string;
      if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
      if (dateTo) filters.dateTo = new Date(dateTo as string);
      if (limit) filters.limit = parseInt(limit as string);
      if (offset) filters.offset = parseInt(offset as string);
      
      const entries = await CashbookService.getCashbookEntries(filters);
      
      return ResponseHelper.success(res, 'Cashbook entries retrieved successfully', entries);
      
    } catch (error: any) {
      console.error('Error in CashbookController.getCashbookEntries:', error);
      return ResponseHelper.error(res, 'Failed to get cashbook entries', error.message);
    }
  }
  
  /**
   * Get Transaction Details
   * GET /api/cashbook/transactions/:id
   */
  static async getTransaction(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const transaction = await prisma.cashbookTransaction.findUnique({
        where: { id },
        include: {
          bank: {
            include: { currency: true }
          },
          journalEntry: {
            include: {
              journalEntryLines: {
                include: {
                  chartOfAccounts: true
                }
              }
            }
          },
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });
      
      if (!transaction) {
        return ResponseHelper.notFound(res, 'Transaction not found');
      }
      
      return ResponseHelper.success(res, 'Transaction retrieved successfully', transaction);
      
    } catch (error: any) {
      console.error('Error in CashbookController.getTransaction:', error);
      return ResponseHelper.error(res, 'Failed to get transaction', error.message);
    }
  }
  
  /**
   * Get Batch Details
   * GET /api/cashbook/batches/:id
   */
  static async getBatch(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const batch = await prisma.cashbookBatch.findUnique({
        where: { id },
        include: {
          transactions: {
            include: {
              bank: {
                include: { currency: true }
              }
            }
          },
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });
      
      if (!batch) {
        return ResponseHelper.notFound(res, 'Batch not found');
      }
      
      return ResponseHelper.success(res, 'Batch retrieved successfully', batch);
      
    } catch (error: any) {
      console.error('Error in CashbookController.getBatch:', error);
      return ResponseHelper.error(res, 'Failed to get batch', error.message);
    }
  }
  
  /**
   * List Batches
   * GET /api/cashbook/batches
   */
  static async listBatches(req: Request, res: Response) {
    try {
      const { status, limit, offset } = req.query;
      
      const where: any = {};
      if (status) where.status = status;
      
      const batches = await prisma.cashbookBatch.findMany({
        where,
        include: {
          transactions: {
            select: {
              id: true,
              type: true,
              amount: true,
              status: true
            }
          },
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit ? parseInt(limit as string) : 20,
        skip: offset ? parseInt(offset as string) : 0
      });
      
      return ResponseHelper.success(res, 'Batches retrieved successfully', batches);
      
    } catch (error: any) {
      console.error('Error in CashbookController.listBatches:', error);
      return ResponseHelper.error(res, 'Failed to list batches', error.message);
    }
  }
  
  /**
   * Void Transaction
   * POST /api/cashbook/transactions/:id/void
   */
  static async voidTransaction(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { id } = req.params;
      const { reason } = req.body;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      if (!reason) {
        return ResponseHelper.badRequest(res, 'Void reason is required');
      }
      
      // Get transaction
      const transaction = await prisma.cashbookTransaction.findUnique({
        where: { id },
        include: { journalEntry: true }
      });
      
      if (!transaction) {
        return ResponseHelper.notFound(res, 'Transaction not found');
      }
      
      if (transaction.status === 'VOIDED') {
        return ResponseHelper.badRequest(res, 'Transaction already voided');
      }
      
      // Update transaction status
      await prisma.cashbookTransaction.update({
        where: { id },
        data: {
          status: 'VOIDED',
          description: `${transaction.description} [VOIDED: ${reason}]`
        }
      });
      
      // If transaction was posted, create reversing journal entry
      if (transaction.journalEntry) {
        // Create reversing journal entry logic here
        // This would create a new journal entry with opposite debits/credits
      }
      
      return ResponseHelper.success(res, 'Transaction voided successfully');
      
    } catch (error: any) {
      console.error('Error in CashbookController.voidTransaction:', error);
      return ResponseHelper.error(res, 'Failed to void transaction', error.message);
    }
  }
  
  /**
   * Get Bank Accounts
   * GET /api/cashbook/banks
   */
  static async getBanks(req: Request, res: Response) {
    try {
      const banks = await prisma.bank.findMany({
        where: { isActive: true },
        include: {
          currency: true,
          glAccount: true
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
   * Create Bank Account
   * POST /api/cashbook/banks
   */
  static async createBank(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const {
        name,
        accountNumber,
        currencyId,
        glAccountId,
        bankCode,
        branchCode,
        isActive = true
      } = req.body;
      
      // Validate required fields
      if (!name || !accountNumber || !currencyId || !glAccountId) {
        return ResponseHelper.badRequest(res, 'Missing required fields: name, accountNumber, currencyId, glAccountId');
      }
      
      const bank = await CashbookService.createBank({
        name,
        accountNumber,
        currencyId,
        glAccountId,
        bankCode,
        branchCode,
        isActive
      });
      
      return ResponseHelper.success(res, 'Bank account created successfully', bank);
    } catch (error: any) {
      console.error('Error in CashbookController.createBank:', error);
      return ResponseHelper.error(res, 'Failed to create bank account', error.message);
    }
  }

  /**
   * Get Chart of Accounts for Cashbook
   * GET /api/cashbook/accounts
   */
  static async getAccounts(req: Request, res: Response) {
    try {
      const { type } = req.query;
      
      const where: any = { isActive: true };
      if (type) {
        where.accountType = type;
      }
      
      const accounts = await prisma.chartOfAccounts.findMany({
        where,
        select: {
          id: true,
          accountNo: true,
          accountName: true,
          accountType: true,
          financialStatement: true
        },
        orderBy: { accountNo: 'asc' }
      });
      
      return ResponseHelper.success(res, 'Accounts retrieved successfully', accounts);
      
    } catch (error: any) {
      console.error('Error in CashbookController.getAccounts:', error);
      return ResponseHelper.error(res, 'Failed to get accounts', error.message);
    }
  }
}