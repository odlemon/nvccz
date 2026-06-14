/**
 * One-off: dump real IDs for Postman forecasting E2E tests.
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const company = await prisma.companyProfile.findFirst({
    select: { id: true, legalName: true }
  });
  const portfolioCompanies = await prisma.portfolioCompany.findMany({
    take: 5,
    select: { id: true, name: true, status: true }
  });
  const funds = await prisma.fund.findMany({
    take: 5,
    select: { id: true, name: true, status: true }
  });
  const expenseAccounts = await prisma.chartOfAccounts.findMany({
    where: { isActive: true, accountType: "Expense" },
    take: 10,
    select: { id: true, accountNo: true, accountName: true, accountType: true },
    orderBy: { accountNo: "asc" }
  });
  const revenueAccounts = await prisma.chartOfAccounts.findMany({
    where: { isActive: true, accountType: "Revenue" },
    take: 5,
    select: { id: true, accountNo: true, accountName: true },
    orderBy: { accountNo: "asc" }
  });
  const users = await prisma.user.findMany({
    take: 5,
    select: { id: true, email: true, roleCode: true, firstName: true, lastName: true }
  });
  const lockUsers = await prisma.user.findMany({
    where: { roleCode: { in: ["CFO", "SYSADMIN", "FORECAST_LOCK"] } },
    take: 5,
    select: { id: true, email: true, roleCode: true }
  });
  const goals = await prisma.performanceGoal.findMany({
    take: 5,
    select: { id: true, title: true, status: true }
  });
  const testUser = await prisma.user.findUnique({
    where: { email: "nyashakarata1@gmail.com" },
    select: { id: true, email: true, roleCode: true, firstName: true, lastName: true }
  });
  const cfoUser = await prisma.user.findUnique({
    where: { email: "info@niakazi.com" },
    select: { id: true, email: true, roleCode: true }
  });

  console.log(JSON.stringify(
    {
      database: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@"),
      apiBase: `http://localhost:${process.env.PORT || 3000}`,
      companyProfile: company,
      portfolioCompanies,
      funds,
      expenseAccounts,
      revenueAccounts,
      users,
      lockUsers,
      performanceGoals: goals,
      testLoginUser: testUser,
      lockLoginUser: cfoUser,
      dimensionPresets: {
        COA_RANGE_REVENUE: "4000-4999 Revenue accounts",
        COA_RANGE_OPEX: "5000-5999 Expense accounts",
        COA_RANGE_COGS: "6000-6999 COGS",
        DEPT_ALL: "Built-in — all departments (no DB id)"
      }
    },
    null,
    2
  ));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
