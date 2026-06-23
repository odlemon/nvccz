// @ts-nocheck
import { prisma } from "../../utils/database";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";

export interface LedgerEntry {
  entryId: string;
  entryType: "CAPITAL_CALL" | "CAPITAL_CALL_PAYMENT" | "DISTRIBUTION" | "DISTRIBUTION_PAYMENT";
  fundId: string;
  fundName: string;
  transactionDate: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
}

export class LpPortalLedgerService {
  static async listLedger(
    ctx: LpPortalContext,
    filters: { fundId?: string; from?: string; to?: string; currency?: string }
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const entries: LedgerEntry[] = [];

    const callAllocations = await prisma.capitalCallAllocation.findMany({
      where: {
        clientId: ctx.clientId,
        ...(filters.fundId ? { capitalCall: { fundId: filters.fundId } } : {}),
      },
      include: {
        capitalCall: { include: { fund: true, currency: true } },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    });

    for (const alloc of callAllocations) {
      if (!LpPortalAccessService.fundAllowed(ctx, alloc.capitalCall.fundId)) continue;
      const ccy = alloc.capitalCall.currency?.code || "USD";
      if (filters.currency && filters.currency !== ccy) continue;
      const txDate = alloc.capitalCall.transactionDate;
      if (filters.from && txDate < new Date(filters.from)) continue;
      if (filters.to && txDate > new Date(filters.to)) continue;

      entries.push({
        entryId: alloc.id,
        entryType: "CAPITAL_CALL",
        fundId: alloc.capitalCall.fundId,
        fundName: alloc.capitalCall.fund.name,
        transactionDate: txDate.toISOString().slice(0, 10),
        amount: Number(alloc.currentCallAmount.toString()),
        currency: ccy,
        description: `Capital call — ${alloc.capitalCall.callPercent}%`,
        status: alloc.status,
      });

      for (const p of alloc.payments) {
        const pDate = p.recordedAt;
        if (filters.from && pDate < new Date(filters.from)) continue;
        if (filters.to && pDate > new Date(filters.to)) continue;
        entries.push({
          entryId: p.id,
          entryType: "CAPITAL_CALL_PAYMENT",
          fundId: alloc.capitalCall.fundId,
          fundName: alloc.capitalCall.fund.name,
          transactionDate: pDate.toISOString().slice(0, 10),
          amount: Number(p.amount.toString()),
          currency: ccy,
          description: "Capital call payment received",
          status: "POSTED",
        });
      }
    }

    const distAllocations = await prisma.distributionAllocation.findMany({
      where: {
        clientId: ctx.clientId,
        ...(filters.fundId ? { distribution: { fundId: filters.fundId } } : {}),
      },
      include: {
        distribution: { include: { fund: true, currency: true } },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    });

    for (const alloc of distAllocations) {
      if (!LpPortalAccessService.fundAllowed(ctx, alloc.distribution.fundId)) continue;
      const ccy = alloc.distribution.currency?.code || "USD";
      if (filters.currency && filters.currency !== ccy) continue;
      const txDate = alloc.distribution.distributionDate;
      if (filters.from && txDate < new Date(filters.from)) continue;
      if (filters.to && txDate > new Date(filters.to)) continue;

      entries.push({
        entryId: alloc.id,
        entryType: "DISTRIBUTION",
        fundId: alloc.distribution.fundId,
        fundName: alloc.distribution.fund.name,
        transactionDate: txDate.toISOString().slice(0, 10),
        amount: Number(alloc.shareAmount.toString()),
        currency: ccy,
        description: "Distribution declared",
        status: alloc.status,
      });

      for (const p of alloc.payments) {
        const pDate = p.recordedAt;
        if (filters.from && pDate < new Date(filters.from)) continue;
        if (filters.to && pDate > new Date(filters.to)) continue;
        entries.push({
          entryId: p.id,
          entryType: "DISTRIBUTION_PAYMENT",
          fundId: alloc.distribution.fundId,
          fundName: alloc.distribution.fund.name,
          transactionDate: pDate.toISOString().slice(0, 10),
          amount: Number(p.amount.toString()),
          currency: ccy,
          description: "Distribution payout",
          status: "POSTED",
        });
      }
    }

    entries.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
    return { data: entries };
  }

  static async getEntryDetail(ctx: LpPortalContext, entryId: string) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);

    const callAlloc = await prisma.capitalCallAllocation.findFirst({
      where: { id: entryId, clientId: ctx.clientId },
      include: {
        capitalCall: { include: { fund: true, currency: true } },
        payments: { orderBy: { recordedAt: "asc" } },
      },
    });
    if (callAlloc) {
      const vaultDoc = await prisma.lpPortalDocument.findFirst({
        where: {
          clientId: ctx.clientId,
          category: "CALL_NOTICE",
          sourceRefId: callAlloc.capitalCallId,
        },
      });
      return {
        entryType: "CAPITAL_CALL",
        allocation: callAlloc,
        payments: callAlloc.payments,
        callNoticeDocumentId: vaultDoc?.id ?? null,
      };
    }

    const payment = await prisma.capitalCallAllocationPayment.findFirst({
      where: { id: entryId },
      include: {
        capitalCallAllocation: {
          include: { capitalCall: { include: { fund: true } } },
        },
      },
    });
    if (payment && payment.capitalCallAllocation.clientId === ctx.clientId) {
      return {
        entryType: "CAPITAL_CALL_PAYMENT",
        payment,
        fundName: payment.capitalCallAllocation.capitalCall.fund.name,
      };
    }

    const distAlloc = await prisma.distributionAllocation.findFirst({
      where: { id: entryId, clientId: ctx.clientId },
      include: { distribution: { include: { fund: true } }, payments: true },
    });
    if (distAlloc) {
      return { entryType: "DISTRIBUTION", allocation: distAlloc };
    }

    throw Object.assign(new Error("Ledger entry not found"), { statusCode: 404 });
  }
}
