// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";

class AccessError extends Error {
  statusCode: number;
  constructor(m: string, s = 400) {
    super(m);
    this.statusCode = s;
  }
}
export { AccessError };

export const PERFORMANCE_RESOURCES: Array<{ key: string; label: string }> = [
  { key: "dashboard", label: "Command Centre" },
  { key: "config", label: "Strategy, themes and configuration" },
  { key: "goals", label: "Goals, objectives, tasks and projects" },
  { key: "kpi", label: "KPI registry" },
  { key: "bsc", label: "BSC pillars" },
  { key: "scorecards", label: "Scorecards" },
  { key: "contracts", label: "Performance contracts" },
  { key: "reviews", label: "Performance reviews" },
  { key: "corrective", label: "Corrective actions" },
  { key: "risks", label: "Enterprise risk register" },
  { key: "alerts", label: "Alerts and escalations" },
  { key: "documents", label: "Document vault" },
  { key: "analytics", label: "Analytics and reports" },
  { key: "integration", label: "Integrations and source mappings" },
  { key: "etl", label: "Data loads (ETL)" },
  { key: "workflow", label: "Workflow" },
  { key: "settings", label: "Performance settings" },
  { key: "access", label: "Access and roles" }
];
export const PERFORMANCE_SCOPES = ["organization", "department", "self"] as const;
const PROTECTED_ROLES = new Set(["admin"]);
const CUSTOM_MARK = "Custom performance role";
const isPerf = (n: string) => /^performance\.[a-z]+\.(view|manage|organization|department)$/.test(n);
const permsOf = (r) => (Array.isArray(r.permissions) ? r.permissions : []);
const has = (r, name) => permsOf(r).some((p) => p?.name === name && p?.value === true);
const scopeOfRole = (r) => (has(r, "performance.scope.organization") ? "organization" : has(r, "performance.scope.department") ? "department" : "self");

export class PerformanceAccessService {
  static async matrix() {
    const [roles, counts] = await Promise.all([
      prisma.role.findMany({ orderBy: { name: "asc" } }),
      prisma.user.groupBy({ by: ["roleId"], _count: { _all: true } })
    ]);
    const n = new Map(counts.map((c) => [c.roleId, c._count._all]));
    return {
      resources: PERFORMANCE_RESOURCES,
      roles: roles.map((r) => ({
        id: r.id, name: r.name, description: r.description, users: n.get(r.id) || 0,
        protected: PROTECTED_ROLES.has(String(r.name).toLowerCase()), custom: String(r.description || "").startsWith(CUSTOM_MARK), scope: scopeOfRole(r),
        access: Object.fromEntries(PERFORMANCE_RESOURCES.map((x) => [x.key, { view: has(r, `performance.${x.key}.view`), manage: has(r, `performance.${x.key}.manage`) }]))
      }))
    };
  }

