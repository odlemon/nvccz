// @ts-nocheck
// Enhanced CashbookController with missing critical features
// Extends the existing CashbookController with void, edit, batch posting, and reconciliation endpoints

import { Request, Response } from "express";
import { CashbookService } from "../services/CashbookService";
import { CashbookServiceEnhanced } from "../services/CashbookService-Enhanced";
import { CashbookAuditExportService } from "../services/CashbookAuditExportService";
import AuditService from "../services/AuditService";
import { ResponseHelper } from "../utils/responseHelper";
import { prisma } from '../utils/database';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export class CashbookControllerEnhanced {
  
  /**
   * Void a cashbook entry
   * PUT /api/cashbook/entries/:id/void
   */
  static async voidEntry(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return ResponseHelper.badRequest(res, 'Void reason is required');
      }

      const result = await CashbookServiceEnhanced.voidCashbookEntry({
        entryId: id,
        reason,
        userId: req.user!.id
      });

      return ResponseHelper.success(res, 'Cashbook entry voided successfully', result);

    } catch (error: any) {
      console.error('Error in CashbookControllerEnhanced.voidEntry:', error);
      return ResponseHelper.error(res, 'Failed to void cashbook entry', error.message);
    }
  }

  /**
   * Update a cashbook entry
   * PUT /api/cashbook/entries/:id
   */
  static async updateEntry(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const result = await CashbookServiceEnhanced.updateCashbookEntry({
        entryId: id,
        updates,
        userId: req.user!.id
      });

      return ResponseHelper.success(res, 'Cashbook entry updated successfully', result);

    } catch (error: any) {
      console.error('Error in CashbookControllerEnhanced.updateEntry:', error);
      return ResponseHelper.error(res, 'Failed to update cashbook entry', error.message);
    }
  }

  /**
   * Post cashbook batch
   * POST /api/cashbook/:bankId/post-batch
   */
  static async postBatch(req: AuthRequest, res: Response) {
    try {
      const { bankId } = req.params;

      const result = await CashbookServiceEnhanced.postCashbookBatch({
        bankId,
        userId: req.user!.id
      });

      return ResponseHelper.success(res, 'Cashbook batch posted successfully', result);

    } catch (error: any) {
      console.error('Error in CashbookControllerEnhanced.postBatch:', error);
      return ResponseHelper.error(res, 'Failed to post cashbook batch', error.message);
    }
  }

  /**
   * Mark entry as reconciled
   * PUT /api/cashbook/entries/:id/reconcile
   */
  static async reconcileEntry(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { bankTransactionId } = req.body;

      const result = await CashbookServiceEnhanced.markAsReconciled({
        entryId: id,
        bankTransactionId,
        userId: req.user!.id
      });

      return ResponseHelper.success(res, 'Cashbook entry reconciled successfully', result);

    } catch (error: any) {
      console.error('Error in CashbookControllerEnhanced.reconcileEntry:', error);
      return ResponseHelper.error(res, 'Failed to reconcile cashbook entry', error.message);
    }
  }

  /**
   * Mark entry as unreconciled
   * PUT /api/cashbook/entries/:id/unreconcile
   */
  static async unreconcileEntry(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const result = await CashbookServiceEnhanced.markAsUnreconciled(id, req.user!.id);

      return ResponseHelper.success(res, 'Cashbook entry unreconciled successfully', result);

    } catch (error: any) {
      console.error('Error in CashbookControllerEnhanced.unreconcileEntry:', error);
      return ResponseHelper.error(res, 'Failed to unreconcile cashbook entry', error.message);
    }
  }

  /**
   * Get cashbook summary
   * GET /api/cashbook/:bankId/summary
   */
  static async getSummary(req: AuthRequest, res: Response) {
    try {
      const { bankId } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return ResponseHelper.badRequest(res, 'Start date and end date are required');
      }

      const summary = await CashbookServiceEnhanced.getCashbookSummary(
        bankId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      return ResponseHelper.success(res, 'Cashbook summary retrieved successfully', summary);

    } catch (error: any) {
      console.error('Error in CashbookControllerEnhanced.getSummary:', error);
      return ResponseHelper.error(res, 'Failed to get cashbook summary', error.message);
    }
  }

  /**
   * Get unreconciled entries
   * GET /api/cashbook/:bankId/unreconciled
   */
  static async getUnreconciledEntries(req: AuthRequest, res: Response) {
    try {
      const { bankId } = req.params;

      const entries = await CashbookServiceEnhanced.getUnreconciledEntries(bankId);
      return ResponseHelper.success(res, 'Unreconciled entries retrieved successfully', entries);

    } catch (error: any) {
      console.error('Error in CashbookControllerEnhanced.getUnreconciledEntries:', error);
      return ResponseHelper.error(res, 'Failed to get unreconciled entries', error.message);
    }
  }

  /**
   * Get cashbook entry by ID
   * GET /api/cashbook/entries/:id
   */
  static async getEntryById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const entry = await prisma.cashbookEntry.findUnique({
        where: { id },
        include: {
          bank: { include: { glAccount: true, currency: true } },
          customer: true,
          vendor: true,
          glAccount: true,
          journalEntry: {
            include: {
              journalEntryLines: {
                include: {
                  chartOfAccount: true
                }
              }
            }
          },
          createdBy: { select: { firstName: true, lastName: true, email: true } }
        }
      });

      if (!entry) {
        return ResponseHelper.notFound(res, 'Cashbook entry not found');
      }

      return ResponseHelper.success(res, 'Cashbook entry retrieved successfully', entry);

    } catch (error: any) {
      console.error('Error in CashbookControllerEnhanced.getEntryById:', error);
      return ResponseHelper.error(res, 'Failed to get cashbook entry', error.message);
    }
  }

  /**
   * Get reconciliation display with running balance
   * GET /api/cashbook/reconciliation/display
   */
  static async getReconciliationDisplay(req: AuthRequest, res: Response) {
    try {
      const { bankId, periodEndDate, tickedEntryIds } = req.query;

      if (!bankId || !periodEndDate) {
        return ResponseHelper.badRequest(res, 'bankId and periodEndDate are required');
      }

      // Parse tickedEntryIds - handle multiple formats:
      // 1. Array from query params: tickedEntryIds[]=id1&tickedEntryIds[]=id2
      // 2. Single value: tickedEntryIds=id1
      // 3. JSON string array: tickedEntryIds=["id1","id2"]
      // 4. Also check for tickedEntryIds[] (with brackets) format
      let parsedTickedIds: string[] | undefined = undefined;
      
      // Check for bracket notation first (tickedEntryIds[])
      const tickedEntryIdsWithBrackets = (req.query as any)['tickedEntryIds[]'];
      if (tickedEntryIdsWithBrackets) {
        if (Array.isArray(tickedEntryIdsWithBrackets)) {
          parsedTickedIds = tickedEntryIdsWithBrackets as string[];
        } else {
          parsedTickedIds = [tickedEntryIdsWithBrackets as string];
        }
      } else if (tickedEntryIds) {
        if (Array.isArray(tickedEntryIds)) {
          parsedTickedIds = tickedEntryIds as string[];
        } else if (typeof tickedEntryIds === 'string') {
          // Try to parse as JSON array first (for frontend usage)
          try {
            const parsed = JSON.parse(tickedEntryIds);
            if (Array.isArray(parsed)) {
              parsedTickedIds = parsed;
            } else {
              parsedTickedIds = [tickedEntryIds];
            }
          } catch {
            // Not JSON, treat as single value
            parsedTickedIds = [tickedEntryIds];
          }
        }
      }

      console.log(`📊 Reconciliation display request: bankId=${bankId}, periodEndDate=${periodEndDate}, tickedEntryIds=${JSON.stringify(parsedTickedIds)}`);

      const result = await CashbookServiceEnhanced.getReconciliationDisplay({
        bankId: bankId as string,
        periodEndDate: new Date(periodEndDate as string),
        tickedEntryIds: parsedTickedIds
      });

      return ResponseHelper.success(res, 'Reconciliation display retrieved successfully', result);

    } catch (error: any) {
      console.error('Error in CashbookControllerEnhanced.getReconciliationDisplay:', error);
      return ResponseHelper.error(res, 'Failed to get reconciliation display', error.message);
    }
  }

  /**
   * Get all cashbook entries (with advanced filtering)
   * GET /api/cashbook/entries
   */
  static async getAllEntries(req: AuthRequest, res: Response) {
    try {
      const { 
        bankId, 
        type, 
        status, 
        counterpartyType,
        startDate, 
        endDate,
        isReconciled,
        minAmount,
        maxAmount,
        search,
        page = 1,
        limit = 50
      } = req.query;


      const where: any = {};
      
      // Exclude reversals from normal cashbook views (reversals have originalTransactionId set)
      // Only show reversals if explicitly requested via query parameter
      const includeReversals = req.query.includeReversals === 'true';
      if (!includeReversals) {
        where.originalTransactionId = null;
      }
      
      if (bankId) where.bankId = bankId;
      if (type) where.type = type;
      if (status) where.status = status;
      if (counterpartyType) where.counterpartyType = counterpartyType;
      if (isReconciled !== undefined) where.isReconciled = isReconciled === 'true';
      if (startDate || endDate) {
        where.transactionDate = {};
        if (startDate) where.transactionDate.gte = new Date(startDate as string);
        if (endDate) where.transactionDate.lte = new Date(endDate as string);
      }
      if (minAmount != null && minAmount !== '') where.amount = { ...(where.amount || {}), gte: Number(minAmount) };
      if (maxAmount != null && maxAmount !== '') where.amount = { ...(where.amount || {}), lte: Number(maxAmount) };
      if (search != null && String(search).trim() !== '') {
        where.description = { contains: String(search).trim() };
      }

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);

      const [entries, total] = await Promise.all([
        prisma.cashbookEntry.findMany({
          where: {
            ...where
          },
          include: {
            bank: { include: { glAccount: true, currency: true } },
            customer: true,
            vendor: true,
            glAccount: true,
            journalEntry: true,
            fundDisbursement: {
              include: {
                investmentImplementation: {
                  include: {
                    portfolioCompany: {
                      select: {
                        name: true
                      }
                    }
                  }
                }
              }
            },
            purchaseInvoice: {
              select: {
                id: true,
                invoiceNumber: true,
                vendor: {
                  select: {
                    name: true
                  }
                }
              }
            },
            createdBy: { select: { firstName: true, lastName: true, email: true } }
          },
          orderBy: { transactionDate: 'desc' },
          skip,
          take
        }),
        prisma.cashbookEntry.count({ where })
      ]);

      return ResponseHelper.success(res, 'Cashbook entries retrieved successfully', {
        entries,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });

    } catch (error: any) {
      console.error('Error in CashbookControllerEnhanced.getAllEntries:', error);
      return ResponseHelper.error(res, 'Failed to get cashbook entries', error.message);
    }
  }

  /**
   * Export a month's cashbook to Excel for tax audit.
   * GET /api/cashbook/export-audit?year=2025&month=2&bankId=optional
   * Columns: Date, Payee, Reference, Amount, Tax. Totals match the system.
   */
  static async exportAudit(req: AuthRequest, res: Response) {
    try {
      const year = parseInt(req.query.year as string, 10);
      const month = parseInt(req.query.month as string, 10);
      const bankId = req.query.bankId as string | undefined;
      if (!year || !month || month < 1 || month > 12) {
        return ResponseHelper.badRequest(res, 'Query parameters year and month (1-12) are required');
      }
      const result = await CashbookAuditExportService.exportMonthToExcel({ bankId, year, month });
      if (!result.success) {
        return ResponseHelper.error(res, result.message, undefined, 400);
      }
      // System audit log: report export with user and IP
      const userId = (req as AuthRequest).user?.id;
      if (userId) {
        const ipAddress = (req as any).ip || (req as any).headers?.["x-forwarded-for"] || (req as any).socket?.remoteAddress || null;
        const userAgent = ((req as any).headers?.["user-agent"] as string) || null;
        await AuditService.log({
          userId,
          action: "REPORT_EXPORT",
          entityType: "CashbookAudit",
          entityId: result.fileName || `cashbook-audit-${year}-${month}`,
          ipAddress: typeof ipAddress === "string" ? ipAddress : (Array.isArray(ipAddress) ? ipAddress[0] : String(ipAddress ?? "")),
          userAgent,
        });
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      res.send(result.buffer);
    } catch (error: any) {
      console.error('Error in CashbookControllerEnhanced.exportAudit:', error);
      return ResponseHelper.error(res, 'Failed to export cashbook for audit', error.message);
    }
  }
}
