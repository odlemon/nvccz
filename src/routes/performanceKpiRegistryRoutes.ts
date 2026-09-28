// @ts-nocheck
/** KPI registry (governed KPI definitions). Mounted at /api/performance/kpi-registry. */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard";
import { PerformanceKpiRegistryService, KpiError } from "../services/PerformanceKpiRegistryService";
import { isPerfAdmin } from "../services/PerformanceScope";

const router = express.Router();
const guard = methodGuard(["performance.kpi.view", "performance.kpi.manage"], ["performance.kpi.manage"]);
const isAdmin = (req: any) => isPerfAdmin(req.user);
const run = (fn) => async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    res.status(e instanceof KpiError ? e.statusCode : 500).json({ success: false, message: e?.message || "Error" });
  }
};
router.use(authenticate, guard);
router.get("/", run(() => PerformanceKpiRegistryService.list()));
router.get("/analytics", run((req) => PerformanceKpiRegistryService.analytics(req.query.period as string, req.query.department as string, req.query.pillar as string)));
router.post("/", run((req) => PerformanceKpiRegistryService.create(req.body || {}, req.user)));
router.put("/:id", run((req) => PerformanceKpiRegistryService.update(req.params.id, req.body || {}, req.user)));
router.post("/:id/submit", run((req) => PerformanceKpiRegistryService.transition(req.params.id, "pending_approval", req.body?.note, req.user, isAdmin(req))));
router.post("/:id/approve", run((req) => PerformanceKpiRegistryService.transition(req.params.id, "approved", req.body?.note, req.user, isAdmin(req))));
router.post("/:id/reject", run((req) => PerformanceKpiRegistryService.transition(req.params.id, "rejected", req.body?.note, req.user, isAdmin(req))));
router.post("/:id/retire", run((req) => PerformanceKpiRegistryService.transition(req.params.id, "retired", req.body?.note, req.user, isAdmin(req))));
router.post("/:id/reinstate", run((req) => PerformanceKpiRegistryService.transition(req.params.id, "approved", req.body?.note, req.user, isAdmin(req))));

export default router;
