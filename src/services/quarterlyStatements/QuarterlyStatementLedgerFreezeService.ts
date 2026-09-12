// @ts-nocheck
import { prisma } from "../../utils/database";
import { QuarterlyStatementFxService } from "./QuarterlyStatementFxService";

export class QuarterlyStatementLedgerFreezeService {
  static async freezeForRun(runId: string, fundId: string, periodStart: Date, periodEnd: Date) {
    await prisma.quarterlyStatementLedgerSnapshot.deleteMany({ where: { runId } });

    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    end.setHours(23, 59, 59, 999);

    const rows: Array<{
      runId: string;
      clientId: string | null;
      sourceType: string;
      sourceId: string;
      transactionDate: Date;
      amount: number;
      currencyCode: string;
      fxRateAtTx: number | null;
      amountUsd: number | null;
      amountZig: number | null;
      metadata?: object;
    }> = [];

    const callPayments = await prisma.capitalCallAllocationPayment.findMany({
      where: {
        recordedAt: { gte: start, lte: end },
        capitalCallAllocation: { capitalCall: { fundId } },
      },
      include: {
        capitalCallAllocation: {
          include: { capitalCall: { include: { currency: true } }, client: true },
        },
      },
    });

    for (const p of callPayments) {
      const alloc = p.capitalCallAllocation;
      const amt = Number(p.amount);
      const currency = QuarterlyStatementFxService.normalize(alloc.capitalCall.currency?.code || "USD");
      const txDate = new Date(p.recordedAt);
      const fxRate = await QuarterlyStatementFxService.rateAtDate(currency, "USD", txDate);
      const amountUsd = await QuarterlyStatementFxService.convert(amt, currency, "USD", txDate);
      const amountZig = await QuarterlyStatementFxService.convert(amt, currency, "ZIG", txDate);
      rows.push({
        runId,
        clientId: alloc.clientId,
        sourceType: "CAPITAL_CALL",
        sourceId: p.id,
        transactionDate: txDate,
        amount: amt,
        currencyCode: currency,
        fxRateAtTx: fxRate,
        amountUsd,
        amountZig,
        metadata: { allocationId: alloc.id, callId: alloc.capitalCallId },
      });
    }

    const distPayments = await prisma.distributionAllocationPayment.findMany({
      where: {
        recordedAt: { gte: start, lte: end },
        allocation: { distribution: { fundId } },
      },
      include: {
        allocation: { include: { distribution: { include: { currency: true } } } },
      },
    });

    for (const p of distPayments) {
      const alloc = p.allocation;
      const amt = Number(p.amount);
      const currency = QuarterlyStatementFxService.normalize(alloc.distribution.currency?.code || "USD");
      const txDate = new Date(p.recordedAt);
      const fxRate = await QuarterlyStatementFxService.rateAtDate(currency, "USD", txDate);
      const amountUsd = await QuarterlyStatementFxService.convert(amt, currency, "USD", txDate);
      const amountZig = await QuarterlyStatementFxService.convert(amt, currency, "ZIG", txDate);
      rows.push({
        runId,
        clientId: alloc.clientId,
        sourceType: "DISTRIBUTION",
        sourceId: p.id,
        transactionDate: txDate,
        amount: amt,
        currencyCode: currency,
        fxRateAtTx: fxRate,
        amountUsd,
        amountZig,
        metadata: { allocationId: alloc.id, distributionId: alloc.distributionId },
      });
    }

    const cashbook = await prisma.cashbookEntry.findMany({
      where: {
        transactionDate: { gte: start, lte: end },
        OR: [
          { description: { contains: "capital call" } },
          { description: { contains: "CCALL" } },
          { reference: { contains: "CCALL" } },
        ],
      },
      take: 500,
    });

    for (const cb of cashbook) {
      const amt = Number(cb.amount);
      const txDate = new Date(cb.transactionDate);
      const amountUsd = await QuarterlyStatementFxService.convert(amt, "USD", "USD", txDate);
      const amountZig = await QuarterlyStatementFxService.convert(amt, "USD", "ZIG", txDate);
      rows.push({
        runId,
        clientId: null,
        sourceType: "CASHBOOK",
        sourceId: cb.id,
        transactionDate: txDate,
        amount: amt,
        currencyCode: "USD",
        fxRateAtTx: 1,
        amountUsd,
        amountZig,
        metadata: { description: cb.description, reference: cb.reference },
      });
    }

    if (rows.length) {
      await prisma.quarterlyStatementLedgerSnapshot.createMany({
        data: rows.map((r) => ({
          runId: r.runId,
          clientId: r.clientId,
          sourceType: r.sourceType,
          sourceId: r.sourceId,
          transactionDate: r.transactionDate,
          amount: r.amount,
          currencyCode: r.currencyCode,
          fxRateAtTx: r.fxRateAtTx,
          amountUsd: r.amountUsd,
          amountZig: r.amountZig,
          metadata: r.metadata,
        })),
      });
    }

    return { frozenCount: rows.length };
  }
}
