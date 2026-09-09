/**
 * Performance module settings — `/api/performance/settings`.
 *
 * Backend contract:
 *   GET    /                 -> { success, message, data: { settings, meta, namespaces }, timestamp }
 *   PUT    /                 -> { success, message, data: { settings, meta }, timestamp }
 *   DELETE /:key             -> { success, message, timestamp }
 *
 * Every route requires a bearer token (`authenticate`, router-wide). Reads additionally
 * require `performance.settings.view` or `.manage`; writes require `.manage`.
 *
 * The guard is not optional here. These settings govern approval workflows, self-appraisal,
 * KPI locking and the audit trail — an unguarded write would let any logged-in user of any
 * portal disable the organisation's performance controls. Granted by
 * `scripts/run-performance-role-permissions-migration.ts`.
 *
 * Spec: `design-refs/performance-module-map.md` §15.6.
 */
import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission } from "../middleware/permissionAuth";
import PerformanceSettingsController from "../controllers/PerformanceSettingsController";

const router = Router();

router.use(authenticate);

const read = requireAnyPermission(["performance.settings.view", "performance.settings.manage"]);
const write = requireAnyPermission(["performance.settings.manage"]);

router.get("/", read, PerformanceSettingsController.getAll);
router.put("/", write, PerformanceSettingsController.update);
router.delete("/:key", write, PerformanceSettingsController.remove);

export default router;
