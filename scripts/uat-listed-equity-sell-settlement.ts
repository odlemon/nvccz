/**
 * UAT — sell settlement, realized P&L, trade/hop status reconciliation.
 * Run: npm run uat:investments:sell-settlement
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { TradeOrchestratorService } from "../src/services/listedEquity/TradeOrchestratorService";
import { ListedEquityPortfolioService } from "../src/services/listedEquity/ListedEquityPortfolioService";
import { WacCalculatorService } from "../src/services/listedEquity/WacCalculatorService";

const COA_MAPPING = {
  listedSecuritiesAsset: "1501",
  bankClearing: "1100",
  realizedGain: "4010",
  realizedLoss: "5200",
};

type Step = { name: string; ok: boolean; detail: string };
const steps: Step[] = [];

function step(name: string, ok: boolean, detail: string) {
  steps.push({ name, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}

async function ensureCoaCodes() {
  for (const code of Object.values(COA_MAPPING)) {
    const row = await prisma.chartOfAccounts.findFirst({ where: { accountNo: code } });
    if (!row) throw new Error(`Missing COA account ${code}`);
  }
}

async function ensureZwgCurrency() {
  let c = await prisma.currency.findFirst({ where: { code: "ZWG" } });
  if (!c) {
    c = await prisma.currency.create({
      data: { code: "ZWG", name: "Zimbabwe Gold", symbol: "ZWG", isActive: true },
    });
  }
  return c;
}

async function confirmAllHops(tradeId: string, userId: string) {
  for (const target of ["BROKER", "CUSTODIAN", "CORE_BANKING", "ACCOUNTING_GL"]) {
    let hop = await prisma.listedEquityTradeRoutingHop.findFirst({
      where: { tradeId, target },
    });
    if (!hop || hop.status === "CONFIRMED") continue;
    await TradeOrchestratorService.confirmHop(hop.id, userId, `UAT-${target}`);
    hop = await prisma.listedEquityTradeRoutingHop.findFirst({ where: { tradeId, target } });
    if (hop?.status !== "CONFIRMED") {
      throw new Error(`${target} hop not CONFIRMED after confirm (status=${hop?.status})`);
    }
  }
}

/** Internal settlement: execute alone should settle bank + GL (custodian skipped). */
async function assertAutoSettled(tradeId: string, label: string) {
  const trade = await TradeOrchestratorService.getTradeDetail(tradeId);
  const custodian = trade?.routingHops.find((h) => h.target === "CUSTODIAN");
  const bank = trade?.routingHops.find((h) => h.target === "CORE_BANKING");
  const gl = trade?.routingHops.find((h) => h.target === "ACCOUNTING_GL");

  step(
    `${label} custodian skipped`,
    custodian?.status === "CONFIRMED" && custodian.externalRef === "SKIPPED_INTERNAL",
    `status=${custodian?.status} ref=${custodian?.externalRef}`
  );
  step(
    `${label} bank hop CONFIRMED`,
    bank?.status === "CONFIRMED",
    `status=${bank?.status}`
  );
  step(
    `${label} GL hop CONFIRMED`,
    gl?.status === "CONFIRMED" && Boolean(trade?.settlement?.journalEntryId),
    `status=${gl?.status} je=${trade?.settlement?.journalEntryId}`
  );
  step(`${label} trade SETTLED`, trade?.status === "SETTLED", `status=${trade?.status}`);
  return trade;
}

async function repairExistingTrades() {
  const trades = await prisma.listedEquityTrade.findMany({
    where: { status: { in: ["ROUTING", "SETTLED", "EXECUTED"] } },
    select: { id: true },
  });
  for (const t of trades) {
    await TradeOrchestratorService.reconcileTradeSettlementState(t.id);
  }
}

