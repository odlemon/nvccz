// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";

class ProjectError extends Error {
  statusCode: number;
  constructor(m: string, s = 400) {
    super(m);
    this.statusCode = s;
  }
}
export { ProjectError };
export const PROJECT_STATUSES = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
const TRANSITIONS: Record<string, string[]> = { PLANNED: ["ACTIVE", "CANCELLED"], ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"], ON_HOLD: ["ACTIVE", "CANCELLED"], COMPLETED: ["ACTIVE"], CANCELLED: [] };
const USER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;
const nameOf = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : null);
const txt = (v, max, label, required = false) => {
  const s = v == null ? "" : String(v).trim();
  if (!s) {
    if (required) throw new ProjectError(`${label} is required.`);
    return null;
  }
  if (s.length > max) throw new ProjectError(`${label} must be ${max} characters or fewer.`);
  return s;
};
const day = (v, label, required = false) => {
  if (v === undefined || v === null || v === "") {
    if (required) throw new ProjectError(`${label} is required.`);
    return null;
  }
  const d = new Date(v);
  if (Number.isNaN(+d)) throw new ProjectError(`${label} is not a valid date.`);
  return d;
};

export class PerformanceProjectService {
  static async list() {
    const projects = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
    if (!projects.length) return [];
    const ids = projects.map((p) => p.id);
    const [tasks, hours] = await Promise.all([
      prisma.task.findMany({ where: { projectId: { in: ids }, isTrashed: false }, select: { projectId: true, stage: true, date: true } }),
      prisma.timesheetEntry.groupBy({ by: ["projectId"], where: { projectId: { in: ids } }, _sum: { hours: true } })
    ]);
    const uids = [...new Set(projects.map((p) => p.ownerId).filter(Boolean))];
    const users = uids.length ? await prisma.user.findMany({ where: { id: { in: uids } }, select: USER_SELECT }) : [];
    const nm = new Map(users.map((u) => [u.id, nameOf(u)]));
    const gids = [...new Set(projects.map((p) => p.goalId).filter(Boolean))];
    const goals = gids.length ? await prisma.performanceGoal.findMany({ where: { id: { in: gids } }, select: { id: true, title: true } }) : [];
    const gm = new Map(goals.map((g) => [g.id, g.title]));
    const now = Date.now();
    return projects.map((p) => {
      const mine = tasks.filter((t) => t.projectId === p.id);
      const done = mine.filter((t) => t.stage === "completed").length;
      return { ...p, budget: p.budget == null ? null : Number(p.budget), ownerName: p.ownerId ? nm.get(p.ownerId) || null : null, goalTitle: p.goalId ? gm.get(p.goalId) || null : null, taskCount: mine.length, doneCount: done, overdueCount: mine.filter((t) => t.stage !== "completed" && +new Date(t.date) < now).length, progress: mine.length ? Math.round((done / mine.length) * 100) : null, hoursLogged: Number((hours.find((h) => h.projectId === p.id) || { _sum: { hours: 0 } })._sum.hours || 0) };
    });
  }

  private static async validateRefs(d) {
    if (d.ownerId && !(await prisma.user.findUnique({ where: { id: d.ownerId }, select: { id: true } }))) throw new ProjectError("The chosen owner does not exist.");
    if (d.goalId && !(await prisma.performanceGoal.findUnique({ where: { id: d.goalId }, select: { id: true } }))) throw new ProjectError("The chosen goal does not exist.");
  }

  static async create(input: any, actor: any) {
    const d: any = { name: txt(input.name, 255, "Project name", true), description: txt(input.description, 4000, "Description"), ownerId: input.ownerId ? String(input.ownerId) : actor.id, goalId: input.goalId ? String(input.goalId) : null, departmentName: txt(input.departmentName, 120, "Department"), startDate: day(input.startDate, "Start date", true), endDate: day(input.endDate, "End date", true) };
    if (d.endDate < d.startDate) throw new ProjectError("The end date must be on or after the start date.");
    if (input.budget !== undefined && input.budget !== null && input.budget !== "") { const b = Number(input.budget); if (!Number.isFinite(b) || b < 0) throw new ProjectError("Budget must be zero or more."); d.budget = b; }
    await PerformanceProjectService.validateRefs(d);
    if (await prisma.project.findFirst({ where: { name: d.name, status: { notIn: ["CANCELLED", "COMPLETED"] } } })) throw new ProjectError("An active project with this name already exists.", 409);
    const row = await prisma.project.create({ data: { ...d, status: "PLANNED", isActive: true, createdById: actor.id } });
    await AuditService.log({ userId: actor.id, action: "CREATE", entityType: "PerformanceProject", entityId: row.id, newValues: row });
    return row;
  }

