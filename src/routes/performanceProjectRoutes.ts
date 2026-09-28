// @ts-nocheck
/** Performance projects (goal-aligned work containers). Mounted at /api/performance/projects. */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard";
import { PerformanceProjectService, ProjectError } from "../services/PerformanceProjectService";
import { prisma } from "../utils/database";
import { perfActor, scoped, sameDepartment, departmentUserIds, departmentInScope, personInScope } from "../services/PerformanceScope";

const router = express.Router();
const guard = methodGuard(["performance.goals.view", "performance.goals.manage"], ["performance.goals.manage"]);
const run = (fn) => async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    res.status(e instanceof ProjectError ? e.statusCode : 500).json({ success: false, message: e?.message || "Error" });
  }
};
router.use(authenticate, guard);

// Row scope (PerformanceScope): the organisation scope sees every project; a department scope its department's projects
// and those its people own; an individual their department's and their own (without budgets). Changing a project needs it
// in the caller's department (or the organisation scope), and it cannot be moved out of it.
const projectVisible = async (a: any, p: any) => {
  if (a.org || p.ownerId === a.id || p.createdById === a.id || sameDepartment(a, p.departmentName)) return true;
  return a.scope === "department" && !!p.ownerId && (await departmentUserIds(a)).includes(p.ownerId);
};
const projectRule = scoped(async (req, a) => {
  const p = await prisma.project.findUnique({ where: { id: String(req.params.id) }, select: { ownerId: true, createdById: true, departmentName: true } });
  if (!p) return null;
  if (a.org) return null;
  if (a.scope === "department" && (sameDepartment(a, p.departmentName) || (!!p.ownerId && (await departmentUserIds(a)).includes(p.ownerId)))) return null;
  return "Your role cannot change this project.";
});
const projectPlacement = scoped(async (req, a) => {
  if (a.org) return null;
  const b = req.body || {};
  if (b.departmentName && !departmentInScope(a, b.departmentName)) return "You can only run projects for your own department.";
  if (b.ownerId && !(await personInScope(a, b.ownerId))) return "The owner must be someone in your department.";
  return null;
});
router.get("/", run(async (req) => {
  const all = await PerformanceProjectService.list();
  const a = await perfActor(req.user);
  if (a.org) return all;
  const keep = await Promise.all(all.map((p: any) => projectVisible(a, p)));
  return all.filter((_: any, i: number) => keep[i]).map((p: any) => (a.scope === "self" ? { ...p, budget: null } : p));
}));
router.post("/", projectPlacement, run((req) => PerformanceProjectService.create(req.body || {}, req.user)));
router.put("/:id", projectRule, projectPlacement, run((req) => PerformanceProjectService.update(req.params.id, req.body || {}, req.user)));
router.post("/:id/status", projectRule, run((req) => PerformanceProjectService.setStatus(req.params.id, String(req.body?.status || ""), req.body?.note, req.user)));
router.post("/:id/tasks", projectRule, run((req) => PerformanceProjectService.assignTasks(req.params.id, req.body?.taskIds, req.user)));
router.delete("/:id/tasks", projectRule, run((req) => PerformanceProjectService.unassignTasks(req.params.id, req.body?.taskIds || [], req.user)));
export default router;
