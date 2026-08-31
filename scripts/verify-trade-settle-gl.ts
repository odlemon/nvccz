import { prisma } from "../src/utils/database";
import { TradeOrchestratorService } from "../src/services/listedEquity/TradeOrchestratorService";
import { InvestmentOrderPhase2Service } from "../src/services/investmentOps/InvestmentOrderPhase2Service";

const tradeId = process.argv[2] || "cmsfs19490001unss5ch34ny6";

async function main() {
  const order = await prisma.investmentOrder.findFirst({ where: { tradeId } });
  if (!order) throw new Error("order not found");

  const user = await prisma.user.findFirst();
  if (!user) throw new Error("user not found");

  console.log("Posting GL...");
  const journalEntryId = await TradeOrchestratorService.ensureSettlementPosted(tradeId, user.id);
  console.log("journalEntryId", journalEntryId);

  console.log("Order accounting...");
  await InvestmentOrderPhase2Service.ensureOrderSettlementAccounting(
    order.id,
    `verify-settle:${tradeId}`,
    user.id
  );

  const settlement = await prisma.listedEquityTradeSettlement.findUnique({ where: { tradeId } });
  const je = settlement?.journalEntryId
    ? await prisma.journalEntry.findUnique({
        where: { id: settlement.journalEntryId },
        include: { journalEntryLines: { include: { chartOfAccount: true } } },
      })
    : null;
  const event = await prisma.investmentAccountingEvent.findFirst({
    where: { sourceId: tradeId, sourceType: "LISTED_EQUITY_TRADE" },
  });

  console.log(
    JSON.stringify(
      {
        journalRef: je?.referenceNumber,
        journalStatus: je?.status,
        lineCount: je?.journalEntryLines?.length,
        lines: je?.journalEntryLines?.map((l) => ({
          account: l.chartOfAccount?.accountNo,
          debit: String(l.debitAmount),
          credit: String(l.creditAmount),
        })),
        accountingEvent: event
          ? { id: event.id, status: event.status, journalEntryId: event.journalEntryId }
          : null,
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
  .finally(() => prisma.$disconnect());
