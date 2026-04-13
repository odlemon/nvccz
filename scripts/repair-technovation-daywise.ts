import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ShortTermInvestmentService, resolveStiFiscalIanaTimezone, formatYyyyMmDdInTimeZone } from "../src/services/ShortTermInvestmentService";

const prisma = new PrismaClient();
const INSTRUMENT_ID = "cmnvkably000lktl9c86ytg26";

function addOneDayIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 6): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e: any) {
      attempt += 1;
      const msg = e?.message ?? String(e);
      const lockWait = msg.includes("Lock wait timeout exceeded");
      const seqConflict =
        msg.includes("Unique constraint failed on the constraint: `auditTrailSequenceNumber`") ||
        msg.includes("auditTrailSequenceNumber");
      if ((!lockWait && !seqConflict) || attempt > retries) throw e;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
}

async function main() {
  const actor = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!actor) throw new Error("No user available for attribution");

  const inst = await prisma.shortTermInvestmentInstrument.findUnique({
    where: { id: INSTRUMENT_ID },
    include: {
      apyRates: { orderBy: { effectiveFrom: "asc" } },
    },
  });
  if (!inst) throw new Error("Instrument not found");

  const startIso = inst.startDate.toISOString().slice(0, 10);
  const firstRate = inst.apyRates[0];
  if (!firstRate) throw new Error("No APY rate");
  const firstRateIso = firstRate.effectiveFrom.toISOString().slice(0, 10);
  if (firstRateIso > startIso) {
    await prisma.shortTermInvestmentApyRate.update({
      where: { id: firstRate.id },
      data: { effectiveFrom: inst.startDate },
    });
    console.log(`[APY FIX] moved first APY from ${firstRateIso} -> ${startIso}`);
  }

  const last = await prisma.shortTermInvestmentAccrual.findFirst({
    where: { instrumentId: INSTRUMENT_ID },
    orderBy: { accrualDate: "desc" },
  });
  const firstDay = last ? addOneDayIso(last.accrualDate.toISOString().slice(0, 10)) : startIso;

  const tz = await resolveStiFiscalIanaTimezone();
  const throughIso = formatYyyyMmDdInTimeZone(new Date(), tz);

  let cursor = firstDay;
  let created = 0;
  let duplicate = 0;
  let skipped = 0;

  while (cursor <= throughIso) {
    const r = await withRetry(() =>
      ShortTermInvestmentService.accrueOneCalendarDay({
        instrumentId: INSTRUMENT_ID,
        accrualIso: cursor,
        actorId: actor.id,
      })
    );
    if (r.outcome === "created") created += 1;
    else if (r.outcome === "duplicate") duplicate += 1;
    else skipped += 1;
    cursor = addOneDayIso(cursor);
  }

  const finalLast = await prisma.shortTermInvestmentAccrual.findFirst({
    where: { instrumentId: INSTRUMENT_ID },
    orderBy: { accrualDate: "desc" },
  });
  console.log(
    JSON.stringify(
      {
        instrumentId: INSTRUMENT_ID,
        throughIso,
        created,
        duplicate,
        skipped,
        lastAccrualDate: finalLast?.accrualDate.toISOString().slice(0, 10) ?? null,
        lastRunningAccrued: finalLast?.runningAccruedBalance.toString() ?? null,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
