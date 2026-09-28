// @ts-nocheck
/** Company strategy hub: overview, reviews, decisions, assumptions. Mounted at /api/performance/strategy-hub. */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard";
import { PerformanceStrategyHubService, StrategyError } from "../services/PerformanceStrategyHubService";
import { isPerfAdmin } from "../services/PerformanceScope";

const router = express.Router();
const guard = methodGuard(["performance.config.view", "performance.config.manage"], ["performance.config.manage"]);
const isAdmin = (req: any) => isPerfAdmin(req.user);
const run = (fn) => async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    res.status(e instanceof StrategyError ? e.statusCode : 500).json({ success: false, message: e?.message || "Error" });
  }
};
router.use(authenticate, guard);
router.get("/overview", run((req) => PerformanceStrategyHubService.overview(req.query.strategyId as string, req.query.department as string)));
router.put("/strategies/:id/meta", run((req) => PerformanceStrategyHubService.setMeta(req.params.id, req.body || {}, req.user)));
router.post("/reviews", run((req) => PerformanceStrategyHubService.createReview(req.body || {}, req.user)));
router.post("/reviews/:id/status", run((req) => PerformanceStrategyHubService.reviewStatus(req.params.id, String(req.body?.status || ""), req.body?.note, req.user)));
router.post("/decisions", run((req) => PerformanceStrategyHubService.createDecision(req.body || {}, req.user)));
router.post("/decisions/:id/:outcome", run((req) => PerformanceStrategyHubService.decide(req.params.id, req.params.outcome, req.body?.note, req.user, isAdmin(req))));
router.post("/assumptions", run((req) => PerformanceStrategyHubService.saveAssumption(req.body || {}, req.user)));
router.delete("/assumptions/:id", run((req) => PerformanceStrategyHubService.removeAssumption(req.params.id, req.user)));
export default router;
