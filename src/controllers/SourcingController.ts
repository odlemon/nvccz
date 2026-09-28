// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import AuditService from "../services/AuditService";
import { publicErrorMessage } from "../utils/publicErrorMessage";
import { serializeDecimalsDeep } from "../utils/prismaDecimalJson";
import { userHasEffectivePermission, isModulePrivilegedUser } from "../config/cfoModulePermissions";
import { PROCUREMENT_PERMISSIONS as P } from "../config/procurementPermissions";
import { SourcingAccessService } from "../services/sourcing/SourcingAccessService";
import { BidOpeningService } from "../services/sourcing/BidOpeningService";
import { EvaluationService } from "../services/sourcing/EvaluationService";
import { QuotationCaptureService, CAPTURE_CHANNELS } from "../services/sourcing/QuotationCaptureService";
import { SourcingComparisonService } from "../services/sourcing/SourcingComparisonService";
import { AwardRecommendationService } from "../services/sourcing/AwardRecommendationService";

/**
 * SRD §15-§20 endpoints. Access to submissions is decided in SourcingAccessService, never here and never by the client.
 */
const user = (req: Request) => (req as any).user;
const fail = (res: Response, e: any, fallback: string) => {
  const status = e?.statusCode || e?.status || 400;
  return res.status(status).json({ success: false, message: publicErrorMessage(e, fallback), code: e?.code });
};
const ok = (res: Response, data: any, message?: string, status = 200) => res.status(status).json({ success: true, message, data: serializeDecimalsDeep(data) });

/** The event's id from a path that carries either its id or its number. */
async function rfqOf(req: Request) {
  const rfq = await SourcingAccessService.loadRfq(req.params.id);
  if (!rfq) throw Object.assign(new Error("Sourcing event not found"), { status: 404 });
  return rfq;
}

export class SourcingController {
  /** One call for the sourcing screens: phase, my level, criteria, committee, my declaration, opening, recommendation. */
  static async state(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      const u = user(req);
      const ctx = await SourcingAccessService.resolve(u, rfq);
      const canView = ctx.member || ctx.canManage || ctx.canAward || ctx.canOpen || userHasEffectivePermission(u, P.rfqView) || isModulePrivilegedUser(u);
      if (!canView) return res.status(403).json({ success: false, message: "You have no role on this sourcing event." });
      const [criteria, committee, opening, settings, options, rec, invited] = await Promise.all([
        EvaluationService.criteria(rfq.id),
        EvaluationService.committee(rfq.id),
        BidOpeningService.describe(rfq.id),
        EvaluationService.settings(),
        EvaluationService.declarationOptions(true),
        ctx.level === "FULL" || ctx.canAward ? AwardRecommendationService.describe(rfq.id) : null,
        ctx.canCapture || ctx.canManage
          ? prisma.rfqVendorInvitation.findMany({ where: { procurementRfqId: rfq.id }, include: { vendor: { select: { id: true, name: true, vendorCode: true } } } })
          : [],
      ]);
      const live = await prisma.vendorQuotation.count({ where: { procurementRfqId: rfq.id, status: { in: ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED"] } } });
      // Who can be appointed to the committee or recorded as attending an opening: active staff, for those who set either up.
      const people =
        ctx.canManage || ctx.canOpen
          ? (await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true, email: true, userDepartment: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }], take: 500 })).map((p) => ({
              id: p.id,
              name: [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email,
              department: p.userDepartment ?? null,
            }))
          : [];
      return ok(res, {
        rfq: { id: rfq.id, rfqNumber: rfq.rfqNumber, title: rfq.title, status: rfq.status, closingAt: rfq.closingAt, sealedBidding: !!rfq.sealedBidding, evaluationMode: rfq.evaluationMode, passRule: rfq.passRule, minEvaluators: rfq.minEvaluators, bidOpenedAt: rfq.bidOpenedAt, criteriaLockedAt: rfq.criteriaLockedAt },
        phase: ctx.phase,
        level: ctx.level,
        priceVisible: ctx.priceVisible,
        reason: ctx.reason,
        submissions: live,
        can: { open: ctx.canOpen, capture: ctx.canCapture, manage: ctx.canManage, award: ctx.canAward },
        me: ctx.member ? { role: ctx.member.role, declaration: ctx.member.declarationCode, declaredAt: ctx.member.declaredAt, recused: ctx.member.recused, scorecardSubmittedAt: ctx.member.scorecardSubmittedAt } : null,
        criteria,
        committee: committee.map((m) => ({ userId: m.userId, name: m.name, department: m.department, role: m.role, declared: !!m.declarationCode, declaration: m.declarationCode, recused: m.recused, scorecardSubmittedAt: m.scorecardSubmittedAt })),
        declarationOptions: options.map((o) => ({ code: o.code, label: o.label, statement: o.statement, effect: o.effect, requiresDetails: o.requiresDetails })),
        settings: { requireDeclaration: settings.requireDeclaration, minAttendees: settings.minAttendees, hasDefaultCriteria: settings.defaultCriteria.length > 0 },
        opening,
        recommendation: rec,
        invitedSuppliers: invited.map((i: any) => ({ id: i.vendorId, name: i.vendor?.name, code: i.vendor?.vendorCode })),
        captureChannels: CAPTURE_CHANNELS,
        people,
      });
    } catch (e) {
      return fail(res, e, "Failed to load the sourcing event");
    }
  }

