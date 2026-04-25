/**
 * Idempotent: ensures a database KPI row named **Assets Under Management** exists for PM/Accounting AUM sync UAT
 * (same string `isPortfolioAumCompatibleGoal` matches via KPI name + `auml` / `assets under management` heuristics).
 *
 * Run: `npm run db:ensure:assets-under-management-kpi` (or `npx ts-node --transpile-only scripts/ensure-assets-under-management-kpi.ts`)
 */
import { prisma } from "../src/utils/database";

const NAME = "Assets Under Management";

async function main() {
  const existing = await prisma.kPI.findFirst({ where: { name: NAME } });
  if (existing) {
    console.log(JSON.stringify({ ok: true, action: "skip", kpiId: existing.id, name: existing.name }, null, 2));
    return;
  }
  const kpi = await prisma.kPI.create({
    data: {
      name: NAME,
      type: "Metric",
      hasUnit: true,
      unitCategory: "Currency",
      unit: "USD",
      unitSymbol: "$",
      isActive: true
    }
  });
  console.log(JSON.stringify({ ok: true, action: "created", kpiId: kpi.id, name: kpi.name }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
