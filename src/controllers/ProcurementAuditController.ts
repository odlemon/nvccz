import { Request, Response } from "express";
import { prisma } from "../utils/database";
import AuditService from "../services/AuditService";
import { AUDIT_EVENT_LABEL, AUDIT_EVENT_TYPES } from "../services/audit/auditEventTypes";

/**
 * Entity types the procurement services write to audit_logs. The registers (plans, contracts, the
 * document vault) and AI invoice capture were writing rows from the day they shipped, but were not
 * listed here, so the Internal Auditor's trail never showed a plan approval or a contract activation.
 */
const PROCUREMENT_ENTITY_TYPES = [
  "PurchaseRequisition",
  "ProcurementRfq",
  "RFQ",
  "VendorQuotation",
  "PurchaseOrder",
  "GoodsReceivedNote",
  "ProcurementInvoice",
  "Vendor",
  "VendorBank",
  "ProcurementPlan",
  "ProcurementContract",
  "ProcurementDocument",
  "VendorInvoiceIntake",
  "ProcurementSettings",
  "ApprovalMatrix",
  "Approval",
  "Role",
  "ProcurementAudit",
  "StoredFile",
];

/** Sign-in, sign-out, changes to people and permissions, and every AI reading are part of the procurement trail wherever they happen. */
const ACCESS_EVENT_TYPES = ["LOGIN", "LOGOUT", "PERMISSION_CHANGE", "USER_CHANGE", "AI_PROCESSING"];

