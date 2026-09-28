// @ts-nocheck
import { Request, Response } from "express";
import { publicErrorMessage } from "../utils/publicErrorMessage";
import { serializeDecimalsDeep } from "../utils/prismaDecimalJson";
import { PurchaseOrderControlService } from "../services/p2p/PurchaseOrderControlService";
import { brandInfo } from "../services/p2p/BrandService";
import { getP2pConfig } from "../services/p2p/P2pSettings";

/**
 * SRD §21-§25 and §29-§31 endpoints: purchase order approval, receipts, invoice matching and finance handoff, and the AI layer.
 * The rules live in the services; this file only reads the request and shapes the response.
 */
const user = (req: Request) => (req as any).user;
const fail = (res: Response, e: any, fallback: string) => {
  const status = e?.statusCode || e?.status || 400;
  return res.status(status).json({ success: false, message: publicErrorMessage(e, fallback), code: e?.code });
};
const ok = (res: Response, data: any, message?: string, status = 200) => res.status(status).json({ success: true, message, data: serializeDecimalsDeep(data) });

export class P2pController {
  // ------------------------------------------------------------------ purchase orders
  static async poSubmitForApproval(req: Request, res: Response) {
    try {
      return ok(res, await PurchaseOrderControlService.submitForApproval(user(req), req.params.id), "Submitted for approval");
    } catch (e) {
      return fail(res, e, "Could not submit the purchase order for approval");
    }
  }

  static async poDecide(req: Request, res: Response) {
    try {
      const decision = String(req.body?.decision || "").toUpperCase() === "REJECT" ? "REJECT" : "APPROVE";
      return ok(res, await PurchaseOrderControlService.decide(user(req), req.params.id, decision, req.body?.comments), decision === "APPROVE" ? "Approved" : "Rejected");
    } catch (e) {
      return fail(res, e, "Could not record the decision");
    }
  }

  static async poApprovals(req: Request, res: Response) {
    try {
      return ok(res, await PurchaseOrderControlService.describeApprovals(req.params.id));
    } catch (e) {
      return fail(res, e, "Could not load the approvals");
    }
  }

  static async poApprovalQueue(req: Request, res: Response) {
    try {
      return ok(res, await PurchaseOrderControlService.queue(user(req)));
    } catch (e) {
      return fail(res, e, "Could not load purchase orders waiting for approval");
    }
  }

  // ------------------------------------------------------------------ receipts
  /**
   * Stages the files of a receipt (delivery note, photos, service evidence) in the platform file store and returns their addresses,
   * which the receipt then carries. Only these platform addresses are accepted on a receipt.
   */
  static async uploadReceiptFiles(req: Request, res: Response) {
    try {
      const files: any[] = (req as any).files ?? [];
      if (!files.length) return res.status(400).json({ success: false, message: "Choose a file to attach." });
      const allowed = ["pdf", "png", "jpg", "jpeg", "webp", "doc", "docx", "xls", "xlsx", "csv"];
      const { storeFile } = await import("../services/ProcurementRegistersService");
      const out = [];
      for (const f of files) {
        const ext = String(f.originalname || "").split(".").pop()?.toLowerCase() ?? "";
        if (!allowed.includes(ext)) return res.status(400).json({ success: false, message: `${f.originalname}: only ${allowed.join(", ")} files can be attached.` });
        if (!f.buffer?.length) return res.status(400).json({ success: false, message: `${f.originalname} is empty.` });
        const stored = await storeFile(f);
        out.push({ fileName: String(f.originalname).slice(0, 255), url: stored.downloadURL, mimeType: f.mimetype || null, size: f.size ?? f.buffer.length });
      }
      return ok(res, out, "Uploaded", 201);
    } catch (e) {
      return fail(res, e, "The file could not be uploaded");
    }
  }

