// @ts-nocheck
import { prisma } from "../utils/database";
import { isAdminViewer, isCEO } from "./performanceScorecardSupport";

function normalizeDeptLabel(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Prefer **one** CEO user — same signals as CEO scorecards (`isCEO`).
 * If none or ambiguous resolution isn't needed here, picks first deterministic match by id.
 */
export async function resolveDefaultCompanyGoalAssigneeId(): Promise<string | null> {
  const roles = await prisma.role.findMany({
    where: {
      OR: [
        { name: "CEO" },
        { name: "Chief Executive Officer" },
        { name: { contains: "Chief Executive" } },
        { name: { contains: "CEO" } }
      ]
    },
    select: { id: true }
  });

  const byRole =
    roles.length > 0
      ? await prisma.user.findMany({
          where: { roleId: { in: roles.map((r) => r.id) } },
          include: { role: { select: { name: true } } },
          orderBy: { id: "asc" }
        })
      : [];

  const byCode = await prisma.user.findMany({
    where: {
      roleCode: { in: ["CEO", "CHIEF_EXECUTIVE", "chief_executive", "ceo"] }
    },
    include: { role: { select: { name: true } } },
    orderBy: { id: "asc" }
  });

  const merged = new Map<string, (typeof byRole)[0]>();
  for (const u of [...byRole, ...byCode]) {
    merged.set(u.id, u);
  }
  const ceos = [...merged.values()].filter((u) => isCEO({ ...u, role: u.role }));
  if (ceos.length > 0) {
    ceos.sort((a, b) => a.id.localeCompare(b.id));
    return ceos[0].id;
  }
  return resolveFirstAdminUserId();
}

/**
 * Department goals: assigned to **departmentRole HEAD** whose linked `Department.name`
 * or `userDepartment` matches `departmentName` (case-insensitive). If none, **admin** (same as dept head fallback semantics).
 */
export async function resolveDefaultDepartmentGoalAssigneeId(departmentName: string): Promise<string | null> {
  const want = normalizeDeptLabel(departmentName);
  if (!want) {
    return resolveFirstAdminUserId();
  }

  const heads = await prisma.user.findMany({
    where: {
      departmentRole: "HEAD"
    },
    include: {
      role: { select: { name: true } },
      department: { select: { name: true } }
    },
    orderBy: { id: "asc" },
    take: 600
  });

  const head = heads.find((u) => {
    const viaRelation = u.department?.name && normalizeDeptLabel(u.department.name) === want;
    const viaLegacy = u.userDepartment && normalizeDeptLabel(u.userDepartment) === want;
    return Boolean(viaRelation || viaLegacy);
  });

  if (head) {
    return head.id;
  }
  return resolveFirstAdminUserId();
}

async function resolveFirstAdminUserId(): Promise<string | null> {
  const adminsByRoleCode = await prisma.user.findMany({
    where: {
      roleCode: { in: ["SYSADMIN", "sysadmin", "ADMIN", "admin"] }
    },
    include: { role: { select: { name: true } } },
    orderBy: { id: "asc" },
    take: 80
  });
  const fromCode = adminsByRoleCode.find((u) => isAdminViewer({ ...u, role: u.role }));
  if (fromCode) {
    return fromCode.id;
  }

  const adminLikeRoles = await prisma.role.findMany({
    where: {
      OR: [
        { name: { equals: "admin", mode: "insensitive" } },
        { name: { contains: "sysadmin", mode: "insensitive" } },
        { name: { contains: "super_admin", mode: "insensitive" } }
      ]
    },
    select: { id: true }
  });
  const roleIds = adminLikeRoles.map((r) => r.id).filter(Boolean);
  if (!roleIds.length) {
    return null;
  }
  const users = await prisma.user.findMany({
    where: { roleId: { in: roleIds } },
    include: { role: { select: { name: true } } },
    orderBy: { id: "asc" },
    take: 200
  });
  const pick = users.find((u) => isAdminViewer({ ...u, role: u.role }));
  return pick?.id ?? users[0]?.id ?? null;
}
