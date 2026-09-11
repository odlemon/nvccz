import { Request, Response } from "express";
import { prisma } from "../utils/database";

/** Entity types the procurement services write to audit_logs. */
const PROCUREMENT_ENTITY_TYPES = [
  "PurchaseRequisition",
  "ProcurementRfq",
  "RFQ",
  "VendorQuotation",
  "PurchaseOrder",
  "GoodsReceivedNote",
  "ProcurementInvoice",
  "Vendor",
];

export class ProcurementAuditController {
  /**
   * The procurement audit trail, newest first.
   *
   * Reads the append-only audit_logs rows the procurement services already write — nothing
   * is synthesised. Each row carries the record's business number where the record still
   * exists (a deleted record keeps its raw id), and the actor's name where there was one.
   *
   * Query: limit (1-500, default 200).
   */
  static async listEvents(req: Request, res: Response) {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
      const rows = await prisma.auditLog.findMany({
        where: { entityType: { in: PROCUREMENT_ENTITY_TYPES } },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      });

      const idsOf = (...types: string[]) => [
        ...new Set(rows.filter((r) => types.includes(r.entityType)).map((r) => r.entityId)),
      ];
      const [requisitions, rfqs, quotations, orders, grns, invoices, vendors] = await Promise.all([
        prisma.purchaseRequisition.findMany({
          where: { id: { in: idsOf("PurchaseRequisition") } },
          select: { id: true, requisitionNumber: true, title: true },
        }),
        prisma.procurementRfq.findMany({
          where: { id: { in: idsOf("ProcurementRfq", "RFQ") } },
          select: { id: true, rfqNumber: true, title: true },
        }),
        prisma.vendorQuotation.findMany({
          where: { id: { in: idsOf("VendorQuotation") } },
          select: { id: true, quotationNumber: true, companyName: true },
        }),
        prisma.purchaseOrder.findMany({
          where: { id: { in: idsOf("PurchaseOrder") } },
          select: { id: true, poNumber: true },
        }),
        prisma.goodsReceivedNote.findMany({
          where: { id: { in: idsOf("GoodsReceivedNote") } },
          select: { id: true, grnNumber: true },
        }),
        prisma.procurementInvoice.findMany({
          where: { id: { in: idsOf("ProcurementInvoice") } },
          select: { id: true, invoiceNumber: true },
        }),
        prisma.vendor.findMany({
          where: { id: { in: idsOf("Vendor") } },
          select: { id: true, name: true },
        }),
      ]);

      const label = new Map<string, string>();
      requisitions.forEach((r) => label.set(r.id, `${r.requisitionNumber} · ${r.title}`));
      rfqs.forEach((r) => label.set(r.id, `${r.rfqNumber} · ${r.title}`));
      quotations.forEach((q) => label.set(q.id, `${q.quotationNumber}${q.companyName ? ` · ${q.companyName}` : ""}`));
      orders.forEach((o) => label.set(o.id, o.poNumber));
      grns.forEach((g) => label.set(g.id, g.grnNumber));
      invoices.forEach((i) => label.set(i.id, i.invoiceNumber));
      vendors.forEach((v) => label.set(v.id, v.name));

      return res.json({
        success: true,
        data: rows.map((r) => ({
          id: r.id,
          occurredAt: r.createdAt,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          entityLabel: label.get(r.entityId) ?? null,
          actorName: r.user
            ? `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim() || r.user.email
            : null,
        })),
      });
    } catch (error) {
      console.error("Error listing procurement audit events:", error);
      return res.status(500).json({ success: false, message: "Failed to load procurement audit events" });
    }
  }
}
