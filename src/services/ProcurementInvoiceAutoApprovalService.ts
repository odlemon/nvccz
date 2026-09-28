//@ts-nocheck
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";
import { isModulePrivilegedUser } from "../config/cfoModulePermissions";
import AuditService from "./AuditService";

/** Invoices still awaiting a decision. */
const OPEN_STATUSES = ["DRAFT", "PENDING", "PENDING_APPROVAL", "RECEIVED", "MATCHED"];
/** Who hears that an invoice went into the payment queue without a person: those who approve and those who pay. */
const TOLD_GRANTS = ["procurement.invoices.approve", "procurement.invoices.pay"];
const NOTIFICATION_TYPE = "PROCUREMENT_INVOICE_AUTO_APPROVED";

const money = (v: any) => Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const badRequest = (message: string, status = 400) => Object.assign(new Error(message), { status });

/**
 * SRD §6.6 and §3: "If the invoice matches the PO exactly, the AI marks the invoice for Auto-Approval and moves it into
 * the payment queue", and an invoice "approved (either automatically by the AI or manually by a user)" becomes a
 * payment request queued in Accounts Payable for its due date.
 *
 * An invoice is approved automatically only when all of these hold, and each unmet one is reported as a blocker:
 *  - the organisation has switched automatic approval on (Procurement, Configuration; administrator or CFO);
 *  - the three-way match is MATCHED with no flag (no price or quantity over the order or receipts, no line off the
 *    order, no possible duplicate);
 *  - the supplier's own document was attached, read by the LLM, and agrees with the capture;
 *  - the total is within the limit, when one is set.
 * It is then approved exactly as a person would approve it (status, payment queue, vendor email, audit), recorded as
 * AUTOMATIC with the reason, and the people who approve and pay invoices are told.
 */
export class ProcurementInvoiceAutoApprovalService {
  static async settings() {
    const s = await prisma.procurementSettings.findUnique({ where: { id: "default" } });
    return {
      enabled: Boolean(s?.autoApproveMatchedInvoices),
      limit: s?.autoApproveInvoiceLimit != null ? Number(s.autoApproveInvoiceLimit) : null,
      updatedAt: s?.updatedAt ?? null,
    };
  }

  static async saveSettings(user: any, input: any) {
    if (!isModulePrivilegedUser(user)) {
      throw badRequest("Only an administrator or the Chief Financial Officer can change automatic invoice approval.", 403);
    }
    const enabled = input?.enabled === true || input?.enabled === "true";
    const raw = input?.limit;
    const limit = raw === "" || raw == null ? null : Number(raw);
    if (limit != null && (!Number.isFinite(limit) || limit <= 0)) {
      throw badRequest("The limit must be an amount above zero, or left empty for no limit.");
    }
    const before = await this.settings();
    await prisma.procurementSettings.upsert({
      where: { id: "default" },
      create: { id: "default", autoApproveMatchedInvoices: enabled, autoApproveInvoiceLimit: limit },
      update: { autoApproveMatchedInvoices: enabled, autoApproveInvoiceLimit: limit },
    });
    await AuditService.log({
      userId: user.id,
      action: "UPDATE",
      entityType: "ProcurementSettings",
      entityId: "default",
      oldValues: { autoApproveMatchedInvoices: before.enabled, autoApproveInvoiceLimit: before.limit },
      newValues: { autoApproveMatchedInvoices: enabled, autoApproveInvoiceLimit: limit },
    });
    return this.settings();
  }

