// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { PerformanceKpiRegistryService } from "./PerformanceKpiRegistryService";
import { PerformanceRiskService } from "./PerformanceRiskService";

class ComplianceError extends Error {
  statusCode: number;
  constructor(m: string, s = 400) {
    super(m);
    this.statusCode = s;
  }
}
export { ComplianceError };
const USER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;
const nameOf = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : null);
const DAY = 86400000;

/** Controls the system can test on its own. Each returns the number of exceptions it found. */
const AUTOMATED: Record<string, () => Promise<{ exceptions: number; detail: string }>> = {
  gl_reconciliation: async () => {
    const { PerformanceGlPostingService } = await import("./PerformanceGlPostingService");
    const rows = await PerformanceGlPostingService.reconcile();
    const bad = rows.filter((r) => !r.ties);
    const o = await PerformanceGlPostingService.overview();
    const failed = (o.counts.failed && o.counts.failed.events) || 0;
    const n = bad.length + failed;
    return { exceptions: n, detail: n ? [bad.length ? `${bad.length} goal(s) do not tie to the GL: ${bad.slice(0, 5).map((r) => `${r.goalTitle} (Performance ${r.performance}, GL ${r.ledger})`).join("; ")}` : "", failed ? `${failed} posting(s) failed and await retry` : ""].filter(Boolean).join(". ") : `All ${rows.length} goal(s) that post to the GL tie to it, and no posting is outstanding.` };
  },
  kpi_owner: async () => { const r = await PerformanceKpiRegistryService.list(); const bad = r.kpis.filter((k) => k.isActive && !k.ownerId); return { exceptions: bad.length, detail: bad.length ? `${bad.length} active KPI(s) have no owner: ${bad.slice(0, 5).map((k) => k.code || k.name).join(", ")}` : "Every active KPI has an owner." }; },
  pillar_weights: async () => { const ps = await prisma.scorecardPillar.findMany({ where: { id: { startsWith: "bsc_" } } }); const t = Math.round(ps.reduce((a, p) => a + Number(p.weight || 0), 0) * 100) / 100; return { exceptions: t === 100 && ps.length === 4 ? 0 : 1, detail: `Perspective weights total ${t}%.` }; },
  contract_weights: async () => { const { PerformanceContractLifecycleService } = await import("./PerformanceContractLifecycleService"); const c = (await PerformanceContractLifecycleService.registry()).filter((x) => x.status !== "CLOSED" && x.goalCount > 0 && Math.abs(x.weightTotal - 100) > 0.01); return { exceptions: c.length, detail: c.length ? `${c.length} contract(s) with objectives do not weight to 100%: ${c.slice(0, 3).map((x) => x.title).join("; ")}` : "Every contract with objectives is weighted to 100%." }; },
  risk_treatment: async () => { const r = (await PerformanceRiskService.list()).filter((x) => x.status !== "closed" && x.appetitePosition === "above" && x.openTreatmentCount === 0); return { exceptions: r.length, detail: r.length ? `${r.length} risk(s) above appetite have no open treatment: ${r.slice(0, 5).map((x) => x.reference).join(", ")}` : "Every risk above appetite has an open treatment action." }; },
  corrective_overdue: async () => { const n = await prisma.performanceCorrectiveAction.count({ where: { status: { not: "closed" }, targetDate: { lt: new Date(Date.now() - 14 * DAY) } } }); return { exceptions: n, detail: n ? `${n} corrective action(s) are more than 14 days past target.` : "No corrective action is more than 14 days overdue." }; },
  alert_sla: async () => { const rows = await prisma.$queryRawUnsafe("SELECT COUNT(*) AS c FROM `performance_alerts` WHERE `status` <> 'resolved' AND `sla_due_at` IS NOT NULL AND `sla_due_at` < NOW()"); const n = Number(rows[0].c || 0); return { exceptions: n, detail: n ? `${n} alert(s) are unresolved past their SLA.` : "No alert is unresolved past its SLA." }; },
  review_overdue: async () => { const n = await prisma.performanceReview.count({ where: { stage: { not: "FINALIZED" }, dueDate: { lt: new Date() } } }); return { exceptions: n, detail: n ? `${n} review(s) are past due and not finalized.` : "No review is past due." }; },
  timesheet_decided: async () => { const n = await prisma.timesheet.count({ where: { status: "SUBMITTED", submittedAt: { lt: new Date(Date.now() - 14 * DAY) } } }); return { exceptions: n, detail: n ? `${n} timesheet(s) have waited more than 14 days for a decision.` : "Every submitted timesheet was decided within 14 days." }; },
  document_retention: async () => { const n = await prisma.performanceDocument.count({ where: { status: "approved", retentionClass: { in: ["3_years", "7_years", "10_years"] }, retentionUntil: null } }); return { exceptions: n, detail: n ? `${n} approved document(s) have no retention date.` : "Every approved document carries a retention date." }; }
};

