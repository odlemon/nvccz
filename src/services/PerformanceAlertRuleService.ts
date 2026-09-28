// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import PerformanceAlertService from "./PerformanceAlertService";
import { dispatchProcurementNotification } from "./ProcurementNotificationService";
import { usersWithPermission } from "./notifications/ProcurementNotifier";

export const RULE_SOURCES = {
  corrective_overdue: { label: "Corrective action overdue", thresholdLabel: "Days past target", path: "/performance/corrective" },
  risk_review_overdue: { label: "Risk review overdue", thresholdLabel: "Days past review date", path: "/performance/risks" },
  risk_above_appetite: { label: "Risk above appetite", thresholdLabel: "Points above the limit", path: "/performance/risks" },
  treatment_overdue: { label: "Risk treatment overdue", thresholdLabel: "Days past due", path: "/performance/risks" },
  goal_red_zone: { label: "Goal in the red zone", thresholdLabel: "Not used", path: "/performance/objectives" }
} as const;

export const DEFAULT_RULES = [
  { code: "CORRECTIVE_OVERDUE", name: "Corrective action overdue", source: "corrective_overdue", severity: "warning", threshold: 0, level1Minutes: 1440, level2Minutes: 4320, level3Minutes: 10080, resolveWithinMinutes: 10080, description: "Raised when an open corrective action passes its target date." },
  { code: "RISK_REVIEW_OVERDUE", name: "Risk review overdue", source: "risk_review_overdue", severity: "warning", threshold: 0, level1Minutes: 2880, level2Minutes: 10080, level3Minutes: 20160, resolveWithinMinutes: 20160, description: "Raised when an active risk is past its review date." },
  { code: "RISK_ABOVE_APPETITE", name: "Risk above appetite", source: "risk_above_appetite", severity: "critical", threshold: 0, level1Minutes: 240, level2Minutes: 1440, level3Minutes: 4320, resolveWithinMinutes: 4320, description: "Raised when a residual risk score exceeds its appetite limit." },
  { code: "TREATMENT_OVERDUE", name: "Risk treatment overdue", source: "treatment_overdue", severity: "warning", threshold: 0, level1Minutes: 1440, level2Minutes: 4320, level3Minutes: 10080, resolveWithinMinutes: 10080, description: "Raised when a risk treatment action passes its due date." },
  { code: "GOAL_RED_ZONE", name: "Goal in the red zone", source: "goal_red_zone", severity: "critical", threshold: 0, level1Minutes: 1440, level2Minutes: 4320, level3Minutes: 10080, resolveWithinMinutes: 10080, description: "Raised when a goal's performance zone turns red." }
];

class RuleError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}
export { RuleError };

const CHANNELS = ["in_app", "email"];
const SEVERITIES = ["info", "warning", "critical"];
const int = (v, label, min, max) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new RuleError(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
};

export class PerformanceAlertRuleService {
  static async ensureDefaults(actorId: string) {
    const count = await prisma.performanceAlertRule.count();
    if (count > 0) return;
    for (const r of DEFAULT_RULES) {
      await prisma.performanceAlertRule.upsert({ where: { code: r.code }, update: {}, create: { ...r, channels: "in_app", isActive: true, createdById: actorId } });
    }
  }

  static async list(actorId: string) {
    await PerformanceAlertRuleService.ensureDefaults(actorId);
    const rules = await prisma.performanceAlertRule.findMany({ orderBy: { name: "asc" } });
    const open = await prisma.$queryRawUnsafe<Array<{ rule_id: string; c: bigint }>>("SELECT `rule_id`, COUNT(*) AS c FROM `performance_alerts` WHERE `rule_id` IS NOT NULL AND `status` <> 'resolved' GROUP BY `rule_id`");
    return rules.map((r) => ({ ...r, sourceLabel: RULE_SOURCES[r.source]?.label || r.source, thresholdLabel: RULE_SOURCES[r.source]?.thresholdLabel || "", openAlerts: Number(open.find((o) => o.rule_id === r.id)?.c || 0) }));
  }

