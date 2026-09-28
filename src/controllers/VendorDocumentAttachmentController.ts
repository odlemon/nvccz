// @ts-nocheck
import { Request, Response } from "express";
import { VendorDocumentUploadSettingsService } from "../services/VendorDocumentUploadSettingsService";
import { VendorDocumentAttachmentService } from "../services/VendorDocumentAttachmentService";
import { isVendorDocumentEntityType } from "../constants/vendorDocumentAttachment";

function requestMeta(req: Request) {
  const m = (req as any).requestMeta;
  return {
    ipAddress: m?.ipAddress,
    userAgent: m?.userAgent
  };
}

function staffActor(req: Request) {
  const userId = (req as any).user?.id;
  if (!userId) throw new Error("Authentication required");
  return { kind: "staff" as const, userId };
}

export class VendorDocumentAttachmentController {
  static async getSettings(req: Request, res: Response) {
    try {
      staffActor(req);
      const data = await VendorDocumentUploadSettingsService.getSettings();
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message?.includes("Authentication") ? 401 : 500).json({
        success: false,
        message: error.message || "Failed to load settings"
      });
    }
  }

  static async getPublicSettings(_req: Request, res: Response) {
    try {
      const settings = await VendorDocumentUploadSettingsService.getSettings();
      res.json({
        success: true,
        data: VendorDocumentUploadSettingsService.getPublicSettingsView(settings)
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async updateSettings(req: Request, res: Response) {
    try {
      const actor = staffActor(req);
      const data = await VendorDocumentUploadSettingsService.updateSettings({
        maxFileSizeBytes: req.body?.maxFileSizeBytes,
        allowedFileTypes: req.body?.allowedFileTypes,
        maxAttachmentsPerRecord: req.body?.maxAttachmentsPerRecord,
        userId: actor.userId,
        meta: requestMeta(req)
      });
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async portalUpload(req: Request, res: Response) {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file?.buffer?.length) {
        return res.status(400).json({ success: false, message: "Multipart field document is required" });
      }
      const vendorPortalToken = String(
        req.body?.vendorPortalToken || req.body?.token || ""
      ).trim();
      if (!vendorPortalToken) {
        return res.status(400).json({ success: false, message: "vendorPortalToken is required" });
      }
      const entityType = String(req.body?.entityType || "").trim();
      if (!isVendorDocumentEntityType(entityType)) {
        return res.status(400).json({
          success: false,
          message: "entityType must be VENDOR_QUOTATION or PROCUREMENT_INVOICE"
        });
      }
      // A supplier stages a file and links it when they submit. Naming an existing record here would let one supplier attach
      // files to another's quotation or invoice, so it is refused outright.
      if (req.body?.entityId) {
        return res.status(400).json({ success: false, message: "Upload the file first; it is linked to your submission when you submit." });
      }
      const entityId = null;
      // §15/§16: in a two-envelope event a supplier says which of its documents are technical; anything else is commercial.
      const envelope = String(req.body?.envelope || "").toUpperCase() === "TECHNICAL" ? "TECHNICAL" : "COMMERCIAL";

      const data = await VendorDocumentAttachmentService.upload({
        file,
        entityType,
        entityId,
        actor: { kind: "portal", vendorPortalToken },
        meta: requestMeta(req),
        overrides: entityType === "VENDOR_QUOTATION" ? { envelope } : undefined
      });
      res.status(201).json({ success: true, data });
    } catch (error: any) {
      const msg = String(error.message || "");
      const status = msg.includes("token") || msg.includes("Access denied") ? 403 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  static async portalDownload(req: Request, res: Response) {
    try {
      const attachmentId = String(req.params.attachmentId || "").trim();
      const vendorPortalToken = String(
        req.query?.vendorPortalToken || req.query?.token || ""
      ).trim();
      if (!vendorPortalToken) {
        return res.status(400).json({ success: false, message: "vendorPortalToken is required" });
      }
      const { buffer, fileName, mimeType } = await VendorDocumentAttachmentService.getFileBuffer(
        attachmentId,
        { kind: "portal", vendorPortalToken }
      );
      res.setHeader("Content-Type", mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName.replace(/"/g, "")}"`);
      res.send(buffer);
    } catch (error: any) {
      const msg = String(error.message || "");
      const status = msg.includes("not found") ? 404 : msg.includes("denied") ? 403 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  static async staffUploadToQuotation(_req: Request, res: Response) {
    // §15: a quotation's documents are what the supplier submitted, or what an authorised user captured on the supplier's behalf
    // through POST /procurement/rfqs/:id/quotations/capture. Attaching a file to someone else's submission is not offered.
    return res.status(403).json({
      success: false,
      message: "Documents are attached to a quotation by the supplier, or by capturing the quotation on their behalf. They cannot be added afterwards.",
    });
  }

  static async staffUploadToProcurementInvoice(req: Request, res: Response) {
    try {
      const file = (req as any).file;
      if (!file?.buffer?.length) {
        return res.status(400).json({ success: false, message: "Multipart field document is required" });
      }
      const data = await VendorDocumentAttachmentService.upload({
        file,
        entityType: "PROCUREMENT_INVOICE",
        entityId: req.params.invoiceId,
        actor: staffActor(req),
        meta: requestMeta(req)
      });
      res.status(201).json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async staffUploadToPurchaseInvoice(req: Request, res: Response) {
    try {
      const file = (req as any).file;
      if (!file?.buffer?.length) {
        return res.status(400).json({ success: false, message: "Multipart field document is required" });
      }
      const data = await VendorDocumentAttachmentService.upload({
        file,
        entityType: "PURCHASE_INVOICE",
        entityId: req.params.invoiceId,
        actor: staffActor(req),
        meta: requestMeta(req)
      });
      res.status(201).json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async listByEntity(req: Request, res: Response) {
    try {
      const entityType = String(req.params.entityType || "").trim();
      const entityId = String(req.params.entityId || "").trim();
      if (!isVendorDocumentEntityType(entityType)) {
        return res.status(400).json({ success: false, message: "Invalid entityType" });
      }
      const actor = staffActor(req);
      const data = await VendorDocumentAttachmentService.listAttachments(
        entityType,
        entityId,
        actor
      );
      res.json({ success: true, data });
    } catch (error: any) {
      const status = error.status || error.statusCode || (error.message?.includes("Authentication") ? 401 : 404);
      res.status(status).json({ success: false, message: error.message, code: error.code });
    }
  }

  static async staffDownload(req: Request, res: Response) {
    try {
      const { buffer, fileName, mimeType } = await VendorDocumentAttachmentService.getFileBuffer(
        req.params.attachmentId,
        staffActor(req)
      );
      res.setHeader("Content-Type", mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName.replace(/"/g, "")}"`);
      res.send(buffer);
    } catch (error: any) {
      const msg = String(error.message || "");
      const status = error.status || error.statusCode || (msg.includes("not found") ? 404 : msg.includes("Authentication") ? 401 : 400);
      res.status(status).json({ success: false, message: error.message, code: error.code });
    }
  }

  static async replace(req: Request, res: Response) {
    try {
      const file = (req as any).file;
      if (!file?.buffer?.length) {
        return res.status(400).json({ success: false, message: "Multipart field document is required" });
      }
      const data = await VendorDocumentAttachmentService.replaceAttachment({
        attachmentId: req.params.attachmentId,
        file,
        actor: staffActor(req),
        meta: requestMeta(req)
      });
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const data = await VendorDocumentAttachmentService.deleteAttachment({
        attachmentId: req.params.attachmentId,
        actor: staffActor(req),
        meta: requestMeta(req)
      });
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
