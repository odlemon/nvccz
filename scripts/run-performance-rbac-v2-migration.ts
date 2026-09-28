/**
 * Performance RBAC v2: give every role the Performance access its tier calls for, and nothing more.
 *
 * WHY
 * ---
 * v1 (`run-performance-role-permissions-migration.ts`) granted `performance.<every resource>.view` to every internal role and
 * `.manage` on every resource — settings and integrations included — to every "Manager" role, with no data scope at all. So an
 * Operations Member could read every employee's contract and scorecard, and a Procurement Manager (380 users locally) could
 * change Performance settings, approve KPIs and propose BSC pillar weights. The module's own role model
 * (design-refs/performance-role-matrix.md §3) is five tiers with a data scope each; this script writes that model onto the
 * roles, once. After it has run, Performance → Access is where grants and scopes change — re-running would overwrite those
 * edits, so the script refuses unless given --force.
 *
 * WHAT IT CHANGES (per role, except custom performance roles, which keep what an administrator gave them)
 *   - removes every `performance.*` key, then writes the tier's keys (view/manage per resource, data scope, access admin);
 *   - adds `accounting.timesheets.view` to every internal role, and `accounting.timesheets.manage` to the tiers that approve
 *     timesheets. Other `accounting.*` and non-performance keys are left exactly as they are.
 * The tiers and their keys: design-refs/performance-sweep/RBAC.md.
 *
 * Usage:
 *   npx ts-node --transpile-only -r dotenv/config scripts/run-performance-rbac-v2-migration.ts            (apply)
 *   ... --check   (report what would change, write nothing)
 *   ... --force   (apply again even though v2 has already been applied; resets matrix edits to the defaults)
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHECK = process.argv.includes("--check");
const FORCE = process.argv.includes("--force");

type Tier = "admin" | "executive" | "hr" | "manager" | "individual" | "none";
const TIER_BY_ROLE: Record<string, Tier> = {
  "admin": "admin", "System Administrator": "admin", "IT Manager": "admin",
  "CEO": "executive", "CIO": "executive", "Chief Financial Officer": "executive",
  "HR Manager": "hr", "HR Officer": "hr", "HR Coordinator": "hr",
  "Finance Manager": "manager", "Sales Manager": "manager", "Operations Manager": "manager", "Procurement Manager": "manager",
  "Marketing Manager": "manager", "Legal Manager": "manager", "Fund Manager": "manager", "Portfolio Manager": "manager", "Payroll Manager": "manager",
  // not staff of the organisation's performance framework: portal users, the board, the investment committee, external audit
  "applicant": "none", "INVESTEE": "none", "Limited Partner": "none", "LP Viewer": "none", "LP Institutional Manager": "none",
  "External Auditor": "none", "Board Chairman": "none", "Board Member": "none", "Investment Committee Member": "none",
};
const tierOf = (name: string): Tier => TIER_BY_ROLE[name] || (/^local_dev_verify/i.test(name) ? "none" : "individual");

const ALL = ["dashboard", "config", "goals", "kpi", "bsc", "scorecards", "contracts", "reviews", "corrective", "risks", "alerts", "documents", "analytics", "integration", "etl", "workflow", "settings", "access"];
const GRANTS: Record<Exclude<Tier, "none">, { view: string[]; manage: string[]; scope: "organization" | "department" | null; timesheetsManage: boolean }> = {
  admin: { view: ALL, manage: ALL, scope: "organization", timesheetsManage: true },
  executive: {
    view: ["dashboard", "config", "goals", "kpi", "bsc", "scorecards", "contracts", "reviews", "corrective", "risks", "alerts", "documents", "analytics", "access"],
    manage: ["config", "goals", "kpi", "bsc", "scorecards", "contracts", "reviews", "corrective", "risks", "documents", "analytics"],
    scope: "organization", timesheetsManage: true,
  },
  hr: {
    view: ["dashboard", "config", "goals", "kpi", "bsc", "scorecards", "contracts", "reviews", "corrective", "risks", "alerts", "documents", "analytics", "settings", "access"],
    manage: ["scorecards", "contracts", "reviews", "corrective", "documents", "analytics"],
    scope: "organization", timesheetsManage: false,
  },
  manager: {
    view: ["dashboard", "config", "goals", "kpi", "scorecards", "contracts", "reviews", "corrective", "risks", "alerts", "documents", "analytics"],
    manage: ["goals", "scorecards", "contracts", "reviews", "corrective", "risks", "documents"],
    scope: "department", timesheetsManage: true,
  },
  individual: {
    view: ["dashboard", "config", "goals", "kpi", "scorecards", "contracts", "reviews", "corrective", "alerts", "documents"],
    manage: [],
    scope: null, timesheetsManage: false,
  },
};
// the HR head approves their own department's timesheets like any other department head
const TIMESHEET_MANAGERS_EXTRA = new Set(["HR Manager"]);

const isPerf = (n: string) => /^performance\./.test(n);
const CUSTOM = "Custom performance role";

async function main() {
  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
  const custom = (r) => String(r.description || "").startsWith(CUSTOM);
  const applied = roles.some((r) => !custom(r) && Array.isArray(r.permissions) && r.permissions.some((p) => p && /^performance\.scope\./.test(p.name)));
  if (applied && !FORCE && !CHECK) {
    console.log("[perf-rbac-v2] already applied (a role carries a performance.scope key). Grants are now managed on Performance → Access; pass --force to reset them to the defaults.");
    return;
  }
  let changed = 0;
  for (const r of roles) {
    if (custom(r)) { console.log(`[skip]   ${r.name} (custom performance role)`); continue; }
    // a few portal roles keep their own object-shaped permission map; they hold no Performance access and are not touched
    if (r.permissions != null && !Array.isArray(r.permissions)) { console.log(`[skip]   ${r.name} (non-list permissions, portal role)`); continue; }
    const tier = tierOf(r.name);
    const before = (Array.isArray(r.permissions) ? r.permissions : []).filter((p) => p && typeof p === "object" && p.name);
    const kept = before.filter((p) => !isPerf(p.name));
    const add = (arr, name) => { if (!arr.some((p) => p.name === name)) arr.push({ name, value: true }); };
    const next = kept.map((p) => ({ ...p }));
    if (tier !== "none") {
      const g = GRANTS[tier];
      for (const k of g.view) add(next, `performance.${k}.view`);
      for (const k of g.manage) add(next, `performance.${k}.manage`);
      if (g.scope) add(next, `performance.scope.${g.scope}`);
      if (tier === "admin") add(next, "performance.access.manage");
      add(next, "accounting.timesheets.view");
      if (g.timesheetsManage || TIMESHEET_MANAGERS_EXTRA.has(r.name)) add(next, "accounting.timesheets.manage");
    }
    const key = (arr) => JSON.stringify(arr.filter((p) => p.value === true).map((p) => p.name).sort());
    if (key(before) === key(next)) { console.log(`[same]   ${r.name.padEnd(34)} ${tier}`); continue; }
    const perfBefore = before.filter((p) => isPerf(p.name) && p.value === true).length;
    const perfAfter = next.filter((p) => isPerf(p.name)).length;
    console.log(`[${CHECK ? "would" : "update"}] ${r.name.padEnd(34)} ${tier.padEnd(10)} performance keys ${perfBefore} -> ${perfAfter}`);
    changed++;
    if (!CHECK) await prisma.role.update({ where: { id: r.id }, data: { permissions: next } });
  }
  console.log(`\n[perf-rbac-v2] ${CHECK ? "would change" : "changed"} ${changed} role(s).`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
