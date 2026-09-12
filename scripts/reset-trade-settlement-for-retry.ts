/**
 * Dev/UAT helper: reverse a blotter trade settlement so Settle & post can be run again.
 * Usage: npx ts-node scripts/reset-trade-settlement-for-retry.ts [tradeId]
 */
import { prisma } from "../src/utils/database";
import { createJournalEntryWithAuditSequence } from "../src/services/AuditTrailSequenceService";

const tradeId = process.argv[2] || "cmsfs19490001unss5ch34ny6";

async function reverseGlEvent(eventId: string, userId: string, reason: string) {
  const event = await prisma.investmentAccountingEvent.findUnique({ where: { id: eventId } });
  if (!event?.journalEntryId || event.status === "REVERSED") return null;

  const original = await prisma.journalEntry.findUnique({
    where: { id: event.journalEntryId },
    include: { journalEntryLines: true },
  });
  if (!original) throw new Error("Original journal not found");

  const existingVr = await prisma.journalEntry.findFirst({
    where: { referenceNumber: `VR-${original.referenceNumber}` },
  });
  if (existingVr) {
    await prisma.investmentAccountingEvent.update({
      where: { id: eventId },
      data: {
        status: "REVERSED",
        reversalJournalEntryId: existingVr.id,
        version: { increment: 1 },
      },
    });
    return existingVr.id;
  }

  return prisma.$transaction(
    async (tx) => {
      const created = await createJournalEntryWithAuditSequence({
        transactionDate: new Date(),
        referenceNumber: `VR-${original.referenceNumber}`,
        description: `REVERSAL of ${original.referenceNumber}: ${reason}`,
        totalAmount: original.totalAmount,
        currencyId: original.currencyId,
        status: "POSTED",
        createdById: userId,
      });

      for (const line of original.journalEntryLines) {
        await tx.journalEntryLine.create({
          data: {
            journalEntryId: created.id,
            chartOfAccountId: line.chartOfAccountId,
            debitAmount: line.creditAmount,
            creditAmount: line.debitAmount,
            description: `REVERSAL: ${line.description}`,
            vatAmount: line.vatAmount || null,
          },
        });
      }

      await tx.investmentAccountingEvent.update({
        where: { id: eventId },
        data: {
          status: "REVERSED",
          reversalJournalEntryId: created.id,
          version: { increment: 1 },
        },
      });

      return created.id;
    },
    { maxWait: 15_000, timeout: 60_000 }
  );
}

async function reverseBuyHolding(tradeId: string) {
  const trade = await prisma.listedEquityTrade.findUnique({ where: { id: tradeId } });
  if (!trade || trade.side !== "BUY") return;

  const lot = await prisma.listedEquityHoldingLot.findFirst({ where: { tradeId } });
  if (!lot) return;

  const holding = await prisma.listedEquityHolding.findUnique({
    where: { fundId_securityId: { fundId: trade.fundId, securityId: trade.securityId } },
  });
  if (!holding) {
    await prisma.listedEquityHoldingLot.delete({ where: { id: lot.id } });
    return;
  }

  const buyQty = Number(lot.quantity);
  const buyPrice = Number(lot.executionPrice);
  const currentQty = Number(holding.quantity);
  const currentWac = Number(holding.wac);
  const newQty = currentQty - buyQty;
  const newWac = newQty > 0 ? (currentQty * currentWac - buyQty * buyPrice) / newQty : 0;

  await prisma.listedEquityHoldingLot.delete({ where: { id: lot.id } });
  await prisma.listedEquityHolding.update({
    where: { id: holding.id },
    data: { quantity: Math.max(0, newQty), wac: newWac },
  });
}

async function main() {
  const trade = await prisma.listedEquityTrade.findUnique({
    where: { id: tradeId },
    include: { routingHops: true, settlement: true },
  });
  if (!trade) throw new Error(`Trade not found: ${tradeId}`);

  const order = await prisma.investmentOrder.findFirst({ where: { tradeId } });
  const admin = await prisma.user.findFirst({
    where: { email: "admin@nvccz.co.zw" },
    include: { role: true },
  });
  if (!admin) throw new Error("admin user not found");

  const glEvent = await prisma.investmentAccountingEvent.findUnique({
    where: { id: `${tradeId}-gl` },
  });

  if (glEvent?.status === "POSTED" && glEvent.journalEntryId) {
    console.log("Reversing GL accounting event…");
    const reversalJeId = await reverseGlEvent(
      glEvent.id,
      admin.id,
      "Reset for blotter settle retry (dev)"
    );
    console.log("reversalJournalEntryId", reversalJeId);
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.listedEquityTradeSettlement.update({
        where: { tradeId },
        data: { journalEntryId: null, realizedPnl: null },
      });

      await tx.listedEquityTradeRoutingHop.updateMany({
        where: { tradeId, target: "ACCOUNTING_GL" },
        data: {
          status: "STAGED",
          confirmedAt: null,
          lastError: null,
          nextRetryAt: null,
          attemptCount: 0,
        },
      });

      await tx.listedEquityTrade.update({
        where: { id: tradeId },
        data: { status: "ROUTING", settledAt: null },
      });

      if (order) {
        await tx.investmentOrder.update({
          where: { id: order.id },
          data: { status: "PENDING_SETTLEMENT" },
        });
        await tx.investmentAccountingEvent.deleteMany({
          where: {
            sourceType: "INVESTMENT_ORDER",
            sourceId: order.id,
            eventType: "SETTLEMENT",
            status: "NOT_POSTED",
          },
        });
      }

      await tx.investmentCashLedgerEntry.deleteMany({
        where: { idempotencyKey: `cash-settle:${tradeId}` },
      });
      await tx.investmentTransaction.deleteMany({
        where: { idempotencyKey: `trade-settle:${tradeId}` },
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  await reverseBuyHolding(tradeId);

  const after = await prisma.listedEquityTrade.findUnique({
    where: { id: tradeId },
    include: { routingHops: true, settlement: true },
  });
  const orderAfter = order
    ? await prisma.investmentOrder.findUnique({ where: { id: order.id } })
    : null;
  const eventAfter = await prisma.investmentAccountingEvent.findUnique({
    where: { id: `${tradeId}-gl` },
  });

  console.log(
    JSON.stringify(
      {
        tradeStatus: after?.status,
        settlementJournalId: after?.settlement?.journalEntryId,
        glHop: after?.routingHops.find((h) => h.target === "ACCOUNTING_GL"),
        orderStatus: orderAfter?.status,
        glEventStatus: eventAfter?.status,
        reversalJournalId: eventAfter?.reversalJournalEntryId,
      },
      null,
      2
    )
  );
  console.log("Done — refresh blotter and use Settle & post.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
