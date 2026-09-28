// @ts-nocheck
/**
 * Who may see and change what in the Performance module — the one place that answers it.
 *
 * Two facts, both held on the caller's role (`roles.permissions`), both editable on Performance → Access:
 *   - per resource, `performance.<resource>.view` / `.manage` (checked by the routers' guards);
 *   - the data scope: `performance.scope.organization`, `performance.scope.department`, or neither (= self).
 * Module administration (roles, the access matrix, the maker-checker exemption) is `performance.access.manage`.
 *
 * Scope decides which rows a caller sees and may change:
 *   organization  every row
 *   department    rows of the caller's department, plus rows they own or are named on
 *   self          rows they own or are named on (and organisation-level records meant for everyone, where a resource has them)
 * A department-scoped caller with no department on their user record falls back to self.
 *
 * The role model and the defaults per tier: design-refs/performance-sweep/RBAC.md.
 */
import { prisma } from "../utils/database";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";

export type PerfScope = "organization" | "department" | "self";

export class PerfAccessError extends Error {
  statusCode = 403;
  constructor(message = "Your role does not include this.") {
    super(message);
  }
}

export const ACCESS_ADMIN_KEY = "performance.access.manage";

export function perfCan(user: any, resource: string, level: "view" | "manage" = "view"): boolean {
  if (!user) return false;
  const manage = userHasEffectivePermission(user, `performance.${resource}.manage`);
  return level === "manage" ? manage : manage || userHasEffectivePermission(user, `performance.${resource}.view`);
}

/** The module administrators: change roles and access, and are exempt from maker-checker where the spec says so. */
export function isPerfAdmin(user: any): boolean {
  return !!user && userHasEffectivePermission(user, ACCESS_ADMIN_KEY);
}

export function perfScopeOf(user: any): PerfScope {
  if (!user) return "self";
  if (userHasEffectivePermission(user, "performance.scope.organization")) return "organization";
  if (userHasEffectivePermission(user, "performance.scope.department")) return "department";
  return "self";
}

export interface PerfActor {
  id: string;
  user: any;
  scope: PerfScope;
  departmentId: string | null;
  departmentName: string | null;
  isAdmin: boolean;
  org: boolean;
}

/** The caller, with their scope and department resolved once per request. */
export async function perfActor(user: any): Promise<PerfActor> {
  if (!user) throw new PerfAccessError("Sign in first.");
  if (user.__perfActor) return user.__perfActor;
  let departmentName: string | null = null;
  if (user.departmentId) {
    const d = await prisma.department.findUnique({ where: { id: user.departmentId }, select: { name: true } });
    departmentName = d?.name || null;
  }
  if (!departmentName && user.userDepartment) departmentName = String(user.userDepartment).trim() || null;
  let scope = perfScopeOf(user);
  if (scope === "department" && !departmentName) scope = "self";
  const a: PerfActor = { id: user.id, user, scope, departmentId: user.departmentId || null, departmentName, isAdmin: isPerfAdmin(user), org: scope === "organization" };
  Object.defineProperty(user, "__perfActor", { value: a, enumerable: false, configurable: true });
  return a;
}

const lc = (s: any) => String(s || "").trim().toLowerCase();
export const sameDepartment = (a: PerfActor, name: any) => !!a.departmentName && lc(name) === lc(a.departmentName);

/** Ids of the people in the caller's department (by FK or by the legacy department-name column). */
export function departmentUserIds(a: PerfActor): Promise<string[]> {
  if (!a.departmentName && !a.departmentId) return Promise.resolve([]);
  // one lookup per request: the promise is cached, since list filters check many rows at once
  const cached = (a as any).__deptIds as Promise<string[]> | undefined;
  if (cached) return cached;
  const or: any[] = [];
  if (a.departmentId) or.push({ departmentId: a.departmentId });
  if (a.departmentName) or.push({ userDepartment: a.departmentName });
  const p = prisma.user.findMany({ where: { OR: or }, select: { id: true } }).then((rows) => rows.map((r) => r.id));
  Object.defineProperty(a, "__deptIds", { value: p, enumerable: false });
  return p;
}

/** A user's department name (FK first, then the legacy column). */
export async function departmentOfUser(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { userDepartment: true, department: { select: { name: true } } } });
  return u?.department?.name || u?.userDepartment || null;
}

/**
 * Row filter for the registers that carry `departmentId` and person columns (corrective actions, risks, alerts,
 * documents). `people` are the columns that name someone on the row (owner, creator, uploader…).
 */
export function registerWhere(a: PerfActor, people: string[], extra: any[] = []): any {
  if (a.org) return {};
  const or: any[] = people.map((c) => ({ [c]: a.id }));
  if (a.scope === "department" && a.departmentId) or.push({ departmentId: a.departmentId });
  or.push(...extra);
  return { OR: or };
}

