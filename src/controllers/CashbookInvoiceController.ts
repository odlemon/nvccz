// @ts-nocheck
import { Request, Response } from 'express';
import InvoiceService from '../services/InvoiceService';
import { ResponseHelper } from "../utils/responseHelper";
import { logger } from "../utils/logger";
import { parseDate } from "../utils/dateHelper";

export class CashbookInvoiceController {
  
  /**
   * Get invoices for cashbook
   * Same response as accounting invoices but with cashbook-specific naming
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
        startDate: startDate ? parseDate(startDate as string) : undefined,
        endDate: endDate ? parseDate(endDate as string) : undefined,
        status: status as string
      };

      const result = await InvoiceService.getInvoices(params);
      const data = {
        ...result,
        invoices: (result.invoices || []).map((inv: any) => ({ ...inv, invoiceNumber: inv.invoiceNumber ?? null }))
      };
      ResponseHelper.success(res, "Invoices retrieved successfully", data);
    } catch (error: any) {
      logger.error("Error getting invoices", { error: error.message });
      ResponseHelper.error(res, `Failed to get invoices: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get invoice by ID for cashbook
   * Same response as accounting invoices but with cashbook-specific naming
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

      const data = { ...invoice, invoiceNumber: (invoice as any).invoiceNumber ?? null };
      ResponseHelper.success(res, "Invoice retrieved successfully", data);
    } catch (error: any) {
      logger.error("Error getting invoice", { error: error.message });
      ResponseHelper.error(res, `Failed to get invoice: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Create invoice for cashbook
   * Same response as accounting invoices but with cashbook-specific naming
   */
  static async createInvoice(req: Request, res: Response): Promise<void> {
    try {
      const invoiceData = req.body;

      // Validate required fields
      if (!invoiceData.customerId || !invoiceData.amount || !invoiceData.currencyId) {
        ResponseHelper.error(res, "Customer ID, amount, and currency ID are required", undefined, 400);
        return;
      }

      // Validate amount
      if (invoiceData.amount <= 0) {
        ResponseHelper.error(res, "Amount must be greater than zero", undefined, 400);
        return;
      }

      const invoice = await InvoiceService.createInvoice(invoiceData);

      ResponseHelper.success(res, "Invoice created successfully", invoice);
    } catch (error: any) {
      logger.error("Error creating invoice", { error: error.message });
      ResponseHelper.error(res, `Failed to create invoice: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Update invoice for cashbook
   * Same response as accounting invoices but with cashbook-specific naming
   */
  static async updateInvoice(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;

      if (!id) {
        ResponseHelper.error(res, "Invoice ID is required", undefined, 400);
        return;
      }

      // Validate amount if provided
      if (updateData.amount !== undefined && updateData.amount <= 0) {
        ResponseHelper.error(res, "Amount must be greater than zero", undefined, 400);
        return;
      }

      const invoice = await InvoiceService.updateInvoice(id, updateData);

      if (!invoice) {
        ResponseHelper.error(res, "Invoice not found", undefined, 404);
        return;
      }

      ResponseHelper.success(res, "Invoice updated successfully", invoice);
    } catch (error: any) {
      logger.error("Error updating invoice", { error: error.message });
      ResponseHelper.error(res, `Failed to update invoice: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Delete invoice for cashbook
   * Same response as accounting invoices but with cashbook-specific naming
   */
  static async deleteInvoice(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.error(res, "Invoice ID is required", undefined, 400);
        return;
      }

      const success = await InvoiceService.deleteInvoice(id);

      if (!success) {
        ResponseHelper.error(res, "Invoice not found", undefined, 404);
        return;
      }

      ResponseHelper.success(res, "Invoice deleted successfully", null);
    } catch (error: any) {
      logger.error("Error deleting invoice", { error: error.message });
      ResponseHelper.error(res, `Failed to delete invoice: ${error.message}`, undefined, 500);
    }
  }
}
