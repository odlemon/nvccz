/**
 * Remove Investment Ops UAT / Swagger / Verify junk data.
 * Keeps Arcus Listed Portfolio, PE funds, instrument types, countries, market-data source configs.
 *
 * Usage: npm run db:cleanup:investment-ops-uat
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const KEEP_FUND_NAME = "Arcus Listed Portfolio";

function isJunkName(name: string | null | undefined): boolean {
  if (!name) return true;
  const n = name.trim();
  if (!n || n.toLowerCase() === "string") return true;
  return (
    /^UAT\b/i.test(n) ||
    /UAT Listed Fund/i.test(n) ||
    /^SwaggerVerify/i.test(n) ||
    /^Verify\b/i.test(n) ||
    /^Sell UAT/i.test(n) ||
    /io-report-uat/i.test(n) ||
    /IO Report UAT/i.test(n)
  );
}

function isJunkSymbol(symbol: string | null | undefined): boolean {
  if (!symbol) return false;
  const s = symbol.trim().toUpperCase();
  return (
    s === "TEST" ||
    s.startsWith("SV") ||
    s.startsWith("UAT") ||
    s.startsWith("TRD") ||
    s.startsWith("SEL") ||
    /^V\d{10,}$/.test(s)
  );
}

async function main() {
  console.log("Investment Ops UAT cleanup starting…\n");

  const allLeFunds = await prisma.fund.findMany({
    where: { fundPurpose: "LISTED_EQUITY" },
    select: { id: true, name: true },
  });
  const junkFundIds = allLeFunds
    .filter((f) => f.id && f.name !== KEEP_FUND_NAME && (isJunkName(f.name) || f.name === "string" || !f.name?.trim()))
    .map((f) => f.id);
  console.log(`[info] Junk LISTED_EQUITY funds: ${junkFundIds.length}`);
  for (const f of allLeFunds.filter((x) => junkFundIds.includes(x.id))) {
    console.log(`  - ${f.name} (${f.id})`);
  }

  const keepFund = allLeFunds.find((f) => f.name === KEEP_FUND_NAME);
  const keepFundId = keepFund?.id;

  const junkSecurities = await prisma.listedEquitySecurity.findMany({
    where: {
      OR: [
        { symbol: { startsWith: "UAT" } },
        { symbol: { startsWith: "TRD" } },
        { symbol: { startsWith: "SEL" } },
        { symbol: { startsWith: "SV" } },
        { symbol: "TEST" },
        { name: { startsWith: "UAT" } },
        { name: { startsWith: "Sell UAT" } },
        { name: { startsWith: "Swagger" } },
      ],
    },
    select: { id: true, symbol: true, name: true },
  });
  // Also catch any remaining by helper
  const allSecs = await prisma.listedEquitySecurity.findMany({ select: { id: true, symbol: true, name: true } });
  const junkSecIds = new Set([
    ...junkSecurities.map((s) => s.id),
    ...allSecs.filter((s) => isJunkSymbol(s.symbol) || isJunkName(s.name)).map((s) => s.id),
  ]);
  console.log(`[info] Junk securities: ${junkSecIds.size}`);

  const junkInstruments = await prisma.investmentInstrument.findMany({
    where: {
      OR: [
        { shortName: { startsWith: "SwaggerVerify" } },
        { shortName: { startsWith: "UAT" } },
        { ticker: { startsWith: "SV" } },
        { ticker: { startsWith: "UAT" } },
        { instrumentCode: { startsWith: "SV" } },
      ],
    },
    select: { id: true, shortName: true, ticker: true },
  });
  const junkInstrumentIds = junkInstruments.map((i) => i.id);
  console.log(`[info] Junk instruments: ${junkInstrumentIds.length}`);

  const allStakeholders = await prisma.listedEquityStakeholderProfile.findMany({
    select: { id: true, name: true },
  });
  const junkStakeholderIds = allStakeholders.filter((s) => isJunkName(s.name)).map((s) => s.id);
  console.log(`[info] Junk stakeholders: ${junkStakeholderIds.length}`);

  const junkMarkets = await prisma.investmentMarket.findMany({
    where: {
      OR: [{ marketName: { startsWith: "Verify" } }, { marketCode: { startsWith: "V" } }],
    },
    select: { id: true, marketCode: true, marketName: true },
  });
  // Only delete clearly verify markets (code like V1783…), not VFEX
  const junkMarketIds = junkMarkets
    .filter((m) => /^V\d/.test(m.marketCode) || isJunkName(m.marketName))
    .map((m) => m.id);
  console.log(`[info] Junk markets: ${junkMarketIds.length}`);

  const junkIssuers = await prisma.investmentIssuer.findMany({
    where: {
      OR: [{ legalName: { startsWith: "Verify" } }, { issuerCode: { startsWith: "V" } }],
    },
    select: { id: true, issuerCode: true, legalName: true },
  });
  const junkIssuerIds = junkIssuers
    .filter((i) => /^V\d/.test(i.issuerCode) || isJunkName(i.legalName))
    .map((i) => i.id);
  console.log(`[info] Junk issuers: ${junkIssuerIds.length}`);

  const junkClients = await prisma.client.findMany({
    where: {
      OR: [
        { legalName: { contains: "IO Report UAT" } },
        { email: { contains: "io-report-uat" } },
        { legalName: { startsWith: "UAT" } },
      ],
    },
    select: { id: true, legalName: true },
  });
  const junkClientIds = junkClients.map((c) => c.id);
  console.log(`[info] Junk clients: ${junkClientIds.length}`);

  // --- Report runs (all IO report history for clean demo) ---
  const reportRuns = await prisma.investmentReportRun.findMany({ select: { id: true, fileRef: true } });
  for (const r of reportRuns) {
    if (r.fileRef) {
      try {
        if (fs.existsSync(r.fileRef)) fs.unlinkSync(r.fileRef);
      } catch {
        /* ignore */
      }
    }
  }
  const reportsDeleted = await prisma.investmentReportRun.deleteMany({});
  console.log(`[ok] Deleted investment_report_runs: ${reportsDeleted.count}`);

  // Clear mock report dir leftovers
  const reportDir = path.join(process.cwd(), "storage", "local-upload-mock", "investment-ops-reports");
  if (fs.existsSync(reportDir)) {
    for (const f of fs.readdirSync(reportDir)) {
      try {
        fs.unlinkSync(path.join(reportDir, f));
      } catch {
        /* ignore */
      }
    }
    console.log(`[ok] Cleared ${reportDir}`);
  }

  // --- Fund-scoped junk (UAT funds) ---
  if (junkFundIds.length) {
    await prisma.investmentDocument.deleteMany({ where: { fundId: { in: junkFundIds } } });
    await prisma.investmentSimulationRun.deleteMany({ where: { fundId: { in: junkFundIds } } });
    await prisma.investmentAccountingEvent.deleteMany({ where: { fundId: { in: junkFundIds } } });

    const reconBatches = await prisma.investmentReconciliationBatch.findMany({
      where: { fundId: { in: junkFundIds } },
      select: { id: true },
    });
    if (reconBatches.length) {
      await prisma.investmentReconciliationItem.deleteMany({
        where: { batchId: { in: reconBatches.map((b) => b.id) } },
      });
      await prisma.investmentReconciliationBatch.deleteMany({ where: { fundId: { in: junkFundIds } } });
    }

    const valRuns = await prisma.investmentValuationRun.findMany({
      where: { fundId: { in: junkFundIds } },
      select: { id: true },
    });
    if (valRuns.length) {
      await prisma.investmentValuationException.deleteMany({
        where: { valuationRunId: { in: valRuns.map((v) => v.id) } },
      });
      await prisma.investmentValuationRun.deleteMany({ where: { fundId: { in: junkFundIds } } });
    }

    const orders = await prisma.investmentOrder.findMany({
      where: { fundId: { in: junkFundIds } },
      select: { id: true },
    });
    if (orders.length) {
      await prisma.investmentComplianceResult.deleteMany({
        where: { orderId: { in: orders.map((o) => o.id) } },
      });
      await prisma.investmentOrderApproval.deleteMany({
        where: { orderId: { in: orders.map((o) => o.id) } },
      });
      await prisma.investmentOrder.deleteMany({ where: { fundId: { in: junkFundIds } } });
    }

    await prisma.investmentComplianceRule.deleteMany({ where: { fundId: { in: junkFundIds } } });

    const trades = await prisma.listedEquityTrade.findMany({
      where: { fundId: { in: junkFundIds } },
      select: { id: true },
    });
    if (trades.length) {
      const tids = trades.map((t) => t.id);
      await prisma.listedEquityCashHold.deleteMany({ where: { tradeId: { in: tids } } });
      await prisma.listedEquityTradeSettlement.deleteMany({ where: { tradeId: { in: tids } } });
      await prisma.listedEquityTradeRoutingHop.deleteMany({ where: { tradeId: { in: tids } } });
      await prisma.listedEquityTrade.deleteMany({ where: { id: { in: tids } } });
    }

    await prisma.listedEquityHoldingLot.deleteMany({ where: { fundId: { in: junkFundIds } } });
    await prisma.listedEquityHolding.deleteMany({ where: { fundId: { in: junkFundIds } } });
    await prisma.listedEquityValuationSnapshot.deleteMany({ where: { fundId: { in: junkFundIds } } });

    // Detach stakeholder refs before deleting configs
    await prisma.listedEquityFundConfig.updateMany({
      where: { fundId: { in: junkFundIds } },
      data: { brokerProfileId: null, custodianProfileId: null },
    });
    await prisma.listedEquityFundSigningKey.deleteMany({
      where: { fundConfig: { fundId: { in: junkFundIds } } },
    });
    await prisma.listedEquityFundConfig.deleteMany({ where: { fundId: { in: junkFundIds } } });
    await prisma.fundManager.deleteMany({ where: { fundId: { in: junkFundIds } } });
    await prisma.fund.deleteMany({ where: { id: { in: junkFundIds } } });
    console.log(`[ok] Deleted ${junkFundIds.length} UAT listed-equity funds`);
  }

  // --- Swagger verify compliance rules (MAX_W_*) on keep fund ---
  const swaggerRules = await prisma.investmentComplianceRule.deleteMany({
    where: { ruleCode: { startsWith: "MAX_W_" } },
  });
  console.log(`[ok] Deleted swagger compliance rules: ${swaggerRules.count}`);

  // --- Junk instruments (orders may reference) ---
  if (junkInstrumentIds.length) {
    const ordersOnInst = await prisma.investmentOrder.findMany({
      where: { instrumentId: { in: junkInstrumentIds } },
      select: { id: true },
    });
    if (ordersOnInst.length) {
      const oids = ordersOnInst.map((o) => o.id);
      await prisma.investmentComplianceResult.deleteMany({ where: { orderId: { in: oids } } });
      await prisma.investmentOrderApproval.deleteMany({ where: { orderId: { in: oids } } });
      await prisma.investmentOrder.deleteMany({ where: { id: { in: oids } } });
    }
    await prisma.investmentInstrument.deleteMany({ where: { id: { in: junkInstrumentIds } } });
    console.log(`[ok] Deleted junk instruments: ${junkInstrumentIds.length}`);
  }

  // --- Junk securities and related ---
  const junkSecIdArr = [...junkSecIds];
  if (junkSecIdArr.length) {
    const trades = await prisma.listedEquityTrade.findMany({
      where: { securityId: { in: junkSecIdArr } },
      select: { id: true },
    });
    if (trades.length) {
      const tids = trades.map((t) => t.id);
      await prisma.listedEquityCashHold.deleteMany({ where: { tradeId: { in: tids } } });
      await prisma.listedEquityTradeSettlement.deleteMany({ where: { tradeId: { in: tids } } });
      await prisma.listedEquityTradeRoutingHop.deleteMany({ where: { tradeId: { in: tids } } });
      await prisma.listedEquityTrade.deleteMany({ where: { id: { in: tids } } });
    }
    await prisma.listedEquityHoldingLot.deleteMany({ where: { securityId: { in: junkSecIdArr } } });
    await prisma.listedEquityHolding.deleteMany({ where: { securityId: { in: junkSecIdArr } } });
    await prisma.listedEquityWatchlistEntry.deleteMany({ where: { securityId: { in: junkSecIdArr } } });
    await prisma.listedEquityPriceTick.deleteMany({ where: { securityId: { in: junkSecIdArr } } });
    await prisma.listedEquitySecurityVendorSymbol.deleteMany({ where: { securityId: { in: junkSecIdArr } } });
    await prisma.listedEquitySecurity.deleteMany({ where: { id: { in: junkSecIdArr } } });
    console.log(`[ok] Deleted junk securities: ${junkSecIdArr.length}`);
  }

  // --- Junk stakeholders (detach from keep fund first) ---
  if (junkStakeholderIds.length) {
    await prisma.listedEquityFundConfig.updateMany({
      where: { brokerProfileId: { in: junkStakeholderIds } },
      data: { brokerProfileId: null },
    });
    await prisma.listedEquityFundConfig.updateMany({
      where: { custodianProfileId: { in: junkStakeholderIds } },
      data: { custodianProfileId: null },
    });
    await prisma.investmentBrokerCommission.deleteMany({
      where: { stakeholderProfileId: { in: junkStakeholderIds } },
    });
    await prisma.listedEquityStakeholderProfile.deleteMany({ where: { id: { in: junkStakeholderIds } } });
    console.log(`[ok] Deleted junk stakeholders: ${junkStakeholderIds.length}`);
  }

  if (junkMarketIds.length) {
    await prisma.investmentMarket.deleteMany({ where: { id: { in: junkMarketIds } } });
    console.log(`[ok] Deleted junk markets: ${junkMarketIds.length}`);
  }

  if (junkIssuerIds.length) {
    await prisma.investmentInstrument.updateMany({
      where: { issuerId: { in: junkIssuerIds } },
      data: { issuerId: null },
    });
    await prisma.investmentIssuer.deleteMany({ where: { id: { in: junkIssuerIds } } });
    console.log(`[ok] Deleted junk issuers: ${junkIssuerIds.length}`);
  }

  // Verify* model portfolios
  const junkModels = await prisma.investmentModelPortfolio.deleteMany({
    where: { name: { startsWith: "Verify Model" } },
  });
  console.log(`[ok] Deleted verify model portfolios: ${junkModels.count}`);

  // Junk countries (X## verify)
  const junkCountries = await prisma.investmentCountry.findMany({
    where: { countryName: { startsWith: "Verify" } },
    select: { countryCode: true },
  });
  if (junkCountries.length) {
    await prisma.investmentCountry.deleteMany({
      where: { countryCode: { in: junkCountries.map((c) => c.countryCode) } },
    });
    console.log(`[ok] Deleted junk countries: ${junkCountries.length}`);
  }

  if (junkClientIds.length) {
    await prisma.investmentReportRun.deleteMany({ where: { clientId: { in: junkClientIds } } }).catch(() => null);
    // Soft: only delete if no critical FKs — try delete
    try {
      await prisma.client.deleteMany({ where: { id: { in: junkClientIds } } });
      console.log(`[ok] Deleted junk clients: ${junkClientIds.length}`);
    } catch (e: any) {
      console.log(`[warn] Could not delete some junk clients (FK): ${e.message?.slice(0, 120)}`);
    }
  }

  // Remaining LE funds should only be Arcus (+ any non-UAT)
  const remaining = await prisma.fund.findMany({
    where: { fundPurpose: "LISTED_EQUITY" },
    select: { id: true, name: true },
  });
  console.log("\nRemaining LISTED_EQUITY funds:");
  for (const f of remaining) console.log(`  - ${f.name} (${f.id})`);
  if (keepFundId) console.log(`\nKept canonical fund: ${KEEP_FUND_NAME} (${keepFundId})`);
  console.log("\nInvestment Ops UAT cleanup complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