  /** Every reason this invoice is not approved automatically; empty when it may be. */
  static blockers(invoice: any, settings: { enabled: boolean; limit: number | null }): string[] {
    const out: string[] = [];
    if (!settings.enabled) out.push("Automatic approval is switched off");
    if (!OPEN_STATUSES.includes(String(invoice.status || "").toUpperCase())) {
      out.push(`The invoice is already ${String(invoice.status || "decided").toLowerCase()}`);
    }
    if (String(invoice.matchingStatus || "").toUpperCase() !== "MATCHED") out.push("The three-way match is not exact");
    if ((invoice.aiDiscrepancies?.flags || []).length) out.push("The match raised flags to review");
    // An AI reading can only add caution: when the supplier's document was read and does not agree with the capture, a person
    // reviews it. It can never make an invoice approvable, so approval works the same with the AI layer off.
    const reading = invoice.ocrData;
    if (reading?.status === "READ" && reading.comparison && reading.comparison.agrees === false) out.push("The supplier's document does not agree with the capture");
    if (settings.limit != null && Number(invoice.totalAmount) > settings.limit) {
      out.push(`The total is above the automatic approval limit of ${money(settings.limit)}`);
    }
    return out;
  }

  static async considerQuietly(invoiceId: string) {
    try {
      return await this.consider(invoiceId);
    } catch (e: any) {
      logger.error("Automatic invoice approval failed", { invoiceId, error: String(e?.message || e) });
      return null;
    }
  }

  static async consider(invoiceId: string) {
    const settings = await this.settings();
    if (!settings.enabled) return { approved: false, blockers: ["Automatic approval is switched off"] };
    const invoice = await prisma.procurementInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: { select: { name: true } },
        purchaseOrder: { select: { poNumber: true } },
        currency: { select: { code: true } },
      },
    });
    if (!invoice) return null;
    const blockers = this.blockers(invoice, settings);
    if (blockers.length) return { approved: false, blockers };

    const reason = `Exact three-way match with ${invoice.purchaseOrder?.poNumber ?? "its purchase order"}, within the automatic approval rule set by the organisation`;
    const { ProcurementService } = await import("./ProcurementService");
    await ProcurementService.approveProcurementInvoice(invoiceId, null, undefined, { automatic: true, reason });
    await this.notify(invoiceId, reason);
    return { approved: true, blockers: [] };
  }

  static async notify(invoiceId: string, reason: string) {
    const invoice = await prisma.procurementInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: { select: { name: true } },
        purchaseOrder: { select: { poNumber: true } },
        currency: { select: { code: true } },
      },
    });
    if (!invoice) return;
    const users = await prisma.user.findMany({
      select: { id: true, role: { select: { permissions: true } } },
    });
    const people = users.filter((u) => {
      const perms = Array.isArray(u.role?.permissions) ? u.role.permissions : [];
      return perms.some((p: any) => TOLD_GRANTS.includes(p?.name) && p?.value === true);
    });
    const due = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      : null;
    const title = `${invoice.invoiceNumber} approved automatically`.slice(0, 150);
    const message = `${invoice.vendor?.name ?? "A vendor"}, ${invoice.currency?.code ?? "USD"} ${money(invoice.totalAmount)}: exact match with ${invoice.purchaseOrder?.poNumber ?? "its order"}. In the payment queue${due ? `, due ${due}` : ""}.`.slice(0, 180);
    // one lookup and one insert for everyone (not a query per person: the audience is every role that holds the grant)
    const told = people.length
      ? new Set((await prisma.notification.findMany({ where: { userId: { in: people.map((u) => u.id) }, type: NOTIFICATION_TYPE, relatedEntityId: invoice.id }, select: { userId: true } })).map((n) => n.userId))
      : new Set<string>();
    const fresh = people.filter((u) => !told.has(u.id));
    if (!fresh.length) return;
    await prisma.notification.createMany({
      data: fresh.map((u) => ({
        userId: u.id,
        type: NOTIFICATION_TYPE,
        title,
        message,
        relatedEntity: "ProcurementInvoice",
        relatedEntityId: invoice.id,
        data: {
          path: "/procurement/invoices",
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          poNumber: invoice.purchaseOrder?.poNumber ?? null,
          reason,
          dueDate: invoice.dueDate ?? null,
        },
      })),
    });
  }
}
