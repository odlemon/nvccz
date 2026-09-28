// @ts-nocheck
/** Performance access review and role administration. Mounted at /api/performance/access. /me: anyone signed in. Reads: performance.access.view. Writes: performance.access.manage. */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission } from "../middleware/permissionAuth";
import { PerformanceAccessService, AccessError } from "../services/PerformanceAccessService";
import { isPerfAdmin } from "../services/PerformanceScope";

const router = express.Router();
const read = requireAnyPermission(["performance.access.view", "performance.access.manage"]);
const adminOnly = (req: any, res: any, next: any) => {
  if (!isPerfAdmin(req.user)) return res.status(403).json({ success: false, message: "Only an administrator can change roles and access." });
  next();
};
const run = (fn) => async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    res.status(e instanceof AccessError ? e.statusCode : 500).json({ success: false, message: e?.message || "Error" });
  }
};
router.use(authenticate);
router.get("/me", run((req) => PerformanceAccessService.me(req.user)));
router.get("/matrix", read, run(() => PerformanceAccessService.matrix()));
router.put("/roles/:id/scope", adminOnly, run((req) => PerformanceAccessService.setScope(req.params.id, String(req.body?.scope || ""), req.user)));
router.put("/roles/:id/permission", adminOnly, run((req) => PerformanceAccessService.setPermission(req.params.id, String(req.body?.resource || ""), String(req.body?.level || ""), !!req.body?.value, req.user)));
router.post("/roles", adminOnly, run((req) => PerformanceAccessService.createRole(req.body || {}, req.user)));
router.delete("/roles/:id", adminOnly, run((req) => PerformanceAccessService.deleteRole(req.params.id, req.user)));
router.post("/assign", adminOnly, run((req) => PerformanceAccessService.assignRole(String(req.body?.userId || ""), String(req.body?.roleId || ""), req.user)));
export default router;