  static async update(id: string, input: any, actor: any) {
    const cur = await prisma.project.findUnique({ where: { id } });
    if (!cur) throw new ProjectError("Project not found.", 404);
    if (["COMPLETED", "CANCELLED"].includes(cur.status)) throw new ProjectError(`A ${cur.status.toLowerCase()} project cannot be edited.`);
    const d: any = {};
    if (input.name !== undefined) d.name = txt(input.name, 255, "Project name", true);
    if (input.description !== undefined) d.description = txt(input.description, 4000, "Description");
    if (input.ownerId !== undefined) d.ownerId = input.ownerId ? String(input.ownerId) : null;
    if (input.goalId !== undefined) d.goalId = input.goalId ? String(input.goalId) : null;
    if (input.departmentName !== undefined) d.departmentName = txt(input.departmentName, 120, "Department");
    if (input.startDate !== undefined) d.startDate = day(input.startDate, "Start date", true);
    if (input.endDate !== undefined) d.endDate = day(input.endDate, "End date", true);
    if (input.budget !== undefined) { const b = input.budget === "" || input.budget === null ? null : Number(input.budget); if (b !== null && (!Number.isFinite(b) || b < 0)) throw new ProjectError("Budget must be zero or more."); d.budget = b; }
    if (!Object.keys(d).length) throw new ProjectError("Nothing to update.");
    const s = d.startDate || cur.startDate, e = d.endDate || cur.endDate;
    if (s && e && e < s) throw new ProjectError("The end date must be on or after the start date.");
    await PerformanceProjectService.validateRefs(d);
    const row = await prisma.project.update({ where: { id }, data: d });
    await AuditService.log({ userId: actor.id, action: "UPDATE", entityType: "PerformanceProject", entityId: id, oldValues: cur, newValues: row });
    return row;
  }

  static async setStatus(id: string, status: string, note: any, actor: any) {
    const cur = await prisma.project.findUnique({ where: { id } });
    if (!cur) throw new ProjectError("Project not found.", 404);
    if (!PROJECT_STATUSES.includes(status)) throw new ProjectError(`Status must be one of: ${PROJECT_STATUSES.join(", ")}.`);
    if (!(TRANSITIONS[cur.status] || []).includes(status)) throw new ProjectError(`A ${cur.status.toLowerCase().replace("_", " ")} project cannot move to ${status.toLowerCase().replace("_", " ")}.`);
    const n = String(note || "").trim();
    if (["CANCELLED", "ON_HOLD"].includes(status) && !n) throw new ProjectError(`Say why the project is ${status === "ON_HOLD" ? "put on hold" : "cancelled"}.`);
    if (status === "COMPLETED") {
      const open = await prisma.task.count({ where: { projectId: id, isTrashed: false, stage: { not: "completed" } } });
      if (open) throw new ProjectError(`${open} task${open === 1 ? " is" : "s are"} not complete yet. Finish or move ${open === 1 ? "it" : "them"} first.`);
    }
    const row = await prisma.project.update({ where: { id }, data: { status, isActive: !["COMPLETED", "CANCELLED"].includes(status) } });
    await AuditService.log({ userId: actor.id, action: "STATUS", entityType: "PerformanceProject", entityId: id, oldValues: { status: cur.status }, newValues: { status, note: n } });
    return row;
  }

  static async assignTasks(id: string, taskIds: string[], actor: any) {
    const cur = await prisma.project.findUnique({ where: { id } });
    if (!cur) throw new ProjectError("Project not found.", 404);
    if (["COMPLETED", "CANCELLED"].includes(cur.status)) throw new ProjectError("Tasks cannot be added to a completed or cancelled project.");
    if (!Array.isArray(taskIds) || !taskIds.length) throw new ProjectError("Choose at least one task.");
    const r = await prisma.task.updateMany({ where: { id: { in: taskIds } }, data: { projectId: id } });
    await AuditService.log({ userId: actor.id, action: "ASSIGN_TASKS", entityType: "PerformanceProject", entityId: id, newValues: { taskIds } });
    return { assigned: r.count };
  }

  static async unassignTasks(id: string, taskIds: string[], actor: any) {
    const r = await prisma.task.updateMany({ where: { id: { in: taskIds }, projectId: id }, data: { projectId: null } });
    await AuditService.log({ userId: actor.id, action: "UNASSIGN_TASKS", entityType: "PerformanceProject", entityId: id, newValues: { taskIds } });
    return { removed: r.count };
  }
}
