import { prisma } from "../../utils/database";
import AuditService from "../AuditService";
import { SourcingAccessService } from "./SourcingAccessService";
import { EvaluationService } from "./EvaluationService";
import { ProcurementDecisionLogService } from "../ProcurementDecisionLogService";
import { Decimal } from "@prisma/client/runtime/library";

const fail = (message: string, status = 400, code?: string) => Object.assign(new Error(message), { status, code });
const ENTITY = "AwardRecommendation";

/**
 * SRD §20: the award recommendation package and its approval. It is prepared by an authorised procurement officer (never picked
 * by the system), routed through the configured AWARD_RECOMMENDATION approval route (Configuration, Approval matrix), and an
 * award can be finalised only from an approved recommendation for that quotation.
 */
export class AwardRecommendationService {
  static async latest(rfqId: string) {
    return prisma.rfqAwardRecommendation.findFirst({ where: { rfqId }, orderBy: { version: "desc" } });
  }

  static async describe(rfqId: string) {
    const rec = await this.latest(rfqId);
    if (!rec) return null;
    const [q, preparer, decisions, route] = await Promise.all([
      prisma.vendorQuotation.findUnique({ where: { id: rec.recommendedQuotationId }, select: { id: true, quotationNumber: true, companyName: true, vendorName: true, vendorId: true } }),
      prisma.user.findUnique({ where: { id: rec.preparedById }, select: { firstName: true, lastName: true, email: true } }),
      ProcurementDecisionLogService.list(ENTITY, rec.id),
      this.route(rec),
    ]);
    return {
      id: rec.id,
      version: rec.version,
      status: rec.status,
      recommendedQuotation: q,
      recommendedAmount: Number(rec.recommendedAmount),
      currencyCode: rec.currencyCode,
      justification: rec.justification,
      deviations: rec.deviations,
      evaluationSummary: rec.evaluationSummary,
      supportingDocuments: rec.supportingDocuments,
      preparedBy: { id: rec.preparedById, name: [preparer?.firstName, preparer?.lastName].filter(Boolean).join(" ") || preparer?.email || null },
      submittedAt: rec.submittedAt,
      decidedAt: rec.decidedAt,
      decisionComments: rec.decisionComments,
      route,
      decisions,
    };
  }

  /** The approval route of the recommendation: each step, who decides it and what has been decided. */
  static async route(rec: any) {
    if (!rec.approvalRequestId) return null;
    const req = await prisma.approvalRequest.findUnique({
      where: { id: rec.approvalRequestId },
      include: { approvals: { include: { stage: true, approver: { select: { id: true, firstName: true, lastName: true } } } } },
    });
    if (!req) return null;
    const steps = new Map<number, any>();
    for (const a of req.approvals) {
      const n = a.stage.stepNumber;
      if (!steps.has(n)) steps.set(n, { stepNumber: n, name: a.stage.stepName, approvers: [], status: "UPCOMING" });
      steps.get(n).approvers.push({ id: a.approverId, name: [a.approver.firstName, a.approver.lastName].filter(Boolean).join(" "), status: a.status });
    }
    const list = [...steps.values()].sort((x, y) => x.stepNumber - y.stepNumber);
    const current = Math.min(...req.approvals.filter((a) => a.status === "PENDING").map((a) => a.stage.stepNumber), Infinity);
    for (const s of list) {
      const decided = s.approvers.find((a: any) => a.status === "APPROVED" || a.status === "REJECTED");
      s.status = decided ? decided.status : req.status === "PENDING" ? (s.stepNumber === current ? "WAITING" : "UPCOMING") : "NOT_REACHED";
    }
    return { requestId: req.id, status: req.status, steps: list };
  }

