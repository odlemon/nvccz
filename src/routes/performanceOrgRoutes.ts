// @ts-nocheck
/**
 * Performance module: organisation views (departments directory with performance ownership).
 * Mounted at /api/performance/org. Reads need performance.config.view, writes performance.config.manage.
 */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard";
import { PerformanceOrgService } from "../services/PerformanceOrgService";
import { responseHelper } from "../utils/responseHelper";

const router = express.Router();
const guard = methodGuard(["performance.config.view", "performance.config.manage"], ["performance.config.manage"]);
const fail = (res, error) => {
  const msg = error?.message || "Error";
  const status = /not found/i.test(msg) ? 404 : /already exists/i.test(msg) ? 409 : 400;
  return responseHelper.error(res, msg, undefined, status);
};

router.get("/departments", authenticate, guard, async (req, res) => {
  try {
    return responseHelper.success(res, await PerformanceOrgService.listDepartments({ includeInactive: req.query.includeInactive === "true" }), "Departments retrieved");
  } catch (e) { return fail(res, e); }
});
router.post("/departments", authenticate, guard, async (req, res) => {
  try {
    return responseHelper.success(res, await PerformanceOrgService.createDepartment(req.body, req.user), "Department created");
  } catch (e) { return fail(res, e); }
});
router.put("/departments/:id", authenticate, guard, async (req, res) => {
  try {
    return responseHelper.success(res, await PerformanceOrgService.updateDepartment(req.params.id, req.body, req.user), "Department updated");
  } catch (e) { return fail(res, e); }
});

export default router;
