/**
 * Link all company (organisational) goals without kpiId to catalog KPI rows.
 *
 * Usage:
 *   npm run db:backfill:company-goal-kpi-links
 *   GOAL_IDS=id1,id2 npm run db:backfill:company-goal-kpi-links
 *   DRY_RUN=1 npm run db:backfill:company-goal-kpi-links
 */
// @ts-nocheck
import "dotenv/config";
import { prisma } from "../src/utils/database";
import {
  resolveCompanyGoalKpiCode,
  resolveCompanyGoalKpiId
} from "../src/services/companyGoalKpiResolution";
import { KPIService } from "../src/services/KPIService";

const DRY_RUN = String(process.env.DRY_RUN || "").trim() === "1";

async function main() {
  const goalIdsEnv = String(process.env.GOAL_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const where: any = {
    type: "company",
    OR: [{ kpiId: null }, { kpiId: "" }]
  };
  if (goalIdsEnv.length) {
    delete where.OR;
    where.id = { in: goalIdsEnv };
  }

  const goals = await prisma.performanceGoal.findMany({
    where,
    include: {
      kpi: { select: { id: true, name: true, code: true } },
      performanceContract: { select: { contractType: true, title: true } }
    },
    orderBy: [{ displayOrder: "asc" }, { title: "asc" }]
  });

  console.log(`Found ${goals.length} company goal(s) to inspect (${DRY_RUN ? "DRY_RUN" : "APPLY"}).\n`);

  let linked = 0;
  let skipped = 0;
  let failed = 0;
  const touchedKpiIds = new Set<string>();

  for (const goal of goals) {
    if (goal.kpiId && goal.kpi) {
      skipped += 1;
      continue;
    }

    const code = resolveCompanyGoalKpiCode(goal);
    const kpiId = await resolveCompanyGoalKpiId(goal, { createIfMissing: true });

    if (!kpiId) {
      failed += 1;
      console.log(`[FAIL] ${goal.id} | ${goal.title}`);
      console.log(`       formulaType=${goal.formulaType ?? "-"} | could not resolve KPI\n`);
      continue;
    }

    const kpi = await prisma.kPI.findUnique({
      where: { id: kpiId },
      select: { id: true, name: true, code: true }
    });

    if (DRY_RUN) {
      console.log(`[dry-run] ${goal.title}`);
      console.log(`          → KPI ${kpi?.name} (${kpi?.code ?? code ?? "?"}) id=${kpiId}`);
      if (goal.performanceContract) {
        console.log(`          contract: ${goal.performanceContract.contractType} ${goal.performanceContract.title}`);
      }
      linked += 1;
      continue;
    }

    await prisma.performanceGoal.update({
      where: { id: goal.id },
      data: { kpiId }
    });
    touchedKpiIds.add(kpiId);
    linked += 1;
    console.log(`[ok] ${goal.title}`);
    console.log(`     → ${kpi?.name} (${kpi?.code ?? code})`);
  }

  if (!DRY_RUN) {
    for (const kid of touchedKpiIds) {
      await KPIService.syncKpiActiveFromLinkedGoals(kid);
    }
  }

  const remaining = await prisma.performanceGoal.count({
    where: { type: "company", OR: [{ kpiId: null }, { kpiId: "" }] }
  });

  console.log("\n--- Summary ---");
  console.log(`Linked: ${linked}`);
  console.log(`Skipped (already had KPI): ${skipped}`);
  console.log(`Failed (no mapping): ${failed}`);
  console.log(`Company goals still without kpiId: ${remaining}`);
  if (remaining > 0) {
    console.log("Review failed rows and extend companyGoalKpiResolution.ts mappings.");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