  private static clean(input: any, isCreate: boolean) {
    const d: any = {};
    if (isCreate || input.name !== undefined) {
      const name = String(input.name ?? "").trim();
      if (!name) throw new RuleError("Rule name is required.");
      d.name = name.slice(0, 160);
    }
    if (isCreate || input.source !== undefined) {
      if (!RULE_SOURCES[input.source]) throw new RuleError(`Source must be one of: ${Object.keys(RULE_SOURCES).join(", ")}.`);
      d.source = input.source;
    }
    if (input.description !== undefined) d.description = String(input.description ?? "").trim() || null;
    if (input.severity !== undefined) {
      if (!SEVERITIES.includes(input.severity)) throw new RuleError("Severity must be info, warning or critical.");
      d.severity = input.severity;
    }
    if (input.threshold !== undefined) d.threshold = int(input.threshold, "Threshold", 0, 3650);
    for (const [k, label] of [["level1Minutes", "Level 1 window"], ["level2Minutes", "Level 2 window"], ["level3Minutes", "Level 3 window"], ["resolveWithinMinutes", "Resolution SLA"]]) {
      if (input[k] !== undefined) d[k] = int(input[k], label, 5, 525600);
    }
    if (input.channels !== undefined) {
      const list = Array.isArray(input.channels) ? input.channels : String(input.channels).split(",");
      const chosen = list.map((c) => String(c).trim()).filter(Boolean);
      if (!chosen.length) throw new RuleError("Choose at least one notification channel.");
      if (chosen.some((c) => !CHANNELS.includes(c))) throw new RuleError(`Channels must be from: ${CHANNELS.join(", ")}.`);
      d.channels = chosen.join(",");
    }
    if (input.isActive !== undefined) d.isActive = !!input.isActive;
    return d;
  }

  private static assertWindows(d, current = {}) {
    const l1 = d.level1Minutes ?? current.level1Minutes, l2 = d.level2Minutes ?? current.level2Minutes, l3 = d.level3Minutes ?? current.level3Minutes;
    if (l1 != null && l2 != null && l2 <= l1) throw new RuleError("Level 2 must come after level 1.");
    if (l2 != null && l3 != null && l3 <= l2) throw new RuleError("Level 3 must come after level 2.");
  }

  static async create(input: any, actor: any) {
    const d = PerformanceAlertRuleService.clean(input, true);
    const full = { severity: "warning", threshold: 0, level1Minutes: 1440, level2Minutes: 4320, level3Minutes: 10080, resolveWithinMinutes: 10080, channels: "in_app", ...d };
    PerformanceAlertRuleService.assertWindows(full);
    const code = String(input.code || d.name).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "RULE";
    if (await prisma.performanceAlertRule.findUnique({ where: { code } })) throw new RuleError("A rule with this name already exists.", 409);
    const row = await prisma.performanceAlertRule.create({ data: { ...full, code, isActive: true, createdById: actor.id } });
    await AuditService.log({ userId: actor.id, action: "CREATE", entityType: "PerformanceAlertRule", entityId: row.id, newValues: row });
    return row;
  }

  static async update(id: string, input: any, actor: any) {
    const cur = await prisma.performanceAlertRule.findUnique({ where: { id } });
    if (!cur) throw new RuleError("Rule not found.", 404);
    const d = PerformanceAlertRuleService.clean(input, false);
    if (d.source && d.source !== cur.source) throw new RuleError("A rule's source cannot be changed. Create a new rule instead.");
    delete d.source;
    if (!Object.keys(d).length) throw new RuleError("Nothing to update.");
    PerformanceAlertRuleService.assertWindows(d, cur);
    const row = await prisma.performanceAlertRule.update({ where: { id }, data: d });
    await AuditService.log({ userId: actor.id, action: "UPDATE", entityType: "PerformanceAlertRule", entityId: id, oldValues: cur, newValues: row });
    return row;
  }

