/**
 * Grant the permission keys the Performance module's guarded routes actually require.
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/config/hardcodedRoles.ts` defines every role as `{ name, level, department,
 * description }` — it has **no permissions field at all**. `scripts/sync-hardcoded-roles.ts`
 * therefore created 57 roles with an empty `permissions` array. Measured 8 Sep 2026:
 *
 *     roles in DB: 59
 *     roles WITH permissions:  2   (`admin` with 34, plus one stray local test role)
 *     roles WITHOUT:          57
 *
 * Every route guarded by `requireAnyPermission(...)` consequently 403s for all 57 real
 * roles. Verified end to end on `GET /api/accounting/timesheets/mine`, which the Performance
 * module's Timesheets page depends on:
 *
 *     admin           200
 *     SYSADMIN        403
 *     CEO             403
 *     HR_MGR          403
 *     OPS_MGR         403
 *     OPS_MEM         403   <- the employee whose own timesheet it is
 *
 * So self-service timesheets were unusable for literally everyone except the system admin,
 * and had evidently never worked.
 *
 * SCOPE OF THIS SCRIPT
 * --------------------
 * Deliberately narrow: it grants only the keys the Performance module's own pages need.
 * The wider gap — that the granular permission system has no data behind it for any role
 * other than `admin`, affecting other modules too — is real and is NOT fixed here. See
 * `design-refs/performance-role-matrix.md`.
 *
 * Grants:
 *   accounting.timesheets.view      -> every internal staff role (self-service: own timesheet)
 *   accounting.timesheets.manage    -> manager/exec roles (approve or return others')
 *   performance.corrective.view     -> every internal staff role
 *   performance.corrective.manage   -> manager/exec roles
 *   performance.alerts.view         -> every internal staff role
 *   performance.alerts.manage       -> manager/exec roles
 *   performance.documents.view      -> every internal staff role
 *   performance.documents.manage    -> manager/exec roles
 *
 * External/portal roles are deliberately excluded from ALL of these — an LP or an applicant
 * has no timesheet, and must not be able to read, let alone create, a corrective action, a
 * performance alert or a document in the performance vault. Before these keys existed the
 * three registers were `authenticate`-only, so any logged-in user of any portal could create
 * and delete records in them.
 *
 * Idempotent: existing permissions are preserved and a key is only appended when missing.
 * Re-running prints `[skip]` for everything.
 *
 * Usage:
 *   npx ts-node --transpile-only -r dotenv/config scripts/run-performance-role-permissions-migration.ts
 *   ... --check     (report only, write nothing)
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient() as any;
const CHECK_ONLY = process.argv.includes("--check");

const SELF_SERVICE_KEY = "accounting.timesheets.view";
const MANAGE_KEY = "accounting.timesheets.manage";

/**
 * Performance module keys, granted in two passes.
 *
 * Pass 1 (corrective actions, alerts, documents, settings): registers with their own tables
 * that had NO guard at all — `authenticate`-only, writable by any logged-in user of any
 * portal.
 *
 * Pass 2 (goals, scorecards, bsc, reviews, contracts, config, kpi, integration, etl,
 * workflow, dashboard, analytics, rollup, risks, breakdown): the other 118 write endpoints
 * across 22 route files that were in the exact same unguarded state — `router.use(authenticate)`
 * and nothing else. Guarded via `methodGuard()` (src/middleware/methodGuard.ts): GET/HEAD get
 * the `.view` set, everything else gets `.manage`, applied once per router rather than per
 * route, so a route added later inherits the guard instead of shipping unguarded by omission.
 *
 * `board-reviews` and `risk-assessments`... risk-assessments IS included (domain `risks`) —
 * despite the underlying `RiskAssessment` model's shape reading like a deal/investment
 * due-diligence record, nothing outside the Performance module's frontend or backend
 * currently reads or writes it (verified: no other service touches `prisma.riskAssessment`,
 * no other frontend module calls `/api/risk-assessments`). `board-reviews` was checked and
 * excluded — it backs the Portfolio/Investment-Committee deal flow and guarding it here would
 * have locked out deal analysts who hold no Performance permission.
 *
 * Read is granted to every internal staff role — these are organisation-wide governance
 * surfaces, and an employee needs to see e.g. the corrective action raised against their own
 * objective. Write is manager/exec only.
 */
