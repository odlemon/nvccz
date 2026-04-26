/**
 * Lists company goals tied to VC CAC (KPI / formula / pillar) and, if any are inactive,
 * activates them with equal line weights in Customer & Market (siblings in same strategy/dept
 * line share 100% equally).
 *
 * Run: npx ts-node --transpile-only scripts/list-and-activate-vc-cac-goal.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { PerformanceConfigService } from "../src/services/PerformanceConfigService";
import { VC_CAC_KPI_CODE } from "../src/services/VcCacSyncService";
import { ORG_BSC_CANONICAL_TO_PILLAR_ID } from "../src/services/performanceScorecardSupport";

const PILLAR_ID = ORG_BSC_CANONICAL_TO_PILLAR_ID["Customer & Market"] || "bsc_customer_market";

const FORMULA = ["VC_CAC", "COMPANY_CAC", "VC_CUSTOMER_ACQUISITION_COST"];

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

async function findVcCacGoalsFixed() {
  const kpiCode = VC_CAC_KPI_CODE;
  return prisma.performanceGoal.findMany({
    where: {
      type: "company",
      AND: [
        {
          OR: [
            { kpi: { code: kpiCode } },
            { formulaType: { in: FORMULA } },
            { title: { contains: "UAT VC CAC" } },
            { title: { contains: "Customer Acquisition" } }
          ]
        },
        {
          OR: [{ pillarId: PILLAR_ID }, { scorecardPillar: "Customer & Market" }]
        }
      ]
    },
    select: {
      id: true,
      title: true,
      status: true,
      scorecardWeight: true,
      pillarId: true,
      scorecardPillar: true,
      strategyId: true,
      departmentName: true,
      formulaType: true,
      preciseCurrentValue: true,
      currentValue: true,
      lastSyncedAt: true,
      kpi: { select: { id: true, name: true, code: true } }
    }
  });
}

async function listSiblingsInLine(pillarId: string, strategyId: string | null, departmentName: string | null) {
  const pillarRow = await prisma.scorecardPillar.findUnique({ where: { id: pillarId } });
  const canonical = pillarRow?.canonicalName || "Customer & Market";
  const aliasRows = await prisma.scorecardPillarAlias.findMany({
    where: { pillarId },
    select: { alias: true }
  });
  const aliasValues = aliasRows.map((r) => r.alias).filter(Boolean) as string[];
  const orPillar: any[] = [{ pillarId }, { scorecardPillar: canonical }];
  for (const a of aliasValues) {
    orPillar.push({ scorecardPillar: a });
  }
  const where: any = { type: "company", OR: orPillar };
  if (strategyId) {
    where.strategyId = strategyId;
  } else {
    where.strategyId = null;
  }
  if (departmentName != null && String(departmentName).trim() !== "") {
    where.departmentName = departmentName;
  } else {
    where.departmentName = null;
  }
  return prisma.performanceGoal.findMany({
    where,
    select: { id: true, title: true, status: true, scorecardWeight: true }
  });
}

async function main() {
  const target = await findVcCacGoalsFixed();
  const actor = await prisma.user.findFirst({ orderBy: { id: "asc" } });
  if (!actor) {
    throw new Error("No user for actor");
  }

  console.log("=== VC CAC–related company goals (Customer & Market pillar) ===\n");
  if (target.length === 0) {
    console.log("None found. Create a company goal with kpiId for VC_CUSTOMER_ACQUISITION_COST and pillar bsc_customer_market.");
  }
  for (const g of target) {
    const w = g.scorecardWeight != null ? String(g.scorecardWeight) : "null";
    const pv = g.preciseCurrentValue != null ? String(g.preciseCurrentValue) : "null";
    console.log(`id:         ${g.id}`);
    console.log(`title:      ${g.title}`);
    console.log(`status:     ${g.status}`);
    console.log(`kpi:        ${g.kpi?.name ?? "—"} (code: ${g.kpi?.code ?? "—"})`);
    console.log(`formula:    ${g.formulaType ?? "—"}`);
    console.log(`weight:     ${w}`);
    console.log(`current$:   ${g.currentValue != null ? String(g.currentValue) : "null"}`);
    console.log(`precise:    ${pv}`);
    console.log(`lastSync:   ${g.lastSyncedAt ? g.lastSyncedAt.toISOString() : "null"}`);
    console.log("---");
  }

  const inactive = target.filter((g) => g.status !== "active");
  if (inactive.length === 0) {
    console.log("\nAll matching goals are already **active** (or none exist).");
    return;
  }

  for (const g of inactive) {
    const sibs = await listSiblingsInLine(PILLAR_ID, g.strategyId, g.departmentName);
    if (sibs.length === 0) {
      console.warn("No siblings for", g.id);
      continue;
    }
    const each = round4(100 / sibs.length);
    let acc = 0;
    const goalWeights: Record<string, number> = {};
    sibs.forEach((s, i) => {
      if (i === sibs.length - 1) {
        goalWeights[s.id] = round4(100 - acc);
      } else {
        goalWeights[s.id] = each;
        acc += each;
      }
    });
    console.log(
      `\nActivating line (equal ${each}% per goal, last gets remainder) for ${sibs.length} goal(s) in Customer & Market...`
    );
    const updated = await PerformanceConfigService.setCompanyGoalWeightsInPillarBatch({
      pillarId: PILLAR_ID,
      goalWeights,
      actor: { id: actor.id, role: actor.role, email: actor.email }
    });
    console.log("Updated goals:", updated.map((u) => ({ id: u.id, status: u.status, weight: u.scorecardWeight })));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
