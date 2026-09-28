// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { PerformanceIntegrationService } from "./PerformanceIntegrationService";

class IntegrationError extends Error {
  statusCode: number;
  constructor(m: string, s = 400) {
    super(m);
    this.statusCode = s;
  }
}
export { IntegrationError };

export const SOURCE_SYSTEMS = [
  { key: "accounting", label: "Accounting", covers: "Finance metrics" },
  { key: "portfolio", label: "Portfolio Management", covers: "AUM, IRR, valuation" },
  { key: "procurement", label: "Procurement", covers: "Invoice and contract cycle metrics" },
  { key: "payroll", label: "Payroll / HR", covers: "People cost and HR indicators" },
  { key: "events", label: "Events", covers: "RSVP and engagement metrics" },
  { key: "tasks", label: "Task Management", covers: "Task completion, timeliness and training" },
  { key: "external", label: "External API", covers: "Any other system that serves a /v1/ endpoint" }
];
const FREQ = ["daily", "weekly", "monthly", "quarterly", "annually"];
const FREQ_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 31, quarterly: 92, annually: 366 };

export class PerformanceIntegrationOverviewService {
  static async overview() {
    const goals = await prisma.performanceGoal.findMany({
      where: { syncEndpointPath: { not: null } },
      select: { id: true, title: true, dataSourceModule: true, syncEndpointPath: true, syncConfig: true, trackingFrequency: true, allowableVariance: true, lastSyncedAt: true, lastSyncedValue: true, isPendingApproval: true, requiresManagerApproval: true, manualOverrideAt: true, departmentName: true, kpi: { select: { name: true } } }
    });
    const ids = goals.map((g) => g.id);
    const since = new Date(Date.now() - 30 * 86400000);
    const jobs = ids.length ? await prisma.performanceSyncJob.findMany({ where: { goalId: { in: ids }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: { id: true, goalId: true, status: true, errorMessage: true, createdAt: true, finishedAt: true, approvalStatus: true } }) : [];
    const week = Date.now() - 7 * 86400000;
    const now = Date.now();
    const mappings = goals.map((g) => {
      const mine = jobs.filter((j) => j.goalId === g.id);
      const last = mine[0] || null;
      const freq = g.trackingFrequency || null;
      const stale = g.lastSyncedAt && freq && FREQ_DAYS[freq] ? now - +new Date(g.lastSyncedAt) > FREQ_DAYS[freq] * 2 * 86400000 : !g.lastSyncedAt;
      const health = last && String(last.status).toUpperCase().startsWith("FAIL") ? "failed" : !last || stale ? "warning" : "healthy";
      return { goalId: g.id, goal: g.title, kpi: g.kpi ? g.kpi.name : null, department: g.departmentName, source: (g.dataSourceModule || "external").toLowerCase(), endpoint: g.syncEndpointPath, fieldPath: (g.syncConfig && g.syncConfig.fieldPath) || null, frequency: freq, allowableVariance: g.allowableVariance == null ? null : Number(g.allowableVariance), lastSyncedAt: g.lastSyncedAt, lastSyncedValue: g.lastSyncedValue == null ? null : Number(g.lastSyncedValue), pendingApproval: !!g.isPendingApproval, lastStatus: last ? last.status : null, lastError: last && last.errorMessage ? last.errorMessage : null, health, jobs30: mine.length };
    });
    const j7 = jobs.filter((j) => +new Date(j.createdAt) >= week);
    const ok7 = j7.filter((j) => /SUCCESS|COMPLETED|OK/i.test(String(j.status)));
    const [overrides, events] = await Promise.all([prisma.performanceGoal.count({ where: { manualOverrideAt: { not: null } } }), prisma.performanceGoalProgressEvent.count()]);
    const sources = SOURCE_SYSTEMS.map((s) => {
      const m = mappings.filter((x) => x.source === s.key || (s.key === "external" && !SOURCE_SYSTEMS.some((y) => y.key === x.source)));
      const sj = m.flatMap((x) => jobs.filter((j) => j.goalId === x.goalId));
      return { ...s, mappings: m.length, healthy: m.filter((x) => x.health === "healthy").length, warning: m.filter((x) => x.health === "warning").length, failed: m.filter((x) => x.health === "failed").length, lastSyncAt: m.map((x) => x.lastSyncedAt).filter(Boolean).sort().pop() || null, connected: m.length > 0 && sj.some((j) => /SUCCESS|COMPLETED|OK/i.test(String(j.status))) };
    });
    return {
      sources, mappings,
      totals: { connected: sources.filter((s) => s.connected).length, mappings: mappings.length, failedSyncs: mappings.filter((x) => x.health === "failed").length, schedules: new Set(mappings.map((m) => m.frequency).filter(Boolean)).size, thresholds: mappings.filter((m) => m.allowableVariance != null).length, successRate7: j7.length ? Math.round((ok7.length / j7.length) * 1000) / 10 : null, jobs7: j7.length, healthy: mappings.filter((m) => m.health === "healthy").length, warning: mappings.filter((m) => m.health === "warning").length, failed: mappings.filter((m) => m.health === "failed").length },
      governance: { pendingApproval: mappings.filter((m) => m.pendingApproval).length, managerApproval: goals.filter((g) => g.requiresManagerApproval).length, overrides, progressEvents: events },
      recentJobs: jobs.slice(0, 20)
    };
  }

  private static async clean(input: any) {
    const goalId = String(input.goalId || "");
    const goal = goalId ? await prisma.performanceGoal.findUnique({ where: { id: goalId }, select: { id: true, title: true, syncConfig: true } }) : null;
    if (!goal) throw new IntegrationError("Choose the goal this mapping feeds.");
    const endpoint = String(input.endpoint || "").trim();
    if (!endpoint) throw new IntegrationError("The endpoint is required.");
    if (!endpoint.includes("/v1/")) throw new IntegrationError("The endpoint must contain /v1/.");
    if (endpoint.length > 500) throw new IntegrationError("The endpoint must be 500 characters or fewer.");
    const fieldPath = String(input.fieldPath || "").trim();
    if (!fieldPath) throw new IntegrationError("The field path is required, for example data.metrics.value.");
    if (!/^[A-Za-z0-9_.\[\]-]+$/.test(fieldPath)) throw new IntegrationError("The field path may hold letters, digits, dots and brackets only.");
    const source = String(input.source || "external");
    if (!SOURCE_SYSTEMS.some((s) => s.key === source)) throw new IntegrationError("Choose a known source system.");
    const frequency = String(input.frequency || "");
    if (!FREQ.includes(frequency)) throw new IntegrationError(`The refresh frequency must be one of: ${FREQ.join(", ")}.`);
    let variance = null;
    if (input.allowableVariance !== undefined && input.allowableVariance !== null && input.allowableVariance !== "") {
      variance = Number(input.allowableVariance);
      if (!Number.isFinite(variance) || variance < 0 || variance > 1) throw new IntegrationError("The allowable variance is a fraction between 0 and 1.");
    }
    return { goal, endpoint, fieldPath, source, frequency, variance };
  }

  static async saveMapping(input: any, actor: any) {
    const c = await PerformanceIntegrationOverviewService.clean(input);
    const before = await prisma.performanceGoal.findUnique({ where: { id: c.goal.id }, select: { syncEndpointPath: true, dataSourceModule: true } });
    await prisma.performanceGoal.update({ where: { id: c.goal.id }, data: { syncEndpointPath: c.endpoint, dataSourceModule: c.source, trackingFrequency: c.frequency, syncConfig: { ...(c.goal.syncConfig || {}), fieldPath: c.fieldPath }, ...(c.variance != null ? { allowableVariance: c.variance } : {}) } });
    await AuditService.log({ userId: actor.id, action: before && before.syncEndpointPath ? "UPDATE" : "CREATE", entityType: "PerformanceIntegrationMapping", entityId: c.goal.id, oldValues: before, newValues: { endpoint: c.endpoint, source: c.source, fieldPath: c.fieldPath } });
    return PerformanceIntegrationOverviewService.overview();
  }

  static async removeMapping(goalId: string, actor: any) {
    const g = await prisma.performanceGoal.findUnique({ where: { id: goalId }, select: { id: true, syncEndpointPath: true, syncConfig: true, isPendingApproval: true } });
    if (!g || !g.syncEndpointPath) throw new IntegrationError("That goal has no mapping.", 404);
    if (g.isPendingApproval) throw new IntegrationError("A value from this source is waiting for approval. Decide it before removing the mapping.");
    const cfg = { ...(g.syncConfig || {}) }; delete cfg.fieldPath;
    await prisma.performanceGoal.update({ where: { id: goalId }, data: { syncEndpointPath: null, syncConfig: Object.keys(cfg).length ? cfg : null } });
    await AuditService.log({ userId: actor.id, action: "DELETE", entityType: "PerformanceIntegrationMapping", entityId: goalId, oldValues: { endpoint: g.syncEndpointPath } });
    return PerformanceIntegrationOverviewService.overview();
  }

  /** Runs each mapped goal's sync in turn; one failure never stops the rest. */
  static async refreshAll(actor: any, only?: string) {
    const goals = await prisma.performanceGoal.findMany({ where: { syncEndpointPath: { not: null }, ...(only ? { id: only } : {}) }, select: { id: true, title: true } });
    if (!goals.length) throw new IntegrationError(only ? "That goal has no mapping." : "There are no mappings to refresh.");
    const results = [];
    for (const g of goals) {
      try { await PerformanceIntegrationService.runManualSync({ goalId: g.id, actor }); results.push({ goalId: g.id, goal: g.title, ok: true }); }
      catch (e) { results.push({ goalId: g.id, goal: g.title, ok: false, error: String(e?.message || e).slice(0, 300) }); }
    }
    return { results, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, overview: await PerformanceIntegrationOverviewService.overview() };
  }
}

/**
 * Refreshes each source mapping on its own schedule (its tracking frequency). The mappings page showed a refresh frequency
 * and marked mappings stale by it, but nothing refreshed them — only the Refresh button did. Hourly check; a mapping is due
 * when it has never synced or its last sync is older than its frequency. In-process feeds (AUM, CAC) are kept current by
 * their own modules and are not fetched. Off with PERFORMANCE_INTEGRATION_REFRESH_JOB=off.
 */
export async function runDueIntegrationRefreshes(nowMs = Date.now()) {
  const goals = await prisma.performanceGoal.findMany({ where: { syncEndpointPath: { contains: "/v1/" } }, select: { id: true, createdById: true, trackingFrequency: true, lastSyncedAt: true } });
  const due = goals.filter((g) => { const days = FREQ_DAYS[String(g.trackingFrequency || "monthly").toLowerCase()] || 31; return !g.lastSyncedAt || nowMs - +new Date(g.lastSyncedAt) >= days * 86400000; });
  const out = { due: due.length, ok: 0, failed: 0 };
  for (const g of due) {
    try { await PerformanceIntegrationService.runManualSync({ goalId: g.id, actor: { id: g.createdById } }); out.ok++; }
    catch (e: any) { out.failed++; console.warn(`[performance-integration-refresh] ${g.id}: ${String(e?.message || e).slice(0, 200)}`); }
  }
  return out;
}

export function startPerformanceIntegrationRefreshScheduler() {
  if (String(process.env.PERFORMANCE_INTEGRATION_REFRESH_JOB || "").toLowerCase() === "off") return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { const r = await runDueIntegrationRefreshes(); if (r.due) console.log(`[performance-integration-refresh] ${r.ok} refreshed, ${r.failed} failed`); }
    catch (e: any) { console.warn("[performance-integration-refresh] run failed:", e?.message || e); }
    finally { running = false; }
  };
  setTimeout(() => { tick(); setInterval(tick, 60 * 60 * 1000); }, 300 * 1000);
}