export function registerRowVisible(a: PerfActor, row: any, people: string[]): boolean {
  if (!row) return false;
  if (a.org) return true;
  if (people.some((c) => row[c] && row[c] === a.id)) return true;
  return a.scope === "department" && !!a.departmentId && row.departmentId === a.departmentId;
}

// ---------------------------------------------------------------------------------------------------------------- goals
/**
 * A goal is visible to: the organisation scope; the person it is assigned to or who created it; everyone for company goals
 * (the strategy people align to); the caller's own department's department goals; and, for a department scope, every goal
 * of the department and of its people.
 */
export async function goalVisible(a: PerfActor, g: any): Promise<boolean> {
  if (!g) return false;
  if (a.org) return true;
  if (g.assignedToId === a.id || g.createdById === a.id) return true;
  const type = lc(g.type);
  if (type === "company") return true;
  if (type === "department" && sameDepartment(a, g.departmentName)) return true;
  if (a.scope !== "department") return false;
  if (sameDepartment(a, g.departmentName)) return true;
  return !!g.assignedToId && (await departmentUserIds(a)).includes(g.assignedToId);
}

/** Who may change a goal (on top of performance.goals.manage): the organisation scope, or a department scope for its own department's goals. */
export async function goalWritable(a: PerfActor, g: any): Promise<boolean> {
  if (!g) return false;
  if (a.org) return true;
  if (a.scope !== "department" || lc(g.type) === "company") return false;
  if (sameDepartment(a, g.departmentName)) return true;
  return !!g.assignedToId && (await departmentUserIds(a)).includes(g.assignedToId);
}

export const GOAL_SCOPE_SELECT = { id: true, type: true, assignedToId: true, createdById: true, departmentName: true } as const;

/** A department (by name) the caller may act on: any for the organisation scope, their own for a department scope. */
export function departmentInScope(a: PerfActor, name: any): boolean {
  return a.org || (a.scope === "department" && sameDepartment(a, name));
}

/** A person the caller may act on: themselves, anyone for the organisation scope, their department's people for a department scope. */
export async function personInScope(a: PerfActor, userId: any): Promise<boolean> {
  if (!userId) return false;
  if (a.org || userId === a.id) return true;
  return a.scope === "department" && (await departmentUserIds(a)).includes(String(userId));
}

// ------------------------------------------------------------------------------------------------------------ contracts
const ORG_CONTRACT_TYPES = new Set(["board", "ceo"]);
const namedOnContract = (a: PerfActor, c: any) => [c.subjectUserId, c.reviewerUserId, c.approverUserId, c.createdById].includes(a.id);

/** Contracts: the people named on one; a department scope also sees its department's and its people's (not Board/CEO). */
export async function contractWhere(a: PerfActor): Promise<any> {
  if (a.org) return {};
  const or: any[] = [{ subjectUserId: a.id }, { reviewerUserId: a.id }, { approverUserId: a.id }, { createdById: a.id }];
  if (a.scope === "department") {
    or.push({ AND: [{ departmentName: a.departmentName }, { contractType: { notIn: ["BOARD", "CEO", "board", "ceo"] } }] });
    const ids = await departmentUserIds(a);
    if (ids.length) or.push({ subjectUserId: { in: ids } });
  }
  return { OR: or };
}
export async function contractVisible(a: PerfActor, c: any): Promise<boolean> {
  if (!c) return false;
  if (a.org || namedOnContract(a, c)) return true;
  if (a.scope !== "department" || ORG_CONTRACT_TYPES.has(lc(c.contractType))) return false;
  if (sameDepartment(a, c.departmentName)) return true;
  return !!c.subjectUserId && (await departmentUserIds(a)).includes(c.subjectUserId);
}
/** Amend, close, reopen (on top of contracts.manage): organisation scope; a department scope for its department's contracts —
 *  never one's own (no one amends the contract they are measured by), Board and CEO contracts are organisation-only. */
export async function contractWritable(a: PerfActor, c: any): Promise<boolean> {
  if (!c) return false;
  if (a.org) return a.isAdmin || c.subjectUserId !== a.id;
  if (a.scope !== "department" || ORG_CONTRACT_TYPES.has(lc(c.contractType)) || c.subjectUserId === a.id) return false;
  if (sameDepartment(a, c.departmentName)) return true;
  return !!c.subjectUserId && (await departmentUserIds(a)).includes(c.subjectUserId);
}

