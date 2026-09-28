import { prisma } from "../../utils/database";
import AuditService from "../AuditService";
import { userHasEffectivePermission, isModulePrivilegedUser } from "../../config/cfoModulePermissions";
import { PROCUREMENT_PERMISSIONS as P } from "../../config/procurementPermissions";

/**
 * SRD §16: the one place that decides what a member of staff may see of a sourcing event's submissions.
 *
 * Phases of a sealed event:
 *   OPEN           before the closing deadline: submissions are inaccessible to every interactive user, administrators included.
 *   CLOSED_SEALED  after the deadline, before formal opening: still inaccessible; an authorised user may open them.
 *   OPENED         after formal opening: released by role.
 *
 * Levels after opening:
 *   FULL       procurement officers/managers, award authorities, administrators, auditors: everything, incl. documents and prices.
 *   EVALUATOR  a committee member who has declared and is not recused: the submissions, prices unless the event is two-envelope
 *              and their own scorecard is not yet submitted.
 *   COUNT      everyone else, and a recused member whatever their role: how many, nothing more.
 * Nothing here trusts the client: every read path (lists, single records, comparison, documents, exports, notifications, dashboard)
 * goes through resolve() and the sanitisers below.
 */
export type Phase = "OPEN" | "CLOSED_SEALED" | "OPENED";
export type Level = "COUNT" | "EVALUATOR" | "FULL";

// Closed is not decided: after the closing time a sealed event is still sealed until its bids are formally opened.
const DECIDED = new Set(["AWARDED", "CANCELLED", "COMPLETED"]);

export type SourcingContext = {
  rfq: any;
  phase: Phase;
  sealed: boolean;
  level: Level;
  member: any | null;
  /** Prices, VAT, totals and commercial documents may be shown to this person now. */
  priceVisible: boolean;
  canOpen: boolean;
  canCapture: boolean;
  canManage: boolean;
  canAward: boolean;
  reason: string | null;
};

export function phaseOf(rfq: any, now: Date = new Date()): Phase {
  if (!rfq) return "OPENED";
  if (!rfq.sealedBidding) return "OPENED";
  if (rfq.bidOpenedAt) return "OPENED";
  // Events decided before sealing existed carry no opening stamp; they are not re-sealed.
  if (DECIDED.has(String(rfq.status || "").toUpperCase())) return "OPENED";
  if (rfq.closingAt && now.getTime() < new Date(rfq.closingAt).getTime()) return "OPEN";
  return "CLOSED_SEALED";
}

const SEALED_REASON: Record<Phase, string | null> = {
  OPEN: "Submissions are sealed until the closing deadline. Nobody can view them before then.",
  CLOSED_SEALED: "The deadline has passed but the bids have not been formally opened. Submissions stay sealed until an authorised user opens them.",
  OPENED: null,
};

export class SourcingAccessService {
  static async loadRfq(idOrNumber: string) {
    return prisma.procurementRfq.findFirst({ where: { OR: [{ id: idOrNumber }, { rfqNumber: idOrNumber }] } });
  }

  static async resolve(user: any, rfqOrId: any): Promise<SourcingContext> {
    const rfq = typeof rfqOrId === "string" ? await this.loadRfq(rfqOrId) : rfqOrId;
    if (!rfq) throw Object.assign(new Error("Sourcing event not found"), { status: 404 });
    const phase = phaseOf(rfq);
    const sealed = phase !== "OPENED";
    const has = (perm: string) => userHasEffectivePermission(user, perm) || isModulePrivilegedUser(user);
    const member = user?.id
      ? await prisma.rfqEvaluationMember.findUnique({ where: { rfqId_userId: { rfqId: rfq.id, userId: user.id } } })
      : null;
    const canManage = has(P.rfqManage);
    const canAward = has(P.rfqAward);
    const canOpen = has(P.bidsOpen);
    const canCapture = has(P.quotationsCapture);
    const fullRole = isModulePrivilegedUser(user) || canManage || canAward || canOpen || has(P.quotationsManage) || has(P.auditView);

    let level: Level = "COUNT";
    let reason: string | null = SEALED_REASON[phase];
    if (!sealed) {
      if (member?.recused) {
        reason = "You are recused from this evaluation, so its submissions are not available to you.";
      } else if (fullRole) {
        level = "FULL";
        reason = null;
      } else if (member && member.declarationCode) {
        level = "EVALUATOR";
        reason = null;
      } else if (member) {
        reason = "Confirm your declaration to see the submissions you are asked to evaluate.";
      } else {
        reason = "Submissions are released to the procurement team and the evaluation committee.";
      }
    }
    // Two-envelope: a committee member sees prices only once their own technical scorecard is submitted, whatever else their role.
    const twoEnvelopeLocked = !!member && !member.recused && rfq.evaluationMode === "TWO_ENVELOPE" && !member.scorecardSubmittedAt;
    const priceVisible = level !== "COUNT" && !twoEnvelopeLocked;
    return { rfq, phase, sealed, level, member, priceVisible, canOpen, canCapture, canManage, canAward, reason };
  }