  static async setPermission(roleId: string, resource: string, level: "view" | "manage", value: boolean, actor: any) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new AccessError("Role not found.", 404);
    if (PROTECTED_ROLES.has(String(role.name).toLowerCase())) throw new AccessError("The administrator role is protected and cannot be changed here.", 403);
    if (!PERFORMANCE_RESOURCES.some((r) => r.key === resource)) throw new AccessError("Unknown resource.");
    if (!["view", "manage"].includes(level)) throw new AccessError("Level must be view or manage.");
    if (actor.roleId === roleId && resource === "access" && !value) throw new AccessError("You cannot remove your own access to roles and access.");
    let perms = permsOf(role).filter((p) => p && p.name);
    const set = (name, v) => { const i = perms.findIndex((p) => p.name === name); if (i >= 0) perms[i] = { name, value: v }; else if (v) perms.push({ name, value: true }); };
    const view = `performance.${resource}.view`, manage = `performance.${resource}.manage`;
    if (level === "manage") { set(manage, value); if (value) set(view, true); }
    else { set(view, value); if (!value) set(manage, false); }
    perms = perms.filter((p) => !(isPerf(p.name) && p.value === false));
    const row = await prisma.role.update({ where: { id: roleId }, data: { permissions: perms } });
    await AuditService.log({ userId: actor.id, action: "ROLE_PERMISSION", entityType: "Role", entityId: roleId, oldValues: { [`${resource}.${level}`]: !value }, newValues: { [`${resource}.${level}`]: value, role: role.name }, eventType: "PERMISSION_CHANGE" });
    return PerformanceAccessService.matrix();
  }

  /** The data scope a role's holders see: every row, their department's rows, or only their own. */
  static async setScope(roleId: string, scope: string, actor: any) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new AccessError("Role not found.", 404);
    if (PROTECTED_ROLES.has(String(role.name).toLowerCase())) throw new AccessError("The administrator role is protected and cannot be changed here.", 403);
    if (!PERFORMANCE_SCOPES.includes(scope as any)) throw new AccessError("Scope must be organization, department or self.");
    if (actor.roleId === roleId) throw new AccessError("You cannot change the scope of your own role.", 403);
    const before = scopeOfRole(role);
    const perms = permsOf(role).filter((p) => p && p.name && !/^performance\.scope\./.test(p.name));
    if (scope !== "self") perms.push({ name: `performance.scope.${scope}`, value: true });
    await prisma.role.update({ where: { id: roleId }, data: { permissions: perms } });
    await AuditService.log({ userId: actor.id, action: "ROLE_PERMISSION", entityType: "Role", entityId: roleId, oldValues: { scope: before }, newValues: { scope, role: role.name }, eventType: "PERMISSION_CHANGE" });
    return PerformanceAccessService.matrix();
  }

  /** What the signed-in person may see and do in Performance — what the pages hide, show and allow is decided from this. */
  static async me(user: any) {
    const { perfActor, perfCan } = await import("./PerformanceScope");
    const a = await perfActor(user);
    const resources = Object.fromEntries(PERFORMANCE_RESOURCES.map((x) => [x.key, { view: perfCan(user, x.key, "view"), manage: perfCan(user, x.key, "manage") }]));
    const { userHasEffectivePermission } = await import("../config/cfoModulePermissions");
    return {
      userId: user.id, role: user.role?.name || null, roleCode: user.roleCode || null, scope: a.scope, department: a.departmentName, departmentId: a.departmentId,
      isAdmin: a.isAdmin, resources, any: Object.values(resources).some((r: any) => r.view),
      // the Timesheets page's approval views follow the timesheet approval grant (an Accounting key, not a Performance resource)
      timesheetApprover: userHasEffectivePermission(user, "accounting.timesheets.manage")
    };
  }

  static async createRole(input: any, actor: any) {
    const name = String(input.name || "").trim();
    if (!name) throw new AccessError("Role name is required.");
    if (name.length > 80) throw new AccessError("Role name must be 80 characters or fewer.");
    if (await prisma.role.findUnique({ where: { name } })) throw new AccessError("A role with this name already exists.", 409);
    let permissions = [];
    if (input.cloneFromId) {
      const src = await prisma.role.findUnique({ where: { id: String(input.cloneFromId) } });
      if (!src) throw new AccessError("The role to copy does not exist.");
      permissions = permsOf(src);
    }
    const row = await prisma.role.create({ data: { name, description: `${CUSTOM_MARK}${input.description ? ": " + String(input.description).trim().slice(0, 200) : ""}`, permissions } });
    await AuditService.log({ userId: actor.id, action: "ROLE_CREATE", entityType: "Role", entityId: row.id, newValues: { name, clonedFrom: input.cloneFromId || null }, eventType: "PERMISSION_CHANGE" });
    return PerformanceAccessService.matrix();
  }

  static async deleteRole(id: string, actor: any) {
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) throw new AccessError("Role not found.", 404);
    if (!String(role.description || "").startsWith(CUSTOM_MARK)) throw new AccessError("Only a custom performance role can be deleted here.", 403);
    const users = await prisma.user.count({ where: { roleId: id } });
    if (users) throw new AccessError(`${users} user${users === 1 ? " holds" : "s hold"} this role. Move ${users === 1 ? "them" : "them"} to another role first.`);
    await prisma.role.delete({ where: { id } });
    await AuditService.log({ userId: actor.id, action: "ROLE_DELETE", entityType: "Role", entityId: id, oldValues: { name: role.name }, eventType: "PERMISSION_CHANGE" });
    return PerformanceAccessService.matrix();
  }

  static async assignRole(userId: string, roleId: string, actor: any) {
    const [user, role] = await Promise.all([prisma.user.findUnique({ where: { id: userId }, select: { id: true, roleId: true, firstName: true, lastName: true } }), prisma.role.findUnique({ where: { id: roleId } })]);
    if (!user) throw new AccessError("User not found.", 404);
    if (!role) throw new AccessError("Role not found.", 404);
    if (user.id === actor.id) throw new AccessError("You cannot change your own role.", 403);
    if (user.roleId === roleId) throw new AccessError("The person already holds this role.");
    const before = await prisma.role.findUnique({ where: { id: user.roleId }, select: { name: true } });
    await prisma.user.update({ where: { id: userId }, data: { roleId } });
    await AuditService.log({ userId: actor.id, action: "ROLE_ASSIGN", entityType: "User", entityId: userId, oldValues: { role: before?.name }, newValues: { role: role.name }, eventType: "PERMISSION_CHANGE" });
    return { userId, role: role.name };
  }
}
