/**
 * Accounting sweep A3: one fiscal calendar. Some databases hold a second fiscal year over the same dates as the seeded
 * one (`fy_<year>` / `fp_<year>_<mm>` from run-fiscal-period-lock-migration.ts), created by an older script with local-
 * time dates, so every month starts a day early ("September 2026" = 31 Aug – 29 Sep). A date then falls in two periods
 * and the period lookup takes whichever it finds first: a lock on one copy can be missed through the other.
 *
 * For each duplicate period (same name as a seeded period, in a year that is not the seeded one): close tasks and lock
 * history move to the seeded period; its module locks merge into the seeded period's (the stricter status wins:
 * CLOSED > LOCKED > OPEN); then the duplicate periods and year are removed. Idempotent. Logged in
 * nvccz-new/design-refs/accounting-sweep/MIGRATION_LOG.md.
 *
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/run-accounting-fiscal-dedupe-migration.ts [--check]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHECK = process.argv.includes("--check");
const RANK: Record<string, number> = { OPEN: 0, LOCKED: 1, CLOSED: 2 };

async function main() {
  const seeded = await prisma.fiscalPeriod.findMany({ where: { fiscalYearId: { startsWith: "fy_" } }, select: { id: true, name: true } });
  const seededByName = new Map(seeded.map((p) => [p.name, p.id]));
  const dupYears = await prisma.fiscalYear.findMany({
    where: { NOT: { id: { startsWith: "fy_" } } },
    include: { periods: { select: { id: true, name: true, startDate: true, endDate: true } } },
  });
  if (!dupYears.length) return console.log("[skip] no fiscal year outside the seeded calendar");

  for (const y of dupYears) {
    const unmatched = y.periods.filter((p) => !seededByName.has(p.name));
    if (unmatched.length) {
      console.log(`[hold] ${y.name} (${y.id}): ${unmatched.length} period(s) have no seeded counterpart (${unmatched.map((p) => p.name).join(", ")}); left as is`);
      continue;
    }
    console.log(`[dup]  ${y.name} (${y.id}): ${y.periods.length} periods → seeded periods by name`);
    for (const p of y.periods) {
      const target = seededByName.get(p.name)!;
      const [tasks, audits, locks] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>("SELECT COUNT(*) AS n FROM accounting_close_tasks WHERE fiscal_period_id = ?", p.id),
        prisma.$queryRawUnsafe<any[]>("SELECT COUNT(*) AS n FROM period_lock_audit_logs WHERE fiscal_period_id = ?", p.id),
        prisma.$queryRawUnsafe<any[]>("SELECT id, module_code, lock_status, reason, updated_by_id FROM module_period_locks WHERE fiscal_period_id = ?", p.id),
      ]);
      const nTasks = Number(tasks[0]?.n ?? 0), nAudits = Number(audits[0]?.n ?? 0);
      if (nTasks || nAudits || locks.length) console.log(`       ${p.name}: ${nTasks} close task(s), ${nAudits} lock history row(s), ${locks.length} module lock(s) → ${target}`);
      if (CHECK) continue;
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("UPDATE accounting_close_tasks SET fiscal_period_id = ? WHERE fiscal_period_id = ?", target, p.id);
        await tx.$executeRawUnsafe("UPDATE period_lock_audit_logs SET fiscal_period_id = ? WHERE fiscal_period_id = ?", target, p.id);
        for (const l of locks) {
          const existing = await tx.$queryRawUnsafe<any[]>("SELECT id, lock_status FROM module_period_locks WHERE fiscal_period_id = ? AND module_code = ?", target, l.module_code);
          if (!existing.length) {
            await tx.$executeRawUnsafe("UPDATE module_period_locks SET fiscal_period_id = ? WHERE id = ?", target, l.id);
            continue;
          }
          if ((RANK[l.lock_status] ?? 0) > (RANK[existing[0].lock_status] ?? 0)) {
            await tx.$executeRawUnsafe("UPDATE module_period_locks SET lock_status = ?, reason = ?, updated_by_id = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?", l.lock_status, l.reason, l.updated_by_id, existing[0].id);
            console.log(`       ${p.name} ${l.module_code}: stricter status ${l.lock_status} kept`);
          }
          await tx.$executeRawUnsafe("DELETE FROM module_period_locks WHERE id = ?", l.id);
        }
        await tx.$executeRawUnsafe("DELETE FROM fiscal_periods WHERE id = ?", p.id);
      });
    }
    if (!CHECK) {
      await prisma.$executeRawUnsafe("DELETE FROM fiscal_years WHERE id = ?", y.id);
      console.log(`[ok]   ${y.name} (${y.id}) removed`);
    }
  }
  // what is left must be one period per day
  const overlaps = await prisma.$queryRawUnsafe<any[]>(
    "SELECT a.id AS a, b.id AS b FROM fiscal_periods a JOIN fiscal_periods b ON a.id < b.id AND a.start_date <= b.end_date AND b.start_date <= a.end_date LIMIT 5"
  );
  console.log(overlaps.length ? `[warn] overlapping periods remain: ${JSON.stringify(overlaps)}` : "[ok]   no overlapping fiscal periods");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
