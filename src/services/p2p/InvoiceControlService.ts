//@ts-nocheck
/**
 * §24-§25: what an invoice is held to before it is approved or paid, and the finance handoff.
 *
 * MATCH ENFORCEMENT. With enforcement on (Configuration, default), an invoice with blocking match exceptions is not approved and is
 * not paid. A person with the override grant can approve it anyway, with a written reason; the override is recorded on the invoice
 * and in the audit trail, and it covers only the exceptions that were in front of them (a new exception needs a new override).
 *
 * FINANCE HANDOFF. Approval makes an invoice READY_FOR_FINANCE. From there it moves only along:
 *     READY_FOR_FINANCE → SUBMITTED → ACCEPTED → PAID → CLOSED,   with SUBMITTED → REJECTED (returned) → READY_FOR_FINANCE.
 * No state can be skipped. Each move records who and when (columns on the invoice, and an append-only event). Payment needs the
 * invoice ACCEPTED, and a fully paid invoice moves itself to PAID.
 */
import { createHash } from "crypto";
import { prisma } from "../../utils/database";
import AuditService from "../AuditService";
import { getP2pConfig } from "./P2pSettings";
import { userHasEffectivePermission, isModulePrivilegedUser } from "../../config/cfoModulePermissions";
import { PROCUREMENT_PERMISSIONS as P } from "../../config/procurementPermissions";

const fail = (message: string, status = 400, code?: string) => Object.assign(new Error(message), { status, statusCode: status, code });

const signatureOf = (exceptions: Array<{ type: string; line?: number; message: string }>) =>
  createHash("sha256").update(JSON.stringify(exceptions.map((e) => [e.type, e.line ?? null, e.message]).sort())).digest("hex").slice(0, 32);

export class InvoiceControlService {
  // ------------------------------------------------------------------ match enforcement
  /**
   * Refuses approval or payment while the invoice has blocking match exceptions, unless an override stands for exactly them.
   * `override` is the person's reason and identity when they are approving over the exceptions.
   */
  static async assertMatchAllows(invoiceId: string, action: "APPROVE" | "PAY", actor?: any, overrideReason?: string) {
    const cfg = await getP2pConfig();
    const { ProcurementInvoiceMatchService } = await import("../ProcurementInvoiceMatchService");
    const blocking = await ProcurementInvoiceMatchService.blockingFor(invoiceId);
    if (!blocking.length) return;
    if (cfg.matchEnforcement !== "ENFORCE") return; // WARN: the exceptions are shown, not enforced

    const inv: any = await prisma.procurementInvoice.findUnique({ where: { id: invoiceId }, select: { id: true, invoiceNumber: true, matchOverrideReason: true, matchOverrideAt: true, matchResult: true } });
    const sig = signatureOf(blocking);
    const standing = inv?.matchResult?.overrideSignature;

    const reason = String(overrideReason ?? "").trim();
    if (reason) {
      const may = actor && (isModulePrivilegedUser(actor) || userHasEffectivePermission(actor, P.invoicesOverrideMatch));
      if (!may) throw fail("Approving an invoice over match exceptions needs the match-override permission.", 403, "MATCH_OVERRIDE_NOT_PERMITTED");
      if (reason.length < 10) throw fail("Give the reason for approving over the match exceptions (at least a sentence).", 400, "MATCH_OVERRIDE_REASON");
      await prisma.procurementInvoice.update({
        where: { id: invoiceId },
        data: {
          matchOverrideReason: reason,
          matchOverrideById: actor.id,
          matchOverrideAt: new Date(),
          matchResult: { ...(inv?.matchResult ?? {}), overrideSignature: sig } as object,
        },
      });
      await AuditService.log({
        userId: actor.id, action: "MATCH_OVERRIDE", entityType: "ProcurementInvoice", entityId: invoiceId,
        newValues: { reason, exceptions: blocking.map((e) => ({ type: e.type, message: e.message })) },
      });
      return;
    }
    if (inv?.matchOverrideAt && standing === sig) return; // an override already covers exactly these exceptions

    throw fail(
      `${inv?.invoiceNumber ?? "The invoice"} cannot be ${action === "APPROVE" ? "approved" : "paid"}: the three-way match has ${blocking.length} open exception${blocking.length === 1 ? "" : "s"}. ${blocking.map((e) => e.message).join(" ")}`,
      409,
      "MATCH_EXCEPTIONS"
    );
  }

