//@ts-nocheck
/**
 * §21 Purchase orders: what a PO carries from the award and the requisition (so nothing is re-keyed), the PO's own approval when the
 * organisation requires it, and the approvals record shown on the PO.
 */
import { prisma } from "../../utils/database";
import AuditService from "../AuditService";
import { ProcurementDecisionLogService } from "../ProcurementDecisionLogService";
import { getP2pConfig } from "./P2pSettings";

const fail = (message: string, status = 400, code?: string) => Object.assign(new Error(message), { status, code });

export class PurchaseOrderControlService {
  /**
   * The references a new PO takes from what it fulfils. An explicit value from the caller wins; otherwise it comes from the
   * requisition (cost centre, budget code), the budget line (GL code), the award (RFQ, approved recommendation, special
   * requirements as purchase conditions) and the vendor (code).
   */
  static async defaultsFor(input: {
    requisitionId?: string | null;
    quotationId?: string | null;
    vendorId: string;
    costCentre?: string | null;
    budgetCode?: string | null;
    glCode?: string | null;
    purchaseConditions?: string | null;
  }) {
    const vendor: any = await prisma.vendor.findUnique({ where: { id: input.vendorId }, select: { vendorCode: true, bpNumber: true } });
    const req: any = input.requisitionId
      ? await prisma.purchaseRequisition.findUnique({ where: { id: input.requisitionId }, select: { costCentre: true, budgetCode: true } }).catch(() => null)
      : null;
    let rfqId: string | null = null;
    let awardRecommendationId: string | null = null;
    let conditions: string | null = null;
    if (input.quotationId) {
      const q: any = await prisma.vendorQuotation.findUnique({ where: { id: input.quotationId }, select: { id: true, procurementRfqId: true } });
      rfqId = q?.procurementRfqId ?? null;
      if (rfqId) {
        const rec = await prisma.rfqAwardRecommendation.findFirst({
          where: { rfqId, recommendedQuotationId: input.quotationId, status: "APPROVED" },
          orderBy: { version: "desc" },
          select: { id: true },
        });
        awardRecommendationId = rec?.id ?? null;
        const rfq: any = await prisma.procurementRfq.findUnique({ where: { id: rfqId }, select: { specialRequirements: true } });
        conditions = rfq?.specialRequirements ?? null;
      }
    }
    const costCentre = clean(input.costCentre) ?? clean(req?.costCentre);
    const budgetCode = clean(input.budgetCode) ?? clean(req?.budgetCode);
    let glCode = clean(input.glCode);
    if (!glCode && budgetCode) {
      const budget: any = await prisma.procurementBudget.findFirst({
        where: { budgetCode, ...(costCentre ? { costCentre } : {}), glCode: { not: null } },
        orderBy: { updatedAt: "desc" },
        select: { glCode: true },
      });
      glCode = budget?.glCode ?? null;
    }
    return {
      vendorCode: vendor?.vendorCode ?? vendor?.bpNumber ?? null,
      rfqId,
      awardRecommendationId,
      costCentre,
      budgetCode,
      glCode,
      purchaseConditions: clean(input.purchaseConditions) ?? conditions,
    };
  }

  /** A PO may be sent to the supplier only when it needs no approval, or has been approved. */
  static async assertMaySend(po: { id: string; poNumber: string; approvalStatus?: string | null }) {
    const cfg = await getP2pConfig();
    const status = String(po.approvalStatus || "NOT_REQUIRED").toUpperCase();
    if (cfg.poApprovalRequired && status !== "APPROVED" && status !== "NOT_REQUIRED_LEGACY") {
      if (status === "REJECTED") throw fail(`${po.poNumber} was rejected and cannot be sent.`, 409, "PO_REJECTED");
      throw fail(`${po.poNumber} must be approved before it is sent to the supplier${status === "PENDING" ? " (it is waiting for its approvers)" : ": submit it for approval first"}.`, 409, "PO_APPROVAL_REQUIRED");
    }
    if (status === "PENDING") throw fail(`${po.poNumber} is waiting for approval and cannot be sent yet.`, 409, "PO_APPROVAL_PENDING");
    if (status === "REJECTED") throw fail(`${po.poNumber} was rejected and cannot be sent.`, 409, "PO_REJECTED");
  }

