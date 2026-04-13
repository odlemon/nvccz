import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const names = ["STI — ZIG money market", "Technovation Fund"];
  const rows = await prisma.shortTermInvestmentInstrument.findMany({
    where: { name: { in: names } },
    include: {
      apyRates: { orderBy: { effectiveFrom: "asc" } },
      accruals: { orderBy: { accrualDate: "asc" }, take: 20 },
      _count: { select: { accruals: true } },
    },
  });

  const out = rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    startDate: r.startDate.toISOString().slice(0, 10),
    maturityDate: r.maturityDate?.toISOString().slice(0, 10) ?? null,
    principal: r.principal.toString(),
    dayCountConvention: r.dayCountConvention,
    compoundingMethod: r.compoundingMethod,
    createdAt: r.createdAt.toISOString(),
    apyRates: r.apyRates.map((a) => ({
      id: a.id,
      effectiveFrom: a.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: a.effectiveTo?.toISOString().slice(0, 10) ?? null,
      apy: a.apy.toString(),
      createdAt: a.createdAt.toISOString(),
    })),
    accrualCount: r._count.accruals,
    firstAccruals: r.accruals.slice(0, 3).map((a) => ({
      date: a.accrualDate.toISOString().slice(0, 10),
      amount: a.amountInstrumentCcy.toString(),
      running: a.runningAccruedBalance.toString(),
      status: a.status,
    })),
    lastAccruals: r.accruals.slice(-3).map((a) => ({
      date: a.accrualDate.toISOString().slice(0, 10),
      amount: a.amountInstrumentCcy.toString(),
      running: a.runningAccruedBalance.toString(),
      status: a.status,
    })),
  }));

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
