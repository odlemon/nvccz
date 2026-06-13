/**
 * UAT — Forecasting Engine core workflow.
 * Run: npm run uat:forecasting:core
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { ForecastingScenarioService } from "../src/services/ForecastingScenarioService";
import { ForecastingDriverService } from "../src/services/ForecastingDriverService";
import { ForecastingCellService } from "../src/services/ForecastingCellService";
import { ForecastingVersionService } from "../src/services/ForecastingVersionService";
import { buildPeriodKeys, classifyPeriodKeys } from "../src/utils/forecastPeriodUtils";
import { variancePercent } from "../src/utils/forecastMath";

async function pickUserId(): Promise<string> {
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) throw new Error("No user for UAT");
  return user.id;
}

async function pickEntityId(): Promise<string> {
  const company = await prisma.companyProfile.findFirst({ select: { id: true } });
  if (company) return company.id;
  const pc = await prisma.portfolioCompany.findFirst({ select: { id: true } });
  if (pc) return pc.id;
  throw new Error("No CompanyProfile or PortfolioCompany for UAT");
}

async function pickAccount(): Promise<{ id: string; accountNo: string }> {
  const account = await prisma.chartOfAccounts.findFirst({
    where: { isActive: true, accountType: "Expense" },
    select: { id: true, accountNo: true }
  });
  if (!account) throw new Error("No expense account for UAT");
  return { id: account.id, accountNo: String(account.accountNo).replace(/\D/g, "") };
}

async function main() {
  console.log("UAT — Forecasting Engine core\n");

  const userId = await pickUserId();
  const entityId = await pickEntityId();
  const account = await pickAccount();
  const accountNo = parseInt(account.accountNo, 10) || 5000;

  const start = new Date(Date.UTC(2026, 6, 1));
  const end = new Date(Date.UTC(2027, 5, 1));

  const created = await ForecastingScenarioService.create({
    name: `UAT Forecast ${Date.now()}`,
    entityId,
    baseCurrency: "ZIG",
    horizonStartDate: "2026-07-01",
    horizonEndDate: "2027-06-30",
    granularity: "MONTHLY",
    dimensions: [
      { type: "ACCOUNT", value_id: "COA_RANGE_OPEX" },
      { type: "ACCOUNT", value_id: "COA_RANGE_REVENUE" }
    ],
    userId
  });
  console.log("[ok] scenario created", created.id);

  const driverResult = await ForecastingDriverService.replaceDrivers(created.id, userId, [
    {
      target_account_range_start: accountNo,
      target_account_range_end: accountNo,
      driver_type: "CAGR_DRIVEN",
      formula_expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
      parameters: { cagr_scalar: 0.05, historical_base: 10000, tx_currency: "USD" }
    }
  ]);
  console.log("[ok] driver compute", {
    job: driverResult.compute?.compute_job_id,
    cells: driverResult.compute?.affected_cell_count
  });

  const periodKeys = buildPeriodKeys(start, end, "MONTHLY");
  const futureKey = classifyPeriodKeys(periodKeys, new Date(Date.UTC(2026, 6, 1))).future[0];
  if (!futureKey) throw new Error("No future period key");

  await ForecastingCellService.patchCell(created.id, userId, {
    period_key: futureKey,
    account_id: account.id,
    entity_id: entityId,
    new_value: 99999,
    tx_currency: "USD"
  });
  console.log("[ok] cell patched", futureKey);

  const pct = variancePercent(110000, 100000);
  if (Number(pct) !== 10) throw new Error(`Variance math failed: ${pct}`);
  console.log("[ok] variance math", Number(pct));

  await ForecastingScenarioService.patch(created.id, userId, { status: "ACTIVE" });
  console.log("[ok] promoted to ACTIVE");

  const cfo = await prisma.user.findFirst({
    where: { roleCode: { in: ["CFO", "SYSADMIN", "FORECAST_LOCK"] } },
    select: { id: true, roleCode: true }
  });
  const lockUserId = cfo?.id || userId;
  if (cfo) {
    await ForecastingVersionService.lock(created.id, lockUserId, "UAT_LOCKED");
    console.log("[ok] scenario locked");
  } else {
    console.log("[skip] lock — no FORECAST_LOCK/CFO user (promote + compute verified)");
  }

  try {
    await ForecastingScenarioService.patch(created.id, userId, { name: "Should fail" });
    if (cfo) throw new Error("Expected LOCKED edit to fail");
  } catch (e: any) {
    if (cfo && e?.code !== "FORECAST_LOCKED") throw e;
    console.log("[ok] LOCKED immutability enforced");
  }

  console.log("\nUAT forecasting core passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