  /**
   * Work for the signed-in person in the award process: recommendations waiting for their decision, and approved
   * recommendations waiting to be finalised as an award (for award authorities).
   */
  static async awardQueue(req: Request, res: Response) {
    try {
      const u = user(req);
      const pending = await prisma.approval.findMany({
        where: { approverId: u.id, status: "PENDING", request: { stageType: "AWARD_RECOMMENDATION", status: "PENDING" } },
        include: { stage: true, request: { include: { approvals: { where: { status: "PENDING" }, include: { stage: true } } } } },
      });
      const mine = pending.filter((a) => a.stage.stepNumber === Math.min(...a.request.approvals.map((x) => x.stage.stepNumber)));
      const recs = await prisma.rfqAwardRecommendation.findMany({ where: { id: { in: mine.map((a) => a.request.entityId) } } });
      const rfqs = await prisma.procurementRfq.findMany({ where: { id: { in: recs.map((r) => r.rfqId) } }, select: { id: true, rfqNumber: true, title: true } });
      const quotes = await prisma.vendorQuotation.findMany({ where: { id: { in: recs.map((r) => r.recommendedQuotationId) } }, select: { id: true, quotationNumber: true, companyName: true, vendorName: true } });
      const shape = (r: any) => ({
        recommendationId: r.id,
        rfqId: r.rfqId,
        rfqNumber: rfqs.find((x) => x.id === r.rfqId)?.rfqNumber,
        title: rfqs.find((x) => x.id === r.rfqId)?.title,
        version: r.version,
        supplier: quotes.find((x) => x.id === r.recommendedQuotationId)?.companyName || quotes.find((x) => x.id === r.recommendedQuotationId)?.vendorName,
        quotationId: r.recommendedQuotationId,
        quotationNumber: quotes.find((x) => x.id === r.recommendedQuotationId)?.quotationNumber,
        amount: Number(r.recommendedAmount),
        currencyCode: r.currencyCode,
        deviations: r.deviations,
        preparedById: r.preparedById,
      });
      const canAward = userHasEffectivePermission(u, P.rfqAward) || isModulePrivilegedUser(u);
      let toAward: any[] = [];
      if (canAward) {
        const approved = await prisma.rfqAwardRecommendation.findMany({ where: { status: "APPROVED" }, orderBy: { decidedAt: "desc" }, take: 100 });
        const latestByRfq = new Map<string, any>();
        for (const r of approved) if (!latestByRfq.has(r.rfqId)) latestByRfq.set(r.rfqId, r);
        const cand = [...latestByRfq.values()];
        const qs = await prisma.vendorQuotation.findMany({ where: { id: { in: cand.map((r) => r.recommendedQuotationId) }, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } }, select: { id: true } });
        const open = new Set(qs.map((x) => x.id));
        const more = cand.filter((r) => open.has(r.recommendedQuotationId));
        const rf2 = await prisma.procurementRfq.findMany({ where: { id: { in: more.map((r) => r.rfqId) } }, select: { id: true, rfqNumber: true, title: true } });
        const q2 = await prisma.vendorQuotation.findMany({ where: { id: { in: more.map((r) => r.recommendedQuotationId) } }, select: { id: true, quotationNumber: true, companyName: true, vendorName: true } });
        toAward = more.map((r) => ({
          recommendationId: r.id, rfqId: r.rfqId, rfqNumber: rf2.find((x) => x.id === r.rfqId)?.rfqNumber, title: rf2.find((x) => x.id === r.rfqId)?.title, version: r.version,
          supplier: q2.find((x) => x.id === r.recommendedQuotationId)?.companyName || q2.find((x) => x.id === r.recommendedQuotationId)?.vendorName,
          quotationId: r.recommendedQuotationId, quotationNumber: q2.find((x) => x.id === r.recommendedQuotationId)?.quotationNumber, amount: Number(r.recommendedAmount), currencyCode: r.currencyCode,
        }));
      }
      return ok(res, { toDecide: recs.map(shape), toAward });
    } catch (e) {
      return fail(res, e, "Failed to load the award queue");
    }
  }

  static async comparison(req: Request, res: Response) {
    try {
      // Even the count is for people with a role on the event: procurement staff, award authorities, or a committee member.
      const rfq = await rfqOf(req);
      const u = user(req);
      const c = await SourcingAccessService.resolve(u, rfq);
      if (!(c.member || c.canManage || c.canAward || c.canOpen || userHasEffectivePermission(u, P.rfqView) || userHasEffectivePermission(u, P.quotationsView) || isModulePrivilegedUser(u))) {
        return res.status(403).json({ success: false, message: "Insufficient permissions. Required one of: procurement.rfq.view" });
      }
      return ok(res, await SourcingComparisonService.compare(u, req.params.id));
    } catch (e) {
      return fail(res, e, "Failed to build the comparison");
    }
  }

  // ------------------------------------------------------------------ opening
  static async open(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      return ok(res, await BidOpeningService.open(user(req), rfq.id, { attendees: req.body?.attendees, notes: req.body?.notes }), "Bids opened", 201);
    } catch (e) {
      return fail(res, e, "Failed to open the bids");
    }
  }

  static async opening(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      return ok(res, await BidOpeningService.describe(rfq.id));
    } catch (e) {
      return fail(res, e, "Failed to load the opening record");
    }
  }

  static async setFxRate(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      return ok(res, await BidOpeningService.setFxRate(user(req), rfq.id, req.body || {}), "Exchange rate recorded");
    } catch (e) {
      return fail(res, e, "Failed to record the exchange rate");
    }
  }

  static async verifyOpening(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      return ok(res, await BidOpeningService.verify(rfq.id));
    } catch (e) {
      return fail(res, e, "Failed to verify the opening record");
    }
  }

  // ------------------------------------------------------------------ capture
  static async capture(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      let payload: any = req.body?.payload;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return res.status(400).json({ success: false, message: "The quotation details could not be read." });
        }
      }
      payload = payload || req.body;
      const f: any = (req as any).files || {};
      const files = [
        ...(f.documents || []).map((x: any) => ({ ...x, envelope: "COMMERCIAL" })),
        ...(f.technicalDocuments || []).map((x: any) => ({ ...x, envelope: "TECHNICAL" })),
      ];
      return ok(res, await QuotationCaptureService.capture(user(req), rfq.id, payload, files), "Quotation captured", 201);
    } catch (e) {
      return fail(res, e, "Failed to capture the quotation");
    }
  }

  /** Recomputes the hash of the record as submitted: false means it was altered after submission. */
  static async verifyQuotation(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      await SourcingAccessService.assertCanSeeSubmissions(user(req), rfq, "verify a quotation");
      const q: any = await prisma.vendorQuotation.findFirst({ where: { id: req.params.qid, procurementRfqId: rfq.id }, include: { items: true } });
      if (!q) return res.status(404).json({ success: false, message: "Quotation not found" });
      const { submissionSnapshot, hashSnapshot } = await import("../services/sourcing/QuotationTotals");
      const now = hashSnapshot(submissionSnapshot(q, q.items));
      return ok(res, { quotationNumber: q.quotationNumber, recorded: !!q.snapshotSha256, intact: q.snapshotSha256 ? now === q.snapshotSha256 : null, sha256: q.snapshotSha256 });
    } catch (e) {
      return fail(res, e, "Failed to verify the quotation");
    }
  }

  // ------------------------------------------------------------------ evaluation
  static async setCriteria(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      return ok(res, await EvaluationService.setCriteria(user(req), rfq.id, req.body || {}), "Criteria saved");
    } catch (e) {
      return fail(res, e, "Failed to save the criteria");
    }
  }

  static async applyDefaultCriteria(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      const s = await EvaluationService.settings();
      if (!s.defaultCriteria.length) return res.status(409).json({ success: false, message: "No default criteria are configured." });
      return ok(res, await EvaluationService.setCriteria(user(req), rfq.id, { criteria: s.defaultCriteria }), "Default criteria applied");
    } catch (e) {
      return fail(res, e, "Failed to apply the default criteria");
    }
  }

  static async setCommittee(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      return ok(res, await EvaluationService.setCommittee(user(req), rfq.id, req.body?.members || []), "Committee saved");
    } catch (e) {
      return fail(res, e, "Failed to save the committee");
    }
  }

  static async declare(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      return ok(res, await EvaluationService.declare(user(req), rfq.id, req.body || {}), "Declaration recorded");
    } catch (e) {
      return fail(res, e, "Failed to record the declaration");
    }
  }

  static async saveScores(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      return ok(res, await EvaluationService.saveScores(user(req), rfq.id, req.body || {}), "Scores saved");
    } catch (e) {
      return fail(res, e, "Failed to save the scores");
    }
  }

  static async myScorecard(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      return ok(res, await EvaluationService.myScorecard(user(req), rfq.id));
    } catch (e) {
      return fail(res, e, "Failed to load your scorecard");
    }
  }

  static async submitScorecard(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      return ok(res, await EvaluationService.submitScorecard(user(req), rfq.id), "Scorecard submitted");
    } catch (e) {
      return fail(res, e, "Failed to submit the scorecard");
    }
  }

  static async consolidation(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      const ctx = await SourcingAccessService.assertCanSeeSubmissions(user(req), rfq, "the consolidated evaluation");
      return ok(res, await EvaluationService.consolidate(rfq.id, { level: ctx.level, member: ctx.member, priceVisible: ctx.priceVisible }));
    } catch (e) {
      return fail(res, e, "Failed to consolidate the evaluation");
    }
  }

  static async declarationOptions(_req: Request, res: Response) {
    try {
      return ok(res, await EvaluationService.declarationOptions(false));
    } catch (e) {
      return fail(res, e, "Failed to load the declaration wording");
    }
  }

  static async saveDeclarationOption(req: Request, res: Response) {
    try {
      return ok(res, await EvaluationService.saveDeclarationOption(user(req), { ...(req.body || {}), id: req.params.id || req.body?.id }), "Declaration wording saved");
    } catch (e) {
      return fail(res, e, "Failed to save the declaration wording");
    }
  }

  // ------------------------------------------------------------------ recommendation
  static async prepareRecommendation(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      return ok(res, await AwardRecommendationService.prepare(user(req), rfq.id, req.body || {}), "Recommendation prepared");
    } catch (e) {
      return fail(res, e, "Failed to prepare the recommendation");
    }
  }

  static async submitRecommendation(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      return ok(res, await AwardRecommendationService.submit(user(req), rfq.id), "Recommendation submitted for approval");
    } catch (e) {
      return fail(res, e, "Failed to submit the recommendation");
    }
  }

  static async decideRecommendation(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      const d = String(req.body?.decision ?? "").toUpperCase();
      if (!["APPROVE", "APPROVED", "REJECT", "REJECTED"].includes(d)) return res.status(400).json({ success: false, message: "Decision must be APPROVE or REJECT." });
      return ok(res, await AwardRecommendationService.decide(user(req), rfq.id, d.startsWith("APPROVE") ? "APPROVE" : "REJECT", req.body?.comments), "Decision recorded");
    } catch (e) {
      return fail(res, e, "Failed to record the decision");
    }
  }

  static async recommendation(req: Request, res: Response) {
    try {
      const rfq = await rfqOf(req);
      const ctx = await SourcingAccessService.resolve(user(req), rfq);
      if (ctx.level !== "FULL" && !ctx.canAward) return res.status(403).json({ success: false, message: "The recommendation is available to the procurement team and the approvers." });
      return ok(res, await AwardRecommendationService.describe(rfq.id));
    } catch (e) {
      return fail(res, e, "Failed to load the recommendation");
    }
  }

  static gone(message: string) {
    return (_req: Request, res: Response) => res.status(410).json({ success: false, message });
  }
}
