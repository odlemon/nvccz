// @ts-nocheck
import { prisma } from "../../utils/database";
import AuditService from "../AuditService";
import { TRANSITIONS, statusLabel } from "./StatusTransitions";

/**
 * SRD §40: the actions that move a requisition, a sourcing event or a purchase order through its statuses. Whether a move is legal is
 * decided by the transition map (and enforced again at the data layer by the status guard), so an illegal one is refused with a
 * message here whichever way it is asked for.
 */
const fail = (message: string, status = 409) => Object.assign(new Error(message), { status });
const reasonOf = (v: unknown, required = true) => {
  const t = String(v ?? "").trim();
  if (required && !t) throw fail("Give a reason.", 400);
  if (t.length > 1000) throw fail("Keep the reason under 1,000 characters.", 400);
  return t;
};

/** The person's requisition, or one they manage sourcing for. */
const NON_TERMINAL_RFQ = ["DRAFT", "APPROVED", "PUBLISHED", "OPEN", "CLOSED", "UNDER_EVALUATION", "AWAITING_APPROVAL"];

export class ProcurementLifecycleService {
  // ------------------------------------------------------------------------------------------------ requisitions

  static async cancelRequisition(user: any, id: string, reason: unknown, canManage: boolean) {
    const text = reasonOf(reason);
    const r = await prisma.purchaseRequisition.findUnique({ where: { id }, select: { id: true, requisitionNumber: true, status: true, requestedById: true } });
    if (!r) throw fail("Requisition not found", 404);
    if (r.requestedById !== user.id && !canManage) throw fail("Only the requester or a procurement manager can cancel a requisition.", 403);
    if (!TRANSITIONS.REQUISITION[r.status]?.includes("CANCELLED")) throw fail(`${r.requisitionNumber} is ${statusLabel("REQUISITION", r.status)} and can no longer be cancelled.`);
    const live = await prisma.procurementRfq.count({ where: { requisitionId: id, status: { in: NON_TERMINAL_RFQ } } });
    if (live) throw fail(`${r.requisitionNumber} has a sourcing event in progress. Cancel that event first.`);
    const orders = await prisma.purchaseOrder.count({ where: { requisitionId: id, status: { notIn: ["CANCELLED", "REJECTED"] } } });
    if (orders) throw fail(`${r.requisitionNumber} has a purchase order. Cancel the order first.`);
    await prisma.$transaction(async (tx) => {
      await tx.approval.updateMany({ where: { status: "PENDING", request: { entityId: id, stageType: "PURCHASE_REQUISITION", status: "PENDING" } }, data: { status: "CANCELLED", comments: "Closed: the requisition was cancelled" } });
      await tx.approvalRequest.updateMany({ where: { entityId: id, stageType: "PURCHASE_REQUISITION", status: "PENDING" }, data: { status: "CANCELLED" } });
      await tx.purchaseRequisition.update({ where: { id }, data: { status: "CANCELLED", rejectionReason: text } });
    });
    await AuditService.log({ userId: user.id, action: "CANCEL", entityType: "PurchaseRequisition", entityId: id, oldValues: { status: r.status }, newValues: { status: "CANCELLED", reason: text }, eventType: "WORKFLOW_CHANGE" } as any).catch(() => undefined);
    return prisma.purchaseRequisition.findUnique({ where: { id } });
  }

  static async closeRequisition(user: any, id: string, reason: unknown) {
    const text = reasonOf(reason, false);
    const r = await prisma.purchaseRequisition.findUnique({ where: { id }, select: { id: true, requisitionNumber: true, status: true } });
    if (!r) throw fail("Requisition not found", 404);
    if (!TRANSITIONS.REQUISITION[r.status]?.includes("CLOSED")) throw fail(`${r.requisitionNumber} is ${statusLabel("REQUISITION", r.status)} and cannot be closed from there.`);
    const live = await prisma.procurementRfq.count({ where: { requisitionId: id, status: { in: NON_TERMINAL_RFQ } } });
    if (live) throw fail(`${r.requisitionNumber} has a sourcing event in progress, so it cannot be closed yet.`);
    await prisma.purchaseRequisition.update({ where: { id }, data: { status: "CLOSED" } });
    await AuditService.log({ userId: user.id, action: "CLOSE", entityType: "PurchaseRequisition", entityId: id, oldValues: { status: r.status }, newValues: { status: "CLOSED", reason: text || null }, eventType: "CLOSE" } as any).catch(() => undefined);
    return prisma.purchaseRequisition.findUnique({ where: { id } });
  }

