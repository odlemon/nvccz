import express from "express";
import PerformanceAlertController from "../controllers/PerformanceAlertController";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission } from "../middleware/permissionAuth";
import { prisma } from "../utils/database";
import PerformanceAlertRuleService, { RuleError } from "../services/PerformanceAlertRuleService";
import { registerRule, registerPlacement, orgOnly, isPerfAdmin } from "../services/PerformanceScope";

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
// row scope (PerformanceScope): owner, creator, the alert's department scope, the organisation scope
const PEOPLE = ["ownerId", "createdById"];
const row = registerRule("performanceAlert", PEOPLE, "alert");
const placement = registerPlacement("alert");


// `/summary` must be declared before `/:id` or Express matches it as an id.
router.get("/summary", read, PerformanceAlertController.getSummary);

const rrun = (fn) => async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    res.status(e instanceof RuleError ? e.statusCode : e?.statusCode || 500).json({ success: false, message: e?.message || "Error" });
  }
};
router.get("/rules", read, rrun((req) => PerformanceAlertRuleService.list(req.user.id)));
router.post("/rules", write, rrun((req) => PerformanceAlertRuleService.create(req.body || {}, req.user)));
router.put("/rules/:id", write, rrun((req) => PerformanceAlertRuleService.update(req.params.id, req.body || {}, req.user)));
router.delete("/rules/:id", write, rrun((req) => PerformanceAlertRuleService.remove(req.params.id, req.user)));
router.post("/evaluate", write, rrun((req) => PerformanceAlertRuleService.evaluate(req.user.id)));
router.get("/audit", read, orgOnly("The audit trail is for organisation-wide roles."), rrun(async (req) => {
  // Performance records only; module administrators also see the role, user and department changes made from Access.
  const asked = req.query.entityType ? String(req.query.entityType) : "";
  const adminTypes = new Set(["Role", "User", "Department"]);
  if (asked && !asked.startsWith("Performance") && !(adminTypes.has(asked) && isPerfAdmin(req.user))) {
    throw Object.assign(new Error("The audit trail here covers Performance records only."), { statusCode: 403 });
  }
  const page = Math.max(1, parseInt(String(req.query.page || "1")) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "25")) || 25));
  const where: any = { entityType: asked || { startsWith: "Performance" } };
  if (req.query.action) where.action = String(req.query.action);
  if (req.query.userId) where.userId = String(req.query.userId);
  if (req.query.from || req.query.to) where.createdAt = { ...(req.query.from ? { gte: new Date(String(req.query.from)) } : {}), ...(req.query.to ? { lte: new Date(String(req.query.to) + "T23:59:59.999Z") } : {}) };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit, include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } }),
    prisma.auditLog.count({ where })
  ]);
  return { rows: rows.map((r: any) => ({ id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId, at: r.createdAt, user: r.user ? [r.user.firstName, r.user.lastName].filter(Boolean).join(" ") || r.user.email : null })), total, page, limit };
}));
router.get("/:id/events", read, row, rrun((req) => PerformanceAlertRuleService.events(req.params.id)));

router.get("/", read, PerformanceAlertController.listAlerts);
router.post("/", write, placement, PerformanceAlertController.createAlert);

router.get("/:id", read, row, PerformanceAlertController.getAlertById);
router.patch("/:id", write, row, placement, PerformanceAlertController.updateAlert);
router.delete("/:id", write, row, PerformanceAlertController.deleteAlert);

router.post("/:id/acknowledge", write, row, PerformanceAlertController.acknowledgeAlert);
router.post("/:id/escalate", write, row, PerformanceAlertController.escalateAlert);
router.post("/:id/resolve", write, row, PerformanceAlertController.resolveAlert);

export default router;
