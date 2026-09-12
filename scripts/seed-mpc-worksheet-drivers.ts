/**
 * Seed Stage 3 driver assumptions for a Model Planning worksheet.
 * DEV `nts` only. Run:
 *   npx ts-node --transpile-only -r dotenv/config scripts/seed-mpc-worksheet-drivers.ts
 */
import "dotenv/config";
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();

const CYCLE_ID = process.env.SEED_CYCLE_ID || "cmrntmd6l000cun00tv4ldiee";
const MODEL_ID = process.env.SEED_MODEL_ID || "cmriumdvo7eb85f17e7f4ba64";
const VERSION_ID = process.env.SEED_VERSION_ID || "cmriumdwd8eb58d1bfa251d20";
const SCENARIO_ID = process.env.SEED_SCENARIO_ID || "cmriumdwbc18e73cad3f431ca";

function cuid(): string {
  return `c${Date.now().toString(36)}${randomBytes(8).toString("hex")}`.slice(0, 25);
}

function d(n: number) {
  return Math.round(n * 10000) / 10000;
}

/** Realistic monthly drivers for FY2026 Arcus walkthrough */
const DRIVER_DEFS: Array<{
  code: string;
  name: string;
  category: string;
  unit: string;
  monthly: (m: number) => number;
}> = [
  {
    code: "PRICE",
    name: "Average selling price",
    category: "REVENUE",
    unit: "USD",
    monthly: (m) => 11.5 + (m % 3) * 0.25 + m * 0.05,
  },
  {
    code: "UNITS",
    name: "Units sold",
    category: "REVENUE",
    unit: "EA",
    monthly: (m) => 8200 + m * 180 + (m % 2 === 0 ? 400 : 0),
  },
  {
    code: "HEADCOUNT",
    name: "Headcount",
    category: "WORKFORCE",
    unit: "FTE",
    monthly: (m) => 42 + Math.floor(m / 3),
  },
  {
    code: "AVG_SALARY",
    name: "Average salary",
    category: "WORKFORCE",
    unit: "USD",
    monthly: (m) => 4200 + m * 25,
  },
  {
    code: "CHURN_PCT",
    name: "Customer churn %",
    category: "REVENUE",
    unit: "%",
    monthly: (m) => 1.8 + (m % 4) * 0.1,
  },
  {
    code: "UTILIZATION",
    name: "Utilization rate",
    category: "WORKFORCE",
    unit: "%",
    monthly: (m) => 78 + (m % 5),
  },
];

