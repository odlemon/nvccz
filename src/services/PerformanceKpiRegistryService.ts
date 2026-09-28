// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";

export const UPDATE_METHODS = ["manual", "workflow", "integrated"];
export const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "annually"];
export const APPROVAL = { draft: "Draft", pending_approval: "Pending approval", approved: "Approved", rejected: "Rejected", retired: "Retired" };
export const UNITS: Record<string, { category: string; symbol: string; position: "prefix" | "suffix" }> = {
  percent: { category: "Percentage", symbol: "%", position: "suffix" },
  currency: { category: "Currency", symbol: "$", position: "prefix" },
  number: { category: "Count", symbol: "", position: "suffix" },
  days: { category: "Time", symbol: "days", position: "suffix" },
  score: { category: "Score", symbol: "pts", position: "suffix" }
};
const TRANSITIONS: Record<string, string[]> = { draft: ["pending_approval"], pending_approval: ["approved", "rejected"], rejected: ["pending_approval"], approved: ["retired"], retired: ["approved"] };

class KpiError extends Error {
  statusCode: number;
  constructor(m: string, s = 400) {
    super(m);
    this.statusCode = s;
  }
}
export { KpiError };
const USER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;
const nameOf = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : null);
const txt = (v, max, label, required = false) => {
  const s = v == null ? "" : String(v).trim();
  if (!s) {
    if (required) throw new KpiError(`${label} is required.`);
    return null;
  }
  if (s.length > max) throw new KpiError(`${label} must be ${max} characters or fewer.`);
  return s;
};
const dec = (v, label, req = false) => {
  if (v === undefined || v === null || v === "") {
    if (req) throw new KpiError(`${label} is required.`);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new KpiError(`${label} must be a number.`);
  return n;
};

export class PerformanceKpiRegistryService {
  static async list() {
    const [kpis, goals, pillars, glAccounts] = await Promise.all([
      prisma.kPI.findMany({ orderBy: { name: "asc" } }),
      prisma.performanceGoal.findMany({ where: { kpiId: { not: null } }, select: { id: true, kpiId: true, title: true, status: true, progressPercentage: true, performanceRiskZone: true } }),
      prisma.scorecardPillar.findMany({ select: { id: true, canonicalName: true, displayName: true } }),
      prisma.chartOfAccounts.findMany({ where: { isActive: true }, select: { accountNo: true, accountName: true, accountType: true }, orderBy: { accountNo: "asc" } })
    ]);
    const glName = new Map(glAccounts.map((a) => [a.accountNo, a.accountName]));
    const ownerIds = [...new Set(kpis.map((k) => k.ownerId).filter(Boolean))];
    const owners = ownerIds.length ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: USER_SELECT }) : [];
    const nm = new Map(owners.map((u) => [u.id, nameOf(u)]));
    return {
      pillars: pillars.map((p) => ({ id: p.id, name: p.displayName || p.canonicalName, canonicalName: p.canonicalName })),
      glAccounts,
      kpis: kpis.map((k) => {
        const mine = goals.filter((g) => g.kpiId === k.id);
        const progress = mine.map((g) => Number(g.progressPercentage)).filter(Number.isFinite);
        const exceptions = [];
        if (k.approvalStatus === "approved" || k.isActive) {
          if (!k.ownerId) exceptions.push("No owner");
          if (k.targetValue == null) exceptions.push("No target");
          if (!k.frequency) exceptions.push("No frequency");
        }
        if (k.approvalStatus === "pending_approval") exceptions.push("Awaiting approval");
        return {
          ...k,
          targetValue: k.targetValue == null ? null : Number(k.targetValue),
          amberThreshold: k.amberThreshold == null ? null : Number(k.amberThreshold),
          redThreshold: k.redThreshold == null ? null : Number(k.redThreshold),
          ownerName: k.ownerId ? nm.get(k.ownerId) || null : null,
          accountName: k.accountNumber ? glName.get(k.accountNumber) || null : null,
          linkedGoals: mine.length,
          activeGoals: mine.filter((g) => !["completed", "cancelled"].includes(String(g.status).toLowerCase())).length,
          averageProgress: progress.length ? Math.round((progress.reduce((a, b) => a + b, 0) / progress.length) * 10) / 10 : null,
          redGoals: mine.filter((g) => /RED/.test(String(g.performanceRiskZone || "").toUpperCase())).length,
          exceptions
        };
      })
    };
  }

  /**
   * KPI analytics for one reporting month: completion, band counts, six-month trend against the target trajectory,
   * department x perspective heatmap and the strongest / weakest KPIs. Everything comes from goals linked to KPIs
   * and their recorded progress events; nothing is estimated where there is no record.
   */
  static async analytics(period: string | undefined, department: string | undefined, pillar: string | undefined) {
    const now = new Date();
    const [y, m] = /^d{4}-d{2}$/.test(period || "") ? period!.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
    const monthEnd = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0, 23, 59, 59, 999));
    const where: any = { kpiId: { not: null }, status: { notIn: ["cancelled"] } };
    if (department) where.departmentName = department;
    if (pillar) where.scorecardPillar = pillar;
    const [goals, kpis] = await Promise.all([
      prisma.performanceGoal.findMany({ where, select: { id: true, kpiId: true, title: true, departmentName: true, scorecardPillar: true, progressPercentage: true, targetValue: true, monetaryValue: true, percentValue: true, startDate: true, endDate: true, lastCheckDate: true, isReverseKpi: true, status: true } }),
      prisma.kPI.findMany({ select: { id: true, code: true, name: true, scorecardPillar: true, amberThreshold: true, redThreshold: true, isActive: true } })
    ]);
    const events = goals.length ? await prisma.performanceGoalProgressEvent.findMany({ where: { goalId: { in: goals.map((g) => g.id) } }, select: { goalId: true, amount: true, recordedAt: true } }) : [];
    const kpiById = new Map(kpis.map((k) => [k.id, k]));
    const band = (att: number, k: any) => {
      const amber = k?.amberThreshold != null ? Number(k.amberThreshold) : 90;
      const red = k?.redThreshold != null ? Number(k.redThreshold) : 70;
      return att >= amber ? "on_track" : att >= red ? "at_risk" : "off_track";
    };
    const targetOf = (g) => Number(g.targetValue ?? g.monetaryValue ?? g.percentValue ?? 0) || 0;
    const attainmentAt = (g, at: Date) => {
      const t = targetOf(g);
      if (!t || g.isReverseKpi) return null;
      const sum = events.filter((e) => e.goalId === g.id && +new Date(e.recordedAt) <= +at).reduce((a, e) => a + Number(e.amount), 0);
      return Math.max(0, Math.min(150, (sum / t) * 100));
    };
    const trajectoryAt = (g, at: Date) => {
      const a = +new Date(g.startDate), b = +new Date(g.endDate);
      if (!(b > a)) return null;
      return Math.max(0, Math.min(100, ((+at - a) / (b - a)) * 100));
    };
    const current = goals.map((g) => ({ g, att: Number(g.progressPercentage ?? 0), k: kpiById.get(g.kpiId) }));
    const byKpi = new Map();
    for (const c of current) { const a = byKpi.get(c.g.kpiId) || []; a.push(c.att); byKpi.set(c.g.kpiId, a); }
    const kpiRows = [...byKpi.entries()].map(([kid, arr]) => { const k = kpiById.get(kid); const att = arr.reduce((a, b) => a + b, 0) / arr.length; return { id: kid, code: k?.code || null, name: k?.name || "KPI", pillar: k?.scorecardPillar || null, attainment: Math.round(att * 10) / 10, goals: arr.length, band: band(att, k) }; });
    const counts = { on_track: 0, at_risk: 0, off_track: 0 };
    kpiRows.forEach((r) => { counts[r.band]++; });
    const overall = current.length ? Math.round((current.reduce((a, c) => a + c.att, 0) / current.length) * 10) / 10 : null;
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1)); const end = monthEnd(d.getUTCFullYear(), d.getUTCMonth() + 1);
      const atts = goals.map((g) => attainmentAt(g, end)).filter((x) => x != null);
      const trs = goals.map((g) => trajectoryAt(g, end)).filter((x) => x != null);
      months.push({ month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, completion: atts.length ? Math.round((atts.reduce((a, b) => a + b, 0) / atts.length) * 10) / 10 : null, target: trs.length ? Math.round((trs.reduce((a, b) => a + b, 0) / trs.length) * 10) / 10 : null, goals: atts.length });
    }
    const prev = months[months.length - 2];
    const depts = [...new Set(goals.map((g) => g.departmentName).filter(Boolean))].sort();
    const pillars = [...new Set(goals.map((g) => g.scorecardPillar).filter(Boolean))].sort();
    const heat = depts.map((d) => ({ department: d, cells: pillars.map((p) => { const arr = current.filter((c) => c.g.departmentName === d && c.g.scorecardPillar === p).map((c) => c.att); return { pillar: p, value: arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null, goals: arr.length }; }) }));
    const fresh = goals.filter((g) => g.lastCheckDate && Date.now() - +new Date(g.lastCheckDate) <= 35 * 86400000).length;
    const sorted = kpiRows.slice().sort((a, b) => b.attainment - a.attainment);
    return {
      period: `${y}-${String(m).padStart(2, "0")}`,
      kpisInCatalogue: kpis.length, kpisWithResults: kpiRows.length, goals: goals.length,
      overallCompletion: overall, previousCompletion: prev?.completion ?? null,
      counts, evidenceCurrent: goals.length ? Math.round((fresh / goals.length) * 1000) / 10 : null, evidenceGoals: fresh,
      trend: months, heatmap: { departments: depts, pillars, rows: heat },
      top: sorted.slice(0, 5), bottom: sorted.slice(-5).reverse(), departments: depts, pillarsAvailable: pillars
    };
  }

  private static clean(input, creating) {
    const d: any = {};
    if (creating || input.name !== undefined) d.name = txt(input.name, 191, "Name", true);
    if (creating || input.code !== undefined) {
      d.code = String(txt(input.code, 80, "Code", true)).toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
    }
    if (input.description !== undefined || creating) d.catalogDescription = txt(input.description, 4000, "Definition", creating);
    if (input.frequency !== undefined) {
      const f = txt(input.frequency, 16, "Frequency");
      if (f && !FREQUENCIES.includes(f)) throw new KpiError(`Frequency must be one of: ${FREQUENCIES.join(", ")}.`);
      d.frequency = f;
    }
    if (input.updateMethod !== undefined) {
      const m = txt(input.updateMethod, 16, "Update method");
      if (m && !UPDATE_METHODS.includes(m)) throw new KpiError(`Update method must be one of: ${UPDATE_METHODS.join(", ")}.`);
      d.updateMethod = m;
    }
    if (input.sourceSystem !== undefined) d.sourceSystem = txt(input.sourceSystem, 64, "Source");
    if (input.evidenceRule !== undefined) d.evidenceRule = txt(input.evidenceRule, 255, "Evidence rule");
    if (input.targetValue !== undefined) d.targetValue = dec(input.targetValue, "Target");
    if (input.amberThreshold !== undefined) d.amberThreshold = dec(input.amberThreshold, "Amber threshold");
    if (input.redThreshold !== undefined) d.redThreshold = dec(input.redThreshold, "Red threshold");
    if (input.ownerId !== undefined) d.ownerId = input.ownerId ? String(input.ownerId) : null;
    if (input.isReverseKpi !== undefined) d.isReverseKpi = !!input.isReverseKpi;
    // where the KPI's progress posts in Accounting: a GL account and its side, or nothing (checked in assertRefs)
    if (input.accountNumber !== undefined) {
      d.accountNumber = txt(input.accountNumber, 64, "General ledger account");
      d.isFinancial = !!d.accountNumber;
      if (!d.accountNumber) Object.assign(d, { journalEntryType: null, accountType: null });
    }
    if (input.journalEntryType !== undefined && (input.accountNumber === undefined || d.accountNumber)) {
      const s = txt(input.journalEntryType, 16, "Side");
      if (s && !["Debit", "Credit"].includes(s)) throw new KpiError("The side must be Debit or Credit.");
      d.journalEntryType = s;
    }
    if (input.unitKind !== undefined) {
      const u = UNITS[input.unitKind];
      if (input.unitKind && !u) throw new KpiError(`Unit must be one of: ${Object.keys(UNITS).join(", ")}.`);
      if (u) Object.assign(d, { hasUnit: true, unitCategory: u.category, unit: input.unitKind, unitSymbol: u.symbol || input.unitKind, unitPosition: u.position });
    }
    return d;
  }

  private static async assertRefs(d, cur?: any) {
    const acctNo = d.accountNumber !== undefined ? d.accountNumber : cur?.accountNumber;
    if (d.accountNumber) {
      const a = await prisma.chartOfAccounts.findFirst({ where: { accountNo: d.accountNumber }, select: { accountNo: true, accountType: true, isActive: true } });
      if (!a) throw new KpiError(`General ledger account ${d.accountNumber} is not in the chart of accounts.`);
      if (a.isActive === false) throw new KpiError(`General ledger account ${d.accountNumber} is not active.`);
      d.accountType = a.accountType;
    }
    const side = d.journalEntryType !== undefined ? d.journalEntryType : cur?.journalEntryType;
    if (acctNo && !side) throw new KpiError("Choose which side of the general ledger account the progress posts to.");
    if (d.ownerId && !(await prisma.user.findUnique({ where: { id: d.ownerId }, select: { id: true } }))) throw new KpiError("The chosen owner does not exist.");
    if (d.scorecardPillar && !(await prisma.scorecardPillar.findFirst({ where: { canonicalName: d.scorecardPillar } }))) throw new KpiError("The chosen perspective does not exist.");
  }

  static async create(input: any, actor: any) {
    const d = PerformanceKpiRegistryService.clean(input, true);
    if (input.pillarId) {
      const p = await prisma.scorecardPillar.findUnique({ where: { id: String(input.pillarId) } });
      if (!p) throw new KpiError("The chosen perspective does not exist.");
      d.scorecardPillar = p.canonicalName;
    } else throw new KpiError("Perspective is required.");
    if (await prisma.kPI.findUnique({ where: { code: d.code } })) throw new KpiError("A KPI with this code already exists.", 409);
    await PerformanceKpiRegistryService.assertRefs(d);
    const row = await prisma.kPI.create({ data: { ...d, isActive: false, approvalStatus: "draft", createdById: actor.id, isFinancial: !!d.accountNumber, hasUnit: d.hasUnit ?? false } });
    await AuditService.log({ userId: actor.id, action: "CREATE", entityType: "PerformanceKpi", entityId: row.id, newValues: row });
    return row;
  }

  static async update(id: string, input: any, actor: any) {
    const cur = await prisma.kPI.findUnique({ where: { id } });
    if (!cur) throw new KpiError("KPI not found.", 404);
    if (cur.approvalStatus === "pending_approval") throw new KpiError("A KPI awaiting approval cannot be edited. Ask the approver to return it first.");
    const d = PerformanceKpiRegistryService.clean(input, false);
    if (d.code && d.code !== cur.code) {
      const used = await prisma.performanceGoal.count({ where: { kpiId: id } });
      if (used) throw new KpiError("The code of a KPI that goals already use cannot be changed.");
      if (await prisma.kPI.findUnique({ where: { code: d.code } })) throw new KpiError("A KPI with this code already exists.", 409);
    }
    if (input.pillarId) {
      const p = await prisma.scorecardPillar.findUnique({ where: { id: String(input.pillarId) } });
      if (!p) throw new KpiError("The chosen perspective does not exist.");
      d.scorecardPillar = p.canonicalName;
    }
    if (!Object.keys(d).length) throw new KpiError("Nothing to update.");
    await PerformanceKpiRegistryService.assertRefs(d, cur);
    // an approved definition that changes its measurement (or where it posts in Accounting) goes back through approval
    const material = ["targetValue", "frequency", "updateMethod", "sourceSystem", "isReverseKpi", "unit", "amberThreshold", "redThreshold", "accountNumber", "journalEntryType"].some((k) => d[k] !== undefined && String(d[k]) !== String(cur[k]));
    if (cur.approvalStatus === "approved" && material) Object.assign(d, { approvalStatus: "draft", isActive: false, approvedById: null, approvedAt: null });
    const row = await prisma.kPI.update({ where: { id }, data: d });
    await AuditService.log({ userId: actor.id, action: "UPDATE", entityType: "PerformanceKpi", entityId: id, oldValues: cur, newValues: row });
    return row;
  }

  static async transition(id: string, to: string, note: any, actor: any, isAdmin: boolean) {
    const cur = await prisma.kPI.findUnique({ where: { id } });
    if (!cur) throw new KpiError("KPI not found.", 404);
    if (!(TRANSITIONS[cur.approvalStatus] || []).includes(to)) throw new KpiError(`A KPI that is ${String(cur.approvalStatus).replace("_", " ")} cannot move to ${to.replace("_", " ")}.`);
    const n = txt(note, 1000, "Note");
    const data: any = { approvalStatus: to, reviewNote: n };
    if (to === "pending_approval") {
      const missing = [!cur.ownerId && "an owner", cur.targetValue == null && "a target", !cur.frequency && "a frequency", !cur.updateMethod && "an update method", !cur.catalogDescription && "a definition"].filter(Boolean);
      if (missing.length) throw new KpiError(`Give the KPI ${missing.join(", ")} before submitting it.`);
    }
    if (to === "approved") {
      if (cur.approvalStatus === "pending_approval" && !isAdmin && (cur.createdById === actor.id || cur.ownerId === actor.id)) throw new KpiError("You cannot approve a KPI you created or own. Another approver is needed.");
      Object.assign(data, { isActive: true, approvedById: actor.id, approvedAt: new Date() });
    }
    if (to === "rejected" && !n) throw new KpiError("Say what needs to change.");
    if (to === "retired") {
      if (!n) throw new KpiError("Say why the KPI is being retired.");
      const open = await prisma.performanceGoal.count({ where: { kpiId: id, status: { notIn: ["completed", "cancelled"] } } });
      if (open) throw new KpiError(`${open} active goal${open === 1 ? " uses" : "s use"} this KPI. Complete or re-point ${open === 1 ? "it" : "them"} first.`);
      Object.assign(data, { isActive: false });
    }
    const row = await prisma.kPI.update({ where: { id }, data });
    await AuditService.log({ userId: actor.id, action: "STATUS", entityType: "PerformanceKpi", entityId: id, oldValues: { status: cur.approvalStatus }, newValues: { status: to, note: n } });
    return row;
  }
}