  /**
   * What the register shows: a draft made before approval was switched on still has to be approved before it can be sent
   * (assertMaySend holds it), so it is reported as requiring approval rather than as not required.
   */
  static async withEffectiveApproval<T extends { status?: any; approvalStatus?: any }>(pos: T[]): Promise<T[]> {
    const cfg = await getP2pConfig();
    if (!cfg.poApprovalRequired) return pos;
    return pos.map((po) => {
      const st = String(po.approvalStatus || "NOT_REQUIRED").toUpperCase();
      return st === "NOT_REQUIRED" && ["DRAFT", "PENDING"].includes(String(po.status).toUpperCase()) ? { ...po, approvalStatus: "REQUIRED" } : po;
    });
  }

  /** The approval status a new PO starts in. */
  static async initialApprovalStatus(): Promise<string> {
    return (await getP2pConfig()).poApprovalRequired ? "REQUIRED" : "NOT_REQUIRED";
  }

  static async submitForApproval(user: any, poId: string) {
    const po: any = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { vendor: { select: { name: true } } } });
    if (!po) throw fail("Purchase order not found", 404);
    if (!["DRAFT", "PENDING"].includes(String(po.status).toUpperCase())) throw fail(`${po.poNumber} has already been sent and cannot go for approval.`, 409);
    if (String(po.approvalStatus) === "PENDING") throw fail(`${po.poNumber} is already waiting for approval.`, 409);
    if (String(po.approvalStatus) === "APPROVED") throw fail(`${po.poNumber} is already approved.`, 409);
    const { ApprovalService } = await import("../ApprovalService");
    let created: any = null;
    try {
      created = await ApprovalService.createApprovalRequest({
        stageType: "PURCHASE_ORDER",
        entityId: po.id,
        entityData: { poNumber: po.poNumber, vendor: po.vendor?.name, totalAmount: String(po.totalAmount) },
        requestedById: user.id,
      } as any);
    } catch (e: any) {
      if (/No active approval configuration/i.test(String(e?.message))) {
        throw fail("No purchase order approval route is configured. An administrator sets it in Configuration, Approval matrix, Purchase order route.", 409, "NO_APPROVAL_ROUTE");
      }
      throw e;
    }
    if (!created) throw fail("The purchase order approval route has no steps, so it cannot be routed.", 409, "NO_APPROVAL_ROUTE");
    await prisma.purchaseOrder.update({ where: { id: po.id }, data: { approvalStatus: "PENDING", approvalRequestId: created.approvalRequest.id } });
    await ProcurementDecisionLogService.record({ entityType: "PurchaseOrder", entityId: po.id, requestId: created.approvalRequest.id, actorId: user.id, action: "SUBMITTED", previousStatus: String(po.approvalStatus), resultingStatus: "PENDING" });
    await AuditService.log({ userId: user.id, action: "SUBMIT_PO_FOR_APPROVAL", entityType: "PurchaseOrder", entityId: po.id, newValues: { steps: created.approvalRequest.totalSteps } });
    return this.describeApprovals(po.id);
  }

  static async decide(user: any, poId: string, decision: "APPROVE" | "REJECT", comments?: string) {
    const po: any = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) throw fail("Purchase order not found", 404);
    if (String(po.approvalStatus) !== "PENDING" || !po.approvalRequestId) throw fail(`${po.poNumber} is not waiting for approval.`, 409);
    const text = String(comments ?? "").trim();
    if (decision === "REJECT" && text.length < 3) throw fail("A reason is required to reject a purchase order.");
    const pending = await prisma.approval.findMany({ where: { requestId: po.approvalRequestId, status: "PENDING" }, include: { stage: true } });
    if (!pending.length) throw fail("This purchase order has no step waiting for a decision.", 409);
    const step = Math.min(...pending.map((p) => p.stage.stepNumber));
    const mine = pending.find((p) => p.approverId === user.id && p.stage.stepNumber === step);
    const { isModulePrivilegedUser } = await import("../../config/cfoModulePermissions");
    const row = mine ?? (isModulePrivilegedUser(user) ? pending.find((p) => p.stage.stepNumber === step) : undefined);
    if (!row) throw fail(pending.some((p) => p.approverId === user.id) ? "It is not your step yet: an earlier approval comes first." : "You are not an approver on the step this purchase order is at.", 403);
    const { ApprovalService } = await import("../ApprovalService");
    if (decision === "APPROVE") await ApprovalService.approveApproval({ approvalId: row.id, approverId: user.id, comments: text || undefined });
    else await ApprovalService.rejectApproval({ approvalId: row.id, approverId: user.id, comments: text });
    const after: any = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    await ProcurementDecisionLogService.record({
      entityType: "PurchaseOrder", entityId: po.id, requestId: po.approvalRequestId, approvalId: row.id, stepNumber: row.stage.stepNumber, stepName: row.stage.stepName,
      actorId: user.id, onBehalfOfId: mine ? null : row.approverId, action: decision === "APPROVE" ? "APPROVED" : "REJECTED", comments: text || null,
      previousStatus: "PENDING", resultingStatus: String(after?.approvalStatus ?? "PENDING"),
    });
    await AuditService.log({ userId: user.id, action: decision === "APPROVE" ? "APPROVE_PO" : "REJECT_PO", entityType: "PurchaseOrder", entityId: po.id, newValues: { step: row.stage.stepName, comments: text || null, result: after?.approvalStatus } });
    return this.describeApprovals(po.id);
  }

  /** Purchase orders waiting on the signed-in approver's step. */
  static async queue(user: any) {
    const pending = await prisma.approval.findMany({
      where: { approverId: user.id, status: "PENDING", request: { stageType: "PURCHASE_ORDER", status: "PENDING" } },
      include: { stage: true, request: { include: { approvals: { where: { status: "PENDING" }, include: { stage: true } } } } },
    });
    const mine = pending.filter((a) => a.stage.stepNumber === Math.min(...a.request.approvals.map((x) => x.stage.stepNumber)));
    const pos: any[] = await prisma.purchaseOrder.findMany({ where: { id: { in: mine.map((a) => a.request.entityId) } }, include: { vendor: { select: { name: true } }, currency: { select: { code: true } } } });
    return pos.map((p) => ({ id: p.id, poNumber: p.poNumber, vendor: p.vendor?.name ?? null, amount: Number(p.totalAmount), currencyCode: p.currency?.code ?? null, createdById: p.createdById }));
  }

  /**
   * The approvals a PO stands on, in the order they happened: the requisition's route, the award recommendation's route (when the
   * order came from an award) and the order's own approval.
   */
  static async describeApprovals(poId: string) {
    const po: any = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) throw fail("Purchase order not found", 404);
    const log = async (entityType: string, entityId: string | null) =>
      entityId ? (await ProcurementDecisionLogService.list(entityType, entityId)).map((d: any) => ({ at: d.at ?? d.createdAt, action: d.action, actor: d.actor?.name ?? null, step: d.stepName ?? null, comments: d.comments ?? null })) : [];
    const stages = [
      { stage: "REQUISITION", label: "Purchase requisition", entityId: po.requisitionId, entityType: "PurchaseRequisition" },
      { stage: "AWARD", label: "Award recommendation", entityId: po.awardRecommendationId, entityType: "AwardRecommendation" },
      { stage: "PURCHASE_ORDER", label: "Purchase order", entityId: po.id, entityType: "PurchaseOrder" },
    ];
    const out = [];
    for (const s of stages) {
      if (!s.entityId) continue;
      const decisions = await log(s.entityType, s.entityId);
      let status = "RECORDED";
      if (s.stage === "REQUISITION") {
        const r: any = await prisma.purchaseRequisition.findUnique({ where: { id: s.entityId }, select: { status: true } });
        status = String(r?.status ?? "");
      } else if (s.stage === "AWARD") {
        const r: any = await prisma.rfqAwardRecommendation.findUnique({ where: { id: s.entityId }, select: { status: true } });
        status = String(r?.status ?? "");
      } else status = String(po.approvalStatus);
      out.push({ stage: s.stage, label: s.label, status, decisions });
    }
    return { poId: po.id, poNumber: po.poNumber, approvalStatus: po.approvalStatus, approvedAt: po.approvedAt, approvals: out };
  }
}

function clean(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}
