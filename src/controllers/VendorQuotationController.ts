// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { VendorQuotationService } from "../services/VendorQuotationService";
import { serializeDecimalsDeep } from "../utils/prismaDecimalJson";
import { enrichRfqItemsSnapshotForApi } from "../utils/rfqItemInput";

/**
 * The service throws plain Errors for problems with the request itself — an unknown quotation,
 * a bad or expired vendor portal token, a quotation already decided — and the error middleware
 * answers any error without a status as a 500. That told a vendor or the desk the system had
 * broken when the request was wrong, and buried real failures among them (PROC-FINDING-003).
 * Database errors keep their 500.
 */
function withClientStatus(error: any) {
  if (!error || error.status || error.statusCode) return error;
  const msg = String(error.message || "");
  if (/^PrismaClient/.test(String(error.name || "")) || /prisma\./i.test(msg)) return error;
  if (/not found/i.test(msg)) error.status = 404;
  else if (/already been|already (accepted|rejected|submitted)/i.test(msg)) error.status = 409;
  else if (/token|required|invalid|expired|closed|not invited|does not match|must /i.test(msg)) error.status = 400;
  return error;
}

export class VendorQuotationController {
  /**
   * Create a vendor quotation (PUBLIC - no auth required)
   * This is used by vendors to submit their quotes via a public form
   */
  static async createVendorQuotation(req: Request, res: Response, next: NextFunction) {
    try {
      const body = { ...req.body };
      if (!body.vendorPortalToken && body.token) {
        body.vendorPortalToken = body.token;
      }
      const quotation = await VendorQuotationService.createVendorQuotation(body);

      res.status(201).json({
        success: true,
        message: "Quotation submitted successfully. We will review your quote and contact you soon.",
        data: serializeDecimalsDeep(quotation),
      });
    } catch (error: any) {
      next(withClientStatus(error));
    }
  }

  /**
   * Get all quotations (AUTHENTICATED)
   */
  static async getAllQuotations(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, rfqNumber, vendorEmail, limit, offset } = req.query;

      const result = await VendorQuotationService.getAllQuotations({
        status: status as string,
        rfqNumber: rfqNumber as string,
        vendorEmail: vendorEmail as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });

      // Ensure each quotation in list includes auto-generated quotationNumber
      const data = (result.quotations || []).map((q: any) =>
        serializeDecimalsDeep({ ...q, quotationNumber: q.quotationNumber ?? null })
      );
      res.json({
        success: true,
        message: "Quotations retrieved successfully",
        data,
        count: result.count,
        limit: result.limit,
        offset: result.offset
      });
    } catch (error: any) {
      next(withClientStatus(error));
    }
  }

  /**
   * Get quotation by ID (AUTHENTICATED)
   */
  static async getQuotationById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const quotation = await VendorQuotationService.getQuotationById(id);

      // Ensure auto-generated quotationNumber is always in response
      const data = quotation
        ? serializeDecimalsDeep({ ...quotation, quotationNumber: (quotation as any).quotationNumber ?? null })
        : null;
      res.json({
        success: true,
        message: "Quotation retrieved successfully",
        data
      });
    } catch (error: any) {
      next(withClientStatus(error));
    }
  }

  /**
   * Get quotations by RFQ number (AUTHENTICATED)
   */
  static async getQuotationsByRFQ(req: Request, res: Response, next: NextFunction) {
    try {
      const { rfqNumber } = req.params;

      const result = await VendorQuotationService.getQuotationsByRFQ(rfqNumber);
      const quotations = result.quotations || [];
      const data = quotations.map((q: any) =>
        serializeDecimalsDeep({ ...q, quotationNumber: q.quotationNumber ?? null })
      );
      let rfq = result.rfq ? serializeDecimalsDeep(result.rfq) : null;
      if (rfq && rfq.itemsSnapshot != null) {
        rfq = { ...rfq, itemsSnapshot: enrichRfqItemsSnapshotForApi(rfq.itemsSnapshot) };
      }
      res.json({
        success: true,
        message: "Quotations retrieved successfully",
        data,
        rfq,
        count: data.length,
      });
    } catch (error: any) {
      next(withClientStatus(error));
    }
  }

  /**
   * Accept a vendor quotation (AUTHENTICATED) — creates PO by default
   */
  static async acceptQuotation(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const reviewNotes = req.query.reviewNotes as string | undefined;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
      }

      const result = await VendorQuotationService.reviewQuotation({
        quotationId: id,
        action: "ACCEPT",
        reviewedById: userId,
        reviewNotes,
      });

      let message = "Quotation accepted successfully. Vendor has been notified.";
      if (result.purchaseOrder) {
        const sent = result.purchaseOrder.status === "SENT";
        message = sent
          ? `Quotation accepted. Purchase order ${result.purchaseOrder.poNumber} created and emailed to the vendor.`
          : `Quotation accepted and purchase order ${result.purchaseOrder.poNumber} created.`;
      } else if (result.invoice) {
        message = "Quotation accepted and invoice created successfully. Vendor has been notified.";
      }

      res.json({
        success: true,
        message,
        data: serializeDecimalsDeep({
          quotation: result.quotation,
          purchaseOrder: result.purchaseOrder,
          invoice: result.invoice,
        }),
      });
    } catch (error: any) {
      next(withClientStatus(error));
    }
  }

  /**
   * Reject a vendor quotation (AUTHENTICATED)
   */
  static async rejectQuotation(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { rejectionReason, reviewNotes } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!rejectionReason) {
        return res.status(400).json({
          success: false,
          message: "Rejection reason is required"
        });
      }

      const result = await VendorQuotationService.reviewQuotation({
        quotationId: id,
        action: "REJECT",
        reviewedById: userId,
        reviewNotes,
        rejectionReason,
        createInvoice: false
      });

      res.json({
        success: true,
        message: "Quotation rejected successfully. Vendor has been notified.",
        data: serializeDecimalsDeep(result.quotation),
      });
    } catch (error: any) {
      next(withClientStatus(error));
    }
  }

  /**
   * Delete a quotation (AUTHENTICATED)
   * Only allowed if quotation has not been reviewed yet
   */
  static async deleteQuotation(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      await VendorQuotationService.deleteQuotation(id, userId);

      res.json({
        success: true,
        message: "Quotation deleted successfully"
      });
    } catch (error: any) {
      next(withClientStatus(error));
    }
  }
}






