/**
 * Clear Investments trading activity only (DEV nts).
 * Deletes: orders, LE trades, trade recon, trade-linked accounting / cash journals.
 * Keeps: funds, portfolios, instruments, securities, prices, cash accounts, stakeholders.
 *
 * Usage:
 *   Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
 *   npx ts-node --transpile-only -r dotenv/config scripts/cleanup-investments-trading-activity-nts.ts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient() as any;

async function del(label: string, fn: () => Promise<{ count: number } | number | void>) {
  try {
    const r = await fn();
    const count = typeof r === "number" ? r : (r as any)?.count ?? 0;
    console.log(`[ok] ${label}: ${count}`);
  } catch (e: any) {
    console.warn(`[skip] ${label}: ${String(e?.message || e).slice(0, 160)}`);
  }
}

async function clearDispatchMocks() {
  const dirs = [
    path.join(process.cwd(), "storage", "local-upload-mock", "listed-equity-dispatch"),
    path.join(process.cwd(), "storage", "local-upload-mock", "listed-equity-settlement"),
  ];
  let n = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      try {
        fs.unlinkSync(path.join(dir, f));
        n += 1;
      } catch {
        /* ignore */
      }
    }
  }
  console.log(`[ok] local dispatch/settlement mock files: ${n}`);
}

