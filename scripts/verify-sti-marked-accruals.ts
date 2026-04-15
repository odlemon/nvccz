import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";

const prisma = new PrismaClient();

function dateIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const ids = ["cmnncjs9z0001unco45y48qyw", "cmnvkably000lktl9c86ytg26"];

  for (const id of ids) {
    const inst = await prisma.shortTermInvestmentInstrument.findUnique({
      where: { id },
      include: { apyRates: { orderBy: { effectiveFrom: "asc" } } },
    });
    if (!inst) {
      console.log(JSON.stringify({ id, error: "instrument not found" }, null, 2));
      continue;
    }

    const first = await prisma.shortTermInvestmentAccrual.findFirst({
      where: { instrumentId: id },
      orderBy: { accrualDate: "asc" },
    });
    const last = await prisma.shortTermInvestmentAccrual.findFirst({
      where: { instrumentId: id },
      orderBy: { accrualDate: "desc" },
    });
    const count = await prisma.shortTermInvestmentAccrual.count({ where: { instrumentId: id } });

    let quickMathCheck: string | null = null;
    if (inst.compoundingMethod === "SIMPLE" && inst.apyRates.length > 0 && first && last) {
      const apy = new Decimal(inst.apyRates[0].apy.toString());
      const principal = new Decimal(inst.principal.toString());
      const denom = inst.dayCountConvention === "ACTUAL_360" || inst.dayCountConvention === "THIRTY_360" ? 360 : 365;
      const expectedDaily = principal.mul(apy).div(denom).toDecimalPlaces(6);
      quickMathCheck = `expected daily≈${expectedDaily.toString()}, first=${first.amountInstrumentCcy.toString()}`;
    }

    console.log(
      JSON.stringify(
        {
          id: inst.id,
          name: inst.name,
          status: inst.status,
          startDate: dateIso(inst.startDate),
          maturityDate: inst.maturityDate ? dateIso(inst.maturityDate) : null,
          principal: inst.principal.toString(),
          compoundingMethod: inst.compoundingMethod,
          dayCountConvention: inst.dayCountConvention,
          apyRates: inst.apyRates.map((a) => ({
            effectiveFrom: dateIso(a.effectiveFrom),
            apy: a.apy.toString(),
          })),
          accrualCount: count,
          firstAccrual: first
            ? {
                date: dateIso(first.accrualDate),
                amount: first.amountInstrumentCcy.toString(),
                running: first.runningAccruedBalance.toString(),
                status: first.status,
              }
            : null,
          lastAccrual: last
            ? {
                date: dateIso(last.accrualDate),
                amount: last.amountInstrumentCcy.toString(),
                running: last.runningAccruedBalance.toString(),
                status: last.status,
              }
            : null,
          quickMathCheck,
        },
        null,
        2
      )
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
