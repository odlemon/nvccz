/**
 * Backfill: push completed payroll gross into active accounting budget salary lines.
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/sync-payroll-to-budget.ts
 */
import { prisma } from "../src/utils/database";
import { BudgetPayrollSyncService } from "../src/services/BudgetPayrollSyncService";

async function main() {
  const result = await BudgetPayrollSyncService.syncAllCompletedPayrollToBudgets();
  console.log(JSON.stringify(result, null, 2));
  const budget = await prisma.budget.findFirst({
    where: { isActive: true },
    include: {
      budgetItems: {
        where: {
          OR: [
            { category: { in: ["salary", "salaries", "payroll", "wages"] } },
            { description: { contains: "Payroll" } }
          ]
        }
      }
    }
  });
  if (budget) {
    console.log("\nActive budget salary lines:");
    for (const item of budget.budgetItems) {
      console.log(
        `  ${item.category}: budgeted=${item.budgetedAmount} actual=${item.actualAmount}`
      );
    }
    console.log(`  Header totalActual=${budget.totalActual}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
