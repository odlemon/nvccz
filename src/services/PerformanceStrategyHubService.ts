// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { PerformanceConfigService } from "./PerformanceConfigService";
import { PerformanceKpiRegistryService } from "./PerformanceKpiRegistryService";
import { PerformanceRiskService } from "./PerformanceRiskService";

class StrategyError extends Error {
  statusCode: number;
  constructor(m: string, s = 400) {
    super(m);
    this.statusCode = s;
  }
}
export { StrategyError };
const USER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;
const nameOf = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : null);
const DAY = 86400000;
const txt = (v, max, label, required = false) => {
  const s = v == null ? "" : String(v).trim();
  if (!s) {
    if (required) throw new StrategyError(`${label} is required.`);
    return null;
  }
  if (s.length > max) throw new StrategyError(`${label} must be ${max} characters or fewer.`);
  return s;
};
const day = (v, label, required = false) => {
  if (v === undefined || v === null || v === "") {
    if (required) throw new StrategyError(`${label} is required.`);
    return null;
  }
  const d = new Date(v);
  if (Number.isNaN(+d)) throw new StrategyError(`${label} is not a valid date.`);
  return d;
};
const conf = (g) => g.confidence || ({ GREEN: "high", AMBER: "medium", "AMBER ZONE": "medium", RED: "low", "RED ZONE": "low" })[String(g.performanceRiskZone || "").toUpperCase()] || null;