export const DEFAULT_CONTROLS = [
  { code: "CTL-KPI-OWNER", name: "Every active KPI has an owner", description: "An unowned KPI has nobody accountable for its evidence.", type: "automated", test: "kpi_owner", frequency: "monthly" },
  { code: "CTL-BSC-WEIGHTS", name: "Scorecard perspective weights total 100%", description: "Organization scorecards cannot be published unless the four weights balance.", type: "automated", test: "pillar_weights", frequency: "monthly" },
  { code: "CTL-CONTRACT-WEIGHTS", name: "Contract objectives weight to 100%", description: "A signed contract must measure exactly 100% of the role.", type: "automated", test: "contract_weights", frequency: "monthly" },
  { code: "CTL-RISK-TREATMENT", name: "Risks above appetite are being treated", description: "A risk outside appetite needs at least one open treatment action.", type: "automated", test: "risk_treatment", frequency: "monthly" },
  { code: "CTL-CORRECTIVE", name: "No corrective action is long overdue", description: "Recovery actions stalled beyond 14 days need a decision.", type: "automated", test: "corrective_overdue", frequency: "monthly" },
  { code: "CTL-ALERT-SLA", name: "Alerts are resolved within their SLA", description: "Unresolved alerts past SLA mean escalation is not working.", type: "automated", test: "alert_sla", frequency: "monthly" },
  { code: "CTL-REVIEW-DUE", name: "Performance reviews finish on time", description: "Reviews past their due date and not finalized.", type: "automated", test: "review_overdue", frequency: "quarterly" },
  { code: "CTL-TIMESHEET", name: "Submitted timesheets are decided within 14 days", description: "Managers decide what employees submit.", type: "automated", test: "timesheet_decided", frequency: "monthly" },
  { code: "CTL-DOC-RETENTION", name: "Approved documents carry a retention date", description: "Retention protects governed documents from deletion.", type: "automated", test: "document_retention", frequency: "quarterly" },
  { code: "CTL-GL-RECON", name: "Performance postings tie to the general ledger", description: "For every goal that posts to Accounting, the progress Performance posted equals the movement its journals made on the KPI's account, and no posting has failed.", type: "automated", test: "gl_reconciliation", frequency: "monthly" },
  { code: "CTL-ACCESS-REVIEW", name: "Quarterly review of performance access", description: "A named person reviews who holds which performance permissions and attests to it.", type: "manual", test: null, frequency: "quarterly" }
];
const FREQ_DAYS = { monthly: 31, quarterly: 92 };

