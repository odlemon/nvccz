// @ts-nocheck
import { prisma } from "../../utils/database";

export class QuarterlyStatementPreflightService {
  static async assertJournalsPosted(fundId: string, periodStart: Date, periodEnd: Date) {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    end.setHours(23, 59, 59, 999);

    const blockers: string[] = [];

    const capitalCalls = await prisma.capitalCall.findMany({
      where: {
        fundId,
        transactionDate: { gte: start, lte: end },
        journalEntryId: { not: null },
      },
      include: { journalEntry: { select: { status: true, referenceNumber: true } } },
    });
    for (const cc of capitalCalls) {
      if (cc.journalEntry && cc.journalEntry.status !== "POSTED") {
        blockers.push(`Capital call journal ${cc.journalEntry.referenceNumber} is ${cc.journalEntry.status}`);
      }
    }

    const distributions = await prisma.distribution.findMany({
      where: {
        fundId,
        distributionDate: { gte: start, lte: end },
        journalEntryId: { not: null },
      },
      include: { journalEntry: { select: { status: true, referenceNumber: true } } },
    });
    for (const d of distributions) {
      if (d.journalEntry && d.journalEntry.status !== "POSTED") {
        blockers.push(`Distribution journal ${d.journalEntry.referenceNumber} is ${d.journalEntry.status}`);
      }
    }

    const feePeriods = await prisma.managementFeePeriod.findMany({
      where: {
        fundId,
        periodEnd: { gte: start, lte: end },
        journalEntryId: { not: null },
      },
      include: { journalEntry: { select: { status: true, referenceNumber: true } } },
    });
    for (const fp of feePeriods) {
      if (fp.journalEntry && fp.journalEntry.status !== "POSTED") {
        blockers.push(`Management fee journal ${fp.journalEntry.referenceNumber} is ${fp.journalEntry.status}`);
      }
    }

    if (blockers.length) {
      throw Object.assign(
        new Error(`Cannot compile: unposted journals in period — ${blockers.slice(0, 5).join("; ")}`),
        { statusCode: 400, blockers }
      );
    }

    return { ok: true };
  }
}