  // ------------------------------------------------------------------------------------------------ sourcing events

  private static async rfq(id: string) {
    const rfq = await prisma.procurementRfq.findUnique({ where: { id }, select: { id: true, rfqNumber: true, status: true, requisitionId: true, createdById: true } });
    if (!rfq) throw fail("Sourcing event not found", 404);
    return rfq;
  }
  private static assertMove(rfq: any, to: string, verb: string) {
    if (!TRANSITIONS.RFQ[rfq.status]?.includes(to)) throw fail(`${rfq.rfqNumber} is ${statusLabel("RFQ", rfq.status)} and cannot be ${verb}.`);
  }

  static async approveRfq(user: any, id: string) {
    const rfq = await this.rfq(id);
    if (rfq.status !== "DRAFT") throw fail(`${rfq.rfqNumber} is ${statusLabel("RFQ", rfq.status)}: only a draft can be approved.`);
    if (rfq.createdById === user.id && !user.isAdmin) throw fail("A sourcing event cannot be approved by the person who drafted it.", 403);
    await prisma.procurementRfq.update({ where: { id }, data: { status: "APPROVED" } });
    await AuditService.log({ userId: user.id, action: "APPROVE", entityType: "ProcurementRfq", entityId: id, oldValues: { status: "DRAFT" }, newValues: { status: "APPROVED" }, eventType: "APPROVE" } as any).catch(() => undefined);
    return this.rfq(id);
  }

  /** Publishing sends the invitations, and the event is open for responses from that moment: Published, then Open. */
  static async publishRfq(user: any, id: string) {
    const rfq = await this.rfq(id);
    if (!["DRAFT", "APPROVED"].includes(rfq.status)) throw fail(`${rfq.rfqNumber} is ${statusLabel("RFQ", rfq.status)}: only a draft or approved event can be published.`);
    const row = await prisma.procurementRfq.findUnique({ where: { id }, select: { closingAt: true } });
    if (row?.closingAt && new Date(row.closingAt).getTime() <= Date.now()) throw fail("The closing date has already passed. Set a later closing date before publishing.", 400);
    await prisma.procurementRfq.update({ where: { id }, data: { status: "PUBLISHED" } });
    try {
      const { ProcurementService } = await import("../ProcurementService");
      await ProcurementService.dispatchRfqInvitations(id);
    } catch (e) {
      await prisma.procurementRfq.update({ where: { id }, data: { status: rfq.status } });
      throw e;
    }
    await prisma.procurementRfq.update({ where: { id }, data: { status: "OPEN" } });
    if (rfq.requisitionId) await prisma.purchaseRequisition.updateMany({ where: { id: rfq.requisitionId, status: "APPROVED" }, data: { status: "RFQ_SENT" } });
    await AuditService.log({ userId: user.id, action: "PUBLISH", entityType: "ProcurementRfq", entityId: id, oldValues: { status: rfq.status }, newValues: { status: "OPEN" }, eventType: "WORKFLOW_CHANGE" } as any).catch(() => undefined);
    return this.rfq(id);
  }

  static async closeRfq(user: any, id: string) {
    const rfq = await this.rfq(id);
    this.assertMove(rfq, "CLOSED", "closed");
    await prisma.procurementRfq.update({ where: { id }, data: { status: "CLOSED" } });
    await AuditService.log({ userId: user.id, action: "CLOSE", entityType: "ProcurementRfq", entityId: id, oldValues: { status: rfq.status }, newValues: { status: "CLOSED" }, eventType: "CLOSE" } as any).catch(() => undefined);
    return this.rfq(id);
  }

