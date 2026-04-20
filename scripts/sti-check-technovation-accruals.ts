/**
 * One-off: compare STI start_date vs created_at vs first accrual for Technovation Fund (or name match).
 * npx ts-node --transpile-only -r dotenv/config scripts/sti-check-technovation-accruals.ts
 */
import { prisma } from "../src/utils/database";

async function main() {
  const rows = await prisma.shortTermInvestmentInstrument.findMany({
    where: { name: { contains: "Technovation" } },
    select: {
      id: true,
      name: true,
      startDate: true,
      createdAt: true,
      maturityDate: true,
      status: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (rows.length === 0) {
    console.log(JSON.stringify({ message: "No instrument with name containing Technovation" }, null, 2));
    await prisma.$disconnect();
    return;
  }

  for (const inst of rows) {
    const [apy, accAgg, accFirst, accLast] = await Promise.all([
      prisma.shortTermInvestmentApyRate.findMany({
        where: { instrumentId: inst.id },
        orderBy: { effectiveFrom: "asc" },
        select: { effectiveFrom: true, effectiveTo: true, apy: true, createdAt: true },
        take: 5,
      }),
      prisma.shortTermInvestmentAccrual.aggregate({
        where: { instrumentId: inst.id },
        _count: true,
        _sum: { amountInstrumentCcy: true },
      }),
      prisma.shortTermInvestmentAccrual.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { accrualDate: "asc" },
        select: { accrualDate: true, amountInstrumentCcy: true },
      }),
      prisma.shortTermInvestmentAccrual.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { accrualDate: "desc" },
        select: { accrualDate: true, amountInstrumentCcy: true },
      }),
    ]);

    console.log(
      JSON.stringify(
        {
          instrument: {
            id: inst.id,
            name: inst.name,
            status: inst.status,
            startDate: inst.startDate.toISOString().slice(0, 10),
            maturityDate: inst.maturityDate?.toISOString().slice(0, 10) ?? null,
            createdAt: inst.createdAt.toISOString(),
          },
          apyRatesFirst: apy.map((r) => ({
            effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
            effectiveTo: r.effectiveTo?.toISOString().slice(0, 10) ?? null,
            apy: r.apy.toString(),
            rateRowCreatedAt: r.createdAt.toISOString(),
          })),
          accruals: {
            count: accAgg._count,
            sumAmountInstrument: accAgg._sum.amountInstrumentCcy?.toString() ?? null,
            firstAccrualDate: accFirst?.accrualDate.toISOString().slice(0, 10) ?? null,
            lastAccrualDate: accLast?.accrualDate.toISOString().slice(0, 10) ?? null,
          },
          analysis: {
            accrualsStartAlignedWithInstrumentStart:
              accFirst == null
                ? "no_accruals"
                : accFirst.accrualDate.toISOString().slice(0, 10) >= inst.startDate.toISOString().slice(0, 10)
                ? accFirst.accrualDate.toISOString().slice(0, 10) === inst.startDate.toISOString().slice(0, 10)
                  ? "first_accrual_equals_start_date"
                  : "first_accrual_after_start_date"
                : "BUG_first_accrual_before_start",
            accrualsStartNearCreatedAt:
              accFirst == null
                ? "no_accruals"
                : Math.abs(
                    accFirst.accrualDate.getTime() - inst.createdAt.getTime()
                  ) <
                  5 * 86400000
                  ? "first_accrual_within_5_days_of_createdAt"
                  : "first_accrual_not_near_createdAt",
          },
        },
        null,
        2
      )
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
