/**
 * One-off / ops: run STI catch-up for one ACTIVE instrument through fiscal "today"
 * (or STI_CATCHUP_THROUGH_ISO), same logic as POST .../catch-up and post-create backfill.
 *
 * Usage:
 *   STI_CATCHUP_INSTRUMENT_ID=cmnvk... npm run db:sti:catch-up-instrument
 *   npm run db:sti:catch-up-instrument -- cmnvkably000lktl9c86ytg26
 *
 * Optional:
 *   STI_CATCHUP_THROUGH_ISO=2026-04-19   (defaults to fiscal today in STI settings timezone)
 *   STI_CATCHUP_ACTOR_USER_ID=...        (defaults to oldest user in DB, for audit trail)
 *   STI_CATCHUP_SINGLE_TRANSACTION=1   (one big catch-up; default is month-sized chunks to avoid DB tx timeout)
 *
 * If accruals exist but do NOT begin at instrument start_date (e.g. after a partial delete),
 * catch-up only fills forward from the last accrual day. To rebuild from start_date:
 *   STI_CATCHUP_REBUILD_FROM_START=1
 *   STI_CATCHUP_CONFIRM_REBUILD=DELETE_ALL_ACCRUALS_AND_RECATCH_UP
 * (reverses linked accrual journals, deletes accrual rows, then catch-up through throughIso)
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import {
  compareIsoDate,
  formatYyyyMmDdInTimeZone,
  resolveStiFiscalIanaTimezone,
  ShortTermInvestmentService,
} from "../src/services/ShortTermInvestmentService";

/** Last calendar day of month (month 1–12), UTC YYYY-MM-DD. */
function lastDayOfMonthIso(year: number, month1Based: number): string {
  return new Date(Date.UTC(year, month1Based, 0)).toISOString().slice(0, 10);
}

function minIso(a: string, b: string): string {
  return compareIsoDate(a, b) <= 0 ? a : b;
}

/** Month-by-month catch-up avoids a single 300+ day Prisma transaction (900s default timeout). */
async function catchUpAccrualsMonthChunks(params: {
  instrumentId: string;
  startIso: string;
  throughIso: string;
  actorId: string;
}): Promise<{
  chunks: number;
  totalDayResults: number;
  totalCreated: number;
  totalDuplicate: number;
  totalSkipped: number;
}> {
  const { instrumentId, startIso, throughIso, actorId } = params;
  if (compareIsoDate(startIso, throughIso) > 0) {
    return {
      chunks: 0,
      totalDayResults: 0,
      totalCreated: 0,
      totalDuplicate: 0,
      totalSkipped: 0,
    };
  }

  const [sy, sm] = startIso.split("-").map(Number);
  let curY = sy;
  let curM = sm;
  let chunks = 0;
  let totalDayResults = 0;
  let totalCreated = 0;
  let totalDuplicate = 0;
  let totalSkipped = 0;
  const maxChunks = 600;

  for (;;) {
    const monthEnd = lastDayOfMonthIso(curY, curM);
    const chunkEnd = minIso(monthEnd, throughIso);
    if (compareIsoDate(chunkEnd, startIso) >= 0) {
      chunks += 1;
      const rows = await ShortTermInvestmentService.catchUpAccruals({
        instrumentId,
        throughIso: chunkEnd,
        actorId,
      });
      totalDayResults += rows.length;
      totalCreated += rows.filter((r) => r.outcome === "created").length;
      totalDuplicate += rows.filter((r) => r.outcome === "duplicate").length;
      totalSkipped += rows.filter((r) => r.outcome === "skipped").length;
      console.log(
        JSON.stringify(
          {
            chunk: chunks,
            throughIso: chunkEnd,
            dayResults: rows.length,
            created: rows.filter((r) => r.outcome === "created").length,
          },
          null,
          2
        )
      );
    }

    if (compareIsoDate(monthEnd, throughIso) >= 0) {
      break;
    }
    curM += 1;
    if (curM > 12) {
      curM = 1;
      curY += 1;
    }
    if (chunks > maxChunks) {
      throw new Error(`catch-up exceeded ${maxChunks} month chunks (sanity guard)`);
    }
  }

  return {
    chunks,
    totalDayResults,
    totalCreated,
    totalDuplicate,
    totalSkipped,
  };
}

function argInstrumentId(): string | undefined {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  return argv[0]?.trim() || undefined;
}