  static async cancelRfq(user: any, id: string, reason: unknown) {
    const text = reasonOf(reason);
    const rfq = await this.rfq(id);
    this.assertMove(rfq, "CANCELLED", "cancelled");
    const orders = await prisma.purchaseOrder.count({ where: { rfqId: id, status: { notIn: ["CANCELLED", "REJECTED"] } } }).catch(() => 0);
    if (orders) throw fail(`${rfq.rfqNumber} has led to a purchase order. Cancel the order first.`);
    await prisma.$transaction(async (tx) => {
      await tx.procurementRfq.update({ where: { id }, data: { status: "CANCELLED", rejectionReason: text } });
      // the requisition goes back to Approved so it can be sourced again
      if (rfq.requisitionId) await tx.purchaseRequisition.updateMany({ where: { id: rfq.requisitionId, status: "RFQ_SENT" }, data: { status: "APPROVED" } });
    });
    await AuditService.log({ userId: user.id, action: "CANCEL", entityType: "ProcurementRfq", entityId: id, oldValues: { status: rfq.status }, newValues: { status: "CANCELLED", reason: text }, eventType: "WORKFLOW_CHANGE" } as any).catch(() => undefined);
    return this.rfq(id);
  }

  /**
   * A move the process makes by itself (the closing time passed, evaluation started, a recommendation went for approval). It is
   * applied only when the transition map allows it from where the event is now, and is otherwise quietly left alone.
   */
  static async advanceRfq(id: string, to: string) {
    try {
      const rfq = await prisma.procurementRfq.findUnique({ where: { id }, select: { status: true } });
      if (!rfq || rfq.status === to) return false;
      if (!TRANSITIONS.RFQ[rfq.status]?.includes(to)) return false;
      await prisma.procurementRfq.update({ where: { id }, data: { status: to } });
      return true;
    } catch (_e) {
      return false;
    }
  }

  /** Events past their closing time stop accepting responses: Open becomes Closed. */
  static async closeExpiredRfqs() {
    const due = await prisma.procurementRfq.findMany({ where: { status: "OPEN", closingAt: { lte: new Date() } }, select: { id: true }, take: 500 });
    let n = 0;
    for (const r of due) if (await this.advanceRfq(r.id, "CLOSED")) n += 1;
    return n;
  }

  // ------------------------------------------------------------------------------------------------ purchase orders

  static async cancelPurchaseOrder(user: any, id: string, reason: unknown) {
    const text = reasonOf(reason);
    const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { id: true, poNumber: true, status: true } });
    if (!po) throw fail("Purchase order not found", 404);
    if (!TRANSITIONS.PURCHASE_ORDER[po.status]?.includes("CANCELLED")) throw fail(`${po.poNumber} is ${statusLabel("PURCHASE_ORDER", po.status)} and can no longer be cancelled.`);
    const grns = await prisma.goodsReceivedNote.count({ where: { purchaseOrderId: id } });
    if (grns) throw fail(`${po.poNumber} has goods received against it, so it cannot be cancelled. Close it instead.`);
    const invoices = await prisma.procurementInvoice.count({ where: { purchaseOrderId: id, status: { notIn: ["REJECTED", "CANCELLED"] } } });
    if (invoices) throw fail(`${po.poNumber} has an invoice against it, so it cannot be cancelled.`);
    await prisma.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
    await AuditService.log({ userId: user.id, action: "CANCEL", entityType: "PurchaseOrder", entityId: id, oldValues: { status: po.status }, newValues: { status: "CANCELLED", reason: text }, eventType: "WORKFLOW_CHANGE" } as any).catch(() => undefined);
    return prisma.purchaseOrder.findUnique({ where: { id } });
  }

  static async closePurchaseOrder(user: any, id: string, reason: unknown) {
    const text = reasonOf(reason, false);
    const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { id: true, poNumber: true, status: true } });
    if (!po) throw fail("Purchase order not found", 404);
    if (!TRANSITIONS.PURCHASE_ORDER[po.status]?.includes("CLOSED")) throw fail(`${po.poNumber} is ${statusLabel("PURCHASE_ORDER", po.status)} and cannot be closed from there.`);
    await prisma.purchaseOrder.update({ where: { id }, data: { status: "CLOSED" } });
    await AuditService.log({ userId: user.id, action: "CLOSE", entityType: "PurchaseOrder", entityId: id, oldValues: { status: po.status }, newValues: { status: "CLOSED", reason: text || null }, eventType: "CLOSE" } as any).catch(() => undefined);
    return prisma.purchaseOrder.findUnique({ where: { id } });
  }
}
