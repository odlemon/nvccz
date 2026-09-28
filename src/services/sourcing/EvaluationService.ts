import { prisma } from "../../utils/database";
import AuditService from "../AuditService";
import { SourcingAccessService } from "./SourcingAccessService";
import { Decimal } from "@prisma/client/runtime/library";
import { userHasEffectivePermission, isModulePrivilegedUser } from "../../config/cfoModulePermissions";
import { PROCUREMENT_PERMISSIONS as P } from "../../config/procurementPermissions";

const fail = (message: string, status = 400, code?: string) => Object.assign(new Error(message), { status, code });

export const CRITERION_CATEGORIES = ["COMPLIANCE", "TECHNICAL", "PRICE", "DELIVERY", "EXPERIENCE", "METHODOLOGY", "SUPPORT", "LOCAL", "OTHER"] as const;
export const CRITERION_KINDS = ["PASS_FAIL", "SCORED", "PRICE"] as const;
export const EVALUATION_MODES = ["SINGLE_ENVELOPE", "TWO_ENVELOPE"] as const;
export const PASS_RULES = ["ALL", "MAJORITY"] as const;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const LIVE_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED"];

/**
 * SRD §17-§19: configurable criteria, committee, declarations, individual scorecards, and the consolidation that turns them into
 * a technical, commercial and total score.
 *
 * The maths, in full (so it can be checked by hand):
 *   - a SCORED criterion is entered 0..maxScore by each evaluator and normalised to 0..100 (score / maxScore x 100); the
 *     committee's mark is the plain average of the counted evaluators;
 *   - a PASS_FAIL criterion passes when every counted evaluator passes it (rule ALL) or more than half do (MAJORITY);
 *   - a mandatory PASS_FAIL criterion that fails DISQUALIFIES the bid: it is excluded from ranking and cannot be recommended;
 *   - the PRICE criterion is never scored by hand: the lowest comparable total among qualified bids scores 100, every other bid
 *     scores lowest / its total x 100 (totals in the reporting currency at the rates frozen at bid opening);
 *   - Technical score = sum(weight x mark) / sum(weight) over the scored, non-price criteria;
 *     Commercial score = the price mark;
 *     Total score = sum(weight x mark) / sum(weight) over the scored criteria and the price criterion (weights are percentages);
 *   - counted evaluators are committee members who are not recused and have submitted their scorecard.
 */
export class EvaluationService {
  static async settings() {
    const row: any = await prisma.procurementSettings.findUnique({ where: { id: "default" } }).catch(() => null);
    return {
      requireDeclaration: row?.requireEvaluatorDeclaration !== false,
      minAttendees: Number(row?.minOpeningAttendees ?? 2),
      defaultCriteria: Array.isArray(row?.defaultEvaluationCriteria) ? row.defaultEvaluationCriteria : [],
    };
  }