const CLASSIFICATION: Record<string, string> = {
  LOGIN: "Security", LOGOUT: "Security", PERMISSION_CHANGE: "Security", USER_CHANGE: "Security",
  APPROVE: "Controlled", REJECT: "Controlled", RETURN: "Controlled", SUBMIT: "Workflow", ASSIGN: "Workflow", WORKFLOW_CHANGE: "Workflow",
  CREATE: "Record", EDIT: "Record", CLOSE: "Record", VENDOR_CHANGE: "Record",
  FILE_UPLOAD: "Document", FILE_DOWNLOAD: "Document", INTEGRATION: "System", AI_PROCESSING: "System", OTHER: "Control block",
};

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export class ProcurementAuditController {
  /** The where clause for the filters on the audit page. Everything is applied on the server, before paging. */
  private static async buildWhere(query: Request["query"]) {
    const and: any[] = [
      { OR: [{ entityType: { in: PROCUREMENT_ENTITY_TYPES } }, { eventType: { in: ACCESS_EVENT_TYPES } }] },
    ];
    const eventTypes = clean(query.eventType)?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (eventTypes?.length) and.push({ eventType: { in: eventTypes } });
    const userId = clean(query.userId);
    if (userId) and.push({ userId });
    const entityType = clean(query.entityType);
    if (entityType) and.push({ entityType });
    const from = clean(query.from);
    const to = clean(query.to);
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) and.push({ createdAt: { gte: d } });
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(to)) d.setUTCHours(23, 59, 59, 999);
        and.push({ createdAt: { lte: d } });
      }
    }
    const q = clean(query.q);
    if (q) {
      // Matches what was done, who did it, where from, and the number or name of the record it was done to.
      const [reqs, rfqs, quotes, pos, grns, invs, vendors, plans, contracts, docs] = await Promise.all([
        prisma.purchaseRequisition.findMany({ where: { OR: [{ requisitionNumber: { contains: q } }, { title: { contains: q } }] }, select: { id: true }, take: 100 }),
        prisma.procurementRfq.findMany({ where: { OR: [{ rfqNumber: { contains: q } }, { title: { contains: q } }] }, select: { id: true }, take: 100 }),
        prisma.vendorQuotation.findMany({ where: { OR: [{ quotationNumber: { contains: q } }, { companyName: { contains: q } }] }, select: { id: true }, take: 100 }),
        prisma.purchaseOrder.findMany({ where: { poNumber: { contains: q } }, select: { id: true }, take: 100 }),
        prisma.goodsReceivedNote.findMany({ where: { grnNumber: { contains: q } }, select: { id: true }, take: 100 }),
        prisma.procurementInvoice.findMany({ where: { OR: [{ invoiceNumber: { contains: q } }, { supplierInvoiceNumber: { contains: q } }] }, select: { id: true }, take: 100 }),
        prisma.vendor.findMany({ where: { name: { contains: q } }, select: { id: true }, take: 100 }),
        prisma.procurementPlan.findMany({ where: { OR: [{ planNumber: { contains: q } }, { name: { contains: q } }] }, select: { id: true }, take: 100 }),
        prisma.procurementContract.findMany({ where: { OR: [{ contractNumber: { contains: q } }, { title: { contains: q } }] }, select: { id: true }, take: 100 }),
        prisma.procurementDocument.findMany({ where: { name: { contains: q } }, select: { id: true }, take: 100 }),
      ]);
      const ids = [reqs, rfqs, quotes, pos, grns, invs, vendors, plans, contracts, docs].flat().map((r: any) => r.id);
      and.push({
        OR: [
          { action: { contains: q } },
          { entityId: { contains: q } },
          { ipAddress: { contains: q } },
          // a full name ("Tendai Moyo") matches when every word is in the first name, last name or email
          { user: { is: { AND: q.split(/\s+/).filter(Boolean).map((w) => ({ OR: [{ firstName: { contains: w } }, { lastName: { contains: w } }, { email: { contains: w } }] })) } } },
          ...(ids.length ? [{ entityId: { in: ids } }] : []),
        ],
      });
    }
    return { AND: and };
  }

  /**
   * One page of audit rows, newest first. The sort runs on ids alone and the wide rows (they carry previous and new values) are
   * fetched afterwards: sorting the wide rows themselves ran the database out of sort memory on the deep pages.
   */
  private static async pageRows(where: any, skip: number, take: number) {
    const ids = await prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take, select: { id: true } });
    if (!ids.length) return [];
    const full = await prisma.auditLog.findMany({ where: { id: { in: ids.map((r) => r.id) } }, include: { user: { select: { firstName: true, lastName: true, email: true } } } });
    const byId = new Map(full.map((r) => [r.id, r]));
    return ids.map((r) => byId.get(r.id)).filter(Boolean) as typeof full;
  }

  private static async labelRows(rows: any[]) {
    const idsOf = (...types: string[]) => [...new Set(rows.filter((r) => types.includes(r.entityType)).map((r) => r.entityId))];
    const [requisitions, rfqs, quotations, orders, grns, invoices, vendors, plans, contracts, documents, intakes] = await Promise.all([
      prisma.purchaseRequisition.findMany({ where: { id: { in: idsOf("PurchaseRequisition") } }, select: { id: true, requisitionNumber: true, title: true } }),
      prisma.procurementRfq.findMany({ where: { id: { in: idsOf("ProcurementRfq", "RFQ") } }, select: { id: true, rfqNumber: true, title: true } }),
      prisma.vendorQuotation.findMany({ where: { id: { in: idsOf("VendorQuotation") } }, select: { id: true, quotationNumber: true, companyName: true } }),
      prisma.purchaseOrder.findMany({ where: { id: { in: idsOf("PurchaseOrder") } }, select: { id: true, poNumber: true } }),
      prisma.goodsReceivedNote.findMany({ where: { id: { in: idsOf("GoodsReceivedNote") } }, select: { id: true, grnNumber: true } }),
      prisma.procurementInvoice.findMany({ where: { id: { in: idsOf("ProcurementInvoice") } }, select: { id: true, invoiceNumber: true } }),
      prisma.vendor.findMany({ where: { id: { in: idsOf("Vendor") } }, select: { id: true, name: true } }),
      prisma.procurementPlan.findMany({ where: { id: { in: idsOf("ProcurementPlan") } }, select: { id: true, planNumber: true, name: true } }),
      prisma.procurementContract.findMany({ where: { id: { in: idsOf("ProcurementContract") } }, select: { id: true, contractNumber: true, title: true } }),
      prisma.procurementDocument.findMany({ where: { id: { in: idsOf("ProcurementDocument") } }, select: { id: true, name: true } }),
      prisma.vendorInvoiceIntake.findMany({ where: { id: { in: idsOf("VendorInvoiceIntake") } }, select: { id: true, intakeNumber: true } }),
    ]);
    const [roles, users] = await Promise.all([
      prisma.role.findMany({ where: { id: { in: idsOf("Role") } }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { id: { in: idsOf("User") } }, select: { id: true, firstName: true, lastName: true, email: true } }),
    ]);
    const label = new Map<string, string>();
    roles.forEach((r) => label.set(r.id, r.name));
    users.forEach((u) => label.set(u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email));
    requisitions.forEach((r) => label.set(r.id, `${r.requisitionNumber} · ${r.title}`));
    rfqs.forEach((r) => label.set(r.id, `${r.rfqNumber} · ${r.title}`));
    quotations.forEach((q) => label.set(q.id, `${q.quotationNumber}${q.companyName ? ` · ${q.companyName}` : ""}`));
    orders.forEach((o) => label.set(o.id, o.poNumber));
    grns.forEach((g) => label.set(g.id, g.grnNumber));
    invoices.forEach((i) => label.set(i.id, i.invoiceNumber));
    vendors.forEach((v) => label.set(v.id, v.name));
    plans.forEach((p) => label.set(p.id, `${p.planNumber} · ${p.name}`));
    contracts.forEach((c) => label.set(c.id, `${c.contractNumber} · ${c.title}`));
    documents.forEach((d) => label.set(d.id, d.name));
    intakes.forEach((i) => label.set(i.id, i.intakeNumber));
    return label;
  }

  /** A recorded value as the list shows it: very large ones (a whole approval route) are cut short, the full value is one click away. */
  private static clip(v: any, full: boolean) {
    if (full || v == null) return v ?? null;
    let text = "";
    try { text = JSON.stringify(v); } catch { return v; }
    if (text.length <= 4000) return v;
    return { _truncated: true, _characters: text.length, preview: text.slice(0, 600) };
  }

  private static present(rows: any[], label: Map<string, string>, full = false) {
    // Rows written without a signed-in user (a vendor submitting through their link) name the actor in newValues.actor.
    const recordedActor = (values: unknown): string | null => {
      if (!values || typeof values !== "object" || Array.isArray(values)) return null;
      const actor = (values as Record<string, unknown>).actor;
      return typeof actor === "string" && actor.trim() ? actor.trim() : null;
    };
    return rows.map((r) => ({
      id: r.id,
      occurredAt: r.createdAt,
      action: r.action,
      eventType: r.eventType ?? "OTHER",
      eventLabel: AUDIT_EVENT_LABEL[r.eventType as keyof typeof AUDIT_EVENT_LABEL] ?? "Other",
      classification: CLASSIFICATION[r.eventType ?? "OTHER"] ?? "System",
      entityType: r.entityType,
      entityId: r.entityId,
      entityLabel: label.get(r.entityId) ?? null,
      actorId: r.userId ?? null,
      actorName: r.user ? `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim() || r.user.email : recordedActor(r.newValues),
      previousValue: ProcurementAuditController.clip(r.oldValues, full),
      newValue: ProcurementAuditController.clip(r.newValues, full),
      ipAddress: r.ipAddress ?? null,
      userAgent: r.userAgent ?? null,
    }));
  }

  /**
   * The procurement audit trail, newest first, paged and filtered on the server.
   *
   * Reads the append-only audit_logs rows the services write; nothing is synthesised. Query: page (1..), pageSize (1-200,
   * default 25), eventType (one or a comma list of the eighteen classes), userId, entityType, from, to (ISO dates), q (free text).
   * Response: data (the page), pagination {page, pageSize, total, totalPages}.
   */
  static async listEvents(req: Request, res: Response) {
    try {
      const pageSize = Math.min(Math.max(Number(req.query.pageSize ?? req.query.limit) || 25, 1), 200);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const where = await ProcurementAuditController.buildWhere(req.query);
      const [rows, total] = await Promise.all([
        ProcurementAuditController.pageRows(where, (page - 1) * pageSize, pageSize),
        prisma.auditLog.count({ where }),
      ]);
      const label = await ProcurementAuditController.labelRows(rows);
      return res.json({
        success: true,
        data: ProcurementAuditController.present(rows, label),
        pagination: { page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1) },
      });
    } catch (error) {
      console.error("Error listing procurement audit events:", error);
      return res.status(500).json({ success: false, message: "Failed to load procurement audit events" });
    }
  }

  /** One event with its previous and new values in full. */
  static async getEvent(req: Request, res: Response) {
    try {
      const row = await prisma.auditLog.findUnique({ where: { id: String(req.params.id) }, include: { user: { select: { firstName: true, lastName: true, email: true } } } });
      if (!row) return res.status(404).json({ success: false, message: "Audit event not found" });
      const label = await ProcurementAuditController.labelRows([row]);
      return res.json({ success: true, data: ProcurementAuditController.present([row], label, true)[0] });
    } catch (error) {
      console.error("Error loading audit event:", error);
      return res.status(500).json({ success: false, message: "Failed to load the audit event" });
    }
  }

  /** What the filters offer: how many events of each class there are, and who has acted. Counts follow the date range. */
  static async facets(req: Request, res: Response) {
    try {
      const base = await ProcurementAuditController.buildWhere({ from: req.query.from, to: req.query.to } as any);
      const [byType, actors] = await Promise.all([
        prisma.auditLog.groupBy({ by: ["eventType"], where: base, _count: { _all: true } }),
        prisma.auditLog.groupBy({ by: ["userId"], where: { AND: [base, { userId: { not: null } }] }, _count: { _all: true } }),
      ]);
      const users = actors.length
        ? await prisma.user.findMany({ where: { id: { in: actors.map((a) => a.userId as string) } }, select: { id: true, firstName: true, lastName: true, email: true } })
        : [];
      const nameOf = new Map(users.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email]));
      const counts = new Map(byType.map((b) => [b.eventType ?? "OTHER", b._count._all]));
      return res.json({
        success: true,
        data: {
          eventTypes: [...AUDIT_EVENT_TYPES, "OTHER" as const].map((t) => ({ value: t, label: t === "OTHER" ? "Other (control blocks)" : AUDIT_EVENT_LABEL[t], count: counts.get(t) ?? 0 })),
          // everyone who has acted, by name, so a person with a handful of events can be picked as easily as the busiest
          actors: actors.map((a) => ({ id: a.userId, name: nameOf.get(a.userId as string) ?? a.userId, count: a._count._all })).sort((x, y) => String(x.name).localeCompare(String(y.name))),
          entityTypes: PROCUREMENT_ENTITY_TYPES,
        },
      });
    } catch (error) {
      console.error("Error loading audit facets:", error);
      return res.status(500).json({ success: false, message: "Failed to load audit filters" });
    }
  }

  /** The filtered trail as a CSV file (up to 5,000 rows). The export is itself an audited file download. */
  static async exportCsv(req: Request, res: Response) {
    try {
      const where = await ProcurementAuditController.buildWhere(req.query);
      const rows = await ProcurementAuditController.pageRows(where, 0, 5000);
      const label = await ProcurementAuditController.labelRows(rows);
      const items = ProcurementAuditController.present(rows, label, true);
      const cell = (v: unknown) => {
        const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ["Timestamp", "User", "Event", "Action", "Record type", "Record", "Record ID", "Previous value", "New value", "IP address", "Device"];
      const lines = [header.join(",")].concat(
        items.map((i) => [i.occurredAt.toISOString(), i.actorName, i.eventLabel, i.action, i.entityType, i.entityLabel, i.entityId, i.previousValue, i.newValue, i.ipAddress, i.userAgent].map(cell).join(",")),
      );
      await AuditService.log({
        userId: (req as any).user?.id,
        action: "AUDIT_EXPORT",
        entityType: "ProcurementAudit",
        entityId: "audit-trail",
        newValues: { rows: items.length, filters: req.query },
        eventType: "FILE_DOWNLOAD",
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="procurement-audit-trail.csv"`);
      return res.status(200).send("﻿" + lines.join("\r\n"));
    } catch (error) {
      console.error("Error exporting audit trail:", error);
      return res.status(500).json({ success: false, message: "Failed to export the audit trail" });
    }
  }
}
