// @ts-nocheck
/**
 * SRD "User Master" enforcement for Procurement. The fields are stored on `users`; this is where they change behaviour:
 *
 *  - Approval Limit / Approval Level  -> who is routed a step, and what an approver may decide.
 *  - Delegated Approver               -> work is routed to the delegate, and the hand-off is written to the audit trail.
 *  - Segregation of Duties            -> nobody approves what they raised; per-user duty conflicts are refused.
 *  - Status / Effective / End date    -> an unavailable user is never routed work and cannot act.
 *
 * Every refusal is a UserMasterPolicyError (HTTP 403) and is recorded in the audit trail.
 */
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import {
  UserMasterPolicyError,
  hasSodRestriction,
  isUserAvailable,
  userAvailability,
  fullNameOf,
  normalizeAccessProfile,
  normalizeProcurementFunction,
} from "../config/userMasterAccess";

const USER_POLICY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  status: true,
  effectiveDate: true,
  endDate: true,
  approvalLimitAmount: true,
  approvalLevel: true,
  delegatedApproverId: true,
  reportingManagerId: true,
  sodRestrictions: true,
  costCentre: true,
  branch: true,
  businessUnit: true,
  userDepartment: true,
  accessProfile: true,
  procurementFunction: true,
} as const;

type Db = any;

function money(n: number) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function refuse(
  db: Db,
  actorId: string | null,
  code: string,
  message: string,
  entityType: string,
  entityId: string,
  detail: Record<string, unknown> = {}
): Promise<never> {
  try {
    await AuditService.log({
      userId: actorId,
      action: `POLICY_BLOCK_${code}`,
      entityType,
      entityId,
      newValues: { code, message, ...detail },
    });
  } catch {
    /* an audit failure must never mask the refusal itself */
  }
  throw new UserMasterPolicyError(code, message);
}

export class UserMasterPolicyService {
  static async load(db: Db, id: string | null | undefined) {
    if (!id) return null;
    return db.user.findUnique({ where: { id }, select: USER_POLICY_SELECT });
  }

  /** The person must be Active and inside their validity window. */
  static async assertCanAct(db: Db, userId: string) {
    const user = await this.load(db, userId);
    if (!user) throw new UserMasterPolicyError("USER_NOT_FOUND", "User not found", 401);
    const a = userAvailability(user);
    if (a.ok === false) throw new UserMasterPolicyError(a.code, a.message);
    return user;
  }

  /** Value of the record being approved, from entityData when present, else the record itself. */
  static async entityAmount(db: Db, stageType: string, entityId: string, entityData?: any): Promise<number> {
    const fromData = Number(entityData?.totalAmount);
    if (Number.isFinite(fromData) && fromData > 0) return fromData;
    try {
      if (stageType === "PURCHASE_REQUISITION") {
        const r = await db.purchaseRequisition.findUnique({ where: { id: entityId }, select: { totalAmount: true } });
        return Number(r?.totalAmount || 0);
      }
      if (stageType === "PURCHASE_ORDER") {
        const r = await db.purchaseOrder.findUnique({ where: { id: entityId }, select: { totalAmount: true } });
        return Number(r?.totalAmount || 0);
      }
      if (stageType === "INVOICE") {
        const r = await db.procurementInvoice.findUnique({ where: { id: entityId }, select: { totalAmount: true } });
        return Number(r?.totalAmount || 0);
      }
      if (stageType === "AWARD_RECOMMENDATION") {
        const r = await db.rfqAwardRecommendation.findUnique({ where: { id: entityId }, select: { recommendedAmount: true } });
        return Number(r?.recommendedAmount || 0);
      }
    } catch {
      /* fall through */
    }
    return 0;
  }