  static async remove(id: string, actor: any) {
    const cur = await prisma.performanceAlertRule.findUnique({ where: { id } });
    if (!cur) throw new RuleError("Rule not found.", 404);
    const open = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>("SELECT COUNT(*) AS c FROM `performance_alerts` WHERE `rule_id` = ? AND `status` <> 'resolved'", id);
    if (Number(open[0]?.c || 0) > 0) throw new RuleError("Resolve this rule's open alerts before deleting it, or switch the rule off.");
    await prisma.performanceAlertRule.delete({ where: { id } });
    await AuditService.log({ userId: actor.id, action: "DELETE", entityType: "PerformanceAlertRule", entityId: id, oldValues: cur });
    return { id };
  }

  // ---- events
  static async recordEvent(alertId: string, event: string, note: string | null, actorId: string | null) {
    await prisma.performanceAlertEvent.create({ data: { alertId, event, note: note || null, actorId: actorId || null } });
  }
  static async events(alertId: string) {
    const rows = await prisma.performanceAlertEvent.findMany({ where: { alertId }, orderBy: { createdAt: "desc" } });
    const ids = [...new Set(rows.map((r) => r.actorId).filter(Boolean))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, email: true } }) : [];
    const nm = new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email]));
    return rows.map((r) => ({ ...r, actorName: r.actorId ? nm.get(r.actorId) || null : "System" }));
  }

  // ---- evaluation
  private static async candidates(rule) {
    const now = new Date();
    const cut = (days) => new Date(now.getTime() - days * 86400000);
    if (rule.source === "corrective_overdue") {
      const rows = await prisma.performanceCorrectiveAction.findMany({ where: { status: { not: "closed" }, targetDate: { lt: cut(rule.threshold) } }, select: { id: true, reference: true, title: true, ownerId: true, departmentId: true } });
      return rows.map((r) => ({ key: `corrective:${r.id}`, title: `Corrective action ${r.reference} is overdue`, description: r.title, ownerId: r.ownerId, departmentId: r.departmentId }));
    }
    if (rule.source === "risk_review_overdue") {
      const rows = await prisma.performanceRisk.findMany({ where: { status: { not: "closed" }, nextReviewDate: { lt: cut(rule.threshold) } }, select: { id: true, reference: true, title: true, ownerId: true, departmentId: true } });
      return rows.map((r) => ({ key: `risk-review:${r.id}`, title: `Risk ${r.reference} review is overdue`, description: r.title, ownerId: r.ownerId, departmentId: r.departmentId }));
    }
    if (rule.source === "risk_above_appetite") {
      const rows = await prisma.performanceRisk.findMany({ where: { status: { not: "closed" }, residualLikelihood: { not: null } }, select: { id: true, reference: true, title: true, ownerId: true, departmentId: true, residualLikelihood: true, residualImpact: true, appetiteLimit: true } });
      return rows.filter((r) => r.residualLikelihood * r.residualImpact > r.appetiteLimit + rule.threshold).map((r) => ({ key: `risk-appetite:${r.id}`, title: `Risk ${r.reference} is above appetite`, description: `${r.title} (residual ${r.residualLikelihood * r.residualImpact}, limit ${r.appetiteLimit})`, ownerId: r.ownerId, departmentId: r.departmentId }));
    }
    if (rule.source === "treatment_overdue") {
      const rows = await prisma.performanceRiskTreatment.findMany({ where: { status: { in: ["open", "in_progress"] }, dueDate: { lt: cut(rule.threshold) } } });
      const risks = rows.length ? await prisma.performanceRisk.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.riskId))] } }, select: { id: true, reference: true, departmentId: true } }) : [];
      return rows.map((r) => { const k = risks.find((x) => x.id === r.riskId); return { key: `treatment:${r.id}`, title: `Treatment action on ${k?.reference || "a risk"} is overdue`, description: r.title, ownerId: r.ownerId, departmentId: k?.departmentId || null }; });
    }
    if (rule.source === "goal_red_zone") {
      const rows = await prisma.performanceGoal.findMany({ where: { performanceRiskZone: { in: ["RED", "RED ZONE", "RED_ZONE"] }, status: { notIn: ["completed", "cancelled"] } }, select: { id: true, title: true, assignedToId: true, departmentName: true } }).catch(() => []);
      return rows.map((r) => ({ key: `goal:${r.id}`, title: `Goal is in the red zone`, description: r.title, ownerId: r.assignedToId || null, departmentId: null }));
    }
    return [];
  }

  /** Raise alerts for new breaches, resolve the ones whose condition has cleared, then escalate what has waited too long. */
  static async evaluate(actorId: string) {
    await PerformanceAlertRuleService.ensureDefaults(actorId);
    const rules = await prisma.performanceAlertRule.findMany({ where: { isActive: true } });
    let raised = 0, cleared = 0, escalated = 0;
    for (const rule of rules) {
      const cands = await PerformanceAlertRuleService.candidates(rule);
      const keys = new Set(cands.map((c) => c.key));
      const existing = await prisma.$queryRawUnsafe<Array<{ id: string; dedupe_key: string; status: string }>>("SELECT `id`, `dedupe_key`, `status` FROM `performance_alerts` WHERE `rule_id` = ? AND `status` <> 'resolved'", rule.id);
      const have = new Set(existing.map((e) => e.dedupe_key));
      for (const c of cands) {
        if (have.has(c.key)) continue;
        try {
          const alert = await PerformanceAlertService.createAlert({ title: c.title, description: c.description, source: RULE_SOURCES[rule.source].label, severity: rule.severity, ownerId: c.ownerId, departmentId: c.departmentId }, rule.createdById || actorId);
          await prisma.$executeRawUnsafe("UPDATE `performance_alerts` SET `rule_id` = ?, `dedupe_key` = ?, `sla_due_at` = ? WHERE `id` = ?", rule.id, c.key, new Date(Date.now() + rule.resolveWithinMinutes * 60000), alert.id);
          await PerformanceAlertRuleService.recordEvent(alert.id, "raised", `Raised by rule “${rule.name}”`, null);
          await PerformanceAlertRuleService.notify(rule, alert, c.ownerId ? [c.ownerId] : await PerformanceAlertRuleService.deptHeads(c.departmentId), `New alert: ${c.title}`);
          raised++;
        } catch (e) { console.error("[performance-alerts] raise failed", e?.message || e); }
      }
      for (const e of existing) {
        if (!keys.has(e.dedupe_key)) {
          await prisma.$executeRawUnsafe("UPDATE `performance_alerts` SET `status` = 'resolved', `resolved_at` = ?, `updated_at` = ? WHERE `id` = ?", new Date(), new Date(), e.id);
          await PerformanceAlertRuleService.recordEvent(e.id, "auto_resolved", "The condition that raised it has cleared.", null);
          cleared++;
        }
      }
    }
    escalated = await PerformanceAlertRuleService.escalateWaiting(rules);
    return { raised, cleared, escalated, rulesEvaluated: rules.length };
  }

  static async deptHeads(departmentId: string | null) {
    if (!departmentId) return [];
    const u = await prisma.user.findMany({ where: { departmentId, departmentRole: "HEAD", status: "ACTIVE" }, select: { id: true } });
    return u.map((x) => x.id);
  }

  private static async adminIds() {
    return (await usersWithPermission("performance.alerts.manage")).slice(0, 50);
  }

  static async escalateWaiting(rules) {
    const byId = new Map(rules.map((r) => [r.id, r]));
    const waiting = await prisma.$queryRawUnsafe<Array<any>>("SELECT `id`, `rule_id`, `raised_at`, `escalation_level`, `owner_id`, `department_id`, `title` FROM `performance_alerts` WHERE `rule_id` IS NOT NULL AND `status` <> 'resolved'");
    let n = 0;
    for (const a of waiting) {
      const rule = byId.get(a.rule_id); if (!rule) continue;
      const age = (Date.now() - new Date(a.raised_at).getTime()) / 60000;
      const level = age >= rule.level3Minutes ? 3 : age >= rule.level2Minutes ? 2 : age >= rule.level1Minutes ? 1 : 0;
      if (level > a.escalation_level) {
        await prisma.$executeRawUnsafe("UPDATE `performance_alerts` SET `status` = 'escalated', `escalation_level` = ?, `updated_at` = ? WHERE `id` = ?", level, new Date(), a.id);
        await PerformanceAlertRuleService.recordEvent(a.id, "auto_escalated", `Escalated to level ${level} after ${Math.round(age)} minutes unresolved.`, null);
        const to = level === 1 ? (a.owner_id ? [a.owner_id] : await PerformanceAlertRuleService.deptHeads(a.department_id)) : level === 2 ? await PerformanceAlertRuleService.deptHeads(a.department_id) : await PerformanceAlertRuleService.adminIds();
        await PerformanceAlertRuleService.notify(rule, { id: a.id }, to, `Escalated (level ${level}): ${a.title}`);
        n++;
      }
    }
    return n;
  }

  static async notify(rule, alert, userIds, title) {
    try {
      const ids = [...new Set(userIds.filter(Boolean))];
      if (!ids.length) return;
      const channels = String(rule.channels || "in_app").split(",");
      const users = channels.includes("email") ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }) : [];
      await dispatchProcurementNotification({ userIds: ids, title, message: title, type: "PERFORMANCE_ALERT", relatedEntity: "PerformanceAlert", relatedEntityId: alert.id, data: { path: "/performance/alerts" }, quiet: !channels.includes("in_app") });
      if (channels.includes("email")) {
        for (const u of users.filter((x) => x.email)) await dispatchProcurementNotification({ title, message: title, type: "PERFORMANCE_ALERT", email: { to: [u.email], subject: title, bodyInnerHtml: `<p>${title}</p><p>Open Performance Management &rsaquo; Alerts &amp; Audit to act on it.</p>`, preheader: title } });
      }
    } catch (e) { console.error("[performance-alerts] notify failed", e?.message || e); }
  }
}

