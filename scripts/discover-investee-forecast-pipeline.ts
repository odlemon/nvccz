// @ts-nocheck
/**
 * Read-only discovery for investee → forecasting pipeline UAT.
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/discover-investee-forecast-pipeline.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  console.log("\n=== Investee Forecast Pipeline Discovery ===\n");

  const companies = await prisma.portfolioCompany.findMany({
    where: { status: { in: ["ACTIVE", "APPROVED"] } },
    select: {
      id: true,
      name: true,
      status: true,
      fundId: true,
      contactEmail: true,
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      fund: { select: { id: true, name: true } },
    },
    take: 30,
    orderBy: { updatedAt: "desc" },
  });

  console.log(`Portfolio companies (ACTIVE/APPROVED): ${companies.length}`);
  for (const c of companies) {
    console.log(
      `  - ${c.name} | pc=${c.id.slice(0, 12)}… | user=${c.user?.email || "—"} | fund=${c.fund?.name || c.fundId || "—"} | status=${c.status}`
    );
  }

  const defaultEntity = await prisma.forecastEntity.findFirst({
    where: { isDefault: true },
    select: { id: true, name: true },
  });
  console.log(`\nDefault forecast entity: ${defaultEntity ? `${defaultEntity.name} (${defaultEntity.id})` : "MISSING"}`);

  if (defaultEntity) {
    const coa = await prisma.entityChartOfAccount.findMany({
      where: {
        entityId: defaultEntity.id,
        isActive: true,
        accountType: { in: ["Revenue", "Income", "Expense"] },
      },
      select: { accountNo: true, accountName: true, accountType: true },
      take: 20,
    });
    const rev = coa.filter((a) => /revenue|income/i.test(a.accountType));
    const exp = coa.filter((a) => a.accountType === "Expense");
    console.log(`  Revenue/Income COA: ${rev.length}, Expense COA: ${exp.length}`);
    rev.slice(0, 5).forEach((a) => console.log(`    ${a.accountNo} ${a.accountName} (${a.accountType})`));
    if (exp.length) exp.slice(0, 3).forEach((a) => console.log(`    ${a.accountNo} ${a.accountName} (Expense)`));
  }

  const activeScenarios = await prisma.forecastScenario.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, fundId: true, entityId: true },
    take: 10,
  });
  console.log(`\nACTIVE forecast scenarios: ${activeScenarios.length}`);
  activeScenarios.forEach((s) => console.log(`  - ${s.name} (${s.id.slice(0, 12)}…) fund=${s.fundId || "—"}`));

  const openRequests = await prisma.$queryRawUnsafe<
    Array<{ portfolio_company_id: string; reporting_period: string; c: bigint }>
  >(
    `SELECT portfolio_company_id, reporting_period, COUNT(*) AS c
       FROM reporting_notification_logs
      WHERE event_type = 'REQUEST'
      GROUP BY portfolio_company_id, reporting_period
      ORDER BY reporting_period DESC
      LIMIT 15`
  );
  console.log(`\nOpen reporting REQUEST logs (sample): ${openRequests.length}`);
  for (const r of openRequests) {
    const pc = companies.find((c) => c.id === r.portfolio_company_id);
    console.log(`  - ${r.reporting_period} | ${pc?.name || r.portfolio_company_id.slice(0, 12)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