  /** A denied attempt is recorded: the audit trail is the evidence that the seal held. */
  static async recordDenied(user: any, rfqId: string, what: string, ctx: SourcingContext) {
    await AuditService.log({
      userId: user?.id ?? null,
      action: "SEALED_ACCESS_DENIED",
      entityType: "ProcurementRfq",
      entityId: rfqId,
      newValues: { attempted: what, phase: ctx.phase, level: ctx.level },
    }).catch(() => undefined);
  }

  /** Throws unless the person may see the event's submissions at all. */
  static async assertCanSeeSubmissions(user: any, rfqOrId: any, what = "submissions") {
    const ctx = await this.resolve(user, rfqOrId);
    if (ctx.level === "COUNT") {
      await this.recordDenied(user, ctx.rfq.id, what, ctx);
      throw Object.assign(new Error(ctx.reason || "These submissions are not available to you."), { status: 403, code: "SEALED_SUBMISSIONS" });
    }
    return ctx;
  }

  static async assertCanSeePrices(user: any, rfqOrId: any, what = "prices") {
    const ctx = await this.assertCanSeeSubmissions(user, rfqOrId, what);
    if (!ctx.priceVisible) {
      await this.recordDenied(user, ctx.rfq.id, what, ctx);
      throw Object.assign(new Error("Pricing is released to you after you submit your technical scorecard."), { status: 403, code: "PRICES_NOT_RELEASED" });
    }
    return ctx;
  }

  // ------------------------------------------------------------------ sanitisers

  /** Removes what the person's level does not permit from one quotation (as returned to a staff user). */
  static sanitizeQuotation(q: any, ctx: SourcingContext): any | null {
    if (!q) return q;
    if (ctx.level === "COUNT") return null;
    const out: any = { ...q };
    // A stored file address is never handed to a browser: documents are fetched through the authorised download endpoint.
    delete out.attachments;
    delete out.submittedSnapshot;
    if (!ctx.priceVisible) {
      for (const k of ["subtotal", "taxAmount", "totalAmount", "vatRate", "notes", "reviewNotes"]) out[k] = null;
      out.items = (q.items || []).map((it: any) => ({ ...it, unitPrice: null, totalPrice: null }));
      out.pricesWithheld = true;
      out.pricesWithheldReason = "Pricing is released after you submit your technical scorecard.";
    }
    // What the supplier declared (warranty, local content...) stays; the evaluators' own marks never travel with a quotation.
    if (out.technicalScoreJson && typeof out.technicalScoreJson === "object") {
      const { evaluation: _e, evaluators: _v, ...declared } = out.technicalScoreJson as any;
      out.technicalScoreJson = declared;
    }
    return out;
  }

  /**
   * Filters a mixed list of quotations down to what the person may read, sanitised, plus a count of what is sealed per event.
   * Quotations that belong to no sourcing event are not sealed.
   */
  static async forStaff(list: any[], user: any) {
    const cache = new Map<string, SourcingContext>();
    const visible: any[] = [];
    const sealed = new Map<string, { rfqId: string; rfqNumber: string; count: number; phase: Phase; reason: string | null }>();
    for (const q of list) {
      const rfqId = q.procurementRfqId as string | null;
      if (!rfqId) {
        visible.push(q);
        continue;
      }
      let ctx = cache.get(rfqId);
      if (!ctx) {
        ctx = await this.resolve(user, rfqId);
        cache.set(rfqId, ctx);
      }
      const clean = this.sanitizeQuotation(q, ctx);
      if (clean) visible.push(clean);
      else {
        const cur = sealed.get(rfqId) ?? { rfqId, rfqNumber: ctx.rfq.rfqNumber, count: 0, phase: ctx.phase, reason: ctx.reason };
        cur.count += 1;
        sealed.set(rfqId, cur);
      }
    }
    return { visible, sealed: [...sealed.values()] };
  }

  /** What a list endpoint may tell a person about an event whose submissions they cannot see. */
  static countOnly(count: number, ctx: SourcingContext) {
    return { sealed: true, count, reason: ctx.reason, phase: ctx.phase };
  }

  /** The rfq numbers/ids whose submissions the person may currently read (used to filter cross-event lists). */
  static async readableRfqIds(user: any, rfqIds: string[]): Promise<Set<string>> {
    const ids = [...new Set(rfqIds.filter(Boolean))];
    if (!ids.length) return new Set();
    const rfqs = await prisma.procurementRfq.findMany({ where: { id: { in: ids } } });
    const readable = new Set<string>();
    for (const r of rfqs) {
      const ctx = await this.resolve(user, r);
      if (ctx.level !== "COUNT") readable.add(r.id);
    }
    return readable;
  }
}