async function main() {
  const instrumentId =
    process.env.STI_CATCHUP_INSTRUMENT_ID?.trim() || argInstrumentId();
  if (!instrumentId) {
    console.error(
      "Set STI_CATCHUP_INSTRUMENT_ID or pass the instrument id as the first argument."
    );
    process.exit(1);
  }

  const actorId =
    process.env.STI_CATCHUP_ACTOR_USER_ID?.trim() ||
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
  if (!actorId) {
    console.error("No STI_CATCHUP_ACTOR_USER_ID and no users in database.");
    process.exit(1);
  }

  const throughIsoRaw = process.env.STI_CATCHUP_THROUGH_ISO?.trim();
  const tz = await resolveStiFiscalIanaTimezone();
  const throughIso =
    throughIsoRaw && throughIsoRaw.length >= 10
      ? throughIsoRaw.slice(0, 10)
      : formatYyyyMmDdInTimeZone(new Date(), tz);

  const inst = await prisma.shortTermInvestmentInstrument.findUnique({
    where: { id: instrumentId },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
    },
  });
  if (!inst) {
    console.error(`Instrument not found: ${instrumentId}`);
    process.exit(1);
  }
  if (inst.status !== "ACTIVE") {
    console.error(`Instrument must be ACTIVE (status=${inst.status}).`);
    process.exit(1);
  }

  const before = await prisma.shortTermInvestmentAccrual.count({
    where: { instrumentId },
  });

  const rebuild =
    process.env.STI_CATCHUP_REBUILD_FROM_START === "1" ||
    process.env.STI_CATCHUP_REBUILD_FROM_START === "true";
  const confirmOk =
    process.env.STI_CATCHUP_CONFIRM_REBUILD === "DELETE_ALL_ACCRUALS_AND_RECATCH_UP";

  console.log(
    JSON.stringify(
      {
        instrumentId: inst.id,
        name: inst.name,
        startDate: inst.startDate.toISOString().slice(0, 10),
        throughIso,
        fiscalTimezone: tz,
        actorId,
        accrualRowsBefore: before,
        rebuildFromStart: rebuild,
      },
      null,
      2
    )
  );

  if (rebuild) {
    if (!confirmOk) {
      console.error(
        "STI_CATCHUP_REBUILD_FROM_START is set but STI_CATCHUP_CONFIRM_REBUILD must be exactly: DELETE_ALL_ACCRUALS_AND_RECATCH_UP"
      );
      process.exit(1);
    }
    const accrualIds = await prisma.shortTermInvestmentAccrual.findMany({
      where: { instrumentId },
      orderBy: { accrualDate: "desc" },
      select: { id: true },
    });
    console.log(
      JSON.stringify(
        { phase: "rebuild", reversingJournalCount: accrualIds.length },
        null,
        2
      )
    );
    for (const a of accrualIds) {
      await ShortTermInvestmentService.reverseAccrualLinkedJournal(a.id, actorId);
    }
    const del = await prisma.shortTermInvestmentAccrual.deleteMany({
      where: { instrumentId },
    });
    await prisma.shortTermInvestmentInstrument.update({
      where: { id: instrumentId },
      data: {
        dayCountLocked: false,
        capitalErosion: false,
        updatedAt: new Date(),
      },
    });
    console.log(JSON.stringify({ phase: "rebuild", deletedAccrualRows: del.count }, null, 2));
  }

  const startIso = inst.startDate.toISOString().slice(0, 10);
  const useSingleShot = process.env.STI_CATCHUP_SINGLE_TRANSACTION === "1";
  if (useSingleShot) {
    const rows = await ShortTermInvestmentService.catchUpAccruals({
      instrumentId,
      throughIso,
      actorId,
    });
    const created = rows.filter((r) => r.outcome === "created").length;
    const duplicate = rows.filter((r) => r.outcome === "duplicate").length;
    const skipped = rows.filter((r) => r.outcome === "skipped").length;
    const after = await prisma.shortTermInvestmentAccrual.count({ where: { instrumentId } });
    const first = await prisma.shortTermInvestmentAccrual.findFirst({
      where: { instrumentId },
      orderBy: { accrualDate: "asc" },
      select: { accrualDate: true },
    });
    const last = await prisma.shortTermInvestmentAccrual.findFirst({
      where: { instrumentId },
      orderBy: { accrualDate: "desc" },
      select: { accrualDate: true },
    });
    console.log(
      JSON.stringify(
        {
          mode: "single_transaction",
          dayResults: rows.length,
          outcomeCreated: created,
          outcomeDuplicate: duplicate,
          outcomeSkipped: skipped,
          accrualRowsAfter: after,
          firstAccrualDate: first?.accrualDate.toISOString().slice(0, 10) ?? null,
          lastAccrualDate: last?.accrualDate.toISOString().slice(0, 10) ?? null,
        },
        null,
        2
      )
    );
  } else {
    const agg = await catchUpAccrualsMonthChunks({
      instrumentId,
      startIso,
      throughIso,
      actorId,
    });
    const after = await prisma.shortTermInvestmentAccrual.count({ where: { instrumentId } });
    const first = await prisma.shortTermInvestmentAccrual.findFirst({
      where: { instrumentId },
      orderBy: { accrualDate: "asc" },
      select: { accrualDate: true },
    });
    const last = await prisma.shortTermInvestmentAccrual.findFirst({
      where: { instrumentId },
      orderBy: { accrualDate: "desc" },
      select: { accrualDate: true },
    });
    console.log(
      JSON.stringify(
        {
          mode: "month_chunks",
          monthChunks: agg.chunks,
          dayResults: agg.totalDayResults,
          outcomeCreated: agg.totalCreated,
          outcomeDuplicate: agg.totalDuplicate,
          outcomeSkipped: agg.totalSkipped,
          accrualRowsAfter: after,
          firstAccrualDate: first?.accrualDate.toISOString().slice(0, 10) ?? null,
          lastAccrualDate: last?.accrualDate.toISOString().slice(0, 10) ?? null,
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
