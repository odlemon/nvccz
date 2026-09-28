/**
 * Accounting RBAC: give each role the Accounting keys its job calls for, once.
 *
 * WHY: only the `admin` role held any accounting key (the CFO gets some through a code grant), so every finance role was
 * refused on the few routes that checked, while 304 of 420 accounting routes checked nothing but login — any signed-in
 * user, portal accounts included, could post, void and reverse journals, lock periods and reconcile banks. The routes are
 * now behind one guard (src/middleware/accountingAccessGuard.ts, rules in src/config/accountingAccess.ts); this writes the
 * grants it reads. Preparers prepare; approvers (Finance Manager, CFO, administrators) post, void, reverse and run
 * postings; auditors read. Model: nvccz-new/design-refs/accounting-sweep/RBAC.md.
 *
 * Only accounting keys are touched (the list below); every other key on a role is kept. Custom and object-shaped (portal)
 * permission maps are left alone. Refuses a second run without --force (after it, access is changed per role).
 *
 * Usage: npx ts-node --transpile-only -r dotenv/config scripts/run-accounting-rbac-migration.ts [--check] [--force]
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHECK = process.argv.includes("--check");
const FORCE = process.argv.includes("--force");

const K = {
  VIEW: "view_accounting", MANAGE: "manage_accounting", LV: "view_ledger", LP: "manage_ledger", REP: "view_financial_reports", REPM: "manage_financial_reports",
  BANK: "bank_reconciliation", PV: "accounting.period_lock.view", PM: "accounting.period_lock.manage", PA: "accounting.period_lock.audit_view", PO: "accounting.period_lock.override",
  TR: "accounting.treasury.manage", TRA: "accounting.treasury.approve", ACC: "accounting.access.manage",
};
const ALL = Object.values(K);
const PREPARER = [K.VIEW, K.MANAGE, K.LV, K.REP, K.BANK, K.PV, K.TR];
const TIERS: Record<string, string[]> = {
  "admin": ALL, "System Administrator": ALL,
  "Chief Financial Officer": ALL.filter((k) => k !== K.ACC),
  "Finance Manager": [K.VIEW, K.MANAGE, K.LV, K.LP, K.REP, K.REPM, K.BANK, K.PV, K.PM, K.PA, K.TR, K.TRA],
  "Accountant": PREPARER, "Finance Officer": PREPARER,
  "Finance Assistant": [K.VIEW, K.MANAGE, K.LV],
  "Finance Member": [K.VIEW, K.LV],
  "Payroll Manager": [K.VIEW, K.LV],
  "Internal Auditor": [K.VIEW, K.LV, K.REP, K.PV, K.PA], "External Auditor": [K.VIEW, K.LV, K.REP, K.PV, K.PA],
  "CEO": [K.VIEW, K.REP], "CIO": [K.VIEW, K.REP],
  "FP&A Version Lock Authority": [K.VIEW, K.REP, K.PV],
};
const CUSTOM = "Custom performance role";

async function main() {
  const roles = await prisma.role.findMany({ orderBy: { name: "asc" } });
  const applied = roles.some((r) => Array.isArray(r.permissions) && r.permissions.some((p) => p && p.name === K.TR && p.value === true));
  if (applied && !FORCE && !CHECK) { console.log("[acct-rbac] already applied; change access per role, or pass --force to reset to these defaults."); return; }
  let changed = 0;
  for (const r of roles) {
    if (r.permissions != null && !Array.isArray(r.permissions)) { console.log(`[skip]   ${r.name} (portal permission map)`); continue; }
    if (String(r.description || "").startsWith(CUSTOM)) { console.log(`[skip]   ${r.name} (custom role)`); continue; }
    const want = TIERS[r.name] || [];
    const before = (Array.isArray(r.permissions) ? r.permissions : []).filter((p) => p && typeof p === "object" && p.name);
    const next = before.filter((p) => !ALL.includes(p.name));
    for (const k of want) next.push({ name: k, value: true });
    const key = (a) => JSON.stringify(a.filter((p) => ALL.includes(p.name) && p.value === true).map((p) => p.name).sort());
    if (key(before) === key(next)) continue;
    console.log(`[${CHECK ? "would" : "update"}] ${r.name.padEnd(30)} accounting keys: ${key(before)} -> ${key(next)}`);
    changed++;
    if (!CHECK) await prisma.role.update({ where: { id: r.id }, data: { permissions: next } });
  }
  console.log(`\n[acct-rbac] ${CHECK ? "would change" : "changed"} ${changed} role(s).`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