export class PerformanceComplianceService {
  static async ensureDefaults(actorId: string) {
    // controls added in a later release are created on databases that already have the earlier set
    const have = new Set((await prisma.performanceComplianceControl.findMany({ select: { code: true } })).map((c) => c.code));
    for (const c of DEFAULT_CONTROLS.filter((x) => !have.has(x.code))) await prisma.performanceComplianceControl.create({ data: { code: c.code, name: c.name, description: c.description, controlType: c.type, testKey: c.test, frequency: c.frequency, ownerId: actorId } });
  }
  static async list(actorId: string) {
    await PerformanceComplianceService.ensureDefaults(actorId);
    const [controls, tests] = await Promise.all([prisma.performanceComplianceControl.findMany({ orderBy: { code: "asc" } }), prisma.performanceComplianceTest.findMany({ orderBy: { testedAt: "desc" }, take: 500 })]);
    const uids = [...new Set([...controls.map((c) => c.ownerId), ...tests.map((t) => t.testedById)].filter(Boolean))];
    const users = uids.length ? await prisma.user.findMany({ where: { id: { in: uids } }, select: USER_SELECT }) : [];
    const nm = new Map(users.map((u) => [u.id, nameOf(u)]));
    return controls.map((c) => {
      const last = tests.find((t) => t.controlId === c.id) || null;
      const due = last ? new Date(+new Date(last.testedAt) + (FREQ_DAYS[c.frequency] || 31) * DAY) : null;
      return { ...c, ownerName: c.ownerId ? nm.get(c.ownerId) || null : null, last: last ? { ...last, testedByName: last.testedById ? nm.get(last.testedById) || null : null } : null, dueAt: due, overdue: !last || +due < Date.now(), history: tests.filter((t) => t.controlId === c.id).slice(0, 10).map((t) => ({ ...t, testedByName: t.testedById ? nm.get(t.testedById) || null : null })) };
    });
  }
  static async runTest(id: string, actor: any) {
    const c = await prisma.performanceComplianceControl.findUnique({ where: { id } });
    if (!c) throw new ComplianceError("Control not found.", 404);
    if (c.controlType !== "automated" || !AUTOMATED[c.testKey]) throw new ComplianceError("This control is attested by a person, not tested by the system.");
    const r = await AUTOMATED[c.testKey]();
    const t = await prisma.performanceComplianceTest.create({ data: { controlId: id, result: r.exceptions === 0 ? "pass" : "fail", exceptions: r.exceptions, detail: r.detail.slice(0, 1000), testedById: actor.id } });
    await AuditService.log({ userId: actor.id, action: "CONTROL_TEST", entityType: "PerformanceComplianceControl", entityId: id, newValues: { result: t.result, exceptions: r.exceptions } });
    return t;
  }
  static async runAll(actor: any) {
    const controls = await prisma.performanceComplianceControl.findMany({ where: { controlType: "automated" } });
    const out = [];
    for (const c of controls) { try { out.push(await PerformanceComplianceService.runTest(c.id, actor)); } catch (_) { /* one failing test does not stop the rest */ } }
    return { tested: out.length, failed: out.filter((t) => t.result === "fail").length };
  }
  static async attest(id: string, input: any, actor: any) {
    const c = await prisma.performanceComplianceControl.findUnique({ where: { id } });
    if (!c) throw new ComplianceError("Control not found.", 404);
    if (c.controlType !== "manual") throw new ComplianceError("This control is tested by the system.");
    const result = input.result === "fail" ? "fail" : "pass";
    const note = String(input.note || "").trim();
    if (!note) throw new ComplianceError("Say what was reviewed and what was found.");
    const t = await prisma.performanceComplianceTest.create({ data: { controlId: id, result, exceptions: result === "fail" ? 1 : 0, detail: note.slice(0, 1000), testedById: actor.id } });
    await AuditService.log({ userId: actor.id, action: "CONTROL_ATTEST", entityType: "PerformanceComplianceControl", entityId: id, newValues: { result } });
    return t;
  }
  static async setOwner(id: string, ownerId: string | null, actor: any) {
    if (ownerId && !(await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } }))) throw new ComplianceError("The chosen owner does not exist.");
    const row = await prisma.performanceComplianceControl.update({ where: { id }, data: { ownerId } });
    await AuditService.log({ userId: actor.id, action: "UPDATE", entityType: "PerformanceComplianceControl", entityId: id, newValues: { ownerId } });
    return row;
  }
}
