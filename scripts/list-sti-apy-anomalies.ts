/**
 * Lists APY rate rows where stored value has |apy| > 1 (often a mistaken "percent" entry
 * stored as raw number before normalization). Review before changing data.
 *
 * Run: npx ts-node --transpile-only scripts/list-sti-apy-anomalies.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.shortTermInvestmentApyRate.findMany({
    where: {
      OR: [{ apy: { gt: 1 } }, { apy: { lt: -1 } }],
    },
    include: {
      instrument: { select: { id: true, name: true, status: true } },
    },
    orderBy: { effectiveFrom: "desc" },
  });

  console.log(
    JSON.stringify(
      rows.map((r) => ({
        rateId: r.id,
        instrumentId: r.instrumentId,
        instrumentName: r.instrument.name,
        instrumentStatus: r.instrument.status,
        effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
        apyStored: r.apy.toString(),
        note:
          "|apy|>1 is valid only for extreme yields (e.g. 15 = 1500% as decimal). Often it is a data entry error (meant 8% as 0.08 or 8 as whole percent).",
      })),
      null,
      2
    )
  );
  console.log(`Total: ${rows.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
