/**
 * Point ZimFund listed-equity GL at COA rows that exist in this database.
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/fix-zimfund-listed-equity-coa.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const FUND_ID = "cmjfpk2g0000lktwmt25ni8p8";
const TRADE_ID = "cmql1sy8k0002unt0swvm3ibb";
const GL_HOP_ID = "cmql1ulir000cunt0oy2ueqz4";

/** Accounts verified present in chart_of_accounts */
const COA_MAPPING = {
  listedSecuritiesAsset: "1501", // Portfolio Investments
  bankClearing: "1100", // Bank
  realizedGain: "4010", // Investment Gains
  realizedLoss: "5200", // General Operating Expense
};

async function main() {
  for (const code of Object.values(COA_MAPPING)) {
    const row = await prisma.chartOfAccounts.findFirst({ where: { accountNo: code } });
    if (!row) throw new Error(`Missing COA ${code} — run chart of accounts setup first`);
    console.log(`OK ${code} — ${row.accountName}`);
  }

  const cfg = await prisma.listedEquityFundConfig.findUnique({ where: { fundId: FUND_ID } });
  if (!cfg) {
    throw new Error(`No listed_equity_fund_configs row for fund ${FUND_ID}`);
  }

  await prisma.listedEquityFundConfig.update({
    where: { fundId: FUND_ID },
    data: { coaMappingJson: COA_MAPPING },
  });
  console.log("Updated coaMappingJson on ZimFund");

  await prisma.listedEquityTradeRoutingHop.update({
    where: { id: GL_HOP_ID },
    data: {
      status: "STAGED",
      lastError: null,
      nextRetryAt: null,
      attemptCount: 0,
    },
  });
  await prisma.listedEquityTrade.update({
    where: { id: TRADE_ID },
    data: { status: "ROUTING" },
  });
  console.log("Reset GL hop to STAGED — retry POST .../routing-hops/{glHopId}/confirm");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