async function main() {
  await assertDevDatabase(prisma, "seed-mpc-worksheet-drivers");

  const cycle = await prisma.modelPlanningCycle.findUnique({ where: { id: CYCLE_ID } });
  if (!cycle) {
    throw new Error(`Cycle not found: ${CYCLE_ID}`);
  }
  const modelId = cycle.sourceModelId || MODEL_ID;
  const versionId = VERSION_ID || cycle.sourceModelVersionId;
  const scenarioId = SCENARIO_ID || cycle.baseScenarioId;
  if (!scenarioId) throw new Error("No scenarioId — pass SEED_SCENARIO_ID");

  const model = await prisma.planningModel.findUnique({
    where: { id: modelId },
    select: { id: true, name: true, status: true },
  });
  if (!model) throw new Error(`Model not found: ${modelId}`);

  const version = await prisma.planningVersion.findUnique({ where: { id: versionId } });
  const scenario = await prisma.planningScenario.findUnique({ where: { id: scenarioId } });
  if (!version || version.modelId !== modelId) {
    throw new Error(`Version ${versionId} missing or not on model ${modelId}`);
  }
  if (!scenario || scenario.modelId !== modelId) {
    throw new Error(`Scenario ${scenarioId} missing or not on model ${modelId}`);
  }

  const admin =
    (await prisma.user.findUnique({ where: { email: "admin@nts.com" } })) ||
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!admin) throw new Error("No user for createdById");

  const fy = cycle.financialYear || 2026;
  const existing = await prisma.planningDriver.count({
    where: { modelId, versionId, scenarioId },
  });

  console.log(
    JSON.stringify(
      {
        cycle: { id: cycle.id, name: cycle.name, financialYear: cycle.financialYear },
        model: { id: model.id, name: model.name, status: model.status },
        version: { id: version.id, name: version.name, status: version.status },
        scenario: { id: scenario.id, name: scenario.name },
        existingDriversScoped: existing,
      },
      null,
      2
    )
  );

  // Idempotent: delete prior seeded codes for this version/scenario then recreate
  const codes = DRIVER_DEFS.map((d) => d.code);
  const deleted = await prisma.planningDriver.deleteMany({
    where: { modelId, versionId, scenarioId, code: { in: codes } },
  });
  console.log(`[ok] cleared ${deleted.count} existing drivers for codes ${codes.join(",")}`);

  const rows: any[] = [];
  for (let m = 0; m < 12; m++) {
    const periodDate = new Date(Date.UTC(fy, m, 1));
    for (const def of DRIVER_DEFS) {
      rows.push({
        id: cuid(),
        modelId,
        scenarioId,
        versionId,
        code: def.code,
        name: def.name,
        category: def.category,
        periodDate,
        value: d(def.monthly(m)),
        unit: def.unit,
        requiresApproval: false,
        createdById: admin.id,
      });
    }
  }

  // Also seed prior-FY actuals on PRICE/HEADCOUNT cells so priorActual populates
  const priceLi = await prisma.planningLineItem.findFirst({
    where: { modelId, code: "PRICE" },
    select: { id: true },
  });
  const headLi = await prisma.planningLineItem.findFirst({
    where: { modelId, code: "HEADCOUNT" },
    select: { id: true },
  });
  let priorCells = 0;
  for (const li of [
    { id: priceLi?.id, code: "PRICE", val: (m: number) => 10.8 + m * 0.04 },
    { id: headLi?.id, code: "HEADCOUNT", val: (m: number) => 38 + Math.floor(m / 4) },
  ]) {
    if (!li.id) continue;
    for (let m = 0; m < 12; m++) {
      const periodDate = new Date(Date.UTC(fy - 1, m, 1));
      const found = await prisma.planningCell.findFirst({
        where: {
          modelId,
          versionId,
          scenarioId,
          lineItemId: li.id,
          periodDate,
          departmentId: null,
        },
      });
      if (found) {
        await prisma.planningCell.update({
          where: { id: found.id },
          data: { value: d(li.val(m)), sourceType: "ACTUAL", valueType: "ACTUAL" },
        });
      } else {
        await prisma.planningCell.create({
          data: {
            id: cuid(),
            modelId,
            versionId,
            scenarioId,
            lineItemId: li.id,
            periodDate,
            currencyCode: "USD",
            value: d(li.val(m)),
            valueType: "ACTUAL",
            sourceType: "ACTUAL",
            isEditable: false,
            isLocked: true,
            lastUpdatedById: admin.id,
            lastUpdatedAt: new Date(),
            recordVersion: 1n,
          },
        });
      }
      priorCells++;
    }
  }

  await prisma.planningDriver.createMany({ data: rows });
  console.log(`[ok] created ${rows.length} drivers (${DRIVER_DEFS.length} codes × 12 months)`);
  console.log(`[ok] prior-FY actual cells touched=${priorCells}`);
  console.log(
    `\nRefresh worksheet Driver Assumptions:\n` +
      `  model=${modelId}\n  version=${versionId}\n  scenario=${scenarioId}\n  cycle=${CYCLE_ID}\n` +
      `  GET /api/v1/fpa/models/${modelId}/drivers?versionId=${versionId}&scenarioId=${scenarioId}&cycleId=${CYCLE_ID}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
