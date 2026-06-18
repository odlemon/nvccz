// @ts-nocheck
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const scenarios = await prisma.forecastScenario.findMany({
    select: { id: true, name: true, status: true },
    orderBy: { updatedAt: "desc" },
  });
  console.log("Scenarios:", scenarios.length);
  scenarios.forEach((s) => console.log(`  [${s.status}] ${s.name}`));

  const entities = await prisma.forecastEntity.findMany({
    select: { id: true, name: true, isDefault: true, type: true },
  });
  console.log("\nEntities:", entities.length);
  entities.forEach((e) =>
    console.log(`  ${e.isDefault ? "[DEFAULT]" : ""} ${e.type} — ${e.name} (${e.id.slice(0, 12)}…)`)
  );

  const auditCount = await prisma.forecastAuditLog.count();
  console.log("\nForecast audit logs:", auditCount);

  const pc = await prisma.portfolioCompany.findFirst({
    where: { user: { email: "karatakundai@gmail.com" } },
    select: { id: true, name: true },
  });
  if (pc) {
    const reports = await prisma.$queryRawUnsafe<
      Array<{ id: string; status: string; reportType: string; reportingPeriod: unknown; title: string }>
    >(
      `SELECT id, status, reportType, reportingPeriod, title
         FROM financial_reports
        WHERE portfolioCompanyId = ?
        ORDER BY createdAt DESC
        LIMIT 20`,
      pc.id
    );
    console.log(`\n${pc.name} financial_reports:`, reports.length);
    for (const r of reports) {
      const rp =
        r.reportingPeriod instanceof Date
          ? r.reportingPeriod.toISOString().slice(0, 10)
          : String(r.reportingPeriod || "").slice(0, 10);
      console.log(`  [${r.status}] ${r.reportType} ${rp} — ${(r.title || "").slice(0, 50)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