// ------------------------------------------------------------------------------------------- registers (by departmentId)
/** A register row by id, checked against the caller's scope (see registerRowVisible). */
export const registerRule = (model: string, people: string[], label: string) => scoped(async (req, a) => {
  const select = Object.fromEntries(["departmentId", ...people].map((k) => [k, true]));
  const row = await (prisma as any)[model].findUnique({ where: { id: String(req.params.id) }, select });
  if (!row) return null;
  return registerRowVisible(a, row, people) ? null : `This ${label} is outside what your role can see.`;
});
/** Where a new or edited register row may point: a department scope keeps it in its own department and among its people. */
export const registerPlacement = (label: string) => scoped(async (req, a) => {
  if (a.org) return null;
  const b = req.body || {};
  if (b.departmentId && b.departmentId !== a.departmentId) return `You can only record a ${label} for your own department.`;
  if (b.ownerId && !(await personInScope(a, b.ownerId))) return "The owner must be someone in your department.";
  return null;
});

// ------------------------------------------------------------------------------------------------------------ documents
/**
 * Vault documents, by audience: "All staff" once approved — everyone; "Leadership" — managers and the organisation scope;
 * "Executive", "Board", "HR only" — the organisation scope; "Owner only" — the owner (and administrators). Owners and
 * uploaders always see their own, and a department scope sees its department's documents.
 */
export function documentWhere(a: PerfActor): any {
  if (a.isAdmin) return {};
  const mine = [{ ownerId: a.id }, { uploadedById: a.id }];
  if (a.org) return { OR: [...mine, { audience: { not: "Owner only" } }, { audience: null }] };
  const or: any[] = [...mine, { AND: [{ audience: "All staff" }, { status: "approved" }] }];
  if (a.scope === "department") {
    or.push({ audience: "Leadership" });
    if (a.departmentId) or.push({ AND: [{ departmentId: a.departmentId }, { audience: { in: ["All staff", "Leadership"] } }] });
  }
  return { OR: or };
}
export function documentVisible(a: PerfActor, d: any): boolean {
  if (!d) return false;
  if (a.isAdmin || d.ownerId === a.id || d.uploadedById === a.id) return true;
  const aud = d.audience || "All staff";
  if (aud === "Owner only") return false;
  if (a.org) return true;
  if (aud === "All staff" && d.status === "approved") return true;
  if (a.scope !== "department") return false;
  if (aud === "Leadership") return true;
  return !!a.departmentId && d.departmentId === a.departmentId && ["All staff", "Leadership"].includes(aud);
}
/** Changing a document (on top of documents.manage): the organisation scope; otherwise the owner, the uploader, or the
 *  department scope for its own department's documents — seeing another department's document is not owning it. */
export function documentWritable(a: PerfActor, d: any): boolean {
  if (!d) return false;
  if (a.isAdmin) return true;
  if (d.audience === "Owner only" && d.ownerId !== a.id && d.uploadedById !== a.id) return false;
  if (a.org || d.ownerId === a.id || d.uploadedById === a.id) return true;
  return a.scope === "department" && !!a.departmentId && d.departmentId === a.departmentId;
}

export const goalById = (id: any) => (id ? prisma.performanceGoal.findUnique({ where: { id: String(id) }, select: GOAL_SCOPE_SELECT }) : Promise.resolve(null));

/**
 * Express middleware from a row-scope rule: `check(req, actor)` returns a refusal message (403) or nothing (continue).
 * A record that does not exist is left to the handler, which already answers 404.
 */
export const scoped = (check: (req: any, a: PerfActor) => Promise<string | null | void | false>) => async (req: any, res: any, next: any) => {
  try {
    const refusal = await check(req, await perfActor(req.user));
    if (refusal) return res.status(403).json({ success: false, message: refusal });
    next();
  } catch (e: any) {
    res.status(e?.statusCode || 500).json({ success: false, message: e?.message || "Error" });
  }
};
export const goalRule = (param: string, mode: "view" | "write") => scoped(async (req, a) => {
  const g = await goalById(req.params[param] ?? req.body?.[param]);
  if (!g) return null;
  if (mode === "view") return (await goalVisible(a, g)) ? null : "This goal is outside what your role can see.";
  return (await goalWritable(a, g)) ? null : "Your role cannot change this goal.";
});
export const orgOnly = (message = "Only an organisation-wide role can do this.") => scoped(async (_req, a) => (a.org ? null : message));

/** Throws the 403 the routers turn into "You do not have access". */
export function deny(message?: string): never {
  throw new PerfAccessError(message || "This record is outside what your role can see.");
}

/** Express helper: map a PerfAccessError (or anything with statusCode) to a response. */
export function sendError(res: any, e: any, fallback = 500) {
  const code = e?.statusCode || e?.status || fallback;
  res.status(code).json({ success: false, message: e?.message || "Error" });
}
