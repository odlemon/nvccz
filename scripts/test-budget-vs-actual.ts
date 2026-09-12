// @ts-nocheck
/**
 * Budget vs Actual – P&L highlights variance in red / shows % over-spend
 *
 * Requirement: Set a budget of 1000 for "Marketing", then post a 1200 expense.
 * Expected: P&L report highlights the 200 variance in red or shows a percentage over-spend.
 *
 * Run: npx ts-node scripts/test-budget-vs-actual.ts
 * (Test data is left in place; no cleanup.)
 */
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../src/utils/database";
import { BudgetManagementService } from "../src/services/BudgetManagementService";
import { IncomeStatementService } from "../src/services/IncomeStatementService";

const BUDGET_AMOUNT = 1000;
const EXPENSE_AMOUNT = 1200;
const EXPECTED_VARIANCE = 200;
const EXPECTED_VARIANCE_PCT = 20; // (200/1000)*100
const failures: string[] = [];
const TOLERANCE = 0.01;

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function main() {
  console.log("=== Budget vs Actual test (Marketing: budget 1000, expense 1200, variance 200 / 20%) ===\n");

  const currency = await prisma.currency.findFirst({ where: { isActive: true } });
  const user = await prisma.user.findFirst({ select: { id: true } });
  let vendor = await prisma.vendor.findFirst({ select: { id: true } });
  if (!currency || !user) {
    console.error("Need currency and user.");
    process.exit(1);
  }
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        name: "Test Vendor Budget",
        email: "vendor-budget@test.local",
        createdById: user.id
      },
      select: { id: true }
    }) as { id: string };
  }

  const periodStart = new Date(2026, 0, 1, 0, 0, 0, 0);
  const periodEnd = new Date(2026, 11, 31, 23, 59, 59, 999);
  const midPeriod = new Date(2026, 5, 15, 12, 0, 0, 0);

  // 1) Set budget of 1000 for Marketing
  const existingBudget = await prisma.budget.findFirst({
    where: {
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart }
    },
    include: { budgetItems: true }
  });
  let budgetId: string;
  if (existingBudget) {
    const marketingItem = (existingBudget.budgetItems as any[]).find(
      (i: any) => (i.category || "").toLowerCase().includes("marketing") || i.accountCode === "5060"
    );
    if (marketingItem) {
      await prisma.budgetItem.update({
        where: { id: marketingItem.id },
        data: { budgetedAmount: new Decimal(BUDGET_AMOUNT) }
      });
      budgetId = existingBudget.id;
      console.log("Updated existing Marketing budget item to", BUDGET_AMOUNT);
    } else {
      await prisma.budgetItem.create({
        data: {
          budgetId: existingBudget.id,
          category: "Marketing",
          description: "Marketing budget",
          accountCode: "5060",
          budgetedAmount: new Decimal(BUDGET_AMOUNT),
          actualAmount: new Decimal(0),
          variance: new Decimal(-BUDGET_AMOUNT),
          variancePercentage: new Decimal(0),
          createdById: user.id
        }
      });
      budgetId = existingBudget.id;
      console.log("Added Marketing budget item", BUDGET_AMOUNT, "to existing budget");
    }
  } else {
    const created = await BudgetManagementService.createBudget(
      {
        name: "Test Budget 2026",
        budgetType: "annual",
        period: "2026",
        startDate: periodStart,
        endDate: periodEnd,
        budgetItems: [
          { category: "Marketing", description: "Marketing", accountCode: "5060", budgetedAmount: BUDGET_AMOUNT }
        ]
      },
      user.id
    );
    budgetId = (created as any).id;
    console.log("Created budget with Marketing", BUDGET_AMOUNT);
  }
  await prisma.budget.update({
    where: { id: budgetId },
    data: { isActive: true, status: "active" }
  }).catch(() => {});

  // 2) Post a 1200 expense to Marketing (GL 5060) via journal entry
  const marketingGl = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: "5060", isActive: true }
  });
  const bankGl = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: { in: ["1100", "1000", "1010"] }, isActive: true }
  });
  if (!marketingGl || !bankGl) {
    console.error("Need GL 5060 (Marketing) and a bank GL for the test.");
    process.exit(1);
  }
  const existingJe = await prisma.journalEntry.findFirst({
    where: {
      description: { contains: "Test Marketing expense for budget vs actual" },
      transactionDate: { gte: periodStart, lte: periodEnd }
    }
  });
  if (!existingJe) {
    const je = await prisma.journalEntry.create({
      data: {
        transactionDate: midPeriod,
        referenceNumber: `BVA-MKT-${Date.now()}`,
        description: "Test Marketing expense for budget vs actual",
        totalAmount: new Decimal(EXPENSE_AMOUNT),
        currencyId: currency.id,
        status: "POSTED",
        createdById: user.id
      }
    });
    await prisma.journalEntryLine.createMany({
      data: [
        { journalEntryId: je.id, chartOfAccountId: marketingGl.id, debitAmount: new Decimal(EXPENSE_AMOUNT), creditAmount: new Decimal(0), description: "Dr Marketing" },
        { journalEntryId: je.id, chartOfAccountId: bankGl.id, debitAmount: new Decimal(0), creditAmount: new Decimal(EXPENSE_AMOUNT), description: "Cr Bank" }
      ]
    });
    console.log("Posted Marketing expense (JE)", EXPENSE_AMOUNT);
  } else {
    console.log("Marketing expense JE already exists for period");
  }

  // 3) P&L with budget variance
  const pl = await IncomeStatementService.generateIncomeStatementWithBudgetVariance({
    startDate: periodStart,
    endDate: periodEnd,
    currencyId: currency.id
  });

  const marketingLine = pl.sections.operatingExpenses.accounts.find(
    (a: any) =>
      (a.accountName || "").toLowerCase().includes("marketing") || (a.accountNo || "") === "5060"
  );
  assert(!!marketingLine, "P&L must include a Marketing expense line (account 5060 or name Marketing)");
  assert(
    !!marketingLine?.budgetVariance,
    "Marketing line must have budgetVariance (variance in red / % over-spend)"
  );
  if (marketingLine?.budgetVariance) {
    const v = marketingLine.budgetVariance;
    assert(
      Math.abs(v.budgetedAmount - BUDGET_AMOUNT) < TOLERANCE,
      `Budgeted amount should be ${BUDGET_AMOUNT}, got ${v.budgetedAmount}`
    );
    assert(
      Math.abs(v.actualAmount - EXPENSE_AMOUNT) < TOLERANCE,
      `Actual amount should be ${EXPENSE_AMOUNT}, got ${v.actualAmount}`
    );
    assert(
      Math.abs(v.variance - EXPECTED_VARIANCE) < TOLERANCE,
      `Variance should be ${EXPECTED_VARIANCE}, got ${v.variance}`
    );
    assert(
      Math.abs(v.variancePercentage - EXPECTED_VARIANCE_PCT) < TOLERANCE,
      `Variance % should be ${EXPECTED_VARIANCE_PCT}, got ${v.variancePercentage}`
    );
    assert(v.isOverBudget === true, "Marketing should be flagged as over budget (isOverBudget true)");
  }

  console.log("\nP&L Marketing line (with budget variance):");
  if (marketingLine) {
    console.log("  accountNo:", marketingLine.accountNo, "accountName:", marketingLine.accountName);
    console.log("  amount (actual):", marketingLine.amount);
    if (marketingLine.budgetVariance) {
      console.log("  budgetVariance:", marketingLine.budgetVariance);
      console.log("  -> Variance", marketingLine.budgetVariance.variance, "(", marketingLine.budgetVariance.variancePercentage, "% over-spend ), isOverBudget:", marketingLine.budgetVariance.isOverBudget);
    }
  }

  if (failures.length > 0) {
    console.error("\n❌ FAILED:");
    failures.forEach((f) => console.error("  -", f));
    process.exit(1);
  }
  console.log("\n✅ PASSED: P&L report shows 200 variance and percentage over-spend for Marketing (can be highlighted in red).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
