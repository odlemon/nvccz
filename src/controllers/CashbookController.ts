// @ts-nocheck
// Comprehensive Cashbook Controller
// API endpoints for complete cashbook functionality

import { Request, Response } from "express";
import { ResponseHelper } from "../utils/responseHelper";
import CashbookService from "../services/CashbookService";
import { prisma } from "../utils/database";
import AuditService from "../services/AuditService";
import { createJournalEntryWithAuditSequence } from "../services/AuditTrailSequenceService";
import { parseDate } from "../utils/dateHelper";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

export default class CashbookController {
  /**
   * Magic bankId values: resolve or create the operating ZiG bank (same as CashbookService.ensureZigCashbookBank).
   * Use these instead of a separate flag — it's still just `bankId`.
   */
  private static readonly ZIG_BANK_SHORTCUTS = new Set([
    'AUTO_ZIG',
    'AUTO:ZIG',
    '@ZIG',
    '_ZIG',
  ]);

  private static bankIdRequestsZiGAutoProvision(bankId: unknown): boolean {
    if (bankId == null || typeof bankId !== 'string') {
      return false;
    }
    const key = bankId.trim().toUpperCase();
    return CashbookController.ZIG_BANK_SHORTCUTS.has(key);
  }

  /** Resolves real `banks.id`, including ZiG aliases (`@ZIG`, `AUTO_ZIG`, …). */
  private static async resolveCashbookBankId(bankId: unknown): Promise<string | undefined> {
    let resolved: string | undefined =
      typeof bankId === 'string' && bankId.trim() !== '' ? bankId.trim() : undefined;
    if (CashbookController.bankIdRequestsZiGAutoProvision(resolved)) {
      const ensured = await CashbookService.ensureZigCashbookBank();
      return ensured.bank.id;
    }
    return resolved;
  }

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

      const resolvedBankId = await CashbookController.resolveCashbookBankId(bankId);

