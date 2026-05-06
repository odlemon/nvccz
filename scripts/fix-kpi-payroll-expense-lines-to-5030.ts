/**
 * Data fix: KPI accounting integration created journal entry lines with chartOfAccountId mistakenly set
 * to the accountNo string (e.g. "5030") instead of the ChartOfAccounts.id.
 *
 * We previously moved orphan lines to suspense to unblock Prisma queries.
 * This script retargets Payroll Expense KPI lines to the real 5030 chart-of-accounts row.
 *
 * Safe to re-run.
 *
 * Usage:
 *   npm run db:fix:kpi-payroll-expense-lines-to-5030
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const suspense = await prisma.chartOfAccounts.findFirst({ where: { accountNo: "9999" }, select: { id: true } });
  const acc5030 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: "5030" }, select: { id: true } });
  if (!suspense) throw new Error("Suspense account 9999 not found");
  if (!acc5030) throw new Error("Account 5030 not found");

  const res = await prisma.journalEntryLine.updateMany({
    where: {
      chartOfAccountId: suspense.id,
      description: { startsWith: "KPI: Payroll Expense" },
      debitAmount: { gt: 0 },
      creditAmount: 0 as any,
    },
    data: { chartOfAccountId: acc5030.id },
  });

  console.log("fix-kpi-payroll-expense-lines-to-5030:", {
    updated: res.count,
    suspenseId: suspense.id,
    account5030Id: acc5030.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

