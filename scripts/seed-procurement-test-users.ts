/**
 * Idempotent DEV seed: real users for each Procurement V23 persona.
 *
 * The V23 UI ships its own demo users and a client-side RBAC matrix, none of which is a
 * real user. Neither the role-based screens nor the backend's authorisation of procurement
 * actions can be verified without real logins, and the local database had no user holding
 * any procurement role (PROC_MGR, PROC_OFF, BUYER) or a payables role.
 *
 * One user per missing persona, on roleCodes that exist in the frontend RoleCode union
 * (`lib/config/role-permissions.ts`) and as `roles` rows here.
 *
 * Personas that already have a local test user are reused, not duplicated:
 *   Department head (approves the requester's PR)  perf.deptmgr@nts.local      OPS_MGR / Operations / HEAD
 *   Finance Manager                                payroll.finmgr@nts.local    FIN_MGR
 *   Chief Financial Officer                        payroll.cfo@nts.local       CFO
 *   Internal Auditor                               payroll.intaudit@nts.local  INT_AUDITOR
 *   System Administrator                           perf.sysadmin@nts.local     SYSADMIN
 *
 * Test-only. Local dev database only — deliberately NOT part of any VPS deploy.
 *
 * Usage:
 *   npm run db:seed:procurement-test-users
 *   npm run db:seed:procurement-test-users -- --remove
 */
// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient() as any;

/** Matches the other local test logins so the whole dev set shares one password. */
const PASSWORD = "admin123";

type Persona = {
  email: string;
  firstName: string;
  lastName: string;
  /** Existing `roles.name` row this user is attached to. */
  roleName: string;
  /** Must be a member of the frontend RoleCode union. */
  roleCode: string;
  department: string;
  departmentRole: "HEAD" | "OFFICER" | "MEMBER";
  /** What this persona does in the procure-to-pay flow. */
  acts: string;
};

const PERSONAS: Persona[] = [
  {
    email: "proc.mgr@nts.local",
    firstName: "Proc",
    lastName: "Manager",
    roleName: "Procurement Manager",
    roleCode: "PROC_MGR",
    department: "Procurement",
    departmentRole: "HEAD",
    acts: "Owns the plan and tenders, awards, signs off POs",
  },
  {
    email: "proc.officer@nts.local",
    firstName: "Proc",
    lastName: "Officer",
    roleName: "Procurement Officer",
    roleCode: "PROC_OFF",
    department: "Procurement",
    departmentRole: "OFFICER",
    acts: "Converts approved PRs, runs RFQs, raises POs",
  },
  {
    email: "proc.buyer@nts.local",
    firstName: "Proc",
    lastName: "Buyer",
    roleName: "Buyer",
    roleCode: "BUYER",
    department: "Procurement",
    departmentRole: "MEMBER",
    acts: "Sources vendors and quotations, records receipts",
  },
  {
    email: "proc.requester@nts.local",
    firstName: "Proc",
    lastName: "Requester",
    roleName: "Operations Member",
    roleCode: "OPS_MEM",
    department: "Operations",
    departmentRole: "MEMBER",
    acts: "Raises purchase requisitions (approved by perf.deptmgr)",
  },
  {
    email: "proc.ap@nts.local",
    firstName: "Proc",
    lastName: "Payables",
    roleName: "Accountant",
    roleCode: "ACCOUNTANT",
    department: "Finance",
    departmentRole: "MEMBER",
    acts: "Accounts payable: invoice capture, match, payment",
  },
];

async function remove() {
  const emails = PERSONAS.map((p) => p.email);
  const found = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
  if (!found.length) {
    console.log("[proc-users] nothing to remove");
    return;
  }
  const res = await prisma.user.deleteMany({ where: { email: { in: emails } } });
  console.log(`[proc-users] removed ${res.count} user(s): ${found.map((f) => f.email).join(", ")}`);
}

async function seed() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Resolve every dependency up-front so a missing role or department fails before any write.
  const roleNames = [...new Set(PERSONAS.map((p) => p.roleName))];
  const roles = await prisma.role.findMany({ where: { name: { in: roleNames } }, select: { id: true, name: true } });
  const missingRoles = roleNames.filter((n) => !roles.some((r) => r.name === n));
  if (missingRoles.length) {
    console.error(`[proc-users] ABORT — missing roles rows: ${missingRoles.join(", ")}`);
    process.exit(1);
  }

  const deptNames = [...new Set(PERSONAS.map((p) => p.department))];
  const depts = await prisma.department.findMany({ where: { name: { in: deptNames } }, select: { id: true, name: true } });
  const missingDepts = deptNames.filter((n) => !depts.some((d) => d.name === n));
  if (missingDepts.length) {
    console.error(`[proc-users] ABORT — missing departments: ${missingDepts.join(", ")}`);
    process.exit(1);
  }

  for (const p of PERSONAS) {
    const role = roles.find((r) => r.name === p.roleName);
    const dept = depts.find((d) => d.name === p.department);
    const data = {
      email: p.email,
      password: hash,
      firstName: p.firstName,
      lastName: p.lastName,
      roleId: role.id,
      roleCode: p.roleCode,
      departmentId: dept.id,
      userDepartment: p.department,
      departmentRole: p.departmentRole,
    };
    const existing = await prisma.user.findUnique({ where: { email: p.email } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data });
      console.log(`[proc-users] upserted ${p.email.padEnd(26)} ${p.roleCode.padEnd(10)} ${p.department}/${p.departmentRole}`);
    } else {
      await prisma.user.create({ data });
      console.log(`[proc-users] created  ${p.email.padEnd(26)} ${p.roleCode.padEnd(10)} ${p.department}/${p.departmentRole}`);
    }
  }

  console.log(`\n[proc-users] password for all seeded users: ${PASSWORD}`);
  for (const p of PERSONAS) console.log(`  ${p.email.padEnd(26)} ${p.acts}`);
}

(async () => {
  await assertDevDatabase(prisma, "proc-users");
  if (process.argv.includes("--remove")) await remove();
  else await seed();
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error("[proc-users] FAILED:", err?.message || err);
  await prisma.$disconnect();
  process.exit(1);
});
