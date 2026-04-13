import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ShortTermInvestmentService, resolveStiFiscalIanaTimezone, formatYyyyMmDdInTimeZone } from "../src/services/ShortTermInvestmentService";

const prisma = new PrismaClient();

function monthEndIsoFor(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

function addOneDayIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

async function main() {
  const targets = ["STI — ZIG money market", "Technovation Fund"];

  const actor = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!actor) throw new Error("No user found to attribute STI repair actions");

  const tz = await resolveStiFiscalIanaTimezone();
  const throughIso = formatYyyyMmDdInTimeZone(new Date(), tz);

  const instruments = await prisma.shortTermInvestmentInstrument.findMany({
    where: { name: { in: targets }, status: "ACTIVE" },
    include: {
      apyRates: { orderBy: { effectiveFrom: "asc" } },
      _count: { select: { accruals: true } },
    },
  });

  for (const inst of instruments) {
    const startIso = inst.startDate.toISOString().slice(0, 10);
    const firstRate = inst.apyRates[0] ?? null;

    if (inst._count.accruals === 0 && firstRate && firstRate.effectiveFrom.toISOString().slice(0, 10) > startIso) {
      await prisma.shortTermInvestmentApyRate.update({
        where: { id: firstRate.id },
        data: { effectiveFrom: inst.startDate },
      });
      console.log(
        `[APY FIX] ${inst.name} (${inst.id}) first APY moved ${firstRate.effectiveFrom.toISOString().slice(0, 10)} -> ${startIso}`
      );
    }

    let cursor = startIso;
    let created = 0;
    let duplicates = 0;
    let skipped = 0;

    while (cursor <= throughIso) {
      const chunkThrough = monthEndIsoFor(cursor) < throughIso ? monthEndIsoFor(cursor) : throughIso;
      const chunk = await ShortTermInvestmentService.catchUpAccruals({
        instrumentId: inst.id,
        throughIso: chunkThrough,
        actorId: actor.id,
      });
      created += chunk.filter((r) => r.outcome === "created").length;
      duplicates += chunk.filter((r) => r.outcome === "duplicate").length;
      skipped += chunk.filter((r) => r.outcome === "skipped").length;
      cursor = addOneDayIso(chunkThrough);
    }

    console.log(
      `[CATCH-UP] ${inst.name} (${inst.id}) through ${throughIso}: created=${created}, duplicate=${duplicates}, skipped=${skipped}`
    );
  }

  console.log("STI repair script complete.");
}

main()
  .catch((e) => {
    console.error("STI repair failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