  /** Who created/raised the record, independent of who happened to submit it. */
  static async entityRaiserId(db: Db, stageType: string, entityId: string): Promise<string | null> {
    try {
      if (stageType === "PURCHASE_REQUISITION") {
        return (await db.purchaseRequisition.findUnique({ where: { id: entityId }, select: { requestedById: true } }))?.requestedById ?? null;
      }
      if (stageType === "PURCHASE_ORDER") {
        return (await db.purchaseOrder.findUnique({ where: { id: entityId }, select: { createdById: true } }))?.createdById ?? null;
      }
      if (stageType === "INVOICE") {
        const inv = await db.procurementInvoice.findUnique({ where: { id: entityId }, select: { createdById: true, submittedVia: true } });
        // A supplier's own submission is attributed to a system user; nobody on staff raised it.
        return inv?.submittedVia === "VENDOR_PORTAL" ? null : inv?.createdById ?? null;
      }
      if (stageType === "GRN") {
        return (await db.goodsReceivedNote.findUnique({ where: { id: entityId }, select: { receivedById: true } }))?.receivedById ?? null;
      }
      if (stageType === "AWARD_RECOMMENDATION") {
        return (await db.rfqAwardRecommendation.findUnique({ where: { id: entityId }, select: { preparedById: true } }))?.preparedById ?? null;
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  static withinLimit(user: any, amount: number): boolean {
    if (user?.approvalLimitAmount == null) return true; // no limit configured = unrestricted
    return amount <= Number(user.approvalLimitAmount);
  }

  /**
   * Route a step. Input is the approvers the approval matrix selected; output is who is actually asked:
   *  1. someone unavailable (suspended, locked, deactivated, outside validity) is dropped, or replaced by their delegate;
   *  2. someone with a Delegated Approver on file is replaced by that delegate (recorded for the audit trail);
   *  3. the requester is never asked to approve their own record;
   *  4. approvers below the step's minimum Approval Level are dropped;
   *  5. when at least one remaining approver's limit covers the amount, those below the amount are dropped.
   */
  static async resolveStepApprovers(
    db: Db,
    params: {
      approverIds: string[];
      requesterId: string;
      amount: number;
      minApprovalLevel?: number | null;
      stepName?: string;
    }
  ): Promise<{ approverIds: string[]; delegations: Array<{ fromId: string; toId: string; reason: string; fromName: string }> }> {
    const delegations: Array<{ fromId: string; toId: string; reason: string; fromName: string }> = [];
    const users = await db.user.findMany({ where: { id: { in: params.approverIds } }, select: USER_POLICY_SELECT });
    const byId = new Map(users.map((u: any) => [u.id, u]));
    const resolved = new Map<string, any>();

    for (const id of params.approverIds) {
      const u: any = byId.get(id);
      if (!u) continue;
      let target = u;
      let reason = "";
      if (!isUserAvailable(u)) {
        const a: any = userAvailability(u);
        reason = `approver unavailable (${a.code})`;
        target = null;
      }
      if (u.delegatedApproverId && u.delegatedApproverId !== params.requesterId) {
        const d = await this.load(db, u.delegatedApproverId);
        if (d && isUserAvailable(d)) {
          target = d;
          reason = reason || "delegated approver on file";
        }
      } else if (!target) {
        // unavailable and no delegate: dropped
      }
      if (!target) continue;
      if (target.id !== u.id) delegations.push({ fromId: u.id, toId: target.id, reason, fromName: fullNameOf(u) });
      resolved.set(target.id, target);
    }

    let list = [...resolved.values()].filter((u: any) => u.id !== params.requesterId);

    if (params.minApprovalLevel != null) {
      list = list.filter((u: any) => u.approvalLevel != null && u.approvalLevel >= params.minApprovalLevel);
    }
    if (params.amount > 0) {
      const covering = list.filter((u: any) => this.withinLimit(u, params.amount));
      if (covering.length) list = covering;
    }

    const keep = new Set(list.map((u: any) => u.id));
    return { approverIds: [...keep], delegations: delegations.filter((d) => keep.has(d.toId)) };
  }

  /** Written once the Approval row exists, so the hand-off is visible on the record's audit trail. */
  static async logDelegation(approvalId: string, requestId: string, d: { fromId: string; toId: string; reason: string }, entityType: string) {
    await AuditService.log({
      userId: d.fromId,
      action: "APPROVAL_ROUTED_TO_DELEGATE",
      entityType: "Approval",
      entityId: approvalId,
      oldValues: { approverId: d.fromId },
      newValues: { approverId: d.toId, reason: d.reason, requestId, subject: entityType },
    });
  }

  /**
   * Gate every approval decision on the engine. Throws (and audits) when the actor may not approve.
   * Returns nothing; escalation on an exceeded limit happens here, then the call is refused.
   */
  static async guardApprove(params: { approvalId: string; approverId: string }) {
    const approval = await prisma.approval.findUnique({
      where: { id: params.approvalId },
      include: { request: true, stage: true },
    });
    if (!approval) return; // the service reports "Approval not found"
    const stageType = String(approval.request?.stageType || "");
    if (!["PURCHASE_REQUISITION", "PURCHASE_ORDER", "INVOICE", "GRN", "AWARD_RECOMMENDATION"].includes(stageType)) return;

    const actor = await this.assertCanAct(prisma, params.approverId);
    const entityId = approval.request.entityId;

    // Segregation of duties: nobody approves what they raised (or submitted). Not waivable, admins included.
    const raiser = await this.entityRaiserId(prisma, stageType, entityId);
    if (actor.id === approval.request.requestedById || (raiser && actor.id === raiser)) {
      await refuse(
        prisma,
        actor.id,
        "SOD_RAISE_AND_APPROVE",
        "Segregation of duties: you raised this record, so you cannot approve it.",
        "Approval",
        approval.id,
        { stageType, entityId }
      );
    }
    if (stageType === "INVOICE") await this.assertInvoiceApprovalDuties(prisma, actor, entityId, approval.id);

    if (approval.approverId === actor.id && approval.stage?.minApprovalLevel != null) {
      if (actor.approvalLevel == null || actor.approvalLevel < approval.stage.minApprovalLevel) {
        await refuse(
          prisma,
          actor.id,
          "APPROVAL_LEVEL_TOO_LOW",
          `This step needs approval level ${approval.stage.minApprovalLevel} or higher; yours is ${actor.approvalLevel ?? "not set"}.`,
          "Approval",
          approval.id
        );
      }
    }

    const amount = await this.entityAmount(prisma, stageType, entityId, approval.request.entityData);
    if (!this.withinLimit(actor, amount)) {
      const escalated = await this.escalate(actor, approval, amount);
      await refuse(
        prisma,
        actor.id,
        "APPROVAL_LIMIT_EXCEEDED",
        `This is ${money(amount)}, above your approval limit of ${money(Number(actor.approvalLimitAmount))}. ` +
          (escalated
            ? `It has been escalated to ${escalated}.`
            : "No approver with a sufficient limit is available; ask an administrator to route it."),
        "Approval",
        approval.id,
        { amount, limit: Number(actor.approvalLimitAmount), escalatedTo: escalated }
      );
    }
  }

  /** Why `delegate` may not take over this approval (null = fine). Same rules whether asked by the picker or by the guard. */
  static delegateIneligibility(
    delegate: any,
    ctx: { requesterId: string; raiserId?: string | null; amount: number; minApprovalLevel?: number | null; alreadyAtStep: string[] }
  ): { code: string; message: string } | null {
    if (!isUserAvailable(delegate)) {
      const a: any = userAvailability(delegate);
      return { code: "DELEGATE_UNAVAILABLE", message: `${fullNameOf(delegate) || "That user"} cannot act (${a.message || a.code}).` };
    }
    if (delegate.id === ctx.requesterId || (ctx.raiserId && delegate.id === ctx.raiserId)) {
      return { code: "DELEGATE_IS_REQUESTER", message: "You cannot delegate to the person who raised the record: they may not approve their own request." };
    }
    if (ctx.alreadyAtStep.includes(delegate.id)) {
      return { code: "DELEGATE_ALREADY_APPROVER", message: `${fullNameOf(delegate)} already sits on this step.` };
    }
    if (normalizeAccessProfile(delegate.accessProfile) === "READ_ONLY") {
      return { code: "DELEGATE_READ_ONLY", message: `${fullNameOf(delegate)} has a read-only access profile and cannot approve.` };
    }
    const fn = normalizeProcurementFunction(delegate.procurementFunction);
    if (fn && !["APPROVER", "PROCUREMENT_MANAGER"].includes(fn)) {
      return { code: "DELEGATE_FUNCTION", message: `${fullNameOf(delegate)}'s procurement function (${fn.replace(/_/g, " ").toLowerCase()}) does not include approving.` };
    }
    if (ctx.minApprovalLevel != null && (delegate.approvalLevel == null || delegate.approvalLevel < ctx.minApprovalLevel)) {
      return { code: "DELEGATE_LEVEL_TOO_LOW", message: `This step needs approval level ${ctx.minApprovalLevel} or higher; ${fullNameOf(delegate)}'s is ${delegate.approvalLevel ?? "not set"}.` };
    }
    if (!this.withinLimit(delegate, ctx.amount)) {
      return { code: "DELEGATE_LIMIT_EXCEEDED", message: `This is ${money(ctx.amount)}, above ${fullNameOf(delegate)}'s approval limit of ${money(Number(delegate.approvalLimitAmount))}.` };
    }
    return null;
  }

  /** Gate a delegation: the delegator must be able to act, and the delegate must be someone who could approve it themselves. */
  static async guardDelegate(params: { approvalId: string; fromUserId: string; delegatedToId: string }) {
    const approval = await prisma.approval.findUnique({ where: { id: params.approvalId }, include: { request: true, stage: true } });
    if (!approval) return;
    const actor = await this.assertCanAct(prisma, params.fromUserId);
    const stageType = String(approval.request?.stageType || "");
    const delegate = await this.load(prisma, params.delegatedToId);
    if (!delegate) await refuse(prisma, actor.id, "DELEGATE_NOT_FOUND", "Delegate user not found.", "Approval", approval.id);
    const amount = await this.entityAmount(prisma, stageType, approval.request.entityId, approval.request.entityData);
    const raiserId = await this.entityRaiserId(prisma, stageType, approval.request.entityId);
    const peers = await prisma.approval.findMany({
      where: { requestId: approval.requestId, stageId: approval.stageId, status: "PENDING" },
      select: { approverId: true },
    });
    const why = this.delegateIneligibility(delegate, {
      requesterId: approval.request.requestedById,
      raiserId,
      amount,
      minApprovalLevel: approval.stage?.minApprovalLevel ?? null,
      alreadyAtStep: peers.map((p) => p.approverId),
    });
    if (why) await refuse(prisma, actor.id, why.code, why.message, "Approval", approval.id, { delegatedToId: params.delegatedToId });
  }

  /** Hand an over-limit approval to the first available person up the reporting line whose limit covers it. */
  private static async escalate(actor: any, approval: any, amount: number): Promise<string | null> {
    const seen = new Set<string>([actor.id]);
    let cursor = actor.reportingManagerId as string | null;
    for (let hop = 0; cursor && hop < 6; hop++) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const mgr = await this.load(prisma, cursor);
      if (!mgr) break;
      if (isUserAvailable(mgr) && mgr.id !== approval.request.requestedById && this.withinLimit(mgr, amount)) {
        await prisma.$transaction(async (tx) => {
          await tx.approval.update({
            where: { id: approval.id },
            data: {
              status: "ESCALATED",
              comments: `Escalated: amount ${money(amount)} exceeds ${fullNameOf(actor)}'s approval limit`,
            },
          });
          await tx.approval.create({
            data: {
              requestId: approval.requestId,
              stageId: approval.stageId,
              approverId: mgr.id,
              status: "PENDING",
              comments: `Escalated from ${fullNameOf(actor)}: amount ${money(amount)} exceeds their approval limit`,
            },
          });
        });
        await AuditService.log({
          userId: actor.id,
          action: "APPROVAL_ESCALATED",
          entityType: "Approval",
          entityId: approval.id,
          oldValues: { approverId: actor.id, limit: Number(actor.approvalLimitAmount) },
          newValues: { approverId: mgr.id, amount },
        });
        return fullNameOf(mgr);
      }
      cursor = mgr.reportingManagerId;
    }
    return null;
  }

  /** Per-user duty conflicts on invoice approval, shared by the engine and the direct approve endpoint. */
  static async assertInvoiceApprovalDuties(db: Db, actor: any, invoiceId: string, auditEntityId?: string) {
    const invoice = await db.procurementInvoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, createdById: true, purchaseOrderId: true, submittedVia: true },
    });
    if (!invoice) return;
    const entity = auditEntityId || invoiceId;
    if (invoice.createdById === actor.id && invoice.submittedVia !== "VENDOR_PORTAL") {
      await refuse(db, actor.id, "SOD_RAISE_AND_APPROVE", "Segregation of duties: you raised this invoice, so you cannot approve it.", "ProcurementInvoice", entity);
    }
    if (invoice.purchaseOrderId) {
      if (hasSodRestriction(actor, "RECEIVE_AND_APPROVE_INVOICE")) {
        const grn = await db.goodsReceivedNote.findFirst({
          where: { purchaseOrderId: invoice.purchaseOrderId, receivedById: actor.id },
          select: { id: true },
        });
        if (grn) {
          await refuse(db, actor.id, "SOD_RECEIVE_AND_APPROVE_INVOICE", "Segregation of duties: you received the goods on this order, so you cannot approve its invoice.", "ProcurementInvoice", entity);
        }
      }
      if (hasSodRestriction(actor, "CREATE_PO_AND_APPROVE_INVOICE")) {
        const po = await db.purchaseOrder.findUnique({ where: { id: invoice.purchaseOrderId }, select: { createdById: true } });
        if (po?.createdById === actor.id) {
          await refuse(db, actor.id, "SOD_CREATE_PO_AND_APPROVE_INVOICE", "Segregation of duties: you created the purchase order for this invoice, so you cannot approve it.", "ProcurementInvoice", entity);
        }
      }
    }
  }

  /** Direct (non-engine) invoice approval: availability, SoD, and the approver's limit against the invoice total. */
  static async guardInvoiceApproval(invoiceId: string, approverId: string) {
    const actor = await this.assertCanAct(prisma, approverId);
    await this.assertInvoiceApprovalDuties(prisma, actor, invoiceId);
    const inv = await prisma.procurementInvoice.findUnique({ where: { id: invoiceId }, select: { totalAmount: true } });
    const amount = Number(inv?.totalAmount || 0);
    if (!this.withinLimit(actor, amount)) {
      await refuse(
        prisma,
        actor.id,
        "APPROVAL_LIMIT_EXCEEDED",
        `This invoice is ${money(amount)}, above your approval limit of ${money(Number(actor.approvalLimitAmount))}.`,
        "ProcurementInvoice",
        invoiceId,
        { amount, limit: Number(actor.approvalLimitAmount) }
      );
    }
  }

  static async guardInvoicePayment(invoiceId: string, payerId: string) {
    const actor = await this.assertCanAct(prisma, payerId);
    const inv = await prisma.procurementInvoice.findUnique({ where: { id: invoiceId }, select: { approvedById: true } });
    if (inv?.approvedById && inv.approvedById === actor.id && hasSodRestriction(actor, "APPROVE_AND_PAY_INVOICE")) {
      await refuse(prisma, actor.id, "SOD_APPROVE_AND_PAY_INVOICE", "Segregation of duties: you approved this invoice, so you cannot also pay it.", "ProcurementInvoice", invoiceId);
    }
  }

  static async guardGrnApproval(grnId: string, approverId: string) {
    const actor = await this.assertCanAct(prisma, approverId);
    const grn = await prisma.goodsReceivedNote.findUnique({ where: { id: grnId }, select: { receivedById: true } });
    if (grn?.receivedById === actor.id) {
      await refuse(prisma, actor.id, "SOD_RAISE_AND_APPROVE", "Segregation of duties: you recorded this goods receipt, so you cannot approve it.", "GoodsReceivedNote", grnId);
    }
  }

  static async guardGrnCreation(purchaseOrderId: string, receiverId: string) {
    const actor = await this.assertCanAct(prisma, receiverId);
    if (!hasSodRestriction(actor, "REQUEST_AND_RECEIVE_GOODS")) return;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: { requisitionId: true } }).catch(() => null);
    const reqId = po?.requisitionId;
    if (!reqId) return;
    const pr = await prisma.purchaseRequisition.findUnique({ where: { id: reqId }, select: { requestedById: true } });
    if (pr?.requestedById === actor.id) {
      await refuse(prisma, actor.id, "SOD_REQUEST_AND_RECEIVE_GOODS", "Segregation of duties: you raised the requisition behind this order, so you cannot receive the goods.", "PurchaseOrder", purchaseOrderId);
    }
  }
}