  // ------------------------------------------------------------------ finance handoff
  static readonly STATES = ["READY_FOR_FINANCE", "SUBMITTED", "ACCEPTED", "REJECTED", "PAID", "CLOSED"] as const;
  static readonly NEXT: Record<string, string[]> = {
    READY_FOR_FINANCE: ["SUBMITTED"],
    SUBMITTED: ["ACCEPTED", "REJECTED"],
    REJECTED: ["READY_FOR_FINANCE"],
    ACCEPTED: ["PAID"],
    PAID: ["CLOSED"],
    CLOSED: [],
  };

  /** The moves the signed-in user could make from the invoice's current state (grants and separation of duties applied). */
  static async describe(invoiceId: string, actor?: any) {
    const inv: any = await prisma.procurementInvoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw fail("Invoice not found", 404);
    const events = await prisma.procurementInvoiceHandoffEvent.findMany({ where: { invoiceId }, orderBy: { createdAt: "asc" } });
    const ids = [...new Set(events.map((e) => e.actorId).filter(Boolean))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, email: true } }) : [];
    const who = (id: string | null) => {
      const u = users.find((x) => x.id === id);
      return u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : null;
    };
    const status = inv.financeHandoffStatus as string | null;
    const allowed = status ? this.NEXT[status] ?? [] : [];
    const mine = actor ? allowed.filter((to) => this.mayMove(actor, inv, status, to).ok) : [];
    return {
      invoiceId,
      invoiceNumber: inv.invoiceNumber,
      status,
      approved: String(inv.status) === "APPROVED",
      next: allowed,
      canDo: mine,
      history: events.map((e) => ({ at: e.createdAt, from: e.fromStatus, to: e.toStatus, by: who(e.actorId), comment: e.comment })),
      returnReason: status === "REJECTED" ? inv.financeReturnReason : null,
    };
  }

  private static mayMove(actor: any, inv: any, from: string | null, to: string): { ok: boolean; reason?: string } {
    const privileged = isModulePrivilegedUser(actor);
    const has = (p: string) => privileged || userHasEffectivePermission(actor, p);
    if (from === "READY_FOR_FINANCE" && to === "SUBMITTED") return has(P.invoicesApprove) || has(P.invoicesPay) ? { ok: true } : { ok: false, reason: "Submitting an invoice to Finance needs the invoice approval grant." };
    if (from === "SUBMITTED" && (to === "ACCEPTED" || to === "REJECTED")) {
      if (!has(P.invoicesPay)) return { ok: false, reason: "Accepting or returning an invoice for Finance needs the payment grant." };
      if (inv.financeSubmittedById && inv.financeSubmittedById === actor.id) return { ok: false, reason: "The person who submitted the invoice to Finance cannot also accept or return it." };
      return { ok: true };
    }
    if (from === "REJECTED" && to === "READY_FOR_FINANCE") return has(P.invoicesApprove) || has(P.invoicesPay) || has(P.intakeManage) ? { ok: true } : { ok: false, reason: "Only procurement or Finance can send a returned invoice back to Ready for Finance." };
    if (from === "ACCEPTED" && to === "PAID") return { ok: false, reason: "An invoice becomes Paid when its payment is recorded in full." };
    if (from === "PAID" && to === "CLOSED") return has(P.invoicesPay) || has(P.invoicesApprove) ? { ok: true } : { ok: false, reason: "Closing an invoice needs the payment or approval grant." };
    return { ok: false, reason: "That move is not allowed." };
  }

  /** Move an invoice to the next handoff state. Only the moves in NEXT are possible; nothing is skipped. */
  static async transition(actor: any, invoiceId: string, to: string, comment?: string) {
    const target = String(to || "").toUpperCase().replace(/[^A-Z_]/g, "");
    if (!(this.STATES as readonly string[]).includes(target)) throw fail(`The handoff state must be one of ${this.STATES.join(", ")}.`);
    const inv: any = await prisma.procurementInvoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw fail("Invoice not found", 404);
    if (String(inv.status).toUpperCase() !== "APPROVED" && String(inv.paymentStatus).toUpperCase() !== "PAID") {
      throw fail(`${inv.invoiceNumber} is not approved yet, so there is nothing to hand off. Approve it first.`, 409, "NOT_APPROVED");
    }
    const from: string | null = inv.financeHandoffStatus ?? null;
    if (!from) throw fail(`${inv.invoiceNumber} has no handoff state yet.`, 409);
    if (from === target) throw fail(`${inv.invoiceNumber} is already ${target.replace(/_/g, " ").toLowerCase()}.`, 409, "NO_CHANGE");
    const allowed = this.NEXT[from] ?? [];
    if (!allowed.includes(target)) {
      throw fail(
        `${inv.invoiceNumber} is ${from.replace(/_/g, " ").toLowerCase()}; the next step is ${allowed.length ? allowed.map((s) => s.replace(/_/g, " ").toLowerCase()).join(" or ") : "none (it is closed)"}, not ${target.replace(/_/g, " ").toLowerCase()}. A step cannot be skipped.`,
        409,
        "HANDOFF_ORDER"
      );
    }
    const may = this.mayMove(actor, inv, from, target);
    if (!may.ok) throw fail(may.reason || "You cannot make that move.", 403);
    const text = String(comment ?? "").trim();
    if (target === "REJECTED" && text.length < 3) throw fail("A reason is required to return an invoice.", 400, "REASON_REQUIRED");

    const now = new Date();
    const data: any = { financeHandoffStatus: target };
    if (target === "SUBMITTED") Object.assign(data, { financeSubmittedAt: now, financeSubmittedById: actor.id });
    if (target === "ACCEPTED") Object.assign(data, { financeAcceptedAt: now, financeAcceptedById: actor.id, financeReturnReason: null });
    if (target === "REJECTED") Object.assign(data, { financeReturnedAt: now, financeReturnedById: actor.id, financeReturnReason: text });
    if (target === "READY_FOR_FINANCE") Object.assign(data, { financeSubmittedAt: null, financeSubmittedById: null });
    if (target === "CLOSED") Object.assign(data, { financeClosedAt: now, financeClosedById: actor.id });
    await prisma.$transaction([
      prisma.procurementInvoice.update({ where: { id: invoiceId }, data }),
      prisma.procurementInvoiceHandoffEvent.create({ data: { invoiceId, fromStatus: from, toStatus: target, actorId: actor.id, comment: text || null } }),
    ]);
    await AuditService.log({ userId: actor.id, action: `FINANCE_HANDOFF_${target}`, entityType: "ProcurementInvoice", entityId: invoiceId, oldValues: { financeHandoffStatus: from }, newValues: { financeHandoffStatus: target, comment: text || null } });
    return this.describe(invoiceId, actor);
  }

  /** Approval starts the handoff. Recorded as an event (by the approver, or by no one for an automatic approval). */
  static async start(invoiceId: string, actorId: string | null) {
    const inv: any = await prisma.procurementInvoice.findUnique({ where: { id: invoiceId }, select: { financeHandoffStatus: true } });
    if (inv?.financeHandoffStatus) return;
    await prisma.$transaction([
      prisma.procurementInvoice.update({ where: { id: invoiceId }, data: { financeHandoffStatus: "READY_FOR_FINANCE" } }),
      prisma.procurementInvoiceHandoffEvent.create({ data: { invoiceId, fromStatus: null, toStatus: "READY_FOR_FINANCE", actorId, comment: "Invoice approved" } }),
    ]);
  }

  /** Payment: it needs Finance to have accepted the invoice, and a fully paid invoice becomes Paid. */
  static async assertReadyToPay(invoiceId: string) {
    const inv: any = await prisma.procurementInvoice.findUnique({ where: { id: invoiceId }, select: { invoiceNumber: true, financeHandoffStatus: true } });
    const s = inv?.financeHandoffStatus;
    if (s !== "ACCEPTED") {
      throw fail(
        `${inv?.invoiceNumber ?? "The invoice"} cannot be paid yet: ${s ? `it is ${String(s).replace(/_/g, " ").toLowerCase()}` : "it has not been handed to Finance"}. Finance must accept it first (Ready for Finance, Submitted to Finance, Accepted).`,
        409,
        "HANDOFF_NOT_ACCEPTED"
      );
    }
  }

  static async markPaid(invoiceId: string, actorId: string | null) {
    const inv: any = await prisma.procurementInvoice.findUnique({ where: { id: invoiceId }, select: { financeHandoffStatus: true } });
    if (inv?.financeHandoffStatus === "PAID" || inv?.financeHandoffStatus === "CLOSED") return;
    await prisma.$transaction([
      prisma.procurementInvoice.update({ where: { id: invoiceId }, data: { financeHandoffStatus: "PAID" } }),
      prisma.procurementInvoiceHandoffEvent.create({ data: { invoiceId, fromStatus: inv?.financeHandoffStatus ?? null, toStatus: "PAID", actorId, comment: "Payment recorded in full" } }),
    ]);
  }
}