async function main() {
  console.log("\n=== Cleanup Investments trading activity (DEV nts only) ===\n");
  await assertDevDatabase(prisma, "cleanup:trading-activity");

  // ── Trade recon (3-way) ──────────────────────────────────────────────
  await del("tradeReconExceptions", () => prisma.investmentTradeReconException.deleteMany({}));
  await del("tradeReconLines", () => prisma.investmentTradeReconLine.deleteMany({}));
  await del("tradeReconBatches", () => prisma.investmentTradeReconBatch.deleteMany({}));

  // ── Collect LE trades + settlement JEs ───────────────────────────────
  const trades = await prisma.listedEquityTrade.findMany({
    select: { id: true },
  });
  const tradeIds: string[] = trades.map((t: { id: string }) => t.id);
  console.log(`listed_equity_trades: ${tradeIds.length}`);

  const settlements = await prisma.listedEquityTradeSettlement.findMany({
    where: tradeIds.length ? { tradeId: { in: tradeIds } } : undefined,
    select: { journalEntryId: true, cashbookEntryId: true },
  });
  const jeIds = [
    ...new Set(
      settlements.map((s: any) => s.journalEntryId).filter(Boolean) as string[]
    ),
  ];
  const cashbookIds = [
    ...new Set(
      settlements.map((s: any) => s.cashbookEntryId).filter(Boolean) as string[]
    ),
  ];

  // ── Orders + children ────────────────────────────────────────────────
  const orders = await prisma.investmentOrder.findMany({ select: { id: true, tradeId: true } });
  const orderIds: string[] = orders.map((o: { id: string }) => o.id);
  console.log(`investment_orders: ${orderIds.length}`);

  if (orderIds.length) {
    await del("brokerConfirmations", () =>
      prisma.investmentOrderBrokerConfirmation.deleteMany({ where: { orderId: { in: orderIds } } })
    );

    const orderTxns = await prisma.investmentTransaction.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true },
    });
    const orderTxnIds = orderTxns.map((t: { id: string }) => t.id);
    if (orderTxnIds.length) {
      await del("cashLedgerByTxn", () =>
        prisma.investmentCashLedgerEntry.deleteMany({
          where: { transactionId: { in: orderTxnIds } },
        })
      );
      await del("orderTransactions", () =>
        prisma.investmentTransaction.deleteMany({ where: { id: { in: orderTxnIds } } })
      );
    }

    const results = await prisma.investmentComplianceResult.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true },
    });
    const resultIds = results.map((r: { id: string }) => r.id);
    if (resultIds.length) {
      await del("complianceOverrides", () =>
        prisma.investmentComplianceOverride.deleteMany({
          where: { complianceResultId: { in: resultIds } },
        })
      );
      await del("complianceResults", () =>
        prisma.investmentComplianceResult.deleteMany({ where: { id: { in: resultIds } } })
      );
    }

    await del("complianceRunsByOrder", () =>
      prisma.investmentComplianceRun.deleteMany({ where: { orderId: { in: orderIds } } })
    );
    await del("orderExecutions", () =>
      prisma.investmentOrderExecution.deleteMany({ where: { orderId: { in: orderIds } } })
    );
    await del("orderRoutes", () =>
      prisma.investmentOrderRoute.deleteMany({ where: { orderId: { in: orderIds } } })
    );
    await del("orderPreviews", () =>
      prisma.investmentOrderPreview.deleteMany({ where: { orderId: { in: orderIds } } })
    );
    await del("orderRevisions", () =>
      prisma.investmentOrderRevision.deleteMany({ where: { orderId: { in: orderIds } } })
    );
    await del("orderStatusEvents", () =>
      prisma.investmentOrderStatusEvent.deleteMany({ where: { orderId: { in: orderIds } } })
    );
    await del("orderApprovals", () =>
      prisma.investmentOrderApproval.deleteMany({ where: { orderId: { in: orderIds } } })
    );
    await del("blotterItems", () =>
      prisma.investmentBlotterItem.deleteMany({ where: { orderId: { in: orderIds } } })
    );
    await del("docsByOrder", () =>
      prisma.investmentDocument.deleteMany({ where: { orderId: { in: orderIds } } })
    );
  }

  // Orphan confirmations / docs by trade
  await del("brokerConfirmationsAll", () =>
    prisma.investmentOrderBrokerConfirmation.deleteMany({})
  );
  if (tradeIds.length) {
    await del("docsByTrade", () =>
      prisma.investmentDocument.deleteMany({ where: { tradeId: { in: tradeIds } } })
    );
  }

  // Clear order.tradeId before deleting trades
  await del("ordersUnlinkTrade", () =>
    prisma.investmentOrder.updateMany({
      where: { tradeId: { not: null } },
      data: { tradeId: null },
    })
  );

  // ── Investment accounting events tied to orders/trades ───────────────
  let acctIds: string[] = [];
  try {
    const sourceIds = [...orderIds, ...tradeIds];
    const acctEvents = await prisma.investmentAccountingEvent.findMany({
      where: sourceIds.length
        ? {
            OR: [
              { sourceId: { in: sourceIds } },
              {
                sourceType: {
                  in: [
                    "ORDER",
                    "TRADE",
                    "ORDER_SETTLEMENT",
                    "TRADE_SETTLEMENT",
                    "LISTED_EQUITY_TRADE",
                  ],
                },
              },
            ],
          }
        : {
            sourceType: {
              in: [
                "ORDER",
                "TRADE",
                "ORDER_SETTLEMENT",
                "TRADE_SETTLEMENT",
                "LISTED_EQUITY_TRADE",
              ],
            },
          },
      select: { id: true, journalEntryId: true, reversalJournalEntryId: true },
    });
    acctIds = acctEvents.map((e: { id: string }) => e.id);
    for (const e of acctEvents) {
      if (e.journalEntryId && !jeIds.includes(e.journalEntryId)) jeIds.push(e.journalEntryId);
      if (e.reversalJournalEntryId && !jeIds.includes(e.reversalJournalEntryId)) {
        jeIds.push(e.reversalJournalEntryId);
      }
    }
  } catch (e: any) {
    console.warn(`[skip] acctEvents lookup: ${String(e?.message || e).slice(0, 120)}`);
  }
  if (acctIds.length) {
    await del("acctWorkflows", () =>
      prisma.investmentAccountingJournalWorkflow.deleteMany({
        where: { accountingEventId: { in: acctIds } },
      })
    );
    await del("acctReversals", () =>
      prisma.investmentAccountingReversal.deleteMany({
        where: { accountingEventId: { in: acctIds } },
      })
    );
    await del("acctExportLinks", () =>
      prisma.investmentAccountingExportLink.deleteMany({
        where: { accountingEventId: { in: acctIds } },
      })
    );
    await del("acctEvents", () =>
      prisma.investmentAccountingEvent.deleteMany({ where: { id: { in: acctIds } } })
    );
  }

  // ── LE trades ────────────────────────────────────────────────────────
  if (tradeIds.length) {
    await del("cashHolds", () =>
      prisma.listedEquityCashHold.deleteMany({ where: { tradeId: { in: tradeIds } } })
    );
    await del("tradeSettlements", () =>
      prisma.listedEquityTradeSettlement.deleteMany({ where: { tradeId: { in: tradeIds } } })
    );
    await del("routingHops", () =>
      prisma.listedEquityTradeRoutingHop.deleteMany({ where: { tradeId: { in: tradeIds } } })
    );
    await del("trades", () =>
      prisma.listedEquityTrade.deleteMany({ where: { id: { in: tradeIds } } })
    );
  } else {
    await del("cashHoldsAll", () => prisma.listedEquityCashHold.deleteMany({}));
    await del("tradeSettlementsAll", () => prisma.listedEquityTradeSettlement.deleteMany({}));
    await del("routingHopsAll", () => prisma.listedEquityTradeRoutingHop.deleteMany({}));
    await del("tradesAll", () => prisma.listedEquityTrade.deleteMany({}));
  }

  // Holding lots/positions are trade outcomes — reset so books match empty blotter
  await del("holdingLots", () => prisma.listedEquityHoldingLot.deleteMany({}));
  await del("holdings", () => prisma.listedEquityHolding.deleteMany({}));

  // ── Orders (after children) ──────────────────────────────────────────
  await del("orders", () => prisma.investmentOrder.deleteMany({}));
  await del("orphanBlotterItems", () => prisma.investmentBlotterItem.deleteMany({}));
  await del("blotters", () => prisma.investmentBlotter.deleteMany({}));

  // ── GL journal entries from trade settlement ─────────────────────────
  if (jeIds.length) {
    await del("journalLines", () =>
      prisma.journalEntryLine.deleteMany({ where: { journalEntryId: { in: jeIds } } })
    );
    await del("journalEntries", () =>
      prisma.journalEntry.deleteMany({ where: { id: { in: jeIds } } })
    );
  }

  if (cashbookIds.length) {
    await del("cashbookEntries", () =>
      prisma.cashbookEntry.deleteMany({ where: { id: { in: cashbookIds } } })
    );
  }

  // ── SP cash journals linked to trades ────────────────────────────────
  if (tradeIds.length) {
    const journals = await prisma.spCashJournal
      .findMany({
        where: {
          OR: [
            { tradeId: { in: tradeIds } },
            { sourceEventId: { in: tradeIds } },
          ],
        },
        select: { id: true },
      })
      .catch(() => []);
    const jIds = journals.map((j: { id: string }) => j.id);
    if (jIds.length) {
      await del("spJournalLines", () =>
        prisma.spCashJournalLine.deleteMany({ where: { journalId: { in: jIds } } })
      );
      await del("spJournals", () =>
        prisma.spCashJournal.deleteMany({ where: { id: { in: jIds } } })
      );
    }
  }

  await clearDispatchMocks();

  // ── Counts after ─────────────────────────────────────────────────────
  const [o, t, h] = await Promise.all([
    prisma.investmentOrder.count(),
    prisma.listedEquityTrade.count(),
    prisma.listedEquityHolding.count(),
  ]);
  console.log(`\nRemaining: orders=${o} trades=${t} holdings=${h}`);
  console.log("Kept: funds, portfolios, instruments, securities, prices, cash accounts, stakeholders.");
  console.log("Done.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