  /** Prepares (creates or revises) the recommendation as a draft. The amount and currency are the quotation's, not typed. */
  static async prepare(
    user: any,
    rfqId: string,
    input: { quotationId: string; justification: string; deviations?: string; supportingDocumentIds?: string[] }
  ) {
    const ctx = await SourcingAccessService.resolve(user, rfqId);
    if (!(ctx.canManage || ctx.canAward)) throw fail("Only an authorised procurement officer prepares an award recommendation.", 403);
    if (ctx.sealed) throw fail(ctx.reason || "The bids have not been opened.", 403, "SEALED_SUBMISSIONS");
    if (ctx.member?.recused) throw fail("You are recused from this evaluation.", 403);
    const rfq = ctx.rfq;
    if (["AWARDED", "CANCELLED", "COMPLETED"].includes(String(rfq.status).toUpperCase())) throw fail(`This event is ${String(rfq.status).toLowerCase()}.`, 409);
    const current = await this.latest(rfqId);
    if (current && ["PENDING_APPROVAL", "APPROVED"].includes(current.status)) {
      throw fail(current.status === "APPROVED" ? "A recommendation is already approved for this event." : "A recommendation is already with the approvers. It cannot be changed while they consider it.", 409);
    }

    const quotation = await prisma.vendorQuotation.findUnique({ where: { id: input.quotationId } });
    if (!quotation || quotation.procurementRfqId !== rfqId) throw fail("That quotation is not on this sourcing event.");
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(quotation.status)) throw fail(`That quotation is ${String(quotation.status).toLowerCase()} and cannot be recommended.`, 409);
    const result = await EvaluationService.consolidate(rfqId, { level: "FULL", member: ctx.member, priceVisible: ctx.priceVisible });
    if (!result.criteria.length) throw fail("No evaluation criteria were set, so there is nothing to base a recommendation on.", 409);
    if (!result.complete) {
      throw fail(
        result.countedEvaluators < result.minEvaluators
          ? `The evaluation is not complete: ${result.countedEvaluators} scorecard(s) submitted, ${result.minEvaluators} required.`
          : `The evaluation is not complete: waiting for ${result.pendingEvaluators.join(", ")} to submit their scorecards.`,
        409,
        "EVALUATION_INCOMPLETE"
      );
    }
    const row = result.rows.find((r: any) => r.quotationId === quotation.id);
    if (!row) throw fail("That quotation has no evaluation result.", 409);
    if (row.disqualified) throw fail(`That supplier failed a mandatory requirement (${row.failedCriteria.join(", ")}) and cannot be recommended.`, 409, "DISQUALIFIED");
    if (row.totalScore == null) {
      throw fail(
        row.converted && row.comparableAmount == null
          ? `That quotation is in ${quotation.currencyCode} and no exchange rate to ${result.reportingCurrencyCode ?? "the reporting currency"} is on record, so it is not comparable. State a rate first.`
          : "That quotation is not fully scored, so it cannot be recommended.",
        409,
        row.converted && row.comparableAmount == null ? "NOT_COMPARABLE" : undefined
      );
    }

    const top = result.rows.filter((r: any) => r.advisoryRank === 1)[0];
    const deviations = String(input.deviations ?? "").trim();
    const justification = String(input.justification ?? "").trim();
    if (justification.length < 20) throw fail("Give the procurement justification (at least a couple of sentences).");
    const deviates = top && top.quotationId !== quotation.id;
    if (deviates && deviations.length < 10) {
      throw fail("This is not the highest-scoring qualified bid. State the deviation and why it is justified.", 400, "DEVIATION_REQUIRED");
    }

    // Supporting documents must be documents of this event's own quotations.
    const docIds = [...new Set((input.supportingDocumentIds ?? []).map(String))];
    let docs: any[] = [];
    if (docIds.length) {
      const rows = await prisma.vendorDocumentAttachment.findMany({ where: { id: { in: docIds }, entityType: "VENDOR_QUOTATION", status: { in: ["ACTIVE", "SUPERSEDED"] } } });
      const qids = new Set((await prisma.vendorQuotation.findMany({ where: { procurementRfqId: rfqId }, select: { id: true } })).map((x) => x.id));
      if (rows.length !== docIds.length || rows.some((d) => !qids.has(String(d.entityId)))) throw fail("A supporting document is not a document of this event.");
      docs = rows.map((d) => ({ id: d.id, fileName: d.originalFileName, sha256: d.sha256Checksum, quotationId: d.entityId }));
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      reportingCurrencyCode: result.reportingCurrencyCode,
      countedEvaluators: result.countedEvaluators,
      passRule: result.passRule,
      committee: result.committee,
      criteria: result.criteria.map((c: any) => ({ name: c.name, kind: c.kind, weight: c.weight, mandatory: c.mandatory })),
      bids: await Promise.all(
        result.rows.map(async (r: any) => {
          const q = await prisma.vendorQuotation.findUnique({ where: { id: r.quotationId }, select: { quotationNumber: true, companyName: true, vendorName: true, currencyCode: true, totalAmount: true } });
          return {
            quotationId: r.quotationId,
            quotationNumber: q?.quotationNumber,
            supplier: q?.companyName || q?.vendorName,
            amount: Number(q?.totalAmount),
            currencyCode: q?.currencyCode,
            technicalScore: r.technicalScore,
            commercialScore: r.commercialScore,
            totalScore: r.totalScore,
            compliance: r.compliance,
            disqualified: r.disqualified,
            advisoryRank: r.advisoryRank,
          };
        })
      ),
    };

