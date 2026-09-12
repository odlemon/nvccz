/**
 * Idempotent DEV seed: real users for each Performance-module audience tier.
 *
 * Why this exists
 * ---------------
 * The Performance V22 UI ships a client-side "demo role" toggle with five roles —
 * SysAdmin, Executive, HR/M&E Manager, Department Manager, Employee — none of which
 * corresponds to a real role held by a real user (see
 * `design-refs/performance-module-map.md` §7 and §9.2). That makes the module's
 * role-based behaviour untestable and unverifiable.
 *
 * This seed creates one real, loggable-in user per tier, mapped onto roleCodes that
 * (a) exist in the frontend `RoleCode` union in `lib/config/role-permissions.ts`,
 * (b) already carry a `performance-management` grant in `ROLE_PERMISSIONS_MAP`, and
 * (c) exist as real `roles` rows in this database.
 *
 * Scope model note: there is no manager→report relation on `User`. `Employee` has
 * `lineManagerUserId` but that table is empty. The only data-backed scoping signals
 * today are `User.departmentId` / `User.userDepartment` plus `User.departmentRole`
 * ('HEAD' vs 'MEMBER'), so the Department Manager / Employee pair below is
 * distinguished by `departmentRole` inside the same department.
 *
 * Test-only. Local dev database only — deliberately NOT part of any VPS deploy.
 * Delete with:  npm run db:seed:performance-test-users -- --remove
 *
 * Usage:
 *   npm run db:seed:performance-test-users
 *   npm run db:seed:performance-test-users -- --remove
 */
// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient() as any;

/** Matches the other local test logins so the whole dev set shares one password. */
const PASSWORD = "admin123";

/** The department the manager/employee pair sits in, so their scopes differ by role only. */
const SCOPE_DEPARTMENT = "Operations";

type Tier = {
  email: string;
  firstName: string;
  lastName: string;
  /** Existing `roles.name` row this user is attached to. */
  roleName: string;
  /** Must be a member of the frontend RoleCode union. */
  roleCode: string;
  /** Null for org-wide tiers; set for the department-scoped pair. */
  department: string | null;
  /** 'HEAD' marks the department manager; 'MEMBER' the individual contributor. */
  departmentRole: string | null;
  /** Which demo role in the runtime this tier replaces. */
  replacesDemoRole: string;
};

const TIERS: Tier[] = [
  {
    email: "perf.sysadmin@nts.local",
    firstName: "Perf",
    lastName: "SysAdmin",
    roleName: "System Administrator",
    roleCode: "SYSADMIN",
    department: null,
    departmentRole: null,
    replacesDemoRole: "SysAdmin",
  },
  {
    email: "perf.exec@nts.local",
    firstName: "Perf",
    lastName: "Executive",
    roleName: "CEO",
    roleCode: "CEO",
    department: null,
    departmentRole: null,
    replacesDemoRole: "Executive",
  },
  {
    email: "perf.hr@nts.local",
    firstName: "Perf",
    lastName: "HRManager",
    roleName: "HR Manager",
    roleCode: "HR_MGR",
    department: "Human Resources",
    departmentRole: "HEAD",
    replacesDemoRole: "HR/M&E Manager",
  },
  {
    email: "perf.deptmgr@nts.local",
    firstName: "Perf",
    lastName: "DeptManager",
    roleName: "Operations Manager",
    roleCode: "OPS_MGR",
    department: SCOPE_DEPARTMENT,
    departmentRole: "HEAD",
    replacesDemoRole: "Department Manager",
  },
  {
    email: "perf.employee@nts.local",
    firstName: "Perf",
    lastName: "Employee",
    roleName: "Operations Member",
    roleCode: "OPS_MEM",
    department: SCOPE_DEPARTMENT,
    departmentRole: "MEMBER",
    replacesDemoRole: "Employee",
  },
];

async function remove() {
  const emails = TIERS.map((t) => t.email);
  const found = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
  if (!found.length) {
    console.log("[perf-users] nothing to remove");
    return;
  }
  const res = await prisma.user.deleteMany({ where: { email: { in: emails } } });
  console.log(`[perf-users] removed ${res.count} user(s): ${found.map((f) => f.email).join(", ")}`);
}

async function seed() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Resolve every dependency up-front so a missing role fails loudly before any write.
  const roleNames = [...new Set(TIERS.map((t) => t.roleName))];
  const roles = await prisma.role.findMany({ where: { name: { in: roleNames } }, select: { id: true, name: true } });
  const missingRoles = roleNames.filter((n) => !roles.some((r) => r.name === n));
  if (missingRoles.length) {
    console.error(`[perf-users] ABORT — missing roles rows: ${missingRoles.join(", ")}`);
    process.exit(1);
  }

  const deptNames = [...new Set(TIERS.map((t) => t.department).filter(Boolean))] as string[];
  const depts = await prisma.department.findMany({ where: { name: { in: deptNames } }, select: { id: true, name: true } });
  const missingDepts = deptNames.filter((n) => !depts.some((d) => d.name === n));
  if (missingDepts.length) {
    console.error(`[perf-users] ABORT — missing departments: ${missingDepts.join(", ")}`);
    process.exit(1);
  }

  for (const t of TIERS) {
    const role = roles.find((r) => r.name === t.roleName);
    const dept = t.department ? depts.find((d) => d.name === t.department) : null;

    const data = {
      email: t.email,
      password: hash,
      firstName: t.firstName,
      lastName: t.lastName,
      roleId: role.id,
      roleCode: t.roleCode,
      departmentId: dept ? dept.id : null,
      userDepartment: t.department,
      departmentRole: t.departmentRole,
    };

    const existing = await prisma.user.findUnique({ where: { email: t.email } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data });
      console.log(`[perf-users] upserted ${t.email.padEnd(26)} ${t.roleCode.padEnd(9)} dept=${t.department ?? "-"} role=${t.departmentRole ?? "-"}`);
    } else {
      await prisma.user.create({ data });
      console.log(`[perf-users] created  ${t.email.padEnd(26)} ${t.roleCode.padEnd(9)} dept=${t.department ?? "-"} role=${t.departmentRole ?? "-"}`);
    }
  }

  console.log(`\n[perf-users] password for all seeded users: ${PASSWORD}`);
  console.log("[perf-users] tier → demo role replaced:");
  for (const t of TIERS) console.log(`  ${t.email.padEnd(26)} replaces "${t.replacesDemoRole}"`);
}

(async () => {
  await assertDevDatabase(prisma, "perf-users");
  if (process.argv.includes("--remove")) await remove();
  else await seed();
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error("[perf-users] FAILED:", err?.message || err);
  await prisma.$disconnect();
  process.exit(1);
});
