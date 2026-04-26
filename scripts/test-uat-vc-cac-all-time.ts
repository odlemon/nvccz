/**
 * UAT — VC Customer Acquisition Cost (all-time)
 *
 * Verifies:
 * - performance_metric_snapshots: VC_CAC, VC_CAC_NUMERATOR_USD, VC_CAC_CUSTOMER_COUNT
 * - Performance goals linked to VC CAC KPI get preciseCurrentValue ≈ spendUsd / customers
 *
 * Uses ExpenseService (triggers sync on create) and prisma customer create + explicit
 * VcCacSyncService (same service the customer API calls after insert).
 *
 * Run: npx ts-node --transpile-only scripts/test-uat-vc-cac-all-time.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import { ExpenseService } from "../src/services/ExpenseService";
import { VcCacSyncService, VC_CAC_KPI_CODE, getVcCacMarketingCategoryNames } from "../src/services/VcCacSyncService";
import { VC_CAC_MARKETING_EXPENSE_CATEGORY_NAMES } from "../src/config/vcCacMarketingExpenseCategories";

/** Must match a name in `VC_CAC_MARKETING_EXPENSE_CATEGORY_NAMES` (seed: Branding and Marketing). */
const MARKETING_CATEGORY = "Branding and Marketing";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function ensureMarketingCategory() {
  await prisma.expenseCategory.upsert({
    where: { name: MARKETING_CATEGORY },
    create: {
      name: MARKETING_CATEGORY,
      description: "Marketing campaigns, advertising, and branding (VC CAC)",
      isActive: true
    },
    update: { isActive: true }
  });
}

async function main() {
  const allow = getVcCacMarketingCategoryNames();
  assert(
    allow.includes(MARKETING_CATEGORY.toLowerCase()),
    `VC CAC config must include "${MARKETING_CATEGORY}" (got: ${allow.join(",")}). Check vcCacMarketingExpenseCategories.ts — expected one of: ${VC_CAC_MARKETING_EXPENSE_CATEGORY_NAMES.join(", ")}`
  );

  await ensureMarketingCategory();

  const kpi = await prisma.kPI.findFirst({
    where: { code: VC_CAC_KPI_CODE },
    select: { id: true }
  });
  if (!kpi) {
    throw new Error(`KPI ${VC_CAC_KPI_CODE} missing. Run: npx ts-node scripts/upsert-vc-cac-kpi.ts`);
  }

  const actor = await prisma.user.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
  assert(actor, "No user found");

  let vendor = await prisma.vendor.findFirst({
    where: { isActive: true, isBlacklisted: false },
    select: { id: true }
  });
  if (!vendor) {
    const v = await prisma.vendor.create({
      data: {
        name: `UAT VC CAC vendor ${Date.now()}`,
        isActive: true
      },
      select: { id: true }
    });
    vendor = v;
  }

  const usd =
    (await prisma.currency.findFirst({ where: { code: "USD", isActive: true } })) ||
    (await prisma.currency.findFirst({ where: { isActive: true } }));
  assert(usd, "No currency");

  const ts = Date.now();
  const goalTitle = `UAT VC CAC — ${ts}`;

  const goal = await prisma.performanceGoal.create({
    data: {
      title: goalTitle,
      description: "UAT VC CAC realtime",
      type: "company",
      scorecardPillar: "Customer & Market",
      pillarId: "bsc_customer_market",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
      createdById: actor.id,
      kpiId: kpi.id,
      formulaType: "VC_CAC",
      targetValue: new Decimal(0),
      targetUnit: "USD",
      currentValue: new Decimal(0),
      preciseCurrentValue: "0",
      progressPercentage: new Decimal(0),
      targetOperator: "<=",
      isReverseKpi: true,
      requiresManagerApproval: false,
      status: "inactive",
      stage: "planning"
    },
    select: { id: true }
  });

  const cust1 = await prisma.customer.create({
    data: {
      name: `UAT CAC Customer A ${ts}`,
      email: `uat-cac-a-${ts}@example.com`
    },
    select: { id: true }
  });
  const cust2 = await prisma.customer.create({
    data: {
      name: `UAT CAC Customer B ${ts}`,
      email: `uat-cac-b-${ts}@example.com`
    },
    select: { id: true }
  });

  await VcCacSyncService.recomputeAndPersist({ source: "customers" });

  const expenseAmount = process.env.VC_CAC_UAT_EXPENSE_AMOUNT
    ? Number(process.env.VC_CAC_UAT_EXPENSE_AMOUNT)
    : 300;
  assert(Number.isFinite(expenseAmount) && expenseAmount > 0, "VC_CAC_UAT_EXPENSE_AMOUNT invalid");

  await ExpenseService.createExpense({
    vendorId: vendor.id,
    category: MARKETING_CATEGORY,
    amount: expenseAmount,
    currencyId: usd.id,
    transactionDate: new Date(),
    description: `UAT VC CAC marketing ${ts}`,
    isTaxable: false,
    paymentMethod: "BANK",
    createdById: actor.id
  });

  const snapCac = await prisma.performanceMetricSnapshot.findUnique({ where: { code: "VC_CAC" } });
  const snapNum = await prisma.performanceMetricSnapshot.findUnique({ where: { code: "VC_CAC_NUMERATOR_USD" } });
  const snapDen = await prisma.performanceMetricSnapshot.findUnique({ where: { code: "VC_CAC_CUSTOMER_COUNT" } });

  assert(snapCac && snapNum && snapDen, "Missing performance_metric_snapshots");

  const numUsd = toNum(snapNum.value);
  const den = toNum(snapDen.value);
  const cac = toNum(snapCac.value);

  // All-time denominator = every active customer in the DB, not just this script’s rows.
  assert(den >= 2, `Expected at least 2 active customers, got ${den}`);

  const expectedFromComponents = den > 0 ? numUsd / den : 0;
  assert(Math.abs(cac - expectedFromComponents) < 1e-5, "VC_CAC != numerator/denominator");

  assert(
    numUsd + 1e-6 >= expenseAmount,
    `Marketing USD total should include this expense (~${expenseAmount}); got ${numUsd}`
  );

  const g = await prisma.performanceGoal.findUnique({
    where: { id: goal.id },
    select: { preciseCurrentValue: true, lastSyncedAt: true, syncEndpointPath: true }
  });
  assert(g?.lastSyncedAt, "Goal not synced");
  assert(g?.syncEndpointPath === "in-process://realtime-vc-cac", "sync path");
  const gVal = toNum(g?.preciseCurrentValue);
  assert(Math.abs(gVal - cac) < 1e-5, `Goal value ${gVal} should match snapshot VC_CAC ${cac}`);

  console.log("OK — VC CAC UAT passed");
  console.log({ marketingSpendUsd: numUsd, customerCount: den, cac, goalId: goal.id });

  // Cleanup: soft-delete is complex for customers; remove goal + leave test customers (low footprint).
  await prisma.performanceGoal.delete({ where: { id: goal.id } });
  console.log("Removed UAT performance goal. Customers left in DB (delete manually if needed).");
  console.log({ customerIds: [cust1.id, cust2.id] });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
