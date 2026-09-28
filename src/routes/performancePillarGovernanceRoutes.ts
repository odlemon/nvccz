// @ts-nocheck
/** BSC pillar governance: owners, short names, weight proposals with approval and version history. /api/performance/pillar-governance */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard";
import { PerformancePillarGovernanceService, PillarError } from "../services/PerformancePillarGovernanceService";
import { isPerfAdmin } from "../services/PerformanceScope";

const router = express.Router();
// the pillars are read wherever scorecards are read; their weights, owners and names are BSC governance (performance.bsc.manage)
const guard = methodGuard(["performance.scorecards.view", "performance.scorecards.manage", "performance.bsc.view", "performance.bsc.manage"], ["performance.bsc.manage"]);
const isAdmin = (req: any) => isPerfAdmin(req.user);
const run = (fn) => async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    res.status(e instanceof PillarError ? e.statusCode : 500).json({ success: false, message: e?.message || "Error" });
  }
};
router.use(authenticate, guard);
router.get("/", run(() => PerformancePillarGovernanceService.overview()));
router.put("/pillars/:id", run((req) => PerformancePillarGovernanceService.setOwnerAndName(req.params.id, req.body || {}, req.user)));
router.post("/proposals", run((req) => PerformancePillarGovernanceService.propose(req.body || {}, req.user)));
router.post("/proposals/:id/approve", run((req) => PerformancePillarGovernanceService.decide(req.params.id, "approved", req.body?.note, req.user, isAdmin(req))));
router.post("/proposals/:id/reject", run((req) => PerformancePillarGovernanceService.decide(req.params.id, "rejected", req.body?.note, req.user, isAdmin(req))));
router.post("/proposals/:id/withdraw", run((req) => PerformancePillarGovernanceService.withdraw(req.params.id, req.user)));

export default router;
