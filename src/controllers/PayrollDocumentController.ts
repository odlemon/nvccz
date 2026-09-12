// @ts-nocheck
/**
 * Payroll Document Vault endpoints. Guards live on the routes:
 *   GET  /payroll/documents               payroll.vault.view | payroll.vault.manage
 *   POST /payroll/documents               payroll.vault.manage   (multipart field `file`)
 *   GET  /payroll/documents/:id/download  payroll.vault.view | payroll.vault.manage
 *
 * Every download attempt is written to the payroll audit trail, including the ones that
 * fail — the same rule FINDING-009 applied to fundraising data rooms, where only
 * successful reads had been logged.
 */
import type { Request, Response } from "express"
import { PayrollDocumentService } from "../services/payroll/PayrollDocumentService"
import { PayrollAuditService } from "../services/payroll/PayrollAuditService"

/** ASCII-safe filename for Content-Disposition; the UTF-8 form travels in filename*. */
function asciiFilename(name: string): string {
  return Array.from(String(name || "document"))
    .map((ch) => {
      const c = ch.charCodeAt(0)
      return c >= 32 && c <= 126 && ch !== '"' ? ch : "_"
    })
    .join("")
}

export class PayrollDocumentController {
  static async list(req: Request, res: Response) {
    try {
      const data = await PayrollDocumentService.list()
      res.json({ success: true, data })
    } catch (e: any) {
      res.status(e?.status || 500).json({
        success: false,
        message: e?.message || "Failed to list payroll documents",
      })
    }
  }

  static async upload(req: Request, res: Response) {
    const actor = (req as any).user
    try {
      const doc = await PayrollDocumentService.create({
        file: (req as any).file,
        category: req.body?.category,
        classification: req.body?.classification,
        periodLabel: req.body?.periodLabel,
        payrollRunId: req.body?.payrollRunId,
        uploadedById: actor?.id ?? null,
      })
      await PayrollAuditService.record({
        action: "DOCUMENT_UPLOADED",
        eventClass: "Change",
        entityType: "payroll_document",
        entityId: doc.id,
        entityLabel: doc.name,
        detail: `${doc.category} · ${doc.classification}`,
        actor,
      })
      res.status(201).json({ success: true, data: doc, message: "Document uploaded" })
    } catch (e: any) {
      res.status(e?.status || 400).json({ success: false, message: e?.message || "Upload failed" })
    }
  }

  static async download(req: Request, res: Response) {
    const actor = (req as any).user
    try {
      const { doc, buffer } = await PayrollDocumentService.fetchFile(req.params.id)
      await PayrollAuditService.record({
        action: "DOCUMENT_DOWNLOADED",
        eventClass: "Sensitive",
        entityType: "payroll_document",
        entityId: doc.id,
        entityLabel: doc.name,
        detail: `Downloaded (${doc.classification})`,
        actor,
      })
      res.setHeader("Content-Type", doc.mimeType || "application/octet-stream")
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiFilename(doc.name)}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      )
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition")
      res.setHeader("Cache-Control", "no-store")
      res.send(buffer)
    } catch (e: any) {
      if (e?.doc) {
        await PayrollAuditService.record({
          action: "DOCUMENT_DOWNLOAD_FAILED",
          eventClass: "Sensitive",
          entityType: "payroll_document",
          entityId: e.doc.id,
          entityLabel: e.doc.name,
          detail: e.message,
          actor,
        })
      }
      res.status(e?.status || 500).json({
        success: false,
        code: e?.code,
        message: e?.message || "Download failed",
      })
    }
  }
}