const PERFORMANCE_VIEW_KEYS = [
  "performance.corrective.view",
  "performance.alerts.view",
  "performance.documents.view",
  "performance.settings.view",
  "performance.goals.view",
  "performance.scorecards.view",
  "performance.bsc.view",
  "performance.reviews.view",
  "performance.contracts.view",
  "performance.config.view",
  "performance.kpi.view",
  "performance.integration.view",
  "performance.etl.view",
  "performance.workflow.view",
  "performance.dashboard.view",
  "performance.analytics.view",
  "performance.rollup.view",
  "performance.risks.view",
  "performance.breakdown.view",
];
const PERFORMANCE_MANAGE_KEYS = [
  "performance.corrective.manage",
  "performance.alerts.manage",
  "performance.documents.manage",
  "performance.settings.manage",
  "performance.goals.manage",
  "performance.scorecards.manage",
  "performance.bsc.manage",
  "performance.reviews.manage",
  "performance.contracts.manage",
  "performance.config.manage",
  "performance.kpi.manage",
  "performance.integration.manage",
  "performance.etl.manage",
  "performance.workflow.manage",
  "performance.dashboard.manage",
  "performance.analytics.manage",
  "performance.rollup.manage",
  "performance.risks.manage",
  "performance.breakdown.manage",
];

/** Roles that belong to an external party — no timesheet, no grant. */
const EXTERNAL_ROLES = new Set([
  "applicant",
  "INVESTEE",
  "Limited Partner",
  "LP Viewer",
  "LP Institutional Manager",
  "External Auditor",
]);

/** Roles that may approve or return someone else's timesheet. */
const MANAGER_ROLES = new Set([
  "admin",
  "System Administrator",
  "CEO",
  "CIO",
  "Chief Financial Officer",
  "Finance Manager",
  "Sales Manager",
  "Operations Manager",
  "Procurement Manager",
  "HR Manager",
  "HR Officer",
  "Marketing Manager",
  "Legal Manager",
  "IT Manager",
  "Fund Manager",
  "Portfolio Manager",
]);

/** Local scratch roles created by verification runs — never granted anything. */
const isScratchRole = (name: string) => /^local_dev_verify_/.test(name);

function permNames(permissions: unknown): string[] {
  if (!Array.isArray(permissions)) return [];
  return permissions
    .map((p: any) => (typeof p === "string" ? p : p && p.name))
    .filter((n: any): n is string => typeof n === "string");
}

/** Preserve whatever shape the row already uses; default to the {name,value} form `admin` uses. */
function appendPermission(permissions: unknown, key: string): any[] {
  const list = Array.isArray(permissions) ? [...permissions] : [];
  const usesObjects = list.length === 0 || list.some((p: any) => p && typeof p === "object");
  list.push(usesObjects ? { name: key, value: true } : key);
  return list;
}

(async () => {
  const roles = await prisma.role.findMany({ select: { id: true, name: true, permissions: true } });
  console.log(`[perf-role-perms] ${roles.length} roles found (${CHECK_ONLY ? "check only" : "writing"})\n`);

  let granted = 0;
  let skipped = 0;
  let excluded = 0;

  for (const role of roles) {
    if (EXTERNAL_ROLES.has(role.name) || isScratchRole(role.name)) {
      excluded++;
      continue;
    }

    const have = permNames(role.permissions);
    const wanted = [SELF_SERVICE_KEY, ...PERFORMANCE_VIEW_KEYS];
    if (MANAGER_ROLES.has(role.name)) wanted.push(MANAGE_KEY, ...PERFORMANCE_MANAGE_KEYS);

    const missing = wanted.filter((k) => !have.includes(k));
    if (missing.length === 0) {
      console.log(`  [skip] ${role.name}`);
      skipped++;
      continue;
    }

    let next = role.permissions;
    for (const key of missing) next = appendPermission(next, key);

    if (!CHECK_ONLY) {
      await prisma.role.update({ where: { id: role.id }, data: { permissions: next } });
    }
    console.log(`  [grant] ${role.name.padEnd(32)} + ${missing.join(", ")}`);
    granted++;
  }

  console.log(
    `\n[perf-role-perms] granted=${granted} skipped=${skipped} excluded=${excluded}` +
      (CHECK_ONLY ? "  (nothing written)" : "")
  );

  await prisma.$disconnect();
})().catch(async (err) => {
  console.error("[perf-role-perms] FAILED:", err?.message || err);
  await prisma.$disconnect();
  process.exit(1);
});
