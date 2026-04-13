import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TARGET_INSTRUMENT_ID = "cmnvkably000lktl9c86ytg26";

async function main() {
  const before = await prisma.shortTermInvestmentAccrual.count({
    where: { instrumentId: TARGET_INSTRUMENT_ID },
  });

  const del = await prisma.shortTermInvestmentAccrual.deleteMany({
    where: { instrumentId: TARGET_INSTRUMENT_ID },
  });

  await prisma.shortTermInvestmentInstrument.update({
    where: { id: TARGET_INSTRUMENT_ID },
    data: { dayCountLocked: false, capitalErosion: false },
  });

  const after = await prisma.shortTermInvestmentAccrual.count({
    where: { instrumentId: TARGET_INSTRUMENT_ID },
  });

  console.log(
    JSON.stringify(
      {
        instrumentId: TARGET_INSTRUMENT_ID,
        beforeAccrualCount: before,
        deletedAccrualCount: del.count,
        afterAccrualCount: after,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error("Hard delete failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
