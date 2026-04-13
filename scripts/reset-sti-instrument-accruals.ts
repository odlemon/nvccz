import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ShortTermInvestmentService } from "../src/services/ShortTermInvestmentService";

const prisma = new PrismaClient();

// Technovation Fund from the reported issue.
const TARGET_INSTRUMENT_ID = "cmnvkably000lktl9c86ytg26";

async function main() {
  const actor = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!actor) throw new Error("No user found to attribute STI reset actions");

  const inst = await prisma.shortTermInvestmentInstrument.findUnique({
    where: { id: TARGET_INSTRUMENT_ID },
    select: {
      id: true,
      name: true,
      status: true,
      dayCountLocked: true,
      capitalErosion: true,
    },
  });
  if (!inst) throw new Error(`Instrument not found: ${TARGET_INSTRUMENT_ID}`);
  if (inst.status !== "ACTIVE") {
    throw new Error(`Instrument must be ACTIVE to reset accruals. Current status: ${inst.status}`);
  }

  const accruals = await prisma.shortTermInvestmentAccrual.findMany({
    where: { instrumentId: TARGET_INSTRUMENT_ID },
    orderBy: { accrualDate: "desc" },
    select: { id: true },
  });

  console.log(
    `[RESET] Instrument ${inst.name} (${inst.id}) — found ${accruals.length} accrual rows; reversing linked journals...`
  );

  for (const a of accruals) {
    await ShortTermInvestmentService.reverseAccrualLinkedJournal(a.id, actor.id);
  }

  const del = await prisma.shortTermInvestmentAccrual.deleteMany({
    where: { instrumentId: TARGET_INSTRUMENT_ID },
  });

  await prisma.shortTermInvestmentInstrument.update({
    where: { id: TARGET_INSTRUMENT_ID },
    data: {
      dayCountLocked: false,
      capitalErosion: false,
      updatedAt: new Date(),
    },
  });

  const afterCount = await prisma.shortTermInvestmentAccrual.count({
    where: { instrumentId: TARGET_INSTRUMENT_ID },
  });

  console.log(
    JSON.stringify(
      {
        instrumentId: TARGET_INSTRUMENT_ID,
        instrumentName: inst.name,
        actorId: actor.id,
        actorEmail: actor.email,
        deletedAccrualRows: del.count,
        remainingAccrualRows: afterCount,
        resetDayCountLockedTo: false,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error("STI accrual reset failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