export class PerformanceStrategyHubService {
  static async overview(strategyId?: string, department?: string) {
    const strategies = await prisma.performanceStrategy.findMany({ where: { archivedAt: null }, orderBy: { periodStart: "desc" } });
    const strategy = strategyId ? strategies.find((s) => s.id === strategyId) : strategies.find((s) => s.status === "ACTIVE") || strategies[0] || null;
    const [themes, goalsAll, projects, risks, reviews, decisions, assumptions, departments] = await Promise.all([
      PerformanceConfigService.listThemes({}),
      prisma.performanceGoal.findMany({ select: { id: true, title: true, type: true, parentGoalId: true, departmentName: true, strategicThemeId: true, progressPercentage: true, confidence: true, performanceRiskZone: true, lastCheckDate: true, endDate: true, status: true, assignedToId: true, scorecardPillar: true, strategyId: true } }),
      prisma.project.findMany({ where: { goalId: { not: null } } }),
      PerformanceRiskService.list(),
      prisma.performanceStrategyReview.findMany({ orderBy: { scheduledFor: "desc" }, take: 50 }),
      prisma.performanceStrategyDecision.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.performanceStrategyAssumption.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    ]);
    const goals = department ? goalsAll.filter((g) => g.departmentName === department) : goalsAll;
    const objectives = goals.filter((g) => g.type === "company" || !g.parentGoalId);
    const deptGoals = goalsAll.filter((g) => g.type === "department" && g.parentGoalId);
    const aligned = departments.filter((d) => deptGoals.some((g) => g.departmentName === d.name));
    const confs = goals.map(conf).filter(Boolean);
    const confScore = confs.length ? Math.round((confs.reduce((a, c) => a + (c === "high" ? 100 : c === "medium" ? 60 : 20), 0) / confs.length)) : null;
    const goalIds = new Set(goals.map((g) => g.id));
    const inits = projects.filter((p) => goalIds.has(p.goalId) && p.status !== "CANCELLED");
    const initTasks = inits.length ? await prisma.task.findMany({ where: { projectId: { in: inits.map((p) => p.id) }, isTrashed: false }, select: { projectId: true, stage: true } }) : [];
    const strategicRisks = risks.filter((r) => r.category === "Strategic" && r.status !== "closed" && (!department || r.departmentName === department));
    const fresh = goals.filter((g) => g.lastCheckDate && Date.now() - +new Date(g.lastCheckDate) <= 35 * DAY).length;
    const openDecisions = decisions.filter((d) => ["proposed", "under_review"].includes(d.status));
    const ready = openDecisions.filter((d) => d.rationale && d.ownerId && d.reviewId);
    const uids = [...new Set([...(strategy && strategy.metadata && strategy.metadata.ownerId ? [strategy.metadata.ownerId] : []), ...decisions.flatMap((d) => [d.proposedById, d.decidedById, d.ownerId]), ...assumptions.map((a) => a.ownerId), ...reviews.map((r) => r.createdById)].filter(Boolean))];
    const users = uids.length ? await prisma.user.findMany({ where: { id: { in: uids } }, select: USER_SELECT }) : [];
    const nm = new Map(users.map((u) => [u.id, nameOf(u)]));
    const analytics = await PerformanceKpiRegistryService.analytics(undefined, department, undefined).catch(() => null);
    const attention = [
      ...objectives.filter((g) => conf(g) === "low" && !["completed", "cancelled"].includes(String(g.status).toLowerCase())).map((g) => ({ kind: "Objective", title: g.title, why: "Low confidence", weight: 90 })),
      ...strategicRisks.filter((r) => r.appetitePosition === "above").map((r) => ({ kind: "Risk", title: `${r.reference} ${r.title}`, why: "Above appetite", weight: 95 })),
      ...inits.filter((p) => p.endDate && +new Date(p.endDate) < Date.now() && !["COMPLETED", "CANCELLED"].includes(p.status)).map((p) => ({ kind: "Initiative", title: p.name, why: "Past its end date", weight: 80 })),
      ...openDecisions.filter((d) => Date.now() - +new Date(d.createdAt) > 14 * DAY).map((d) => ({ kind: "Decision", title: d.title, why: "Waiting more than 14 days", weight: 70 })),
      ...assumptions.filter((a) => a.status === "at_risk" || a.status === "invalidated").map((a) => ({ kind: "Assumption", title: a.statement, why: a.status === "invalidated" ? "Invalidated" : "At risk", weight: 75 }))
    ].sort((a, b) => b.weight - a.weight).slice(0, 8);
    return {
      strategies: strategies.map((s) => ({ id: s.id, title: s.title, status: s.status, periodStart: s.periodStart, periodEnd: s.periodEnd })),
      strategy: strategy ? { ...strategy, ownerName: strategy.metadata && strategy.metadata.ownerId ? nm.get(strategy.metadata.ownerId) || null : null, version: (strategy.metadata && strategy.metadata.version) || 1, nextReviewDate: (strategy.metadata && strategy.metadata.nextReviewDate) || null } : null,
      departments: departments.map((d) => d.name),
      alignment: { aligned: aligned.length, total: departments.length, pct: departments.length ? Math.round((aligned.length / departments.length) * 100) : null },
      confidence: confScore,
      counts: { themes: themes.filter((t) => t.status !== "ARCHIVED").length, objectives: objectives.length, initiatives: inits.length, risks: strategicRisks.length },
      evidence: goals.length ? Math.round((fresh / goals.length) * 1000) / 10 : null,
      decisionReadiness: openDecisions.length ? Math.round((ready.length / openDecisions.length) * 100) : null,
      trend: analytics ? analytics.trend : [],
      attention,
      themes: themes.filter((t) => t.status !== "ARCHIVED"),
      objectives: objectives.map((g) => ({ ...g, confidence: conf(g), ownerName: g.assignedToId ? nm.get(g.assignedToId) || null : null })),
      initiatives: inits.map((p) => { const ts = initTasks.filter((t) => t.projectId === p.id); const done = ts.filter((t) => t.stage === "completed").length; return { id: p.id, name: p.name, status: p.status, goalId: p.goalId, goalTitle: (goalsAll.find((g) => g.id === p.goalId) || {}).title || null, endDate: p.endDate, tasks: ts.length, progress: ts.length ? Math.round((done / ts.length) * 100) : null }; }),
      risks: strategicRisks,
      assumptions: assumptions.map((a) => ({ ...a, ownerName: a.ownerId ? nm.get(a.ownerId) || null : null })),
      reviews: reviews.map((r) => ({ ...r, createdByName: r.createdById ? nm.get(r.createdById) || null : null, decisionCount: decisions.filter((d) => d.reviewId === r.id).length })),
      decisions: decisions.map((d) => ({ ...d, proposedByName: d.proposedById ? nm.get(d.proposedById) || null : null, decidedByName: d.decidedById ? nm.get(d.decidedById) || null : null, ownerName: d.ownerId ? nm.get(d.ownerId) || null : null }))
    };
  }

