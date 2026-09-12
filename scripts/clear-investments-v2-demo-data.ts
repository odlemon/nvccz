/**
 * Clear Investments V2 UAT junk + LISTED_EQUITY transactional demo volume (DEV nts only).
 * Keeps PE funds, real reference catalogs, users, banks.
 * Keeps "Arcus Listed Portfolio" fund shell (emptied) when present.
 *
 * Usage: npm run db:clear:investments-v2
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient() as any;
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
    /IO Report UAT/i.test(n) ||
    /@example\.com/i.test(n) ||
    /@test\.local/i.test(n)
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

async function del(label: string, fn: () => Promise<{ count: number }>) {
  try {
    const r = await fn();
    if (r.count) console.log(`[ok] ${label}: ${r.count}`);
  } catch (e: any) {
    console.warn(`[skip] ${label}: ${String(e?.message || e).slice(0, 140)}`);
  }
}

async function clearFundActivity(fundIds: string[]) {
  if (!fundIds.length) return;

  await del("reportRuns", () =>
    prisma.investmentReportRun.deleteMany({ where: { fundId: { in: fundIds } } })
  );

  const docs = await prisma.investmentDocument.findMany({
    where: { fundId: { in: fundIds } },
    select: { id: true },
  });
  const docIds = docs.map((d: { id: string }) => d.id);
  if (docIds.length) {
    await del("documentVersions", () =>
      prisma.investmentDocumentVersion.deleteMany({ where: { documentId: { in: docIds } } })
    );
    await del("documentAcls", () =>
      prisma.investmentDocumentAcl.deleteMany({ where: { documentId: { in: docIds } } })
    );
    await del("documentLinks", () =>
      prisma.investmentDocumentLink.deleteMany({ where: { documentId: { in: docIds } } })
    );
    await del("documents", () =>
      prisma.investmentDocument.deleteMany({ where: { id: { in: docIds } } })
    );
  }

  const acctEvents = await prisma.investmentAccountingEvent.findMany({
    where: { fundId: { in: fundIds } },
    select: { id: true },
  });
  const acctIds = acctEvents.map((e: { id: string }) => e.id);
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

  const batches = await prisma.investmentReconciliationBatch.findMany({
    where: { fundId: { in: fundIds } },
    select: { id: true },
  });
  const batchIds = batches.map((b: { id: string }) => b.id);
  if (batchIds.length) {
    const items = await prisma.investmentReconciliationItem.findMany({
      where: { batchId: { in: batchIds } },
      select: { id: true },
    });
    const itemIds = items.map((i: { id: string }) => i.id);
    if (itemIds.length) {
      await del("reconResolutions", () =>
        prisma.investmentReconciliationResolution.deleteMany({
          where: { itemId: { in: itemIds } },
        })
      );
      await del("reconItemHistory", () =>
        prisma.investmentReconciliationItemHistory.deleteMany({
          where: { itemId: { in: itemIds } },
        })
      );
      await del("reconItems", () =>
        prisma.investmentReconciliationItem.deleteMany({ where: { id: { in: itemIds } } })
      );
    }
    await del("reconBatches", () =>
      prisma.investmentReconciliationBatch.deleteMany({ where: { id: { in: batchIds } } })
    );
  }

  const valRuns = await prisma.investmentValuationRun.findMany({
    where: { fundId: { in: fundIds } },
    select: { id: true },
  });
  const valIds = valRuns.map((v: { id: string }) => v.id);
  if (valIds.length) {
    await del("valInputSnapshots", () =>
      prisma.investmentValuationInputSnapshot.deleteMany({
        where: { valuationRunId: { in: valIds } },
      })
    );
    await del("valItemSnapshots", () =>
      prisma.investmentValuationItemSnapshot.deleteMany({
        where: { valuationRunId: { in: valIds } },
      })
    );
    await del("valExceptions", () =>
      prisma.investmentValuationException.deleteMany({
        where: { valuationRunId: { in: valIds } },
      })
    );
    await del("valRuns", () =>
      prisma.investmentValuationRun.deleteMany({ where: { id: { in: valIds } } })
    );
  }

  await del("leValSnapshots", () =>
    prisma.listedEquityValuationSnapshot.deleteMany({ where: { fundId: { in: fundIds } } })
  );

  const orders = await prisma.investmentOrder.findMany({
    where: { fundId: { in: fundIds } },
    select: { id: true },
  });
  const orderIds = orders.map((o: { id: string }) => o.id);
  if (orderIds.length) {
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
    } else {
      await del("orphanComplianceOverrides", () =>
        prisma.investmentComplianceOverride.deleteMany({})
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
    await del("orders", () => prisma.investmentOrder.deleteMany({ where: { id: { in: orderIds } } }));
  }

  await del("complianceRuns", () =>
    prisma.investmentComplianceRun.deleteMany({ where: { fundId: { in: fundIds } } })
  );

  const portfolioConfigs = await prisma.investmentPortfolioConfig.findMany({
    where: { fundId: { in: fundIds } },
    select: { id: true },
  });
  const portfolioConfigIds = portfolioConfigs.map((c: { id: string }) => c.id);
  if (portfolioConfigIds.length) {
    const cashAccts = await prisma.investmentCashAccount.findMany({
      where: { portfolioConfigId: { in: portfolioConfigIds } },
      select: { id: true },
    });
    const cashIds = cashAccts.map((a: { id: string }) => a.id);
    if (cashIds.length) {
      await del("cashLedger", () =>
        prisma.investmentCashLedgerEntry.deleteMany({ where: { cashAccountId: { in: cashIds } } })
      );
      await del("ioCashAccounts", () =>
        prisma.investmentCashAccount.deleteMany({ where: { id: { in: cashIds } } })
      );
    }
  }

  const fundTxns = await prisma.investmentTransaction.findMany({
    where: { fundId: { in: fundIds } },
    select: { id: true },
  });
  const fundTxnIds = fundTxns.map((t: { id: string }) => t.id);
  if (fundTxnIds.length) {
    await del("cashLedgerByFundTxn", () =>
      prisma.investmentCashLedgerEntry.deleteMany({
        where: { transactionId: { in: fundTxnIds } },
      })
    );
  }
  await del("transactions", () =>
    prisma.investmentTransaction.deleteMany({ where: { fundId: { in: fundIds } } })
  );
  const blotters = await prisma.investmentBlotter.findMany({
    where: { fundId: { in: fundIds } },
    select: { id: true },
  });
  const blotterIds = blotters.map((b: { id: string }) => b.id);
  if (blotterIds.length) {
    await del("blotterItemsByBlotter", () =>
      prisma.investmentBlotterItem.deleteMany({ where: { blotterId: { in: blotterIds } } })
    );
    await del("blotters", () =>
      prisma.investmentBlotter.deleteMany({ where: { id: { in: blotterIds } } })
    );
  }

  const rebal = await prisma.investmentRebalanceRun.findMany({
    where: { fundId: { in: fundIds } },
    select: { id: true },
  });
  const rebalIds = rebal.map((r: { id: string }) => r.id);
  if (rebalIds.length) {
    await del("rebalanceItems", () =>
      prisma.investmentRebalanceItem.deleteMany({ where: { runId: { in: rebalIds } } })
    );
    await del("rebalanceRuns", () =>
      prisma.investmentRebalanceRun.deleteMany({ where: { id: { in: rebalIds } } })
    );
  }

  const trades = await prisma.listedEquityTrade.findMany({
    where: { fundId: { in: fundIds } },
    select: { id: true },
  });
  const tradeIds = trades.map((t: { id: string }) => t.id);
  if (tradeIds.length) {
    await del("cashHolds", () =>
      prisma.listedEquityCashHold.deleteMany({ where: { tradeId: { in: tradeIds } } })
    );
    await del("tradeSettlements", () =>
      prisma.listedEquityTradeSettlement.deleteMany({ where: { tradeId: { in: tradeIds } } })
    );
    await del("tradeHops", () =>
      prisma.listedEquityTradeRoutingHop.deleteMany({ where: { tradeId: { in: tradeIds } } })
    );
    await del("trades", () => prisma.listedEquityTrade.deleteMany({ where: { id: { in: tradeIds } } }));
  }

  await del("holdingLots", () =>
    prisma.listedEquityHoldingLot.deleteMany({ where: { fundId: { in: fundIds } } })
  );
  await del("holdings", () =>
    prisma.listedEquityHolding.deleteMany({ where: { fundId: { in: fundIds } } })
  );
  await del("simulations", () =>
    prisma.investmentSimulationRun.deleteMany({ where: { fundId: { in: fundIds } } })
  );
}

async function clearSpCashForPortfolios(portfolioIds: string[]) {
  if (!portfolioIds.length) return;
  const accounts = await prisma.spCashClientAccount.findMany({
    where: {
      OR: [{ portfolioId: { in: portfolioIds } }, { clientName: { contains: "Sunrise" } }, { clientName: { contains: "Client B" } }],
    },
    select: { id: true },
  });
  const ids = accounts.map((a: { id: string }) => a.id);
  if (!ids.length) return;

  const imports = await prisma.spCashStatementImport.findMany({
    where: { cashAccountId: { in: ids } },
    select: { id: true },
  });
  const importIds = imports.map((i: { id: string }) => i.id);
  if (importIds.length) {
    const stmts = await prisma.spCashExternalStatement.findMany({
      where: { importId: { in: importIds } },
      select: { id: true },
    });
    const stmtIds = stmts.map((s: { id: string }) => s.id);
    if (stmtIds.length) {
      await del("spStmtLines", () =>
        prisma.spCashExternalStatementLine.deleteMany({ where: { statementId: { in: stmtIds } } })
      );
      await del("spStmts", () =>
        prisma.spCashExternalStatement.deleteMany({ where: { id: { in: stmtIds } } })
      );
    }
    await del("spImports", () =>
      prisma.spCashStatementImport.deleteMany({ where: { id: { in: importIds } } })
    );
  }

  const batches = await prisma.spCashReconciliationBatch.findMany({
    where: { cashAccountId: { in: ids } },
    select: { id: true },
  });
  const batchIds = batches.map((b: { id: string }) => b.id);
  if (batchIds.length) {
    await del("spMatchLinks", () =>
      prisma.spCashMatchLink.deleteMany({ where: { batchId: { in: batchIds } } })
    );
    await del("spBreaks", () =>
      prisma.spCashReconciliationBreak.deleteMany({ where: { batchId: { in: batchIds } } })
    );
    await del("spExceptions", () =>
      prisma.spCashReconciliationException.deleteMany({ where: { batchId: { in: batchIds } } })
    );
    await del("spBatches", () =>
      prisma.spCashReconciliationBatch.deleteMany({ where: { id: { in: batchIds } } })
    );
  }

  const journals = await prisma.spCashJournal.findMany({
    where: { cashAccountId: { in: ids } },
    select: { id: true },
  });
  const jIds = journals.map((j: { id: string }) => j.id);
  if (jIds.length) {
    await del("spJournalLines", () =>
      prisma.spCashJournalLine.deleteMany({ where: { journalId: { in: jIds } } })
    );
    await del("spJournals", () => prisma.spCashJournal.deleteMany({ where: { id: { in: jIds } } }));
  }

  await del("spReservations", () =>
    prisma.spCashReservation.deleteMany({ where: { cashAccountId: { in: ids } } })
  );
  await del("spExpectations", () =>
    prisma.spCashExpectation.deleteMany({ where: { cashAccountId: { in: ids } } })
  );
  await del("spMappings", () =>
    prisma.spCashAccountMapping.deleteMany({ where: { cashAccountId: { in: ids } } })
  );
  await del("spBrokerCustodianItems", () =>
    prisma.spCashBrokerCustodianItem.deleteMany({ where: { portfolioId: { in: portfolioIds } } })
  );
  await del("spClientAccounts", () =>
    prisma.spCashClientAccount.deleteMany({ where: { id: { in: ids } } })
  );
}

async function deleteFundShell(fundIds: string[]) {
  if (!fundIds.length) return;

  const rules = await prisma.investmentComplianceRule.findMany({
    where: { fundId: { in: fundIds } },
    select: { id: true },
  });
  const ruleIds = rules.map((r: { id: string }) => r.id);
  if (ruleIds.length) {
    await del("portfolioLimits", () =>
      prisma.investmentPortfolioLimit.deleteMany({ where: { complianceRuleId: { in: ruleIds } } })
    );
    await del("complianceRules", () =>
      prisma.investmentComplianceRule.deleteMany({ where: { id: { in: ruleIds } } })
    );
  }

  const configs = await prisma.investmentPortfolioConfig.findMany({
    where: { fundId: { in: fundIds } },
    select: { id: true },
  });
  const configIds = configs.map((c: { id: string }) => c.id);
  if (configIds.length) {
    await del("portfolioLimitsByConfig", () =>
      prisma.investmentPortfolioLimit.deleteMany({ where: { portfolioConfigId: { in: configIds } } })
    );
    await del("portfolioAssignments", () =>
      prisma.investmentPortfolioAssignment.deleteMany({
        where: { portfolioConfigId: { in: configIds } },
      })
    );
  }
  await del("portfolioFolders", () =>
    prisma.investmentPortfolioFolder.deleteMany({ where: { fundId: { in: fundIds } } })
  );
  await del("portfolioConfigs", () =>
    prisma.investmentPortfolioConfig.deleteMany({ where: { fundId: { in: fundIds } } })
  );
  await del("portfolioAccess", () =>
    prisma.investmentPortfolioAccessCapability.deleteMany({ where: { fundId: { in: fundIds } } })
  );
  await del("reconSources", () =>
    prisma.investmentReconciliationSource.deleteMany({ where: { fundId: { in: fundIds } } })
  );

  const models = await prisma.investmentModelPortfolio.findMany({
    where: { linkedFundId: { in: fundIds } },
    select: { id: true },
  });
  const modelIds = models.map((m: { id: string }) => m.id);
  if (modelIds.length) {
    const versions = await prisma.investmentModelPortfolioVersion.findMany({
      where: { modelPortfolioId: { in: modelIds } },
      select: { id: true },
    });
    const versionIds = versions.map((v: { id: string }) => v.id);
    if (versionIds.length) {
      await del("modelVersionAllocs", () =>
        prisma.investmentModelPortfolioVersionAllocation.deleteMany({
          where: { versionId: { in: versionIds } },
        })
      );
      await del("modelVersions", () =>
        prisma.investmentModelPortfolioVersion.deleteMany({ where: { id: { in: versionIds } } })
      );
    }
    await del("modelAllocs", () =>
      prisma.investmentModelPortfolioAllocation.deleteMany({
        where: { modelPortfolioId: { in: modelIds } },
      })
    );
    await del("modelPortfolios", () =>
      prisma.investmentModelPortfolio.deleteMany({ where: { id: { in: modelIds } } })
    );
  }

  await prisma.listedEquityFundConfig.updateMany({
    where: { fundId: { in: fundIds } },
    data: { brokerProfileId: null, custodianProfileId: null },
  });
  await del("fundSigningKeys", () =>
    prisma.listedEquityFundSigningKey.deleteMany({
      where: { fundConfig: { fundId: { in: fundIds } } },
    })
  );
  await del("leFundConfigs", () =>
    prisma.listedEquityFundConfig.deleteMany({ where: { fundId: { in: fundIds } } })
  );
  await del("fundManagers", () => prisma.fundManager.deleteMany({ where: { fundId: { in: fundIds } } }));

  // Detach fundraising campaigns (Restrict FK) instead of cascading delete
  try {
    const detached = await prisma.fundraisingCampaign.updateMany({
      where: { fundId: { in: fundIds } },
      data: { fundId: null },
    });
    if (detached.count) console.log(`[ok] detached fundraisingCampaigns: ${detached.count}`);
  } catch (e: any) {
    console.warn(`[skip] detach fundraisingCampaigns: ${String(e?.message || e).slice(0, 140)}`);
  }
  await del("investmentCommitments", () =>
    prisma.investmentCommitment.deleteMany({ where: { fundId: { in: fundIds } } })
  );
  await del("funds", () => prisma.fund.deleteMany({ where: { id: { in: fundIds } } }));
}

async function main() {
  console.log("Clearing Investments V2 UAT + excess listed-equity demo (nts)…\n");
  await assertDevDatabase(prisma, "clear:investments-v2");

  const allLe = await prisma.fund.findMany({
    where: { fundPurpose: "LISTED_EQUITY" },
    select: { id: true, name: true },
  });
  const keep = allLe.find((f: { name: string }) => f.name === KEEP_FUND_NAME);
  const dropFunds = allLe.filter((f: { id: string; name: string }) => f.id !== keep?.id);
  const allLeIds = allLe.map((f: { id: string }) => f.id);

  console.log(`[info] LISTED_EQUITY funds: ${allLe.length} (keep=${keep?.name ?? "none"})`);
  for (const f of dropFunds) console.log(`  drop ${f.name} (${f.id})`);

  // Report file cleanup
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
  await del("allReportRuns", () => prisma.investmentReportRun.deleteMany({}));
  const reportDir = path.join(process.cwd(), "storage", "local-upload-mock", "investment-ops-reports");
  if (fs.existsSync(reportDir)) {
    for (const f of fs.readdirSync(reportDir)) {
      try {
        fs.unlinkSync(path.join(reportDir, f));
      } catch {
        /* ignore */
      }
    }
  }

  await clearSpCashForPortfolios(allLeIds);
  await clearFundActivity(allLeIds);

  if (dropFunds.length) {
    await deleteFundShell(dropFunds.map((f: { id: string }) => f.id));
  }

  // Empty keep fund shell children that block a clean reseed of rules/config
  if (keep) {
    await del("keepComplianceRules", () =>
      prisma.investmentComplianceRule.deleteMany({ where: { fundId: keep.id } })
    );
  }

  // Junk securities / instruments / stakeholders
  const allSecs = await prisma.listedEquitySecurity.findMany({
    select: { id: true, symbol: true, name: true },
  });
  const junkSecIds = allSecs
    .filter((s: { symbol: string; name: string }) => isJunkSymbol(s.symbol) || isJunkName(s.name))
    .map((s: { id: string }) => s.id);
  if (junkSecIds.length) {
    await del("junkTicks", () =>
      prisma.listedEquityPriceTick.deleteMany({ where: { securityId: { in: junkSecIds } } })
    );
    await del("junkVendorSyms", () =>
      prisma.listedEquitySecurityVendorSymbol.deleteMany({
        where: { securityId: { in: junkSecIds } },
      })
    );
    await prisma.investmentInstrument.updateMany({
      where: { listedEquitySecurityId: { in: junkSecIds } },
      data: { listedEquitySecurityId: null },
    });
    await del("junkSecs", () =>
      prisma.listedEquitySecurity.deleteMany({ where: { id: { in: junkSecIds } } })
    );
  }

  const junkInstruments = await prisma.investmentInstrument.findMany({
    where: {
      OR: [
        { shortName: { startsWith: "SwaggerVerify" } },
        { shortName: { startsWith: "UAT" } },
        { ticker: { startsWith: "SV" } },
        { ticker: { startsWith: "UAT" } },
        { instrumentCode: { startsWith: "SV" } },
        { instrumentCode: { startsWith: "UAT" } },
      ],
    },
    select: { id: true },
  });
  if (junkInstruments.length) {
    await del("junkInstruments", () =>
      prisma.investmentInstrument.deleteMany({
        where: { id: { in: junkInstruments.map((i: { id: string }) => i.id) } },
      })
    );
  }

  const stakeholders = await prisma.listedEquityStakeholderProfile.findMany({
    select: { id: true, name: true },
  });
  const junkStake = stakeholders.filter((s: { name: string }) => isJunkName(s.name)).map((s: { id: string }) => s.id);
  if (junkStake.length) {
    await prisma.listedEquityFundConfig.updateMany({
      where: { brokerProfileId: { in: junkStake } },
      data: { brokerProfileId: null },
    });
    await prisma.listedEquityFundConfig.updateMany({
      where: { custodianProfileId: { in: junkStake } },
      data: { custodianProfileId: null },
    });
    await del("junkCommissions", () =>
      prisma.investmentBrokerCommission.deleteMany({
        where: { stakeholderProfileId: { in: junkStake } },
      })
    );
    await del("junkStakeholders", () =>
      prisma.listedEquityStakeholderProfile.deleteMany({ where: { id: { in: junkStake } } })
    );
  }

  await del("swaggerRules", () =>
    prisma.investmentComplianceRule.deleteMany({ where: { ruleCode: { startsWith: "MAX_W_" } } })
  );
  await del("verifyModels", () =>
    prisma.investmentModelPortfolio.deleteMany({ where: { name: { startsWith: "Verify Model" } } })
  );

  const remaining = await prisma.fund.findMany({
    where: { fundPurpose: "LISTED_EQUITY" },
    select: { id: true, name: true },
  });
  console.log("\nRemaining LISTED_EQUITY funds:");
  for (const f of remaining) console.log(`  - ${f.name} (${f.id})`);
  console.log("\nClear complete. Next: npm run db:seed:investments-v2-demo");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
