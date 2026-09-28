// @ts-nocheck
import { prisma } from "../utils/database";
import { PerformanceKpiRegistryService } from "./PerformanceKpiRegistryService";
import { PerformanceRiskService } from "./PerformanceRiskService";

export type ReportOutput = { columns: string[]; rows: Array<Array<string | number | null>>; summary: Array<[string, string]> };
export type ReportParams = { from?: string; to?: string; department?: string };

const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const name = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : "");
const pct = (v) => (v == null ? "" : `${Math.round(Number(v) * 10) / 10}%`);
const range = (p: ReportParams) => ({ from: p.from ? new Date(p.from) : null, to: p.to ? new Date(p.to + "T23:59:59.999Z") : null });
const inRange = (d, r) => (!r.from || new Date(d) >= r.from) && (!r.to || new Date(d) <= r.to);

export const REPORT_TYPES: Record<string, { label: string; category: string; description: string; usesPeriod: boolean; usesDepartment: boolean; run: (p: ReportParams) => Promise<ReportOutput> }> = {
  kpi_attainment: {
    label: "KPI attainment", category: "KPI", description: "Every registered KPI with its owner, target and average attainment across linked goals.", usesPeriod: false, usesDepartment: false,
    run: async () => {
      const r = await PerformanceKpiRegistryService.list();
      const rows = r.kpis.map((k) => [k.code || "", k.name, k.scorecardPillar || "", k.ownerName || "Unassigned", k.targetValue ?? "", k.linkedGoals, k.averageProgress == null ? "" : pct(k.averageProgress), String(k.approvalStatus).replace("_", " ")]);
      return { columns: ["Code", "KPI", "Perspective", "Owner", "Target", "Linked goals", "Average attainment", "Status"], rows, summary: [["KPIs", String(r.kpis.length)], ["Active", String(r.kpis.filter((k) => k.isActive).length)], ["With linked goals", String(r.kpis.filter((k) => k.linkedGoals).length)]] };
    }
  },
  goals_progress: {
    label: "Goals and objectives progress", category: "Executive", description: "Goals with department, owner, target, current value and progress.", usesPeriod: true, usesDepartment: true,
    run: async (p) => {
      const rg = range(p);
      const goals = await prisma.performanceGoal.findMany({ where: p.department ? { departmentName: p.department } : {}, include: { assignedTo: { select: { firstName: true, lastName: true, email: true } }, kpi: { select: { name: true } } }, orderBy: { endDate: "asc" } });
      const use = goals.filter((g) => inRange(g.endDate, rg));
      const rows = use.map((g) => [g.title, g.type, g.departmentName || "", name(g.assignedTo), g.kpi ? g.kpi.name : "", g.targetValue == null ? "" : Number(g.targetValue), g.currentValue == null ? "" : Number(g.currentValue), pct(g.progressPercentage), fmt(g.endDate), g.status]);
      const avg = use.length ? use.reduce((a, g) => a + Number(g.progressPercentage || 0), 0) / use.length : null;
      return { columns: ["Goal", "Level", "Department", "Owner", "KPI", "Target", "Current", "Progress", "Due", "Status"], rows, summary: [["Goals", String(use.length)], ["Average progress", avg == null ? "—" : pct(avg)], ["Completed", String(use.filter((g) => /complet/i.test(g.status)).length)]] };
    }
  },
  risk_register: {
    label: "Enterprise risk register", category: "Risk", description: "Active risks with inherent and residual scores, appetite position and next review.", usesPeriod: false, usesDepartment: true,
    run: async (p) => {
      let risks = await PerformanceRiskService.list();
      if (p.department) risks = risks.filter((r) => r.departmentName === p.department);
      const rows = risks.map((r) => [r.reference, r.title, r.category, r.ownerName || "Unassigned", r.inherentScore, r.residualScore ?? "", r.appetitePosition || "", r.status, fmt(r.nextReviewDate), r.openTreatmentCount]);
      return { columns: ["Reference", "Risk", "Category", "Owner", "Inherent", "Residual", "Appetite", "Status", "Next review", "Open treatments"], rows, summary: [["Risks", String(risks.length)], ["Above appetite", String(risks.filter((r) => r.appetitePosition === "above").length)], ["Reviews overdue", String(risks.filter((r) => r.status !== "closed" && r.reviewDueInDays != null && r.reviewDueInDays < 0).length)]] };
    }
  },
  corrective_actions: {
    label: "Corrective actions", category: "Governance", description: "Recovery actions with owner, severity, progress and target date.", usesPeriod: true, usesDepartment: true,
    run: async (p) => {
      const rg = range(p);
      const list = await prisma.performanceCorrectiveAction.findMany({ include: { owner: { select: { firstName: true, lastName: true, email: true } }, department: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
      const use = list.filter((a) => inRange(a.createdAt, rg) && (!p.department || (a.department && a.department.name === p.department)));
      const rows = use.map((a) => [a.reference, a.title, a.trigger || "", name(a.owner), a.department ? a.department.name : "", a.severity, a.status, a.progress ?? "", fmt(a.targetDate), a.rootCause || ""]);
      return { columns: ["Reference", "Action", "Trigger", "Owner", "Department", "Severity", "Status", "Progress %", "Target", "Root cause"], rows, summary: [["Actions", String(use.length)], ["Open", String(use.filter((a) => a.status !== "closed").length)], ["Overdue", String(use.filter((a) => a.status !== "closed" && a.targetDate && +new Date(a.targetDate) < Date.now()).length)]] };
    }
  },
  alerts_register: {
    label: "Alerts and escalations", category: "Governance", description: "Raised alerts with severity, owner, escalation level and status.", usesPeriod: true, usesDepartment: false,
    run: async (p) => {
      const rg = range(p);
      const rows0 = await prisma.$queryRawUnsafe("SELECT a.`reference`, a.`title`, a.`source`, a.`severity`, a.`status`, a.`escalation_level` AS lvl, a.`raised_at` AS raisedAt, a.`resolved_at` AS resolvedAt, a.`sla_due_at` AS slaDueAt, CONCAT_WS(' ', u.`firstName`, u.`lastName`) AS owner FROM `performance_alerts` a LEFT JOIN `users` u ON u.`id` = a.`owner_id` ORDER BY a.`raised_at` DESC LIMIT 2000");
      const use = rows0.filter((a) => inRange(a.raisedAt, rg));
      const rows = use.map((a) => [a.reference, a.title, a.source, a.severity, a.owner || "", Number(a.lvl), a.status, fmt(a.raisedAt), fmt(a.resolvedAt), a.status !== "resolved" && a.slaDueAt && +new Date(a.slaDueAt) < Date.now() ? "Yes" : ""]);
      return { columns: ["Reference", "Alert", "Source", "Severity", "Owner", "Escalation", "Status", "Raised", "Resolved", "SLA breached"], rows, summary: [["Alerts", String(use.length)], ["Unresolved", String(use.filter((a) => a.status !== "resolved").length)], ["Critical unresolved", String(use.filter((a) => a.severity === "critical" && a.status !== "resolved").length)]] };
    }
  },
  review_completion: {
    label: "Review completion", category: "People", description: "Performance reviews by stage, rating and due date.", usesPeriod: true, usesDepartment: false,
    run: async (p) => {
      const rg = range(p);
      const list = await prisma.performanceReview.findMany({ include: { reviewee: { select: { firstName: true, lastName: true, email: true, userDepartment: true } }, reviewer: { select: { firstName: true, lastName: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 3000 });
      const use = list.filter((r) => inRange(r.createdAt, rg));
      const rows = use.map((r) => [r.title, r.reviewPeriod, name(r.reviewee), r.reviewee && r.reviewee.userDepartment ? r.reviewee.userDepartment : "", name(r.reviewer), r.stage, r.ratingValue ?? "", fmt(r.dueDate), fmt(r.finalizedAt)]);
      return { columns: ["Review", "Period", "Employee", "Department", "Reviewer", "Stage", "Rating", "Due", "Finalized"], rows, summary: [["Reviews", String(use.length)], ["Finalized", String(use.filter((r) => r.stage === "FINALIZED").length)], ["Overdue", String(use.filter((r) => r.stage !== "FINALIZED" && r.dueDate && +new Date(r.dueDate) < Date.now()).length)]] };
    }
  },
  contracts_status: {
    label: "Performance contracts status", category: "People", description: "Contracts with readiness, weights and signatures.", usesPeriod: false, usesDepartment: true,
    run: async (p) => {
      const { PerformanceContractLifecycleService } = await import("./PerformanceContractLifecycleService");
      let list = await PerformanceContractLifecycleService.registry();
      if (p.department) list = list.filter((c) => c.departmentName === p.department);
      const rows = list.map((c) => [c.title, c.contractType, c.subjectName || "", c.departmentName || "", `v${c.versionNo}`, c.state, c.weightTotal, `${c.signaturesGiven}/${c.signaturesNeeded}`, c.evidenceCoverage == null ? "" : pct(c.evidenceCoverage)]);
      return { columns: ["Contract", "Type", "Employee", "Department", "Version", "Status", "Weight total", "Signed", "Evidence"], rows, summary: [["Contracts", String(list.length)], ["Approved", String(list.filter((c) => c.state === "approved").length)], ["In review", String(list.filter((c) => c.state === "in_review").length)]] };
    }
  },
  timesheet_utilisation: {
    label: "Timesheet utilisation", category: "People", description: "Hours logged by person and project for weeks in the period.", usesPeriod: true, usesDepartment: false,
    run: async (p) => {
      const rg = range(p);
      const entries = await prisma.timesheetEntry.findMany({ where: { ...(rg.from || rg.to ? { date: { ...(rg.from ? { gte: rg.from } : {}), ...(rg.to ? { lte: rg.to } : {}) } } : {}) }, include: { project: { select: { name: true } }, timesheet: { select: { status: true, user: { select: { firstName: true, lastName: true, email: true } } } } }, take: 20000 });
      const by = new Map();
      entries.forEach((e) => { const k = `${name(e.timesheet.user)}|${e.project.name}`; const c = by.get(k) || { person: name(e.timesheet.user), project: e.project.name, hours: 0, billable: 0 }; c.hours += Number(e.hours); if (e.billable) c.billable += Number(e.hours); by.set(k, c); });
      const rows = [...by.values()].sort((a, b) => b.hours - a.hours).map((c) => [c.person, c.project, Math.round(c.hours * 100) / 100, Math.round(c.billable * 100) / 100]);
      const total = rows.reduce((a, r) => a + Number(r[2]), 0);
      return { columns: ["Person", "Project", "Hours", "Billable hours"], rows, summary: [["Lines", String(rows.length)], ["Hours", String(Math.round(total * 100) / 100)], ["People", String(new Set(rows.map((r) => r[0])).size)]] };
    }
  },
  scorecard_summary: {
    label: "Organization scorecard summary", category: "Executive", description: "Balanced scorecard perspectives with weight, score and status.", usesPeriod: false, usesDepartment: false,
    run: async () => {
      const { PerformanceScorecardService } = await import("./PerformanceScorecardService");
      const org = await PerformanceScorecardService.getOrgBscDashboard?.({ id: "system", role: { name: "admin" } }).catch(() => null);
      const pillars = (org && org.pillars) || [];
      if (!pillars.length) {
        const ps = await prisma.scorecardPillar.findMany({ where: { id: { startsWith: "bsc_" } }, orderBy: { id: "asc" } });
        return { columns: ["Perspective", "Weight", "Score", "Status"], rows: ps.map((x) => [x.displayName || x.canonicalName, x.weight == null ? "" : `${Number(x.weight)}%`, "", ""]), summary: [["Perspectives", String(ps.length)]] };
      }
      return { columns: ["Perspective", "Weight", "Score", "Status"], rows: pillars.map((x) => [x.pillarLabel, `${x.pillarWeight}%`, x.pillarScore, x.pillarStatus]), summary: [["Organization score", String(org.orgBscScore)], ["Status", String(org.orgBscStatus)]] };
    }
  }
};