async function main() {
  await ensureCoaCodes();
  await ensureZwgCurrency();
  await repairExistingTrades();

  const admin = await prisma.user.findFirst({
    where: { email: process.env.UAT_EMAIL ?? "admin@nts.com" },
    include: { role: true },
  });
  if (!admin) throw new Error("Admin user not found");
  step("admin user", true, admin.id);

  const fund = await prisma.fund.findFirst({ orderBy: { createdAt: "asc" } });
  const bank = await prisma.bank.findFirst({ orderBy: { createdAt: "asc" } });
  if (!fund || !bank) throw new Error("Need fund + bank");

  let broker = await prisma.listedEquityStakeholderProfile.findFirst({
    where: { profileType: "BROKER", name: { contains: "UAT" } },
  });
  if (!broker) {
    broker = await prisma.listedEquityStakeholderProfile.create({
      data: { profileType: "BROKER", name: "UAT Sell Broker", contactEmail: "broker-uat@test.local" },
    });
  }
  let custodian = await prisma.listedEquityStakeholderProfile.findFirst({
    where: { profileType: "CUSTODIAN", name: { contains: "UAT" } },
  });
  if (!custodian) {
    custodian = await prisma.listedEquityStakeholderProfile.create({
      data: { profileType: "CUSTODIAN", name: "UAT Sell Custodian", contactEmail: "custodian-uat@test.local" },
    });
  }

  await prisma.listedEquityFundConfig.upsert({
    where: { fundId: fund.id },
    create: {
      fundId: fund.id,
      trustBankId: bank.id,
      brokerProfileId: broker.id,
      custodianProfileId: custodian.id,
      coaMappingJson: COA_MAPPING,
    },
    update: {
      trustBankId: bank.id,
      brokerProfileId: broker.id,
      custodianProfileId: custodian.id,
      coaMappingJson: COA_MAPPING,
    },
  });
  step("fund config + COA", true, fund.id);

  const symbol = `SEL${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const security = await prisma.listedEquitySecurity.create({
    data: {
      symbol,
      exchangeCode: "ZSE",
      name: `Sell UAT ${symbol}`,
      listingCurrencyCode: "ZWG",
      isActive: true,
    },
  });
  step("security", true, security.id);

  const buyQty = 1000;
  const buyPrice = 6.4936;
  const sellQty = 500;
  const sellPrice = 7.0;
  const expectedRealized = WacCalculatorService.realizedPnl(sellQty, sellPrice, buyPrice);

  const buy = await TradeOrchestratorService.createDraft({
    fundId: fund.id,
    securityId: security.id,
    side: "BUY",
    quantity: buyQty,
    executionPrice: buyPrice,
    executionCurrencyCode: "ZWG",
    fees: 0,
  });
  await TradeOrchestratorService.execute(buy.id, admin.id);
  const buyFinal = await assertAutoSettled(buy.id, "buy");
  const buyGl = buyFinal?.routingHops.find((h) => h.target === "ACCOUNTING_GL");
  step(
    "buy settled",
    buyFinal?.status === "SETTLED" && buyGl?.status === "CONFIRMED",
    `trade=${buyFinal?.status} glHop=${buyGl?.status}`
  );

  const sell = await TradeOrchestratorService.createDraft({
    fundId: fund.id,
    securityId: security.id,
    side: "SELL",
    quantity: sellQty,
    executionPrice: sellPrice,
    executionCurrencyCode: "ZWG",
    fees: 0,
  });
  await TradeOrchestratorService.execute(sell.id, admin.id);
  const sellFinal = await assertAutoSettled(sell.id, "sell");
  const sellSettlement = sellFinal?.settlement;
  const sellGl = sellFinal?.routingHops.find((h) => h.target === "ACCOUNTING_GL");
  const realized = sellSettlement?.realizedPnl != null ? Number(sellSettlement.realizedPnl) : null;

  step(
    "sell trade SETTLED",
    sellFinal?.status === "SETTLED",
    `status=${sellFinal?.status} settledAt=${sellFinal?.settledAt}`
  );
  step(
    "GL hop CONFIRMED (not STAGED)",
    sellGl?.status === "CONFIRMED" && Boolean(sellGl?.confirmedAt),
    `glStatus=${sellGl?.status} confirmedAt=${sellGl?.confirmedAt}`
  );
  step(
    "realized P&L on settlement",
    realized != null && Math.abs(realized - expectedRealized) < 0.01,
    `expected=${expectedRealized.toFixed(4)} actual=${realized}`
  );

  const holding = await prisma.listedEquityHolding.findUnique({
    where: { fundId_securityId: { fundId: fund.id, securityId: security.id } },
  });
  step(
    "holding qty after sell",
    holding != null && Number(holding.quantity) === buyQty - sellQty,
    `qty=${holding?.quantity} wac=${holding?.wac}`
  );

  const pnl = await ListedEquityPortfolioService.getPnl(fund.id, admin.id, admin);
  const realizedUsd = pnl.realized?.usd ?? 0;
  step(
    "portfolio getPnl returns realized",
    realizedUsd >= expectedRealized - 0.01,
    `realized.usd=${realizedUsd} (includes sell ${expectedRealized})`
  );

  const securityRealized = await prisma.listedEquityTradeSettlement.aggregate({
    where: { trade: { fundId: fund.id, securityId: security.id } },
    _sum: { realizedPnl: true },
  });
  const secSum = Number(securityRealized._sum.realizedPnl ?? 0);
  step(
    "realized P&L for test security only",
    Math.abs(secSum - expectedRealized) < 0.01,
    `sum=${secSum}`
  );

  if (sellSettlement?.journalEntryId) {
    const lines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId: sellSettlement.journalEntryId },
      include: { chartOfAccount: { select: { accountNo: true } } },
    });
    const gainLine = lines.find((l) => l.chartOfAccount.accountNo === COA_MAPPING.realizedGain);
    step(
      "sell JE gain line",
      gainLine != null && Number(gainLine.creditAmount) > 0,
      `gain credit=${gainLine?.creditAmount}`
    );
  }

  // Repair legacy trades from manual UAT
  for (const id of ["cmql1sy8k0002unt0swvm3ibb", "cmql2zsdk000fun402fwhk8g0"]) {
    const exists = await prisma.listedEquityTrade.findUnique({ where: { id } });
    if (!exists) continue;
    await TradeOrchestratorService.reconcileTradeSettlementState(id);
    const t = await TradeOrchestratorService.getTradeDetail(id);
    if (t?.status === "ROUTING" && t.side === "SELL") {
      try {
        await confirmAllHops(id, admin.id);
      } catch (e: any) {
        console.warn(`[REPAIR] could not fully settle ${id}: ${e.message}`);
      }
      await TradeOrchestratorService.reconcileTradeSettlementState(id);
      const t2 = await TradeOrchestratorService.getTradeDetail(id);
      console.log(
        `[REPAIR] ${id} status=${t2?.status} gl=${t2?.routingHops.find((h) => h.target === "ACCOUNTING_GL")?.status}`
      );
    } else {
      console.log(
        `[REPAIR] ${id} status=${t?.status} gl=${t?.routingHops.find((h) => h.target === "ACCOUNTING_GL")?.status}`
      );
    }
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(`\nSell settlement UAT: ${steps.length - failed.length}/${steps.length} passed`);
  if (failed.length) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