  // ------------------------------------------------------------------ criteria
  static async criteria(rfqId: string) {
    const rows = await prisma.rfqEvaluationCriterion.findMany({ where: { rfqId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return rows.map((c) => ({ ...c, weight: Number(c.weight) }));
  }

  static async setCriteria(
    user: any,
    rfqId: string,
    input: { criteria: Array<any>; evaluationMode?: string; passRule?: string; minEvaluators?: number }
  ) {
    const ctx = await SourcingAccessService.resolve(user, rfqId);
    if (!ctx.canManage) throw fail("Only the procurement team configures evaluation criteria.", 403);
    if (ctx.rfq.criteriaLockedAt || ctx.rfq.bidOpenedAt) {
      throw fail("Evaluation criteria are locked once the bids are opened, so they cannot be tuned to the submissions.", 409, "CRITERIA_LOCKED");
    }
    const list = Array.isArray(input.criteria) ? input.criteria : [];
    if (!list.length) throw fail("At least one evaluation criterion is required.");
    if (list.length > 30) throw fail("At most 30 criteria.");
    const seen = new Set<string>();
    const cleaned = list.map((c, i) => {
      const name = String(c?.name ?? "").trim();
      if (!name) throw fail(`Criterion ${i + 1}: a name is required.`);
      const code = String(c?.code ?? name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || `C${i + 1}`;
      if (seen.has(code)) throw fail(`Criterion ${i + 1}: "${name}" repeats another criterion's code.`);
      seen.add(code);
      const kind = String(c?.kind ?? "SCORED").toUpperCase();
      if (!(CRITERION_KINDS as readonly string[]).includes(kind)) throw fail(`Criterion "${name}": kind must be one of ${CRITERION_KINDS.join(", ")}.`);
      const category = String(c?.category ?? "TECHNICAL").toUpperCase();
      if (!(CRITERION_CATEGORIES as readonly string[]).includes(category)) throw fail(`Criterion "${name}": category must be one of ${CRITERION_CATEGORIES.join(", ")}.`);
      const weight = kind === "PASS_FAIL" ? 0 : Number(c?.weight ?? 0);
      if (!Number.isFinite(weight) || weight < 0 || weight > 100) throw fail(`Criterion "${name}": the weight must be from 0 to 100.`);
      const maxScore = Number(c?.maxScore ?? 100);
      if (!Number.isInteger(maxScore) || maxScore < 1 || maxScore > 1000) throw fail(`Criterion "${name}": the maximum score must be a whole number from 1 to 1000.`);
      const mandatory = kind === "PASS_FAIL" ? c?.mandatory !== false : false;
      return { code, name: name.slice(0, 191), category, kind, weight, maxScore, mandatory, sortOrder: i, description: c?.description ? String(c.description).slice(0, 2000) : null };
    });
    if (cleaned.filter((c) => c.kind === "PRICE").length > 1) throw fail("Only one criterion can be the price criterion.");
    const weighted = cleaned.filter((c) => c.kind !== "PASS_FAIL");
    const sum = weighted.reduce((s, c) => s + c.weight, 0);
    if (weighted.length && Math.abs(sum - 100) > 0.001) throw fail(`The weights of the scored and price criteria must add up to 100; they add up to ${round2(sum)}.`, 400, "WEIGHTS_NOT_100");
    const mode = String(input.evaluationMode ?? ctx.rfq.evaluationMode ?? "SINGLE_ENVELOPE").toUpperCase();
    if (!(EVALUATION_MODES as readonly string[]).includes(mode)) throw fail(`Evaluation mode must be one of ${EVALUATION_MODES.join(", ")}.`);
    const rule = String(input.passRule ?? ctx.rfq.passRule ?? "ALL").toUpperCase();
    if (!(PASS_RULES as readonly string[]).includes(rule)) throw fail(`Pass rule must be one of ${PASS_RULES.join(", ")}.`);
    const minEval = Number(input.minEvaluators ?? ctx.rfq.minEvaluators ?? 1);
    if (!Number.isInteger(minEval) || minEval < 1 || minEval > 50) throw fail("The minimum number of evaluators must be a whole number from 1 to 50.");

    await prisma.$transaction(async (tx) => {
      await tx.rfqEvaluationCriterion.deleteMany({ where: { rfqId } });
      for (const c of cleaned) await tx.rfqEvaluationCriterion.create({ data: { rfqId, ...c, weight: new Decimal(c.weight) } });
      await tx.procurementRfq.update({ where: { id: rfqId }, data: { evaluationMode: mode, passRule: rule, minEvaluators: minEval } });
    });
    await AuditService.log({ userId: user.id, action: "UPDATE", entityType: "ProcurementRfq", entityId: rfqId, newValues: { evaluationCriteria: cleaned.map((c) => `${c.name} (${c.kind}${c.kind !== "PASS_FAIL" ? ` ${c.weight}%` : c.mandatory ? " mandatory" : ""})`), evaluationMode: mode, passRule: rule, minEvaluators: minEval } });
    return this.criteria(rfqId);
  }

  // ------------------------------------------------------------------ declaration wording (configuration)
  static async declarationOptions(activeOnly = true) {
    return prisma.evaluationDeclarationOption.findMany({ where: activeOnly ? { active: true } : {}, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  }

  static async saveDeclarationOption(user: any, input: { id?: string; code?: string; label: string; statement: string; effect: string; requiresDetails?: boolean; active?: boolean; sortOrder?: number }) {
    if (!user || !(isModulePrivilegedUser(user) || userHasEffectivePermission(user, P.rfqManage))) throw fail("Only the procurement team configures declaration wording.", 403);
    const label = String(input.label ?? "").trim();
    const statement = String(input.statement ?? "").trim();
    if (!label || !statement) throw fail("Both a label and the declaration wording are required.");
    const effect = String(input.effect ?? "CLEAR").toUpperCase();
    if (!["CLEAR", "DISCLOSED", "RECUSE"].includes(effect)) throw fail("The effect must be CLEAR, DISCLOSED or RECUSE.");
    const data = { label: label.slice(0, 191), statement, effect, requiresDetails: !!input.requiresDetails || effect !== "CLEAR", active: input.active !== false, sortOrder: Number(input.sortOrder ?? 0) };
    let row;
    if (input.id) row = await prisma.evaluationDeclarationOption.update({ where: { id: input.id }, data });
    else {
      const code = String(input.code ?? label).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 32) || `OPT_${Date.now()}`;
      row = await prisma.evaluationDeclarationOption.create({ data: { code, ...data } });
    }
    await AuditService.log({ userId: user.id, action: input.id ? "UPDATE" : "CREATE", entityType: "EvaluationDeclarationOption", entityId: row.id, newValues: data });
    return row;
  }

  // ------------------------------------------------------------------ committee and declarations
  static async committee(rfqId: string) {
    const members = await prisma.rfqEvaluationMember.findMany({ where: { rfqId }, orderBy: { createdAt: "asc" } });
    const users = await prisma.user.findMany({ where: { id: { in: members.map((m) => m.userId) } }, select: { id: true, firstName: true, lastName: true, email: true, userDepartment: true } });
    return members.map((m) => {
      const u = users.find((x) => x.id === m.userId);
      return { ...m, name: [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.email || m.userId, department: u?.userDepartment ?? null };
    });
  }

  static async setCommittee(user: any, rfqId: string, members: Array<{ userId: string; role?: string }>) {
    const ctx = await SourcingAccessService.resolve(user, rfqId);
    if (!ctx.canManage) throw fail("Only the procurement team appoints the evaluation committee.", 403);
    const wanted = new Map<string, string>();
    for (const m of members ?? []) {
      if (!m?.userId) continue;
      const role = String(m.role ?? "MEMBER").toUpperCase() === "CHAIR" ? "CHAIR" : "MEMBER";
      wanted.set(m.userId, role);
    }
    if ([...wanted.values()].filter((r) => r === "CHAIR").length > 1) throw fail("A committee has one chair.");
    const users = await prisma.user.findMany({ where: { id: { in: [...wanted.keys()] } }, select: { id: true, status: true, firstName: true, lastName: true, roleCode: true } });
    for (const id of wanted.keys()) {
      const u = users.find((x) => x.id === id);
      if (!u) throw fail("A committee member is not a user of this system.");
      if (String(u.status || "ACTIVE").toUpperCase() !== "ACTIVE") throw fail(`${u.firstName} ${u.lastName} is not an active user and cannot sit on the committee.`);
    }
    const existing = await prisma.rfqEvaluationMember.findMany({ where: { rfqId } });
    for (const e of existing) {
      if (!wanted.has(e.userId)) {
        const scored = await prisma.rfqEvaluationScore.count({ where: { rfqId, evaluatorId: e.userId } });
        if (scored || e.scorecardSubmittedAt) throw fail("A committee member who has begun scoring cannot be removed. Record a recusal instead.", 409);
      }
    }
    await prisma.$transaction(async (tx) => {
      for (const e of existing) if (!wanted.has(e.userId)) await tx.rfqEvaluationMember.delete({ where: { id: e.id } });
      for (const [userId, role] of wanted) {
        const cur = existing.find((e) => e.userId === userId);
        if (cur) await tx.rfqEvaluationMember.update({ where: { id: cur.id }, data: { role } });
        else await tx.rfqEvaluationMember.create({ data: { rfqId, userId, role, addedById: user.id } });
      }
    });
    try {
      // the one shared dispatcher: people newly appointed are told (those already on the committee are not told again)
      const { notifySafe } = await import("../notifications/ProcurementNotifier");
      const rfq = await prisma.procurementRfq.findUnique({ where: { id: rfqId }, select: { rfqNumber: true, title: true, closingAt: true } });
      for (const [userId, role] of wanted) {
        if (existing.some((e) => e.userId === userId)) continue;
        await notifySafe("EVALUATION_ASSIGNED", { userIds: [userId], actorId: user.id, entityType: "ProcurementRfq", entityId: rfqId, vars: { ref: rfq?.rfqNumber ?? rfqId, title: rfq?.title, role: role === "CHAIR" ? "chair" : "member", closing: rfq?.closingAt ? new Date(rfq.closingAt).toISOString().slice(0, 10) : "" } });
      }
    } catch (_e) { /* the assignment stands */ }
    await AuditService.log({
      userId: user.id,
      action: "COMMITTEE_ASSIGN",
      entityType: "ProcurementRfq",
      entityId: rfqId,
      oldValues: { evaluationCommittee: Object.fromEntries(existing.map((e) => [e.userId, e.role])) },
      newValues: { evaluationCommittee: Object.fromEntries(wanted) },
      eventType: "ASSIGN",
    });
    return this.committee(rfqId);
  }

  /** A member's own declaration, from the configured wording. A recusal removes them from scoring and consolidation. */
  static async declare(user: any, rfqId: string, input: { code: string; details?: string }) {
    const member = await prisma.rfqEvaluationMember.findUnique({ where: { rfqId_userId: { rfqId, userId: user.id } } });
    if (!member) throw fail("You are not on this evaluation committee.", 403);
    if (member.recused) throw fail("You have recused yourself from this evaluation; the declaration cannot be changed.", 409);
    if (member.scorecardSubmittedAt) throw fail("Your scorecard is submitted, so your declaration cannot be changed.", 409);
    const option = await prisma.evaluationDeclarationOption.findFirst({ where: { code: String(input.code ?? ""), active: true } });
    if (!option) throw fail("That declaration is not one of the options currently offered.");
    const details = String(input.details ?? "").trim();
    if (option.requiresDetails && details.length < 5) throw fail("Describe the conflict (at least a sentence) for this declaration.");
    const recuse = option.effect === "RECUSE";
    const row = await prisma.rfqEvaluationMember.update({
      where: { id: member.id },
      data: { declarationCode: option.code, declarationStatement: option.statement, declarationDetails: details || null, declaredAt: new Date(), recused: recuse },
    });
    await AuditService.log({ userId: user.id, action: recuse ? "RECUSE" : "DECLARE", entityType: "ProcurementRfq", entityId: rfqId, newValues: { declaration: option.label, effect: option.effect, details: details || null } });
    return row;
  }

  // ------------------------------------------------------------------ scoring
  private static async assertMayScore(user: any, rfqId: string) {
    const ctx = await SourcingAccessService.resolve(user, rfqId);
    const member = ctx.member;
    if (!member) throw fail("You are not on this evaluation committee, so you cannot score.", 403, "NOT_ON_COMMITTEE");
    if (ctx.sealed) {
      await SourcingAccessService.recordDenied(user, ctx.rfq.id, "score before bid opening", ctx);
      throw fail(ctx.reason || "Submissions are sealed; nothing can be scored yet.", 403, "SEALED_SUBMISSIONS");
    }
    if (member.recused) throw fail("You have recused yourself from this evaluation and cannot score.", 403, "RECUSED");
    const settings = await this.settings();
    if (settings.requireDeclaration && !member.declarationCode) {
      throw fail("Confirm your declaration (no conflict, conflict disclosed or recusal) before you score.", 409, "DECLARATION_REQUIRED");
    }
    if (member.scorecardSubmittedAt) throw fail("Your scorecard is already submitted and cannot be changed.", 409, "SCORECARD_SUBMITTED");
    return ctx;
  }

  static async saveScores(
    user: any,
    rfqId: string,
    input: { quotationId: string; scores?: Array<{ criterionId: string; score?: number | null; passed?: boolean | null; comment?: string }>; comment?: string }
  ) {
    const ctx = await this.assertMayScore(user, rfqId);
    { const { ProcurementLifecycleService } = await import("../status/ProcurementLifecycleService"); await ProcurementLifecycleService.closeExpiredRfqs(); await ProcurementLifecycleService.advanceRfq(rfqId, "UNDER_EVALUATION"); }
    const quotation = await prisma.vendorQuotation.findUnique({ where: { id: input.quotationId }, select: { id: true, procurementRfqId: true, status: true } });
    if (!quotation || quotation.procurementRfqId !== rfqId) throw fail("That quotation is not on this sourcing event.");
    if (!LIVE_STATUSES.includes(quotation.status)) throw fail(`That quotation is ${String(quotation.status).toLowerCase()} and is not evaluated.`, 409);
    const criteria = await this.criteria(rfqId);
    if (!criteria.length) throw fail("No evaluation criteria have been set for this event.", 409);
    const byId = new Map(criteria.map((c) => [c.id, c]));
    for (const s of input.scores ?? []) {
      const c = byId.get(s.criterionId);
      if (!c) throw fail("A score refers to a criterion that is not on this event.");
      if (c.kind === "PRICE") throw fail(`"${c.name}" is the price criterion: it is computed from the quotations, not scored by hand.`, 400, "PRICE_NOT_SCORED");
      if (c.kind === "PASS_FAIL") {
        if (typeof s.passed !== "boolean") throw fail(`"${c.name}" is pass or fail: choose one.`);
      } else {
        const n = Number(s.score);
        if (s.score == null || !Number.isFinite(n) || n < 0 || n > c.maxScore) throw fail(`"${c.name}" is scored from 0 to ${c.maxScore}.`);
      }
    }
    await prisma.$transaction(async (tx) => {
      for (const s of input.scores ?? []) {
        const c = byId.get(s.criterionId)!;
        const data = {
          score: c.kind === "SCORED" ? new Decimal(Number(s.score)) : null,
          passed: c.kind === "PASS_FAIL" ? !!s.passed : null,
          comment: s.comment ? String(s.comment).slice(0, 2000) : null,
        };
        // Keyed on the signed-in evaluator: one evaluator's marks can never overwrite another's.
        await tx.rfqEvaluationScore.upsert({
          where: { quotationId_criterionId_evaluatorId: { quotationId: quotation.id, criterionId: c.id, evaluatorId: user.id } },
          update: data,
          create: { rfqId, quotationId: quotation.id, criterionId: c.id, evaluatorId: user.id, ...data },
        });
      }
      if (input.comment !== undefined) {
        await tx.rfqEvaluationNote.upsert({
          where: { quotationId_evaluatorId: { quotationId: quotation.id, evaluatorId: user.id } },
          update: { comment: String(input.comment).slice(0, 4000) },
          create: { rfqId, quotationId: quotation.id, evaluatorId: user.id, comment: String(input.comment).slice(0, 4000) },
        });
      }
    });
    await AuditService.log({ userId: user.id, action: "SCORE", entityType: "VendorQuotation", entityId: quotation.id, newValues: { criteria: (input.scores ?? []).length, event: ctx.rfq.rfqNumber } });
    return this.myScorecard(user, rfqId);
  }

  /** What this evaluator has entered, for every live bid. */
  static async myScorecard(user: any, rfqId: string) {
    const [scores, notes, member] = await Promise.all([
      prisma.rfqEvaluationScore.findMany({ where: { rfqId, evaluatorId: user.id } }),
      prisma.rfqEvaluationNote.findMany({ where: { rfqId, evaluatorId: user.id } }),
      prisma.rfqEvaluationMember.findUnique({ where: { rfqId_userId: { rfqId, userId: user.id } } }),
    ]);
    return {
      submittedAt: member?.scorecardSubmittedAt ?? null,
      scores: scores.map((s) => ({ quotationId: s.quotationId, criterionId: s.criterionId, score: s.score == null ? null : Number(s.score), passed: s.passed, comment: s.comment })),
      notes: notes.map((n) => ({ quotationId: n.quotationId, comment: n.comment })),
    };
  }

  static async submitScorecard(user: any, rfqId: string) {
    const ctx = await this.assertMayScore(user, rfqId);
    const [criteria, quotes, mine] = await Promise.all([
      this.criteria(rfqId),
      prisma.vendorQuotation.findMany({ where: { procurementRfqId: rfqId, status: { in: LIVE_STATUSES } }, select: { id: true, quotationNumber: true, companyName: true, vendorName: true } }),
      prisma.rfqEvaluationScore.findMany({ where: { rfqId, evaluatorId: user.id } }),
    ]);
    const required = criteria.filter((c) => c.kind !== "PRICE");
    const missing: string[] = [];
    for (const q of quotes) {
      for (const c of required) {
        if (!mine.some((m) => m.quotationId === q.id && m.criterionId === c.id)) missing.push(`${q.companyName || q.vendorName} / ${c.name}`);
      }
    }
    if (!quotes.length) throw fail("There are no submissions to evaluate.", 409);
    if (missing.length) throw fail(`Score every criterion for every bid before submitting. Missing: ${missing.slice(0, 5).join("; ")}${missing.length > 5 ? `; and ${missing.length - 5} more` : ""}.`, 409, "SCORECARD_INCOMPLETE");
    await prisma.rfqEvaluationMember.update({ where: { id: ctx.member.id }, data: { scorecardSubmittedAt: new Date() } });
    await AuditService.log({ userId: user.id, action: "SUBMIT_SCORECARD", entityType: "ProcurementRfq", entityId: rfqId, newValues: { bids: quotes.length, criteria: required.length } });
    return this.myScorecard(user, rfqId);
  }

  // ------------------------------------------------------------------ consolidation
  /**
   * The committee's result for every live bid. `viewer` decides how much of the detail is returned: individual evaluators' marks
   * only to the procurement team, or to an evaluator once their own scorecard is in.
   */
  static async consolidate(rfqId: string, viewer?: { level: string; member: any | null; priceVisible?: boolean }) {
    const rfq: any = await prisma.procurementRfq.findUnique({ where: { id: rfqId } });
    if (!rfq) throw fail("Sourcing event not found", 404);
    const [criteria, members, quotes, scores, opening] = await Promise.all([
      this.criteria(rfqId),
      this.committee(rfqId),
      prisma.vendorQuotation.findMany({ where: { procurementRfqId: rfqId, status: { in: LIVE_STATUSES } }, orderBy: { submittedAt: "asc" } }),
      prisma.rfqEvaluationScore.findMany({ where: { rfqId } }),
      prisma.rfqBidOpening.findUnique({ where: { rfqId } }),
    ]);
    const counted = members.filter((m) => !m.recused && m.scorecardSubmittedAt);
    const countedIds = new Set(counted.map((m) => m.userId));
    const pending = members.filter((m) => !m.recused && !m.scorecardSubmittedAt);
    const passRule = String(rfq.passRule || "ALL");
    const scoredCriteria = criteria.filter((c) => c.kind === "SCORED");
    const passCriteria = criteria.filter((c) => c.kind === "PASS_FAIL");
    const priceCriterion = criteria.find((c) => c.kind === "PRICE") ?? null;

    // Comparable price of each bid: in the reporting currency at the rates frozen at opening.
    const fx: Record<string, { rate: number | null }> = ((opening as any)?.fxSnapshot as any) || {};
    const reportingCode = (opening as any)?.reportingCurrencyCode ?? null;
    const comparable = async (q: any): Promise<{ amount: number | null; rate: number | null; converted: boolean }> => {
      const total = Number(q.totalAmount);
      if (!reportingCode || q.currencyCode === reportingCode) return { amount: total, rate: 1, converted: false };
      // A rate stated by an authorised user after opening (audited) takes the place of a missing one; otherwise the one frozen at opening.
      const stated = (rfq.fxOverrides as any)?.[q.currencyCode]?.rate;
      const frozen = stated != null ? Number(stated) : fx[q.currencyCode]?.rate;
      if (frozen != null) return { amount: round2(total * frozen), rate: frozen, converted: true };
      return { amount: null, rate: null, converted: true };
    };

    const rows: any[] = [];
    for (const q of quotes) {
      const mine = scores.filter((s) => s.quotationId === q.id && countedIds.has(s.evaluatorId));
      const perCriterion: any[] = [];
      let disqualified = false;
      const failed: string[] = [];
      for (const c of passCriteria) {
        const list = mine.filter((s) => s.criterionId === c.id);
        let passed: boolean | null = null;
        if (list.length) {
          const passes = list.filter((s) => s.passed === true).length;
          passed = passRule === "MAJORITY" ? passes > list.length / 2 : passes === list.length;
        }
        if (c.mandatory && passed === false) {
          disqualified = true;
          failed.push(c.name);
        }
        perCriterion.push({ criterionId: c.id, code: c.code, name: c.name, kind: c.kind, mandatory: c.mandatory, passed, evaluators: list.length });
      }
      for (const c of scoredCriteria) {
        const list = mine.filter((s) => s.criterionId === c.id && s.score != null);
        const mark = list.length ? list.reduce((s, x) => s + (Number(x.score) / c.maxScore) * 100, 0) / list.length : null;
        perCriterion.push({ criterionId: c.id, code: c.code, name: c.name, kind: c.kind, weight: c.weight, mark: mark == null ? null : round2(mark), evaluators: list.length });
      }
      const compliance = !passCriteria.length ? "NOT_REQUIRED" : disqualified ? "FAILED" : perCriterion.filter((p) => p.kind === "PASS_FAIL").every((p) => p.passed === true) ? "PASSED" : "PENDING";
      const price = await comparable(q);
      rows.push({ quotation: q, perCriterion, disqualified, failedCriteria: failed, compliance, price });
    }

    // Price marks among qualified bids only.
    const qualified = rows.filter((r) => !r.disqualified && r.price.amount != null && r.price.amount > 0);
    const lowest = qualified.length ? Math.min(...qualified.map((r) => r.price.amount)) : null;
    for (const r of rows) {
      r.priceMark = priceCriterion && lowest != null && !r.disqualified && r.price.amount ? round2((lowest / r.price.amount) * 100) : null;
      const techParts = r.perCriterion.filter((p: any) => p.kind === "SCORED");
      const techComplete = techParts.length > 0 ? techParts.every((p: any) => p.mark != null) : true;
      const techWeight = techParts.reduce((s: number, p: any) => s + p.weight, 0);
      r.technicalScore = techParts.length && techComplete && techWeight > 0 ? round2(techParts.reduce((s: number, p: any) => s + p.weight * p.mark, 0) / techWeight) : null;
      r.commercialScore = r.priceMark;
      const all = [...techParts, ...(priceCriterion ? [{ weight: priceCriterion.weight, mark: r.priceMark }] : [])];
      const totalWeight = all.reduce((s, p: any) => s + p.weight, 0);
      const complete = all.length > 0 && all.every((p: any) => p.mark != null);
      r.totalScore = complete && totalWeight > 0 ? round2(all.reduce((s, p: any) => s + p.weight * p.mark, 0) / totalWeight) : null;
    }

    // Advisory ranking: qualified, fully scored bids by total score. Never a selection.
    const ranked = rows.filter((r) => !r.disqualified && r.totalScore != null).sort((a, b) => b.totalScore - a.totalScore);
    ranked.forEach((r, i) => (r.advisoryRank = i + 1));

    const showIndividual = viewer && (viewer.level === "FULL" || (viewer.member && viewer.member.scorecardSubmittedAt));
    // Independence: an evaluator sees the committee's result only once their own scorecard is in.
    const withhold = !!viewer && viewer.level !== "FULL" && !(viewer.member && viewer.member.scorecardSubmittedAt);
    const hidePrice = !!viewer && viewer.priceVisible === false;
    const out: any = {
      criteria,
      committee: members.map((m) => ({ userId: m.userId, name: m.name, role: m.role, declaration: m.declarationCode, recused: m.recused, scorecardSubmittedAt: m.scorecardSubmittedAt })),
      countedEvaluators: counted.length,
      pendingEvaluators: pending.map((m) => m.name),
      minEvaluators: Number(rfq.minEvaluators || 1),
      complete: counted.length >= Number(rfq.minEvaluators || 1) && pending.length === 0,
      passRule,
      reportingCurrencyCode: reportingCode,
      resultsWithheld: withhold,
      rows: withhold ? [] : rows.map((r) => ({
        quotationId: r.quotation.id,
        technicalScore: r.technicalScore,
        commercialScore: r.commercialScore,
        totalScore: r.totalScore,
        compliance: r.compliance,
        disqualified: r.disqualified,
        failedCriteria: r.failedCriteria,
        advisoryRank: r.advisoryRank ?? null,
        perCriterion: r.perCriterion,
        comparableAmount: hidePrice ? null : r.price.amount,
        fxRate: hidePrice ? null : r.price.rate,
        converted: r.price.converted,
      })),
    };
    if (showIndividual) {
      out.individual = counted.map((m) => ({
        userId: m.userId,
        name: m.name,
        scores: scores.filter((s) => s.evaluatorId === m.userId).map((s) => ({ quotationId: s.quotationId, criterionId: s.criterionId, score: s.score == null ? null : Number(s.score), passed: s.passed, comment: s.comment })),
      }));
    }
    return out;
  }
}
