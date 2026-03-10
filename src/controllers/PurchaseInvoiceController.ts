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
   * PO to Bill: convert an approved Purchase Order into a Vendor Bill (Purchase Invoice).
   * Body: purchaseOrderId, supplierInvoiceNumber; optional dueDate.
   * Items, quantities, and prices carry over from the PO.
   */
  static async convertPOToVendorBill(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { purchaseOrderId, supplierInvoiceNumber, dueDate } = req.body;
      const createdById = (req as any).user?.id;
      if (!createdById) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }
      if (!purchaseOrderId) {
        ResponseHelper.badRequest(res, "purchaseOrderId is required");
        return;
      }
      if (!supplierInvoiceNumber || !String(supplierInvoiceNumber).trim()) {
        ResponseHelper.badRequest(res, "supplierInvoiceNumber is required");
        return;
      }

      const invoice = await PurchaseInvoiceService.createVendorBillFromPurchaseOrder({
        purchaseOrderId,
        supplierInvoiceNumber: String(supplierInvoiceNumber).trim(),
        createdById,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });

      logger.info("PO converted to vendor bill", {
        purchaseOrderId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        userId: createdById,
      });

      ResponseHelper.success(res, "Vendor bill created from purchase order", invoice, 201);
    } catch (error: any) {
      logger.error("Error converting PO to vendor bill", { error: error.message });
      ResponseHelper.error(res, error?.message ?? "Failed to convert PO to vendor bill", undefined, 400);
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
      // currencyId cannot be changed after invoice creation - explicitly excluded
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
   * Submit invoice - creates journal entries based on payment method
   */
  static async submitInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { paymentMethod, expenseAccountId, bankId } = req.body;

      if (!id) {
        ResponseHelper.badRequest(res, "Invoice ID is required");
        return;
      }

      if (!paymentMethod) {
        ResponseHelper.badRequest(res, "Payment method is required (BANK, CASH, or CREDIT)");
        return;
      }

      if (!["BANK", "CASH", "CREDIT"].includes(paymentMethod)) {
        ResponseHelper.badRequest(res, "Payment method must be BANK, CASH, or CREDIT");
        return;
      }

      if (!expenseAccountId) {
        ResponseHelper.badRequest(res, "Expense account ID is required");
        return;
      }

      if (paymentMethod === "BANK" && !bankId) {
        ResponseHelper.badRequest(res, "Bank ID is required for BANK payment method");
        return;
      }

      // Get user ID from request
      const processedById = (req as any).user?.id;
      if (!processedById) {
        ResponseHelper.error(res, "User not authenticated", undefined, 401);
        return;
      }

      const invoice = await PurchaseInvoiceService.submitInvoice(
        id,
        {
          paymentMethod,
          expenseAccountId,
          bankId
        },
        processedById
      );

      logger.info("Purchase invoice submitted", {
        invoiceId: invoice.id,
        paymentMethod,
        journalEntryId: invoice.journalEntryId,
        userId: processedById
      });

      ResponseHelper.success(res, "Purchase invoice submitted successfully", invoice);
    } catch (error: any) {
      logger.error("Error submitting invoice", { error: error.message });
      ResponseHelper.error(res, `Failed to submit invoice: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Pay invoice - creates cashbook payment entry (only for CREDIT invoices)
   */
  static async payInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        paymentMethod,
        bankId,
        paymentDate,
        paymentReference,
        notes
      } = req.body;

      if (!id) {
        ResponseHelper.badRequest(res, "Invoice ID is required");
        return;
      }

      if (!paymentMethod) {
        ResponseHelper.badRequest(res, "Payment method is required (BANK or CASH)");
        return;
      }

      if (!["BANK", "CASH"].includes(paymentMethod)) {
        ResponseHelper.badRequest(res, "Payment method must be BANK or CASH");
        return;
      }

      if (paymentMethod === "BANK" && !bankId) {
        ResponseHelper.badRequest(res, "Bank ID is required for BANK payment method");
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
          paymentMethod,
          bankId,
          paymentDate: new Date(paymentDate),
          paymentReference,
          notes
        },
        processedById
      );

      logger.info("Purchase invoice paid successfully", {
        invoiceId: invoice.id,
        paymentMethod,
        cashbookEntryId: invoice.cashbookEntryId,
        userId: processedById
      });

      ResponseHelper.success(res, "Purchase invoice paid successfully", invoice);
    } catch (error: any) {
      logger.error("Error paying invoice", { error: error.message });
      ResponseHelper.error(res, `Failed to pay invoice: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get expense accounts for purchase invoices
   */
  static async getExpenseAccounts(req: AuthRequest, res: Response): Promise<void> {
    try {
      const expenseAccounts = await PurchaseInvoiceService.getExpenseAccounts();

      logger.info("Expense accounts retrieved successfully", {
        count: expenseAccounts.length
      });

      ResponseHelper.success(res, "Expense accounts retrieved successfully", expenseAccounts);
    } catch (error: any) {
      logger.error("Error getting expense accounts", { error: error.message });
      ResponseHelper.error(res, `Failed to get expense accounts: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get banks for purchase invoices
   */
  static async getBanks(req: AuthRequest, res: Response): Promise<void> {
    try {
      const banks = await PurchaseInvoiceService.getBanks();

      logger.info("Banks retrieved successfully", {
        count: banks.length
      });

      ResponseHelper.success(res, "Banks retrieved successfully", banks);
    } catch (error: any) {
      logger.error("Error getting banks", { error: error.message });
      ResponseHelper.error(res, `Failed to get banks: ${error.message}`, undefined, 500);
    }
  }
}