  static async setMeta(strategyId: string, input: any, actor: any) {
    const s = await prisma.performanceStrategy.findUnique({ where: { id: strategyId } });
    if (!s) throw new StrategyError("Strategy not found.", 404);
    const meta = { ...(s.metadata || {}) };
    if (input.bumpVersion) meta.version = (Number(meta.version) || 1) + 1;
    if (input.ownerId !== undefined) { if (input.ownerId && !(await prisma.user.findUnique({ where: { id: input.ownerId }, select: { id: true } }))) throw new StrategyError("The chosen owner does not exist."); meta.ownerId = input.ownerId || null; }
    if (input.nextReviewDate !== undefined) { const d = day(input.nextReviewDate, "Next review date"); meta.nextReviewDate = d ? d.toISOString().slice(0, 10) : null; }
    await prisma.performanceStrategy.update({ where: { id: strategyId }, data: { metadata: meta } });
    await AuditService.log({ userId: actor.id, action: "UPDATE", entityType: "PerformanceStrategy", entityId: strategyId, newValues: meta });
    return { ok: true };
  }

  // ---- reviews
  static async createReview(input: any, actor: any) {
    const title = txt(input.title, 200, "Review title", true);
    const scheduledFor = day(input.scheduledFor, "Review date", true);
    const scope = txt(input.scope, 500, "Scope");
    const strategyId = input.strategyId ? String(input.strategyId) : null;
    if (strategyId && !(await prisma.performanceStrategy.findUnique({ where: { id: strategyId }, select: { id: true } }))) throw new StrategyError("The chosen strategy does not exist.");
    const row = await prisma.performanceStrategyReview.create({ data: { title, scheduledFor, scope, strategyId, status: "planned", createdById: actor.id } });
    await AuditService.log({ userId: actor.id, action: "CREATE", entityType: "PerformanceStrategyReview", entityId: row.id, newValues: row });
    return row;
  }
  static async reviewStatus(id: string, status: string, note: any, actor: any) {
    const r = await prisma.performanceStrategyReview.findUnique({ where: { id } });
    if (!r) throw new StrategyError("Review not found.", 404);
    const allowed = { planned: ["held", "cancelled"], held: ["closed"], closed: [], cancelled: [] }[r.status] || [];
    if (!allowed.includes(status)) throw new StrategyError(`A review that is ${r.status} cannot move to ${status}.`);
    const n = txt(note, 2000, "Note");
    if (status === "held" && !n) throw new StrategyError("Record what the review covered and concluded.");
    if (status === "cancelled" && !n) throw new StrategyError("Say why the review is cancelled.");
    if (status === "closed") {
      const open = await prisma.performanceStrategyDecision.count({ where: { reviewId: id, status: { in: ["proposed", "under_review"] } } });
      if (open) throw new StrategyError(`${open} decision${open === 1 ? " is" : "s are"} still open. Decide ${open === 1 ? "it" : "them"} before closing the review.`);
    }
    const row = await prisma.performanceStrategyReview.update({ where: { id }, data: { status, outcome: status === "held" || status === "cancelled" ? n : r.outcome, heldAt: status === "held" ? new Date() : r.heldAt } });
    await AuditService.log({ userId: actor.id, action: "STATUS", entityType: "PerformanceStrategyReview", entityId: id, oldValues: { status: r.status }, newValues: { status, note: n } });
    return row;
  }

