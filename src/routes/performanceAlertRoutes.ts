import express from "express";
import PerformanceAlertController from "../controllers/PerformanceAlertController";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission } from "../middleware/permissionAuth";

/**
 * Performance Alerts & Escalations.
 * Mounted at /api/performance/alerts (see design-refs-handoff/performance-alerts.md).
 * Every route is authenticated — applied router-wide below, not per-route.
 */
const router = express.Router();

router.use(authenticate);
/**
 * Permission guards.
 *
 * Before these, every route below was `authenticate`-only: any logged-in user of any portal
 * — an LP, an applicant, an investee — could list, create, edit and delete records in this
 * register. `read` is granted to every internal staff role and `write` to manager/exec roles
 * by `scripts/run-performance-role-permissions-migration.ts`; external roles get neither, so
 * they now receive 403 rather than 200.
 *
 * `admin` retains access through its existing wildcard permission set.
 */
const read = requireAnyPermission(["performance.alerts.view", "performance.alerts.manage"]);
const write = requireAnyPermission(["performance.alerts.manage"]);


// `/summary` must be declared before `/:id` or Express matches it as an id.
router.get("/summary", read, PerformanceAlertController.getSummary);

router.get("/", read, PerformanceAlertController.listAlerts);
router.post("/", write, PerformanceAlertController.createAlert);

router.get("/:id", read, PerformanceAlertController.getAlertById);
router.patch("/:id", write, PerformanceAlertController.updateAlert);
router.delete("/:id", write, PerformanceAlertController.deleteAlert);

router.post("/:id/acknowledge", write, PerformanceAlertController.acknowledgeAlert);
router.post("/:id/escalate", write, PerformanceAlertController.escalateAlert);
router.post("/:id/resolve", write, PerformanceAlertController.resolveAlert);

export default router;