/** Retries failed Performance → GL postings every 15 minutes (off with PERFORMANCE_GL_RETRY_JOB=off). */
export function startPerformanceGlRetryScheduler() {
  if (String(process.env.PERFORMANCE_GL_RETRY_JOB || "").toLowerCase() === "off") return;
  const tick = async () => {
    try {
      const { PerformanceGlPostingService } = await import("./PerformanceGlPostingService");
      const r = await PerformanceGlPostingService.retryFailed({ limit: 100 });
      if (r.tried) console.log(`[performance-gl-retry] tried ${r.tried}, posted ${r.posted}, still failing ${r.stillFailing}`);
    } catch (e: any) {
      console.warn("[performance-gl-retry] run failed:", e?.message || e);
    }
  };
  setTimeout(() => { tick(); setInterval(tick, 15 * 60 * 1000); }, 240 * 1000);
}

export function startPerformanceAlertScheduler() {
  if (String(process.env.PERFORMANCE_ALERT_JOB || "").toLowerCase() === "off") return;
  const run = async () => {
    try {
      const admin = await prisma.user.findFirst({ where: { status: "ACTIVE", role: { name: "admin" } }, select: { id: true } });
      if (!admin) return;
      const s = await PerformanceAlertRuleService.evaluate(admin.id);
      console.log("[performance-alerts]", JSON.stringify(s));
    } catch (e) { console.error("[performance-alerts] failed:", e?.message || e); }
  };
  let last = 0;
  const tick = async () => {
    try {
      const row = await prisma.performanceSetting.findUnique({ where: { settingKey: "workflow.alertEvaluationMinutes" } });
      const minutes = Number(row?.value) >= 1 ? Number(row.value) : 10;
      if (Date.now() - last >= minutes * 60_000 - 1000) { last = Date.now(); await run(); }
    } catch (_) { /* the next tick tries again */ }
  };
  setTimeout(tick, 180_000).unref?.();
  setInterval(tick, 60_000).unref?.();
}
export default PerformanceAlertRuleService;
