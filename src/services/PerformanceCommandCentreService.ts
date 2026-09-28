// @ts-nocheck
import { prisma } from "../utils/database";
import { PerformanceKpiRegistryService } from "./PerformanceKpiRegistryService";

const DAY = 86400000;
const r1 = (n) => Math.round(n * 10) / 10;
const avg = (a) => (a.length ? r1(a.reduce((x, y) => x + y, 0) / a.length) : null);

/** Fiscal year = calendar year. period: YYYY-Q1..Q4 or YYYY-FY (the whole year). */
export function periodRange(period?: string) {
  const now = new Date();
  const m = /^(\d{4})-(Q[1-4]|FY)$/.exec(period || "");
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const key = m ? m[2] : `Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
  if (key === "FY") return { year, key, label: `FY${year}`, start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)) };
  const q = Number(key[1]);
  return { year, key, label: `${key} FY${year}`, start: new Date(Date.UTC(year, (q - 1) * 3, 1)), end: new Date(Date.UTC(year, q * 3, 0, 23, 59, 59, 999)) };
}

export class PerformanceCommandCentreService {
  static async overview(periodParam?: string, department?: string, population?: string) {
    const p = periodRange(periodParam);
    const pop = ["managers", "contributors"].includes(population || "") ? population : "all";
    const [departments, goalsAll, reviewsAll, tasks, pillars, corrective, risks, alertsRow, users] = await Promise.all([
      prisma.department.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
      prisma.performanceGoal.findMany({ select: { id: true, type: true, departmentName: true, progressPercentage: true, parentGoalId: true, strategicThemeId: true, lastCheckDate: true, isPendingApproval: true, startDate: true, endDate: true, scorecardPillar: true, status: true, assignedToId: true } }),
      prisma.performanceReview.findMany({ select: { id: true, stage: true, ratingValue: true, revieweeId: true, dueDate: true, createdAt: true, reviewee: { select: { userDepartment: true, departmentRole: true } } } }),
      prisma.task.findMany({ where: { isTrashed: false, ...(department ? { department } : {}) }, select: { stage: true, date: true } }),
      prisma.scorecardPillar.findMany({ where: { id: { startsWith: "bsc_" } }, orderBy: { id: "asc" } }),
      prisma.performanceCorrectiveAction.findMany({ where: { status: { not: "closed" } }, select: { targetDate: true, severity: true, departmentId: true } }),
      prisma.performanceRisk.findMany({ where: { status: { not: "closed" } }, select: { id: true } }),
      prisma.$queryRawUnsafe("SELECT SUM(`severity` = 'critical' AND `status` <> 'resolved') AS crit, SUM(`status` <> 'resolved' AND `sla_due_at` IS NOT NULL AND `sla_due_at` < NOW()) AS sla FROM `performance_alerts`"),
      prisma.user.groupBy({ by: ["userDepartment"], where: { status: "ACTIVE" }, _count: { _all: true } })
    ]);
    const overlaps = (g) => new Date(g.startDate) <= p.end && new Date(g.endDate) >= p.start;
    const goals = goalsAll.filter((g) => overlaps(g) && (!department || g.departmentName === department));
    const isMgr = (u) => /HEAD|DEPUTY|MANAGER|HOD/i.test(String((u && u.departmentRole) || ""));
    const inPop = (r) => pop === "all" || (pop === "managers" ? isMgr(r.reviewee) : !isMgr(r.reviewee));
    const inPeriod = (r) => new Date(r.createdAt) <= p.end && (!r.dueDate || new Date(r.dueDate) >= p.start || String(r.stage) !== "FINALIZED");
    const reviews = reviewsAll.filter((r) => inPeriod(r) && inPop(r) && (!department || (r.reviewee && r.reviewee.userDepartment === department)));
    const done = reviews.filter((r) => r.stage === "FINALIZED");
    const peopleInScope = users.filter((u) => !department || u.userDepartment === department).reduce((a, u) => a + u._count._all, 0);
    const analytics = await PerformanceKpiRegistryService.analytics(`${p.year}-${String(p.end.getUTCMonth() + 1).padStart(2, "0")}`, department, undefined).catch(() => null);
    const kpiTotal = analytics ? analytics.kpisWithResults : 0;
    const linked = goals.filter((g) => g.parentGoalId || g.strategicThemeId).length;
    const w = new Map(pillars.map((x) => [x.canonicalName, Number(x.weight || 0)]));
    const bsc = pillars.map((x) => { const gs = goals.filter((g) => g.scorecardPillar === x.canonicalName); const sc = avg(gs.map((g) => Number(g.progressPercentage || 0))); return { key: x.id, label: x.displayName || x.canonicalName, weight: Number(x.weight || 0), score: sc, goals: gs.length, atTarget: sc != null && sc >= 90 }; });
    const weighted = bsc.some((b) => b.score != null) ? r1(bsc.reduce((a, b) => a + (b.score || 0) * b.weight, 0) / Math.max(1, bsc.filter((b) => b.score != null).reduce((a, b) => a + b.weight, 0))) : null;
    const fresh = (gs) => (gs.length ? r1((gs.filter((g) => g.lastCheckDate && Date.now() - +new Date(g.lastCheckDate) <= 35 * DAY).length / gs.length) * 100) : null);
    const units = departments.map((d) => {
      const gs = goalsAll.filter((g) => overlaps(g) && g.departmentName === d.name);
      const rs = reviewsAll.filter((r) => inPeriod(r) && inPop(r) && r.reviewee && r.reviewee.userDepartment === d.name);
      const fin = rs.filter((r) => r.stage === "FINALIZED").length;
      return { department: d.name, score: avg(gs.map((g) => Number(g.progressPercentage || 0))), goals: gs.length, kpi: gs.length ? r1((gs.filter((g) => Number(g.progressPercentage || 0) >= 90).length / gs.length) * 100) : null, reviews: rs.length ? r1((fin / rs.length) * 100) : null, alignment: gs.length ? r1((gs.filter((g) => g.parentGoalId || g.strategicThemeId).length / gs.length) * 100) : null, evidence: fresh(gs) };
    });
    const stageOf = (r) => (["SELF_REVIEW", "SELF_ASSESSMENT"].includes(r.stage) ? "self" : r.stage === "MANAGER_REVIEW" ? "manager" : r.stage === "FINAL_REVIEW" ? "calibration" : r.stage === "FINALIZED" ? "complete" : "other");
    const funnel = { self: 0, manager: 0, calibration: 0, complete: 0 };
    reviews.forEach((r) => { const k = stageOf(r); if (funnel[k] != null) funnel[k]++; });
    const noReview = Math.max(0, peopleInScope - new Set(reviews.map((r) => r.revieweeId)).size);
    const dist = [1, 2, 3, 4, 5].map((n) => ({ rating: n, count: reviews.filter((r) => r.ratingValue === n).length }));
    const wk = { todo: 0, in_progress: 0, delayed: 0, completed: 0 };
    tasks.forEach((t) => { const s = t.stage === "completed" ? "completed" : t.stage === "in_progress" ? "in_progress" : ["delayed", "amber", "red", "overdue"].includes(t.stage) ? "delayed" : "todo"; wk[s]++; });
    const overdueCA = corrective.filter((c) => c.targetDate && +new Date(c.targetDate) < Date.now()).length;
    const rt = await prisma.performanceRiskTreatment.count({ where: { status: { in: ["open", "in_progress"] }, dueDate: { lt: new Date(Date.now() + 30 * DAY) } } });
    const al = alertsRow[0] || {};
    const queue = [
      { key: "manager_reviews", title: "Complete manager review actions", detail: `${reviews.filter((r) => r.stage === "MANAGER_REVIEW").length} review${reviews.filter((r) => r.stage === "MANAGER_REVIEW").length === 1 ? "" : "s"} waiting on a manager`, due: "Today", count: reviews.filter((r) => r.stage === "MANAGER_REVIEW").length, page: "reviews" },
      { key: "kpi_evidence", title: "Verify KPI evidence", detail: `${goals.filter((g) => g.isPendingApproval).length} value(s) awaiting approval · ${goals.filter((g) => !g.lastCheckDate || Date.now() - +new Date(g.lastCheckDate) > 35 * DAY).length} goal(s) with no recent check-in`, due: "Today", count: goals.filter((g) => g.isPendingApproval).length + goals.filter((g) => !g.lastCheckDate || Date.now() - +new Date(g.lastCheckDate) > 35 * DAY).length, page: "objectives" },
      { key: "corrective", title: "Close corrective actions", detail: `${corrective.length} open, ${overdueCA} overdue`, due: "This week", count: corrective.length, page: "corrective" },
      { key: "risk_treatments", title: "Review risk treatments", detail: `${rt} treatment action(s) due within 30 days or overdue`, due: "This month", count: rt, page: "risks" }
    ];
    return {
      period: { key: `${p.year}-${p.key}`, label: p.label }, department: department || null, population: pop, refreshedAt: new Date().toISOString(), peopleInScope,
      periods: [`${p.year}-Q1`, `${p.year}-Q2`, `${p.year}-Q3`, `${p.year}-Q4`, `${p.year}-FY`].map((k) => ({ value: k, label: k.endsWith("FY") ? `FY${p.year}` : `${k.slice(5)} FY${p.year}` })),
      departments: departments.map((d) => d.name),
      tiles: { enterprise: weighted, kpiAttainment: kpiTotal ? r1((analytics.counts.on_track / kpiTotal) * 100) : null, reviewCompletion: reviews.length ? r1((done.length / reviews.length) * 100) : null, alignment: goals.length ? r1((linked / goals.length) * 100) : null, goals: goals.length, kpis: kpiTotal, reviews: reviews.length },
      trend: analytics ? analytics.trend : [],
      bsc: { perspectives: bsc, weighted, atTarget: bsc.filter((b) => b.atTarget).length, evidence: fresh(goals) },
      units, dist, funnel: { ...funnel, notStarted: noReview }, work: wk, workTotal: tasks.length, queue, signals: Number(al.crit || 0) + Number(al.sla || 0) + risks.length * 0 + overdueCA
    };
  }
}
