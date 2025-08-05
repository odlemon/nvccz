// @ts-nocheck
import { Request, Response } from "express";
import { InvoiceService, CreateInvoiceParams } from "../services/InvoiceService";
import { ResponseHelper } from "../utils/responseHelper";
import { logger } from "../utils/logger";

export class InvoiceController {
  /**
   * Create a new invoice
   */
  static async createInvoice(req: Request, res: Response): Promise<void> {
    try {
      const {
        customerId,
        amount,
        currencyId,
        transactionDate,
        description,
        items,
        invoiceNumber,
        isTaxable
      } = req.body;

      // Validate required fields
      if (!customerId || !amount || !currencyId || !transactionDate || !description) {
        ResponseHelper.error(res, "Missing required fields", undefined, 400);
        return;
      }

      // Validate amount
      if (amount <= 0) {
        ResponseHelper.error(res, "Amount must be greater than zero", undefined, 400);
        return;
      }

      // Get user ID from request (set by auth middleware)
      const createdById = (req as any).user?.id;
      if (!createdById) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }

      const invoiceParams: CreateInvoiceParams = {
        customerId,
        amount: Number(amount),
        currencyId,
        transactionDate: new Date(transactionDate),
        description,
        items,
        invoiceNumber,
        isTaxable: Boolean(isTaxable),
        createdById
      };

      const invoice = await InvoiceService.createInvoice(invoiceParams);

      logger.info("Invoice created successfully", {
        invoiceId: invoice.id,
        amount: invoice.amount,
        customerId: invoice.customerId,
        userId: createdById
      });

      ResponseHelper.success(res, "Invoice created successfully", invoice, 201);
    } catch (error: any) {
      logger.error("Error creating invoice", { error: error.message });
      ResponseHelper.error(res, `Failed to create invoice: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get invoice by ID
   */
  static async getInvoiceById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.error(res, "Invoice ID is required", undefined, 400);
        return;
      }

      const invoice = await InvoiceService.getInvoiceById(id);

      if (!invoice) {
        ResponseHelper.error(res, "Invoice not found", undefined, 404);
        return;
      }

      ResponseHelper.success(res, "Invoice retrieved successfully", invoice);
    } catch (error: any) {
      logger.error("Error getting invoice", { error: error.message });
      ResponseHelper.error(res, `Failed to get invoice: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get invoices with filtering and pagination
   */
  static async getInvoices(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        customerId,
        currencyId,
        startDate,
        endDate,
        status
      } = req.query;

      const params = {
        page: Number(page),
        limit: Number(limit),
        customerId: customerId as string,
        currencyId: currencyId as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        status: status as string
      };

      const result = await InvoiceService.getInvoices(params);

      ResponseHelper.success(res, 200, "Invoices retrieved successfully", result);
    } catch (error: any) {
      logger.error("Error getting invoices", { error: error.message });
      ResponseHelper.error(res, 500, `Failed to get invoices: ${error.message}`);
    }
  }

  /**
   * Update an invoice
   */
  static async updateInvoice(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;

      if (!id) {
        ResponseHelper.error(res, 400, "Invoice ID is required");
        return;
      }

      // Validate amount if provided
      if (updateData.amount !== undefined && updateData.amount <= 0) {
        ResponseHelper.error(res, 400, "Amount must be greater than zero");
        return;
      }

      // Convert numeric fields
      if (updateData.amount !== undefined) {
        updateData.amount = Number(updateData.amount);
      }
      if (updateData.isTaxable !== undefined) {
        updateData.isTaxable = Boolean(updateData.isTaxable);
      }
      if (updateData.transactionDate !== undefined) {
        updateData.transactionDate = new Date(updateData.transactionDate);
      }

      const updatedInvoice = await InvoiceService.updateInvoice(id, updateData);

      logger.info("Invoice updated successfully", {
        invoiceId: id,
        userId: (req as any).user?.id
      });

      ResponseHelper.success(res, 200, "Invoice updated successfully", updatedInvoice);
    } catch (error: any) {
      logger.error("Error updating invoice", { error: error.message });
      ResponseHelper.error(res, 500, `Failed to update invoice: ${error.message}`);
    }
  }

  /**
   * Delete an invoice
   */
  static async deleteInvoice(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.error(res, 400, "Invoice ID is required");
        return;
      }

      await InvoiceService.deleteInvoice(id);

      logger.info("Invoice deleted successfully", {
        invoiceId: id,
        userId: (req as any).user?.id
      });

      ResponseHelper.success(res, 200, "Invoice deleted successfully");
    } catch (error: any) {
      logger.error("Error deleting invoice", { error: error.message });
      ResponseHelper.error(res, 500, `Failed to delete invoice: ${error.message}`);
    }
  }

  /**
   * Get invoice summary statistics
   */
  static async getInvoiceSummary(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, currencyId } = req.query;

      const params = {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        currencyId: currencyId as string
      };

      const summary = await InvoiceService.getInvoiceSummary(params);

      ResponseHelper.success(res, 200, "Invoice summary retrieved successfully", summary);
    } catch (error: any) {
      logger.error("Error getting invoice summary", { error: error.message });
      ResponseHelper.error(res, 500, `Failed to get invoice summary: ${error.message}`);
    }
  }
} 