      // Validate required fields
      if (!resolvedBankId || !transactionDate || !description || !amount || !counterpartyType) {
        return ResponseHelper.badRequest(
          res,
          'Missing required fields: bankId (use AUTO_ZIG / @ZIG / _ZIG to auto-pick ZiG bank), transactionDate, description, amount, counterpartyType'
        );
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
        bankId: resolvedBankId,
        transactionDate: parseDate(transactionDate),
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

      const resolvedBankId = await CashbookController.resolveCashbookBankId(bankId);

      // Validate required fields
      if (!resolvedBankId || !transactionDate || !description || !amount || !counterpartyType) {
        return ResponseHelper.badRequest(
          res,
          'Missing required fields: bankId (use AUTO_ZIG / @ZIG / _ZIG for ZiG bank), transactionDate, description, amount, counterpartyType'
        );
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
        bankId: resolvedBankId,
        transactionDate: parseDate(transactionDate),
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
        currencyId,
        transactionType,
        status,
        dateFrom,
        dateTo,
        limit,
        offset
      } = req.query;

      const filters: any = {};

      if (bankId) filters.bankId = bankId as string;
      if (currencyId) filters.currencyId = currencyId as string;
      if (transactionType) filters.transactionType = transactionType as string;
      if (status) filters.status = status as string;
      if (dateFrom) filters.dateFrom = parseDate(dateFrom as string);
      if (dateTo) filters.dateTo = parseDate(dateTo as string);
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
      const { status, limit, offset, currencyId } = req.query;
      
      const where: any = {};
      if (status) where.status = status;
      if (currencyId) {
        where.transactions = { some: { bank: { currencyId: currencyId as string } } };
      }
      
      const batches = await prisma.cashbookBatch.findMany({
        where,
        include: {
          transactions: {
            select: {
              id: true,
              type: true,
              amount: true,
              status: true,
              receiptAttachmentUrl: true,
              receiptAttachmentPath: true,
              receiptAttachmentFileName: true,
              receiptAttachmentMimeType: true
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
      
      // Get transaction with journal entry and lines
      const transaction = await prisma.cashbookEntry.findUnique({
        where: { id },
        include: { 
          journalEntry: {
            include: {
              journalEntryLines: {
                include: {
                  chartOfAccount: true
                }
              },
              currency: true
            }
          }
        }
      });
      
      if (!transaction) {
        return ResponseHelper.notFound(res, 'Transaction not found');
      }
      
      if (transaction.status === 'VOIDED') {
        return ResponseHelper.badRequest(res, 'Transaction already voided');
      }
      
      // UAT Requirement: Prevent voiding reconciled transactions
      if (transaction.isReconciled) {
        return ResponseHelper.badRequest(res, 'Transaction must be unreconciled before voiding.');
      }
      
      // Store original status before updating
      const originalStatus = transaction.status;
      
      // UAT Requirement: Create reversing journal entry with opposite CR/DR balance
      let reversalJournalEntry = null;
      // Create reversal if transaction was posted (has journal entry with lines)
      if (transaction.journalEntry && originalStatus === 'POSTED' && transaction.journalEntry.journalEntryLines && transaction.journalEntry.journalEntryLines.length > 0) {
        try {
          const originalEntry = transaction.journalEntry;
          const originalLines = originalEntry.journalEntryLines;
          
          // Create reversal journal entry
          reversalJournalEntry = await createJournalEntryWithAuditSequence({
            transactionDate: new Date(),
            referenceNumber: `VR-${originalEntry.referenceNumber}`,
            description: `REVERSAL of CB Transaction ${id}: ${originalEntry.description}`,
            totalAmount: originalEntry.totalAmount,
            currencyId: originalEntry.currencyId,
            status: 'POSTED',
            createdById: userId,
          });
          
          // Create reversal journal entry lines (opposite debits/credits)
          for (const line of originalLines) {
            await prisma.journalEntryLine.create({
              data: {
                journalEntryId: reversalJournalEntry.id,
                chartOfAccountId: line.chartOfAccountId,
                debitAmount: line.creditAmount, // Swap: original credit becomes debit
                creditAmount: line.debitAmount, // Swap: original debit becomes credit
                description: `REVERSAL: ${line.description}`,
                vatAmount: line.vatAmount ? line.vatAmount : null
              }
            });
          }
          
          console.log(`✅ Reversing journal entry created: ${reversalJournalEntry.referenceNumber}`);
        } catch (reversalError: any) {
          console.error('❌ Error creating reversing journal entry:', reversalError);
          // Don't fail the void if reversal fails - log it
        }
      }
      
      const voidTimestamp = new Date();
      
      // Update transaction status to VOIDED (after creating reversal)
      const updatedTransaction = await prisma.cashbookEntry.update({
        where: { id },
        data: {
          status: 'VOIDED',
          description: `${transaction.description} [VOIDED: ${reason}]`
        }
      });

      // Comprehensive audit log with all required fields:
      // 1. Original transaction details (complete)
      // 2. Date/time of void
      // 3. User ID who performed the void
      // 4. Reference to Reversing Journal ID
      await AuditService.log({
        userId: userId,
        action: "VOID",
        entityType: "CashbookEntry",
        entityId: id,
        oldValues: {
          // Complete original transaction details
          cashbookEntry: {
            id: transaction.id,
            referenceNumber: transaction.referenceNumber,
            description: transaction.description,
            transactionDate: transaction.transactionDate,
            transactionType: transaction.transactionType,
            amount: transaction.amount,
            status: originalStatus,
            isReconciled: transaction.isReconciled,
            createdAt: transaction.createdAt,
            createdById: transaction.createdById
          },
          journalEntry: transaction.journalEntry ? {
            id: transaction.journalEntry.id,
            referenceNumber: transaction.journalEntry.referenceNumber,
            description: transaction.journalEntry.description,
            transactionDate: transaction.journalEntry.transactionDate,
            totalAmount: transaction.journalEntry.totalAmount,
            status: transaction.journalEntry.status
          } : null,
          journalEntryLines: transaction.journalEntry?.journalEntryLines ? transaction.journalEntry.journalEntryLines.map(line => ({
            id: line.id,
            chartOfAccountId: line.chartOfAccountId,
            chartOfAccountName: line.chartOfAccount?.accountName,
            debitAmount: line.debitAmount,
            creditAmount: line.creditAmount,
            description: line.description,
            vatAmount: line.vatAmount
          })) : []
        },
        newValues: {
          // Updated transaction with void status
          cashbookEntry: {
            id: updatedTransaction.id,
            referenceNumber: updatedTransaction.referenceNumber,
            status: updatedTransaction.status,
            description: updatedTransaction.description,
            updatedAt: updatedTransaction.updatedAt
          },
          // Audit trail metadata
          voidDetails: {
            voidedAt: voidTimestamp.toISOString(),
            voidedBy: userId,
            voidReason: reason,
            originalStatus: originalStatus,
            reversalJournalEntry: reversalJournalEntry ? {
              id: reversalJournalEntry.id,
              referenceNumber: reversalJournalEntry.referenceNumber,
              description: reversalJournalEntry.description,
              transactionDate: reversalJournalEntry.transactionDate
            } : null
          }
        }
      });
      
      return ResponseHelper.success(res, 'Transaction voided successfully', {
        transactionId: id,
        status: 'VOIDED',
        reversalJournalEntry: reversalJournalEntry ? {
          id: reversalJournalEntry.id,
          referenceNumber: reversalJournalEntry.referenceNumber,
          description: reversalJournalEntry.description
        } : null
      });
      
    } catch (error: any) {
      console.error('Error in CashbookController.voidTransaction:', error);
      return ResponseHelper.error(res, 'Failed to void transaction', error.message);
    }
  }
  
  /**
   * Get Bank Accounts (dynamic from DB)
   * GET /api/cashbook/banks
   * Query: includeInactive=true to include inactive banks (e.g. for admin/settings).
   */
  static async getBanks(req: Request, res: Response) {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const where: { isActive?: boolean } = {};
      if (!includeInactive) {
        where.isActive = true;
      }
      const banks = await prisma.bank.findMany({
        where,
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
   * Get single bank by ID
   * GET /api/cashbook/banks/:id
   */
  static async getBankById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const bank = await prisma.bank.findUnique({
        where: { id },
        include: {
          currency: true,
          glAccount: true
        }
      });
      if (!bank) {
        return ResponseHelper.notFound(res, 'Bank account not found');
      }
      return ResponseHelper.success(res, 'Bank retrieved successfully', bank);
    } catch (error: any) {
      console.error('Error in CashbookController.getBankById:', error);
      return ResponseHelper.error(res, 'Failed to get bank', error.message);
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
      if (!name || !accountNumber || !currencyId) {
        return ResponseHelper.badRequest(res, 'Missing required fields: name, accountNumber, currencyId');
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
      
      // Handle specific Prisma constraint errors
      if (error.message.includes('Unique constraint failed')) {
        if (error.message.includes('accountNumber')) {
          return ResponseHelper.badRequest(res, 'A bank account with this account number already exists.');
        }
      }
      
      // Handle validation errors from service
      if (error.message.includes('already associated') || 
          error.message.includes('already exists') ||
          error.message.includes('not found')) {
        return ResponseHelper.badRequest(res, error.message);
      }
      
      return ResponseHelper.error(res, 'Failed to create bank account', error.message);
    }
  }

  /**
   * Update Bank Account
   * PUT /api/cashbook/banks/:id
   */
  static async updateBank(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      const { id } = req.params;
      const { name, accountNumber, currencyId, glAccountId, isActive } = req.body;

      const bank = await CashbookService.updateBank(id, {
        name,
        accountNumber,
        currencyId,
        glAccountId,
        isActive
      });
      return ResponseHelper.success(res, 'Bank account updated successfully', bank);
    } catch (error: any) {
      console.error('Error in CashbookController.updateBank:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.notFound(res, error.message);
      }
      if (error.message?.includes('already exists') || error.message?.includes('already associated')) {
        return ResponseHelper.badRequest(res, error.message);
      }
      return ResponseHelper.error(res, 'Failed to update bank account', error.message);
    }
  }

  /**
   * Soft delete bank account (sets isActive: false)
   * DELETE /api/cashbook/banks/:id
   */
  static async deleteBank(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      const { id } = req.params;
      const bank = await CashbookService.softDeleteBank(id);
      return ResponseHelper.success(res, 'Bank account deactivated (soft delete) successfully', bank);
    } catch (error: any) {
      console.error('Error in CashbookController.deleteBank:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.notFound(res, error.message);
      }
      return ResponseHelper.error(res, 'Failed to delete bank account', error.message);
    }
  }

  /**
   * Get Chart of Accounts for Cashbook
   * GET /api/cashbook/accounts
   */
  static async getAccounts(req: Request, res: Response) {
    try {
      const { type, availableForBank } = req.query;
      
      const where: any = { isActive: true };
      if (type) {
        where.accountType = type;
      }
      
      // If requesting accounts available for bank creation, exclude those already used
      if (availableForBank === 'true') {
        where.accountType = { in: ['Current Asset', 'Fixed Asset'] };
        // All banks share one Cash and Cash Equivalents line; do not exclude "already used" GL ids.
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