// @ts-nocheck
/**
 * Enterprise risk register. Mounted at /api/performance/risks.
 * Reads: performance.risks.view (or manage). Writes: performance.risks.manage.
 */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard";
import { PerformanceRiskService, RiskError, RISK_CATEGORIES } from "../services/PerformanceRiskService";
import { responseHelper } from "../utils/responseHelper";
import { prisma } from "../utils/database";
import { perfActor, scoped, registerRule, registerPlacement, registerRowVisible } from "../services/PerformanceScope";

const router = express.Router();
const guard = methodGuard(["performance.risks.view", "performance.risks.manage"], ["performance.risks.manage"]);
const run = (fn) => async (req, res) => {
  try {
    return responseHelper.success(res, await fn(req), "OK");
  } catch (e) {
    return responseHelper.error(res, e?.message || "Error", undefined, e instanceof RiskError ? e.statusCode : 500);
  }
};

router.use(authenticate, guard);

// row scope (PerformanceScope): owner, creator, the risk's department scope, the organisation scope
const PEOPLE = ["ownerId", "createdById"];
const row = registerRule("performanceRisk", PEOPLE, "risk");
const placement = registerPlacement("risk");
const treatmentRow = scoped(async (req, a) => {
  const t = await prisma.performanceRiskTreatment.findUnique({ where: { id: String(req.params.tid) }, select: { riskId: true } });
  if (!t) return null;
  const r = await prisma.performanceRisk.findUnique({ where: { id: t.riskId }, select: { departmentId: true, ownerId: true, createdById: true } });
  return registerRowVisible(a, r, PEOPLE) ? null : "This risk is outside what your role can see.";
});
const visibleRisks = async (req: any, rows: any[]) => { const a = await perfActor(req.user); return a.org ? rows : rows.filter((r) => registerRowVisible(a, r, PEOPLE)); };
router.get("/meta", run(async () => ({ categories: RISK_CATEGORIES })));
router.get("/", run(async (req) => visibleRisks(req, await PerformanceRiskService.list())));
router.get("/treatments", run(async (req) => {
  const all = await PerformanceRiskService.allTreatments();
  const a = await perfActor(req.user);
  if (a.org) return all;
  const ids = new Set((await visibleRisks(req, await prisma.performanceRisk.findMany({ select: { id: true, departmentId: true, ownerId: true, createdById: true } }))).map((r) => r.id));
  return (Array.isArray(all) ? all : []).filter((t: any) => ids.has(t.riskId));
}));
router.put("/treatments/:tid", treatmentRow, run((req) => PerformanceRiskService.updateTreatment(req.params.tid, req.body || {}, req.user)));
router.delete("/treatments/:tid", treatmentRow, run((req) => PerformanceRiskService.removeTreatment(req.params.tid, req.user)));
router.get("/:id", row, run((req) => PerformanceRiskService.get(req.params.id)));
router.post("/", placement, run((req) => PerformanceRiskService.create(req.body || {}, req.user)));
router.put("/:id", row, placement, run((req) => PerformanceRiskService.update(req.params.id, req.body || {}, req.user)));
router.post("/:id/status", row, run((req) => PerformanceRiskService.setStatus(req.params.id, String(req.body?.status || ""), req.body?.note, req.user)));
router.post("/:id/review", row, run((req) => PerformanceRiskService.review(req.params.id, req.body?.note, req.user)));
router.post("/:id/treatments", row, run((req) => PerformanceRiskService.addTreatment(req.params.id, req.body || {}, req.user)));
router.delete("/:id", row, run((req) => PerformanceRiskService.remove(req.params.id, req.user)));

export default router;