  // ---- decisions
  static async createDecision(input: any, actor: any) {
    const title = txt(input.title, 255, "Decision", true);
    const type = ["strategy_change", "investment", "scope", "risk_acceptance", "other"].includes(input.type) ? input.type : "other";
    const reviewId = input.reviewId ? String(input.reviewId) : null;
    if (reviewId) { const r = await prisma.performanceStrategyReview.findUnique({ where: { id: reviewId } }); if (!r) throw new StrategyError("The chosen review does not exist."); if (["closed", "cancelled"].includes(r.status)) throw new StrategyError("A closed or cancelled review takes no new decisions."); }
    const ownerId = input.ownerId ? String(input.ownerId) : actor.id;
    if (!(await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } }))) throw new StrategyError("The chosen owner does not exist.");
    const row = await prisma.performanceStrategyDecision.create({ data: { title, type, description: txt(input.description, 4000, "Description"), rationale: txt(input.rationale, 4000, "Rationale"), reviewId, ownerId, proposedById: actor.id, status: "proposed" } });
    await AuditService.log({ userId: actor.id, action: "CREATE", entityType: "PerformanceStrategyDecision", entityId: row.id, newValues: row });
    return row;
  }
  /** approve / reject / defer. The proposer never approves their own proposal. */
  static async decide(id: string, outcome: string, note: any, actor: any, isAdmin: boolean) {
    const d = await prisma.performanceStrategyDecision.findUnique({ where: { id } });
    if (!d) throw new StrategyError("Decision not found.", 404);
    if (!["proposed", "under_review"].includes(d.status)) throw new StrategyError(`This decision is already ${d.status}.`);
    const map = { approve: "approved", reject: "rejected", defer: "deferred" };
    const status = map[outcome];
    if (!status) throw new StrategyError("Outcome must be approve, reject or defer.");
    const n = txt(note, 2000, "Note");
    if (status !== "approved" && !n) throw new StrategyError(`Say why the decision is ${status}.`);
    if (status === "approved" && d.proposedById === actor.id && !isAdmin) throw new StrategyError("You proposed this decision, so someone else has to approve it.");
    if (status === "approved" && !d.rationale) throw new StrategyError("A decision with no rationale cannot be approved.");
    const row = await prisma.performanceStrategyDecision.update({ where: { id }, data: { status, decidedById: actor.id, decidedAt: new Date(), decisionNote: n } });
    await AuditService.log({ userId: actor.id, action: "DECIDE", entityType: "PerformanceStrategyDecision", entityId: id, newValues: { status, note: n } });
    return row;
  }

  // ---- assumptions
  static async saveAssumption(input: any, actor: any) {
    const statement = txt(input.statement, 1000, "Assumption", true);
    const status = ["valid", "at_risk", "invalidated"].includes(input.status) ? input.status : "valid";
    const data = { statement, status, ownerId: input.ownerId ? String(input.ownerId) : actor.id, reviewDate: day(input.reviewDate, "Review date"), evidence: txt(input.evidence, 1000, "Evidence") };
    if (status !== "valid" && !data.evidence) throw new StrategyError("Say what shows this assumption is at risk or invalid.");
    const row = input.id ? await prisma.performanceStrategyAssumption.update({ where: { id: input.id }, data }) : await prisma.performanceStrategyAssumption.create({ data: { ...data, createdById: actor.id } });
    await AuditService.log({ userId: actor.id, action: input.id ? "UPDATE" : "CREATE", entityType: "PerformanceStrategyAssumption", entityId: row.id, newValues: row });
    return row;
  }
  static async removeAssumption(id: string, actor: any) {
    const a = await prisma.performanceStrategyAssumption.findUnique({ where: { id } });
    if (!a) throw new StrategyError("Assumption not found.", 404);
    await prisma.performanceStrategyAssumption.delete({ where: { id } });
    await AuditService.log({ userId: actor.id, action: "DELETE", entityType: "PerformanceStrategyAssumption", entityId: id, oldValues: a });
    return { id };
  }
}