  // ------------------------------------------------------------------ AI layer (§29-§31)
  static async aiStatus(req: Request, res: Response) {
    try {
      const { AiControlService } = await import("../services/p2p/AiControlService");
      return ok(res, await AiControlService.status(user(req)));
    } catch (e) {
      return fail(res, e, "Could not load the AI status");
    }
  }

  static async aiExtract(req: Request, res: Response) {
    try {
      const { AiDocumentReviewService } = await import("../services/p2p/AiDocumentReviewService");
      const file = (req as any).file;
      const data = await AiDocumentReviewService.extract(user(req), {
        documentType: String(req.body?.documentType || ""),
        file,
        attachmentId: req.body?.attachmentId ? String(req.body.attachmentId) : undefined,
      });
      return ok(res, data, "Read. These are suggestions for you to check.", 201);
    } catch (e) {
      return fail(res, e, "The document could not be read");
    }
  }

  static async aiList(req: Request, res: Response) {
    try {
      const { AiDocumentReviewService } = await import("../services/p2p/AiDocumentReviewService");
      return ok(res, await AiDocumentReviewService.list(user(req)));
    } catch (e) {
      return fail(res, e, "Could not load your AI readings");
    }
  }

  static async aiGet(req: Request, res: Response) {
    try {
      const { AiDocumentReviewService } = await import("../services/p2p/AiDocumentReviewService");
      return ok(res, await AiDocumentReviewService.get(user(req), req.params.id));
    } catch (e) {
      return fail(res, e, "Could not load the AI reading");
    }
  }

  static async aiDecide(req: Request, res: Response) {
    try {
      const { AiDocumentReviewService } = await import("../services/p2p/AiDocumentReviewService");
      return ok(res, await AiDocumentReviewService.decide(user(req), req.params.id, req.params.key, { action: req.body?.action, value: req.body?.value }));
    } catch (e) {
      return fail(res, e, "Could not record the decision");
    }
  }

  static async aiComplete(req: Request, res: Response) {
    try {
      const { AiDocumentReviewService } = await import("../services/p2p/AiDocumentReviewService");
      return ok(res, await AiDocumentReviewService.complete(user(req), req.params.id), "Review complete");
    } catch (e) {
      return fail(res, e, "Could not complete the review");
    }
  }

  static async aiConfirmed(req: Request, res: Response) {
    try {
      const { AiDocumentReviewService } = await import("../services/p2p/AiDocumentReviewService");
      return ok(res, await AiDocumentReviewService.confirmed(user(req), req.params.id));
    } catch (e) {
      return fail(res, e, "Could not load the confirmed values");
    }
  }

  static async aiDiscard(req: Request, res: Response) {
    try {
      const { AiDocumentReviewService } = await import("../services/p2p/AiDocumentReviewService");
      return ok(res, await AiDocumentReviewService.discard(user(req), req.params.id), "Discarded");
    } catch (e) {
      return fail(res, e, "Could not discard the reading");
    }
  }

  static async aiSource(req: Request, res: Response) {
    try {
      const { AiDocumentReviewService } = await import("../services/p2p/AiDocumentReviewService");
      const f = await AiDocumentReviewService.source(user(req), req.params.id);
      res.setHeader("Content-Type", f.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${String(f.fileName || "document").replace(/[^A-Za-z0-9._-]/g, "_")}"`);
      return res.send(f.buffer);
    } catch (e) {
      return fail(res, e, "Could not open the original document");
    }
  }

  static async aiUsage(req: Request, res: Response) {
    try {
      const { AiControlService } = await import("../services/p2p/AiControlService");
      return ok(res, await AiControlService.summary({ days: Number(req.query?.days) || 30 }));
    } catch (e) {
      return fail(res, e, "Could not load AI usage");
    }
  }

  /** Which brand this environment is (so a preview says what the document carries) and the P2P configuration screens read. */
  static async config(_req: Request, res: Response) {
    try {
      return ok(res, { brand: brandInfo(), settings: await getP2pConfig() });
    } catch (e) {
      return fail(res, e, "Could not load the configuration");
    }
  }
}
