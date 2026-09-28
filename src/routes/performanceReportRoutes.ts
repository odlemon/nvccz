// @ts-nocheck
/** Performance reports, schedules and the compliance centre. Mounted at /api/performance/reports. Reads: performance.analytics.view. Writes: performance.analytics.manage. */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard";
import { PerformanceReportService, ReportError } from "../services/PerformanceReportService";
import { PerformanceComplianceService, ComplianceError } from "../services/PerformanceComplianceService";
import { isPerfAdmin } from "../services/PerformanceScope";
import { prisma } from "../utils/database";
import { perfActor, scoped, orgOnly, sameDepartment } from "../services/PerformanceScope";

const router = express.Router();
const guard = methodGuard(["performance.analytics.view", "performance.analytics.manage"], ["performance.analytics.manage"]);
const isAdmin = (req: any) => isPerfAdmin(req.user);
const run = (fn) => async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    res.status(e instanceof ReportError || e instanceof ComplianceError ? e.statusCode : 500).json({ success: false, message: e?.message || "Error" });
  }
};
router.use(authenticate, guard);

/*
 * Row scope (PerformanceScope). Writing reports is analytics.manage (organisation-wide roles). Reading: the organisation
 * scope sees every report; a department scope sees the reports it owns or created and the reports about its department
 * (a definition whose department filter is theirs), their runs and schedules. Compliance controls are organisation
 * governance, not about a department, so they are organisation-wide only.
 */
const defVisible = (a: any, d: any) => {
  if (!d) return false;
  if (a.org || d.ownerId === a.id || d.createdById === a.id) return true;
  const dept = d.filters && typeof d.filters === "object" ? (d.filters as any).department : null;
  return a.scope === "department" && !!dept && sameDepartment(a, dept);
};
const visibleDefIds = async (a: any) => {
  const defs = await prisma.performanceReportDefinition.findMany({ select: { id: true, ownerId: true, createdById: true, filters: true } });
  return new Set(defs.filter((d) => defVisible(a, d)).map((d) => d.id));
};
const runVisible = scoped(async (req, a) => {
  if (a.org) return null;
  const r = await prisma.performanceReportRun.findUnique({ where: { id: String(req.params.id) }, select: { definitionId: true, generatedById: true } });
  if (!r) return null;
  return r.generatedById === a.id || (await visibleDefIds(a)).has(r.definitionId) ? null : "This report is outside what your role can see.";
});
const complianceOrg = orgOnly("Compliance controls are for organisation-wide roles.");
router.get("/catalog", run(() => PerformanceReportService.catalog()));
router.get("/", run(async (req) => {
  const all = await PerformanceReportService.list();
  const a = await perfActor(req.user);
  if (a.org) return all;
  const ids = await visibleDefIds(a);
  return all.filter((d: any) => ids.has(d.id));
}));
router.post("/", run((req) => PerformanceReportService.create(req.body || {}, req.user)));
router.post("/preview", run((req) => PerformanceReportService.preview(req.body || {}, req.user)));
router.get("/runs", run(async (req) => {
  const all = await PerformanceReportService.runs(req.query.definitionId as string);
  const a = await perfActor(req.user);
  if (a.org) return all;
  const ids = await visibleDefIds(a);
  return all.filter((r: any) => ids.has(r.definitionId) || r.generatedById === a.id);
}));
router.get("/runs/:id/content", runVisible, run((req) => PerformanceReportService.runContent(req.params.id, "html")));
router.post("/runs/:id/publish", run((req) => PerformanceReportService.publish(req.params.id, req.user, isAdmin(req))));
router.get("/schedules", run(async (req) => {
  const all = await PerformanceReportService.schedules();
  const a = await perfActor(req.user);
  if (a.org) return all;
  const ids = await visibleDefIds(a);
  return (Array.isArray(all) ? all : []).filter((x: any) => ids.has(x.definitionId));
}));
router.post("/schedules", run((req) => PerformanceReportService.saveSchedule(req.body || {}, req.user)));
router.delete("/schedules/:id", run((req) => PerformanceReportService.stopSchedule(req.params.id, req.user)));
router.post("/schedules/run-due", orgOnly(), run(() => PerformanceReportService.runDue()));
router.get("/compliance/controls", complianceOrg, run((req) => PerformanceComplianceService.list(req.user.id)));
router.post("/compliance/run-all", complianceOrg, run((req) => PerformanceComplianceService.runAll(req.user)));
router.post("/compliance/controls/:id/test", complianceOrg, run((req) => PerformanceComplianceService.runTest(req.params.id, req.user)));
router.post("/compliance/controls/:id/attest", complianceOrg, run((req) => PerformanceComplianceService.attest(req.params.id, req.body || {}, req.user)));
router.put("/compliance/controls/:id/owner", complianceOrg, run((req) => PerformanceComplianceService.setOwner(req.params.id, req.body?.ownerId || null, req.user)));
router.put("/:id", run((req) => PerformanceReportService.update(req.params.id, req.body || {}, req.user)));
router.post("/:id/status", run((req) => PerformanceReportService.setStatus(req.params.id, String(req.body?.status || ""), req.body?.note, req.user)));
router.post("/:id/generate", run((req) => PerformanceReportService.generate(req.params.id, req.user, "manual")));
export default router;
