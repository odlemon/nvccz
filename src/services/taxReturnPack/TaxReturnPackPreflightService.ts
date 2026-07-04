// @ts-nocheck
import { prisma } from "../../utils/database";
import { QuarterlyStatementPreflightService } from "../quarterlyStatements/QuarterlyStatementPreflightService";

export class TaxReturnPackPreflightService {
  static async collectBlockers(
    periodStart: Date,
    periodEnd: Date,
    fundId?: string | null
  ): Promise<string[]> {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    end.setHours(23, 59, 59, 999);

    const blockers: string[] = [];

    const unposted = await prisma.journalEntry.findMany({
      where: {
        transactionDate: { gte: start, lte: end },
        status: { not: "POSTED" },
      },
      select: { referenceNumber: true, status: true, transactionDate: true },
      take: 20,
    });
    for (const je of unposted) {
      blockers.push(
        `Journal ${je.referenceNumber} (${je.transactionDate.toISOString().slice(0, 10)}) is ${je.status}`
      );
    }

    if (fundId) {
      try {
        await QuarterlyStatementPreflightService.assertJournalsPosted(fundId, start, end);
      } catch (e: any) {
        const extra = e?.blockers as string[] | undefined;
        if (extra?.length) blockers.push(...extra);
        else if (e?.message) blockers.push(String(e.message));
      }
    }

    return blockers;
  }

  static async assertReady(periodStart: Date, periodEnd: Date, fundId?: string | null) {
    const blockers = await TaxReturnPackPreflightService.collectBlockers(periodStart, periodEnd, fundId);
    if (blockers.length) {
      throw Object.assign(
        new Error(`Cannot compile: unposted journals in period — ${blockers.slice(0, 5).join("; ")}`),
        { statusCode: 400, blockers }
      );
    }
    return { ok: true };
  }
}
