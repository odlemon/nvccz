// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { VendorInvoiceIntakeService } from "../services/VendorInvoiceIntakeService";
import { VendorInvoiceExtractionService } from "../services/VendorInvoiceExtractionService";
import { ThreeWayMatchService } from "../services/ThreeWayMatchService";
import { getSuite06MatchConfidenceThreshold } from "../config/suite06Config";

export class ProcurementSuite06Controller {
  private static async withTimeout<T>(label: string, ms: number, p: Promise<T>): Promise<T> {
    let t: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (t) clearTimeout(t);
    }
  }

  static async createIntake(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const file = (req as any).file as Express.Multer.File | undefined;
      const { vendorId, sourcePurchaseOrderId, goodsReceivedNoteId } = req.body;

      const vid = String(vendorId ?? "").trim();
      const poId = String(sourcePurchaseOrderId ?? "").trim();
      const grnId = String(goodsReceivedNoteId ?? "").trim();

      if (!vid) {
        return res.status(400).json({ success: false, message: "vendorId is required" });
      }
      if (!poId) {
        return res.status(400).json({ success: false, message: "sourcePurchaseOrderId is required" });
      }
      if (!grnId) {
        return res.status(400).json({ success: false, message: "goodsReceivedNoteId is required" });
      }
      if (!file?.buffer?.length) {
        return res.status(400).json({
          success: false,
          message: "PDF file is required (multipart field name: document)",
        });
      }

      const { FirebaseStorageService } = await import("../services/FirebaseStorageService");
      const startedAt = Date.now();
      const { downloadURL: documentUrl } = await ProcurementSuite06Controller.withTimeout(
        "Upload vendor invoice PDF",
        70_000,
        FirebaseStorageService.uploadProcurementVendorInvoice(file.buffer, file.originalname || "invoice.pdf", userId)
      );

      const data = await VendorInvoiceIntakeService.createIntake({
        documentUrl,
        vendorId: vid,
        sourcePurchaseOrderId: poId,
        goodsReceivedNoteId: grnId,
        createdById: userId,
      });
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs > 15_000) {
        console.warn(`[Suite06] createIntake slow path ${elapsedMs}ms`, { vendorId: vid, poId, grnId });
      }
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      const msg = e?.message || "Failed to create intake";
      const isTimeout = /timed out/i.test(msg);
      res.status(isTimeout ? 504 : 500).json({ success: false, message: msg });
    }
  }

  static async getIntake(req: Request, res: Response) {
    try {
      const data = await VendorInvoiceIntakeService.getIntakeById(req.params.id);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(e.message === "Intake not found" ? 404 : 400).json({
        success: false,
        message: e.message,
      });
    }
  }

  static async listIntakes(req: Request, res: Response) {
    try {
      const take = Math.min(100, Math.max(1, Number(req.query.take) || 50));
      const skip = Math.max(0, Number(req.query.skip) || 0);
      const status = req.query.status ? String(req.query.status).trim() : undefined;
      const vendorId = req.query.vendorId ? String(req.query.vendorId).trim() : undefined;
      const data = await VendorInvoiceIntakeService.listIntakes({ take, skip, status, vendorId });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  /**
   * Procurement → AI Invoice Capture: PDF in, extracted fields out, in one call.
   *
   * The fields prefill the operator's capture form; the invoice is still written by
   * POST /procurement/invoices, so three-way matching, approval and payment are untouched.
   * With a known vendor (given, or resolved from the purchase order) the extraction is stored
   * as a VendorInvoiceIntake, so it reaches the verification queue and the per-vendor correction
   * map. Without one the PDF is still parsed — refusing to read an invoice because nobody has
   * picked the vendor yet would be worse than reading it.
   */
  static async extractForCapture(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file?.buffer?.length) {
        return res.status(400).json({
          success: false,
          message: "PDF file is required (multipart field name: document)",
        });
      }

      const { getLlmConfig } = await import("../services/LlmChatService");
      if (!getLlmConfig().configured) {
        return res.status(503).json({
          success: false,
          message: "Invoice extraction is not configured on this server. Capture the invoice by hand, or set LLM_API_KEY.",
        });
      }

      const purchaseOrderId = String(req.body?.purchaseOrderId ?? "").trim();
      let vendorId = String(req.body?.vendorId ?? "").trim();
      if (!vendorId && purchaseOrderId) {
        const po = await prisma.purchaseOrder.findUnique({
          where: { id: purchaseOrderId },
          select: { vendorId: true },
        });
        vendorId = po?.vendorId || "";
      }

      const { FirebaseStorageService } = await import("../services/FirebaseStorageService");
      const { downloadURL: documentUrl } = await ProcurementSuite06Controller.withTimeout(
        "Upload vendor invoice PDF",
        70_000,
        FirebaseStorageService.uploadProcurementVendorInvoice(
          file.buffer,
          file.originalname || "invoice.pdf",
          userId
        )
      );

      const threshold = getSuite06MatchConfidenceThreshold();

      if (vendorId) {
        const intake = await VendorInvoiceIntakeService.createCaptureIntake({
          documentUrl,
          vendorId,
          sourcePurchaseOrderId: purchaseOrderId || null,
          createdById: userId,
        });
        const extracted = await ProcurementSuite06Controller.withTimeout(
          "Extract vendor invoice",
          150_000,
          VendorInvoiceIntakeService.runExtraction(intake.id)
        );
        return res.json({
          success: true,
          data: {
            payload: extracted.extractedPayloadJson,
            documentUrl,
            intake: {
              id: extracted.id,
              intakeNumber: extracted.intakeNumber,
              status: extracted.status,
              taxParseStatus: extracted.taxParseStatus,
            },
            storedIntake: true,
            lowConfidence: extracted.status === "PENDING_VERIFICATION",
            threshold,
          },
        });
      }

      const rawText = await ProcurementSuite06Controller.withTimeout(
        "Read vendor invoice PDF",
        90_000,
        VendorInvoiceExtractionService.extractTextFromUrl(documentUrl, file.originalname || "invoice.pdf")
      );
      const { payload } = await ProcurementSuite06Controller.withTimeout(
        "Extract vendor invoice",
        150_000,
        VendorInvoiceExtractionService.parseExtractedTextWithLlm(rawText)
      );
      return res.json({
        success: true,
        data: {
          payload,
          documentUrl,
          intake: null,
          storedIntake: false,
          lowConfidence: Number(payload?.overallConfidence ?? 0) < threshold,
          threshold,
        },
      });
    } catch (e: any) {
      const msg = e?.message || "Failed to extract the invoice";
      const isTimeout = /timed out/i.test(msg);
      // A scanned-image PDF carries no text layer: the operator needs to know that, not a 500.
      const isUnreadable = !isTimeout && /no (readable )?text|empty|could not (be )?(read|parsed)|unsupported/i.test(msg);
      res.status(isTimeout ? 504 : isUnreadable ? 400 : 500).json({ success: false, message: msg });
    }
  }

  /**
   * Run extraction from the PDF URL + links already stored on the intake (no re-upload).
   * Optional JSON body can override vendorId / PO / GRN before parsing.
   */
  static async runExtract(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const intakeId = req.params.id;
      if (!intakeId) {
        return res.status(400).json({ success: false, message: "Intake id is required" });
      }

      const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
      const vendorIdIn = String(body.vendorId ?? "").trim();
      const poIn = String(body.sourcePurchaseOrderId ?? "").trim();
      const grnIn = String(body.goodsReceivedNoteId ?? "").trim();

      const existing = await prisma.vendorInvoiceIntake.findUnique({
        where: { id: intakeId },
        select: {
          id: true,
          documentUrl: true,
          vendorId: true,
          sourcePurchaseOrderId: true,
          goodsReceivedNoteId: true,
        },
      });
      if (!existing) {
        return res.status(404).json({ success: false, message: "Intake not found" });
      }

      const patch: Record<string, string> = {};
      if (vendorIdIn) patch.vendorId = vendorIdIn;
      if (poIn) patch.sourcePurchaseOrderId = poIn;
      if (grnIn) patch.goodsReceivedNoteId = grnIn;
      if (Object.keys(patch).length) {
        await prisma.vendorInvoiceIntake.update({ where: { id: intakeId }, data: patch });
      }

      const row = await prisma.vendorInvoiceIntake.findUnique({
        where: { id: intakeId },
        select: {
          documentUrl: true,
          vendorId: true,
          sourcePurchaseOrderId: true,
          goodsReceivedNoteId: true,
        },
      });

      if (!row?.documentUrl?.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Intake has no document URL. Create the intake with POST .../intakes (PDF), or replace the file with POST .../intakes/:id/document",
        });
      }
      if (!row.vendorId) {
        return res.status(400).json({
          success: false,
          message: "vendorId is missing on this intake; pass it in the JSON body or recreate the intake",
        });
      }
      if (!row.sourcePurchaseOrderId || !row.goodsReceivedNoteId) {
        return res.status(400).json({
          success: false,
          message:
            "sourcePurchaseOrderId and goodsReceivedNoteId must be set on the intake; include them in the JSON body or fix via create intake",
        });
      }

      const data = await VendorInvoiceIntakeService.runExtraction(intakeId);
      res.json({ success: true, data });
    } catch (e: any) {
      const msg = e?.message || "Failed to extract intake";
      const isTimeout = /timed out/i.test(msg);
      res.status(isTimeout ? 504 : 500).json({ success: false, message: msg });
    }
  }

  /** Replace PDF on an existing intake (multipart field **document**). */
  static async replaceIntakeDocument(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const intakeId = req.params.id;
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file?.buffer?.length) {
        return res.status(400).json({
          success: false,
          message: "PDF file is required (multipart field name: document)",
        });
      }
      const intake = await prisma.vendorInvoiceIntake.findUnique({ where: { id: intakeId }, select: { id: true } });
      if (!intake) return res.status(404).json({ success: false, message: "Intake not found" });

      const { FirebaseStorageService } = await import("../services/FirebaseStorageService");
      const { downloadURL: documentUrl } = await ProcurementSuite06Controller.withTimeout(
        "Upload vendor invoice PDF",
        70_000,
        FirebaseStorageService.uploadProcurementVendorInvoice(file.buffer, file.originalname || "invoice.pdf", userId)
      );

      const data = await prisma.vendorInvoiceIntake.update({
        where: { id: intakeId },
        data: { documentUrl },
      });
      res.json({ success: true, data });
    } catch (e: any) {
      const msg = e?.message || "Failed to replace document";
      const isTimeout = /timed out/i.test(msg);
      res.status(isTimeout ? 504 : 500).json({ success: false, message: msg });
    }
  }

  static async verifyIntake(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const data = await VendorInvoiceIntakeService.markIntakeVerified(req.params.id, userId);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async upsertFieldCorrection(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { vendorId, fieldKey, correctedValue } = req.body;
      if (!vendorId || !fieldKey || correctedValue === undefined) {
        return res.status(400).json({ success: false, message: "vendorId, fieldKey, correctedValue required" });
      }
      const data = await VendorInvoiceIntakeService.applyFieldCorrection({
        vendorId,
        fieldKey,
        correctedValue: String(correctedValue),
        createdById: userId,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async createDraftBill(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const data = await VendorInvoiceIntakeService.createDraftBillFromIntake({
        intakeId: req.params.id,
        createdById: userId,
      });
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async runThreeWayMatch(req: Request, res: Response) {
    try {
      const data = await ThreeWayMatchService.runMatch(req.params.purchaseInvoiceId);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async verificationQueue(req: Request, res: Response) {
    try {
      const take = Math.min(100, Math.max(1, Number(req.query.take) || 50));
      const data = await VendorInvoiceIntakeService.listVerificationQueue(take);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async cfoDashboard(req: Request, res: Response) {
    try {
      const data = await VendorInvoiceIntakeService.getCfoDashboardSummary();
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}
