// @ts-nocheck
import { Request, Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { PurchaseInvoiceService, CreatePurchaseInvoiceParams } from "../services/PurchaseInvoiceService";
import { ResponseHelper } from "../utils/responseHelper";
import { logger } from "../utils/logger";

export class PurchaseInvoiceController {
  /**
   * Create a new purchase invoice
   */
  static async createPurchaseInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        vendorId,
        invoiceDate,
        dueDate,
        currencyId,
        description,
        items,
        isTaxable,
        invoiceNumber,
        notes
      } = req.body;

      // Validate required fields
      const missing: string[] = [];
      if (!vendorId) missing.push("vendorId");
      if (!invoiceDate) missing.push("invoiceDate");
      if (!currencyId) missing.push("currencyId");
      if (!items || !Array.isArray(items) || items.length === 0) missing.push("items");

      if (missing.length) {
        ResponseHelper.badRequest(
          res,
          `Missing required fields: ${missing.join(", ")}`,
          JSON.stringify({ missingFields: missing })
        );
        return;
      }

      // Get user ID from request
      const createdById = (req as any).user?.id;
      if (!createdById) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }

      const invoiceParams: CreatePurchaseInvoiceParams = {
        vendorId,
        invoiceDate: new Date(invoiceDate),
        dueDate: dueDate ? new Date(dueDate) : undefined,
        currencyId,
        description,
        items,
        isTaxable: Boolean(isTaxable),
        invoiceNumber,
        notes,
        createdById
      };

      const invoice = await PurchaseInvoiceService.createPurchaseInvoice(invoiceParams);

      logger.info("Purchase invoice created successfully", {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        vendorId: invoice.vendorId,
        userId: createdById
      });

      ResponseHelper.success(res, "Purchase invoice created successfully", invoice, 201);
    } catch (error: any) {
      logger.error("Error creating purchase invoice", { error: error.message });
      ResponseHelper.error(res, `Failed to create purchase invoice: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get purchase invoice by ID
   */
  static async getPurchaseInvoiceById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.badRequest(res, "Invoice ID is required");
        return;
      }

      const invoice = await PurchaseInvoiceService.getPurchaseInvoiceById(id);

      if (!invoice) {
        ResponseHelper.notFound(res, "Purchase invoice not found");
        return;
      }

      ResponseHelper.success(res, "Purchase invoice retrieved successfully", invoice);
    } catch (error: any) {
      logger.error("Error getting purchase invoice", { error: error.message });
      ResponseHelper.error(res, `Failed to get purchase invoice: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get all purchase invoices
   */
  static async getAllPurchaseInvoices(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string | undefined;
      const paymentStatus = req.query.paymentStatus as string | undefined;

      const result = await PurchaseInvoiceService.getAllPurchaseInvoices(
        page,
        limit,
        status,
        paymentStatus
      );

      ResponseHelper.success(res, "Purchase invoices retrieved successfully", result);
    } catch (error: any) {
      logger.error("Error getting purchase invoices", { error: error.message });
      ResponseHelper.error(res, `Failed to get purchase invoices: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Update purchase invoice
   */
  static async updatePurchaseInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        vendorId,
        invoiceDate,
        dueDate,
        currencyId,
        description,
        items,
        isTaxable,
        notes
      } = req.body;

      if (!id) {
        ResponseHelper.badRequest(res, "Invoice ID is required");
        return;
      }

      // Get user ID from request
      const updatedById = (req as any).user?.id;
      if (!updatedById) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }

      const updateParams: Partial<CreatePurchaseInvoiceParams> = {};
      if (vendorId) updateParams.vendorId = vendorId;
      if (invoiceDate) updateParams.invoiceDate = new Date(invoiceDate);
      if (dueDate !== undefined) updateParams.dueDate = dueDate ? new Date(dueDate) : undefined;
      if (currencyId) updateParams.currencyId = currencyId;
      if (description !== undefined) updateParams.description = description;
      if (items) updateParams.items = items;
      if (isTaxable !== undefined) updateParams.isTaxable = Boolean(isTaxable);
      if (notes !== undefined) updateParams.notes = notes;

      const invoice = await PurchaseInvoiceService.updatePurchaseInvoice(
        id,
        updateParams,
        updatedById
      );

      logger.info("Purchase invoice updated successfully", {
        invoiceId: invoice.id,
        userId: updatedById
      });

      ResponseHelper.success(res, "Purchase invoice updated successfully", invoice);
    } catch (error: any) {
      logger.error("Error updating purchase invoice", { error: error.message });
      ResponseHelper.error(res, `Failed to update purchase invoice: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Delete purchase invoice
   */
  static async deletePurchaseInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.badRequest(res, "Invoice ID is required");
        return;
      }

      // Get user ID from request
      const deletedById = (req as any).user?.id;
      if (!deletedById) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }

      await PurchaseInvoiceService.deletePurchaseInvoice(id, deletedById);

      logger.info("Purchase invoice deleted successfully", {
        invoiceId: id,
        userId: deletedById
      });

      ResponseHelper.success(res, "Purchase invoice deleted successfully", null);
    } catch (error: any) {
      logger.error("Error deleting purchase invoice", { error: error.message });
      ResponseHelper.error(res, `Failed to delete purchase invoice: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Mark invoice as "on credit" - creates Accounts Payable journal entry
   */
  static async markAsCredit(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { expenseAccountId } = req.body;

      if (!id) {
        ResponseHelper.badRequest(res, "Invoice ID is required");
        return;
      }

      if (!expenseAccountId) {
        ResponseHelper.badRequest(res, "Expense account ID is required");
        return;
      }

      // Get user ID from request
      const processedById = (req as any).user?.id;
      if (!processedById) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }

      const invoice = await PurchaseInvoiceService.markAsCredit(
        id,
        expenseAccountId,
        processedById
      );

      logger.info("Purchase invoice marked as credit", {
        invoiceId: invoice.id,
        journalEntryId: invoice.journalEntryId,
        userId: processedById
      });

      ResponseHelper.success(res, "Purchase invoice marked as credit successfully", invoice);
    } catch (error: any) {
      logger.error("Error marking invoice as credit", { error: error.message });
      ResponseHelper.error(res, `Failed to mark invoice as credit: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Pay invoice - creates cashbook payment entry
   */
  static async payInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        bankId,
        paymentDate,
        paymentReference,
        notes
      } = req.body;

      if (!id) {
        ResponseHelper.badRequest(res, "Invoice ID is required");
        return;
      }

      if (!bankId) {
        ResponseHelper.badRequest(res, "Bank ID is required");
        return;
      }

      if (!paymentDate) {
        ResponseHelper.badRequest(res, "Payment date is required");
        return;
      }

      // Get user ID from request
      const processedById = (req as any).user?.id;
      if (!processedById) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }

      const invoice = await PurchaseInvoiceService.payInvoice(
        id,
        {
          bankId,
          paymentDate: new Date(paymentDate),
          paymentReference,
          notes
        },
        processedById
      );

      logger.info("Purchase invoice paid successfully", {
        invoiceId: invoice.id,
        cashbookEntryId: invoice.cashbookEntryId,
        userId: processedById
      });

      ResponseHelper.success(res, "Purchase invoice paid successfully", invoice);
    } catch (error: any) {
      logger.error("Error paying invoice", { error: error.message });
      ResponseHelper.error(res, `Failed to pay invoice: ${error.message}`, undefined, 500);
    }
  }
}