    const data = {
      recommendedQuotationId: quotation.id,
      recommendedAmount: new Decimal(Number(quotation.totalAmount)),
      currencyCode: quotation.currencyCode,
      justification,
      deviations: deviations || null,
      evaluationSummary: summary as any,
      supportingDocuments: docs as any,
    };
    let rec;
    if (current && current.status === "DRAFT") {
      rec = await prisma.rfqAwardRecommendation.update({ where: { id: current.id }, data: { ...data, preparedById: user.id } });
    } else {
      if (current) await prisma.rfqAwardRecommendation.update({ where: { id: current.id }, data: { status: "SUPERSEDED" } }).catch(() => undefined);
      rec = await prisma.rfqAwardRecommendation.create({ data: { rfqId, version: (current?.version ?? 0) + 1, status: "DRAFT", preparedById: user.id, ...data } });
    }
    await AuditService.log({ userId: user.id, action: "PREPARE_RECOMMENDATION", entityType: "ProcurementRfq", entityId: rfqId, newValues: { version: rec.version, quotation: quotation.quotationNumber, amount: Number(rec.recommendedAmount), deviates: !!deviates } });
    return this.describe(rfqId);
  }

  /** Sends the draft into the configured approval route. With no route configured it is refused, never auto-approved. */
  static async submit(user: any, rfqId: string) {
    const ctx = await SourcingAccessService.resolve(user, rfqId);
    if (!(ctx.canManage || ctx.canAward)) throw fail("Only an authorised procurement officer submits an award recommendation.", 403);
    const rec = await this.latest(rfqId);
    if (!rec || rec.status !== "DRAFT") throw fail("There is no draft recommendation to submit. Prepare one first.", 409);
    if (rec.preparedById !== user.id) throw fail("Only the officer who prepared the recommendation submits it.", 403);
    const { ApprovalService } = await import("../ApprovalService");
    let created: any = null;
    try {
      created = await ApprovalService.createApprovalRequest({
        stageType: "AWARD_RECOMMENDATION",
        entityId: rec.id,
        entityData: {
          rfqNumber: ctx.rfq.rfqNumber,
          title: ctx.rfq.title,
          totalAmount: String(rec.recommendedAmount),
          currencyCode: rec.currencyCode,
          procurementMethod: ctx.rfq.procurementMethod,
        },
        requestedById: user.id,
      } as any);
    } catch (e: any) {
      if (/No active approval configuration/i.test(String(e?.message))) {
        throw fail("No award approval route is configured. An administrator sets it in Configuration, Approval matrix, Award recommendation route.", 409, "NO_APPROVAL_ROUTE");
      }
      throw e;
    }
    if (!created) throw fail("The award approval route has no steps, so the recommendation cannot be routed.", 409, "NO_APPROVAL_ROUTE");
    await prisma.$transaction([
      prisma.rfqAwardRecommendation.update({ where: { id: rec.id }, data: { status: "PENDING_APPROVAL", submittedAt: new Date(), approvalRequestId: created.approvalRequest.id } }),
      prisma.procurementRfq.update({ where: { id: rfqId }, data: { recommendationStatus: "PENDING_APPROVAL", awardedQuotationId: null } }),
    ]);
    { const { ProcurementLifecycleService } = await import("../status/ProcurementLifecycleService"); await ProcurementLifecycleService.advanceRfq(rfqId, "AWAITING_APPROVAL"); }
    await ProcurementDecisionLogService.record({ entityType: ENTITY, entityId: rec.id, requestId: created.approvalRequest.id, actorId: user.id, action: "SUBMITTED", previousStatus: "DRAFT", resultingStatus: "PENDING_APPROVAL", detail: { version: rec.version } });
    await AuditService.log({ userId: user.id, action: "SUBMIT_RECOMMENDATION", entityType: "ProcurementRfq", entityId: rfqId, newValues: { version: rec.version, steps: created.approvalRequest.totalSteps } });
    return this.describe(rfqId);
  }

  /** An approver's decision on the recommendation, through the approval route (limits, level and separation of duties apply). */
  static async decide(user: any, rfqId: string, decision: "APPROVE" | "REJECT", comments?: string) {
    const rec = await this.latest(rfqId);
    if (!rec || rec.status !== "PENDING_APPROVAL" || !rec.approvalRequestId) throw fail("No recommendation is waiting for approval on this event.", 409);
    const text = String(comments ?? "").trim();
    if (decision === "REJECT" && text.length < 3) throw fail("A reason is required to reject a recommendation.");
    const pending = await prisma.approval.findMany({ where: { requestId: rec.approvalRequestId, status: "PENDING" }, include: { stage: true } });
    if (!pending.length) throw fail("This recommendation has no step waiting for a decision.", 409);
    const step = Math.min(...pending.map((p) => p.stage.stepNumber));
    const mine = pending.find((p) => p.approverId === user.id && p.stage.stepNumber === step);
    const { isModulePrivilegedUser } = await import("../../config/cfoModulePermissions");
    const row = mine ?? (isModulePrivilegedUser(user) ? pending.find((p) => p.stage.stepNumber === step) : undefined);
    if (!row) throw fail(pending.some((p) => p.approverId === user.id) ? "It is not your step yet: an earlier approval comes first." : "You are not an approver on the step this recommendation is at.", 403);
    const { ApprovalService } = await import("../ApprovalService");
    if (decision === "APPROVE") await ApprovalService.approveApproval({ approvalId: row.id, approverId: user.id, comments: text || undefined });
    else await ApprovalService.rejectApproval({ approvalId: row.id, approverId: user.id, comments: text });
    const after = await this.latest(rfqId);
    await ProcurementDecisionLogService.record({
      entityType: ENTITY, entityId: rec.id, requestId: rec.approvalRequestId, approvalId: row.id, stepNumber: row.stage.stepNumber, stepName: row.stage.stepName,
      actorId: user.id, onBehalfOfId: mine ? null : row.approverId, action: decision === "APPROVE" ? "APPROVED" : "REJECTED", comments: text || null,
      previousStatus: "PENDING_APPROVAL", resultingStatus: after?.status === "APPROVED" ? "APPROVED" : after?.status === "REJECTED" ? "REJECTED" : "PENDING_APPROVAL",
    });
    await AuditService.log({ userId: user.id, action: decision === "APPROVE" ? "APPROVE_RECOMMENDATION" : "REJECT_RECOMMENDATION", entityType: "ProcurementRfq", entityId: rfqId, newValues: { step: row.stage.stepName, comments: text || null, result: after?.status } });
    return this.describe(rfqId);
  }

  /**
   * The award gate. A quotation is awarded only when the event has been formally opened, the latest recommendation is APPROVED,
   * it names this quotation, and the figure has not moved since it was recommended.
   */
  static async assertAwardable(quotation: any, actorId: string) {
    const rfq: any = await prisma.procurementRfq.findUnique({ where: { id: quotation.procurementRfqId } });
    if (!rfq) return;
    const { phaseOf } = await import("./SourcingAccessService");
    if (phaseOf(rfq) !== "OPENED") throw fail("The bids have not been opened, so nothing can be awarded.", 409, "NOT_OPENED");
    const rec = await this.latest(rfq.id);
    if (!rec) throw fail("An award needs an approved award recommendation. None has been prepared for this event.", 409, "NO_RECOMMENDATION");
    if (rec.status === "PENDING_APPROVAL") throw fail("The award recommendation is still with the approvers. Award after it is approved.", 409, "RECOMMENDATION_PENDING");
    if (rec.status !== "APPROVED") throw fail(`The award recommendation is ${String(rec.status).toLowerCase()}; an award needs an approved recommendation.`, 409, "RECOMMENDATION_NOT_APPROVED");
    if (rec.recommendedQuotationId !== quotation.id) throw fail("The approved recommendation names a different quotation. Recommend and approve this one first.", 409, "WRONG_QUOTATION");
    if (Math.abs(Number(quotation.totalAmount) - Number(rec.recommendedAmount)) > 0.005) throw fail("The quotation's total no longer matches the approved recommendation.", 409, "AMOUNT_CHANGED");
    const requester = await prisma.user.findUnique({ where: { id: actorId }, include: { role: true } });
    const { userHasEffectivePermission, isModulePrivilegedUser } = await import("../../config/cfoModulePermissions");
    const { PROCUREMENT_PERMISSIONS: P } = await import("../../config/procurementPermissions");
    if (!(isModulePrivilegedUser(requester) || userHasEffectivePermission(requester, P.rfqAward))) throw fail("Only an award authority finalises an award.", 403);
    await AuditService.log({ userId: actorId, action: "AWARD_FINALISE", entityType: "ProcurementRfq", entityId: rfq.id, newValues: { recommendation: rec.id, version: rec.version, quotation: quotation.quotationNumber } });
  }
}
