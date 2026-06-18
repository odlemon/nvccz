// @ts-nocheck
/**
 * Remove UAT forecast scenarios, entities, audit noise; reset Test Company investee reports for re-demo.
 *
 * Run:  npm run cleanup:uat-forecast-investee
 * Dry:  DRY_RUN=1 npm run cleanup:uat-forecast-investee
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const INVESTEE_EMAIL = process.env.UAT_INVESTEE_EMAIL || "karatakundai@gmail.com";

/** Scenarios to keep (client demo / non-UAT working copies). */
const KEEP_SCENARIO_NAMES = new Set([
  "ZimFund 2026",
  "Q3 Runway - Working Copy for Phase 2",
  "Q4 Test Scenario",
  "FY2026_BOARD_APPROVED — Working Copy",
  "FY2027 Working Copy (from locked baseline)",
  "Q3 Strategic Growth Runway",
]);

function isUatEntityName(name: string) {
  return /^UAT (Startup|Subsidiary)\b/i.test(name);
}

async function main() {
  console.log(`\n=== UAT forecast + investee cleanup ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  const allScenarios = await prisma.forecastScenario.findMany({
    select: { id: true, name: true, entityId: true, status: true },
  });
  const toDeleteScenarios = allScenarios.filter((s) => !KEEP_SCENARIO_NAMES.has(s.name));
  const keepScenarios = allScenarios.filter((s) => KEEP_SCENARIO_NAMES.has(s.name));

  console.log(`Scenarios: ${allScenarios.length} total, delete ${toDeleteScenarios.length}, keep ${keepScenarios.length}`);
  keepScenarios.forEach((s) => console.log(`  [keep] [${s.status}] ${s.name}`));
  toDeleteScenarios.slice(0, 15).forEach((s) => console.log(`  [del]  [${s.status}] ${s.name}`));
  if (toDeleteScenarios.length > 15) console.log(`  … and ${toDeleteScenarios.length - 15} more`);

  const allEntities = await prisma.forecastEntity.findMany({
    select: { id: true, name: true, isDefault: true },
  });
  const toDeleteEntities = allEntities.filter((e) => !e.isDefault && isUatEntityName(e.name));
  console.log(`\nEntities: delete ${toDeleteEntities.length} UAT entities (keep Default + non-UAT)`);
  toDeleteEntities.forEach((e) => console.log(`  [del] ${e.name}`));

  const pc = await prisma.portfolioCompany.findFirst({
    where: { user: { email: INVESTEE_EMAIL } },
    select: { id: true, name: true },
  });
  if (!pc) {
    console.warn(`\nNo portfolio company for ${INVESTEE_EMAIL}`);
  } else {
    const reportRows = await prisma.$queryRawUnsafe<
      Array<{ id: string; status: string; title: string; reportingPeriod: unknown }>
    >(
      `SELECT id, status, title, reportingPeriod
         FROM financial_reports
        WHERE portfolioCompanyId = ?
          AND (title LIKE 'UAT %' OR title LIKE '%UAT Operational KPIs%')
        ORDER BY createdAt DESC`,
      pc.id
    );
    console.log(`\n${pc.name}: delete ${reportRows.length} UAT financial report(s)`);
    reportRows.forEach((r) => {
      const rp =
        r.reportingPeriod instanceof Date
          ? r.reportingPeriod.toISOString().slice(0, 10)
          : String(r.reportingPeriod || "").slice(0, 10);
      console.log(`  [del] [${r.status}] ${rp} — ${r.title}`);
    });
  }

  const deleteScenarioIds = toDeleteScenarios.map((s) => s.id);
  const deleteEntityIds = toDeleteEntities.map((e) => e.id);

  if (deleteScenarioIds.length) {
    const cells = await prisma.forecastCell.count({
      where: { scenarioId: { in: deleteScenarioIds } },
    });
    const audits = await prisma.forecastAuditLog.count({
      where: { scenarioId: { in: deleteScenarioIds } },
    });
    console.log(`\nCascade via scenario delete: ~${cells} cells, ~${audits} audit rows`);
  }

  if (DRY_RUN) {
    console.log("\nDRY_RUN=1 — no changes written. Re-run without DRY_RUN to apply.\n");
    return;
  }

  if (deleteScenarioIds.length) {
    const r = await prisma.forecastScenario.deleteMany({
      where: { id: { in: deleteScenarioIds } },
    });
    console.log(`\n[ok] Deleted ${r.count} forecast scenario(s)`);
  }

  if (deleteEntityIds.length) {
    const leftover = await prisma.forecastScenario.count({
      where: { entityId: { in: deleteEntityIds } },
    });
    if (leftover > 0) {
      const extra = await prisma.forecastScenario.deleteMany({
        where: { entityId: { in: deleteEntityIds } },
      });
      console.log(`[ok] Deleted ${extra.count} scenario(s) still tied to UAT entities`);
    }

    const coa = await prisma.entityChartOfAccount.deleteMany({
      where: { entityId: { in: deleteEntityIds } },
    });
    console.log(`[ok] Deleted ${coa.count} entity COA row(s)`);

    const ent = await prisma.forecastEntity.deleteMany({
      where: { id: { in: deleteEntityIds } },
    });
    console.log(`[ok] Deleted ${ent.count} UAT forecast entity(ies)`);
  }

  if (pc) {
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM financial_reports
        WHERE portfolioCompanyId = ?
          AND (title LIKE 'UAT %' OR title LIKE '%UAT Operational KPIs%')`,
      pc.id
    );
    console.log(`[ok] Deleted UAT financial report row(s) for ${pc.name} (affected=${deleted})`);
  }

  const remainingScenarios = await prisma.forecastScenario.count();
  const remainingAudits = await prisma.forecastAuditLog.count();
  const remainingEntities = await prisma.forecastEntity.count();
  console.log(
    `\nAfter cleanup: ${remainingScenarios} scenario(s), ${remainingAudits} audit log(s), ${remainingEntities} entity(ies)`
  );
  if (keepScenarios.length) {
    console.log("Kept scenarios:");
    keepScenarios.forEach((s) => console.log(`  - ${s.name}`));
  }
  console.log("\nInvestee can create a new Operational KPIs draft → submit → investor Accept to trigger dispatch.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
