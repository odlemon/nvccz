/**
 * UAT B.12 (user-perspective) — AUM realtime sync
 *
 * Verifies AUM updates automatically when:
 * - Asset is created / revalued (Accounting -> Assets)
 * - Fund totalAmount is updated (Portfolio -> Funds)
 *
 * Uses service-layer mutations (no manual sync endpoint).
 *
 * This script also reverts test changes at the end:
 * - marks the created asset inactive so it no longer contributes to AUM
 * - restores fund.totalAmount to its previous value
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import { AssetService } from "../src/services/AssetService";
import { FundService } from "../src/services/FundService";
import { DataIntegrationService } from "../src/services/DataIntegrationService";

const KPI_NAME = "Assets Under Management";

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function getAumSnapshot() {
  const row = await prisma.performanceMetricSnapshot.findUnique({ where: { code: "AUM_TOTAL" } });
  return row
    ? { value: toNum(row.value), valueRaw: row.value, computedAt: row.computedAt, source: row.source }
    : null;
}

async function getAumGoal(goalId: string) {
  const g = await prisma.performanceGoal.findUnique({
    where: { id: goalId },
    select: {
      id: true,
      title: true,
      status: true,
      currentValue: true,
      preciseCurrentValue: true,
      lastSyncedValue: true,
      lastSyncedAt: true,
      syncEndpointPath: true,
      kpi: { select: { id: true, name: true } }
    }
  });
  return g;
}

async function ensureAumGoal(createdById: string) {
  const kpi = await prisma.kPI.findFirst({ where: { name: KPI_NAME }, select: { id: true } });
  if (!kpi) throw new Error(`KPI not found: ${KPI_NAME}`);

  const existing = await prisma.performanceGoal.findFirst({
    where: { title: "UAT B.12 — AUM realtime (assets+funds)" },
    select: { id: true }
  });
  if (existing?.id) return { goalId: existing.id, kpiId: kpi.id, created: false };

  const g = await prisma.performanceGoal.create({
    data: {
      title: "UAT B.12 — AUM realtime (assets+funds)",
      description: "Auto-created by test script to validate realtime AUM sync wiring.",
      type: "company",
      scorecardPillar: "Financial",
      pillarId: "bsc_financial",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
      createdById,
      kpiId: kpi.id,
      formulaType: "AUM_TOTAL",
      targetValue: new Decimal(0),
      targetUnit: "USD",
      currentValue: new Decimal(0),
      preciseCurrentValue: "0",
      progressPercentage: new Decimal(0),
      targetOperator: ">=",
      isReverseKpi: false,
      requiresManagerApproval: false,
      status: "inactive",
      stage: "planning"
    },
    select: { id: true }
  });
  return { goalId: g.id, kpiId: kpi.id, created: true };
}

async function computeExpectedAumTotal() {
  const [fundsAum, assetsAgg] = await Promise.all([
    DataIntegrationService.calculateAUM(),
    prisma.asset.aggregate({
      where: { isActive: true, status: "IN_USE" },
      _sum: { currentBookValue: true }
    })
  ]);
  const assetsTotal = assetsAgg._sum.currentBookValue ? Number(assetsAgg._sum.currentBookValue) : 0;
  return {
    fundsTotal: fundsAum.totalAUM.toNumber(),
    assetsTotal,
    total: fundsAum.totalAUM.toNumber() + assetsTotal
  };
}

async function main() {
  const assetCreateValue = process.env.B12_ASSET_CREATE_VALUE ? Number(process.env.B12_ASSET_CREATE_VALUE) : 1.23;
  const assetRevalueValue = process.env.B12_ASSET_REVALUE_VALUE ? Number(process.env.B12_ASSET_REVALUE_VALUE) : 9.87;
  const fundDelta = process.env.B12_FUND_DELTA ? Number(process.env.B12_FUND_DELTA) : 100;
  if (![assetCreateValue, assetRevalueValue, fundDelta].every((n) => Number.isFinite(n))) {
    throw new Error("Invalid env: B12_ASSET_CREATE_VALUE, B12_ASSET_REVALUE_VALUE, B12_FUND_DELTA must be numbers.");
  }

  const actor = await prisma.user.findFirst({ orderBy: { id: "asc" }, select: { id: true, email: true } });
  if (!actor) throw new Error("No user found");

  const { goalId } = await ensureAumGoal(actor.id);

  console.log("=== Setup ===");
  console.log("actor", actor);
  console.log("goalId", goalId);

  console.log("\n=== Baseline AUM ===");
  const baselineExpected = await computeExpectedAumTotal();
  const baselineSnap = await getAumSnapshot();
  const baselineGoal = await getAumGoal(goalId);
  console.log("expected", baselineExpected);
  console.log("snapshot", baselineSnap);
  console.log("goal", baselineGoal);

  // Pick any 3 chart of accounts rows for required fields.
  const [assetAcc, accDepAcc, depExpAcc] = await prisma.chartOfAccounts.findMany({
    take: 3,
    orderBy: { id: "asc" },
    select: { id: true }
  });
  if (!assetAcc || !accDepAcc || !depExpAcc) throw new Error("Not enough chart of accounts rows to create asset.");

  console.log("\n=== Asset create (should update AUM automatically) ===");
  const assetCode = `UAT-AUM-${Date.now()}`;
  const assetValue = assetCreateValue;
  const createdAsset = await AssetService.createAsset({
    assetName: "UAT B.12 — AUM trigger asset",
    assetCode,
    description: "Disposable asset created to validate AUM realtime sync wiring.",
    purchaseDate: new Date(),
    cost: assetValue,
    usefulLifeYears: 5,
    depreciationMethod: "STRAIGHT_LINE",
    salvageValue: 0,
    assetAccountId: assetAcc.id,
    accumulatedDepreciationAccountId: accDepAcc.id,
    depreciationExpenseAccountId: depExpAcc.id,
    createdById: actor.id
  });
  console.log("createdAsset", { id: createdAsset.id, assetCode, currentBookValue: Number(createdAsset.currentBookValue) });

  const afterCreateExpected = await computeExpectedAumTotal();
  const afterCreateSnap = await getAumSnapshot();
  const afterCreateGoal = await getAumGoal(goalId);
  console.log("expected", afterCreateExpected);
  console.log("snapshot", afterCreateSnap);
  console.log("goal", afterCreateGoal);

  console.log("\n=== Asset revalue (should update AUM automatically) ===");
  const newValue = assetRevalueValue;
  await AssetService.revalueAsset(createdAsset.id, newValue, actor.id);

  const afterRevalueExpected = await computeExpectedAumTotal();
  const afterRevalueSnap = await getAumSnapshot();
  const afterRevalueGoal = await getAumGoal(goalId);
  console.log("expected", afterRevalueExpected);
  console.log("snapshot", afterRevalueSnap);
  console.log("goal", afterRevalueGoal);

  console.log("\n=== Fund update (should update AUM automatically) ===");
  const fund = await prisma.fund.findFirst({ where: { status: { in: ["OPEN", "CLOSED"] } }, orderBy: { id: "asc" } });
  if (!fund) throw new Error("No OPEN/CLOSED fund found.");
  const beforeFundTotal = Number(fund.totalAmount);
  const delta = fundDelta;
  await FundService.updateFund(fund.id, { totalAmount: beforeFundTotal + delta });

  const afterFundExpected = await computeExpectedAumTotal();
  const afterFundSnap = await getAumSnapshot();
  const afterFundGoal = await getAumGoal(goalId);
  console.log("fund", { id: fund.id, beforeFundTotal, after: beforeFundTotal + delta });
  console.log("expected", afterFundExpected);
  console.log("snapshot", afterFundSnap);
  console.log("goal", afterFundGoal);

  console.log("\n=== Cleanup / revert ===");
  // Remove the disposable asset from the AUM proxy by marking it inactive
  await AssetService.updateAsset(createdAsset.id, { isActive: false } as any, actor.id);
  // Restore fund total amount
  await FundService.updateFund(fund.id, { totalAmount: beforeFundTotal });

  const finalExpected = await computeExpectedAumTotal();
  const finalSnap = await getAumSnapshot();
  console.log("final expected", finalExpected);
  console.log("final snapshot", finalSnap);

  console.log("\n=== Verdict ===");
  const passAssetCreate = afterCreateSnap?.computedAt && (!baselineSnap || afterCreateSnap.computedAt > baselineSnap.computedAt);
  const passAssetRevalue = afterRevalueSnap?.computedAt && afterRevalueSnap.computedAt > (afterCreateSnap?.computedAt ?? new Date(0));
  const passFundUpdate = afterFundSnap?.computedAt && afterFundSnap.computedAt > (afterRevalueSnap?.computedAt ?? new Date(0));

  console.log(
    JSON.stringify(
      {
        assetCreateTriggered: Boolean(passAssetCreate),
        assetRevalueTriggered: Boolean(passAssetRevalue),
        fundUpdateTriggered: Boolean(passFundUpdate)
      },
      null,
      2
    )
  );

  const overall = Boolean(passAssetCreate && passAssetRevalue && passFundUpdate);
  console.log(overall ? "[PASS] UAT B.12 AUM realtime sync" : "[FAIL] UAT B.12 AUM realtime sync");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

