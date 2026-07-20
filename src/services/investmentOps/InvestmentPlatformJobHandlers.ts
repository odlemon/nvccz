// @ts-nocheck
/**
 * Phase 4 platform job handlers for durable Investment Ops work.
 * Handlers for VALUATION_RUN / RECONCILIATION_* are registered by their domain services.
 */
import {
  InvestmentJobWorkerService,
  registerInvestmentJobHandler,
} from "./InvestmentJobWorkerService";
import { InvestmentOutboxService } from "./InvestmentOutboxService";
import { InvestmentAuditEventService } from "./InvestmentAuditEventService";
import { prisma } from "../../utils/database";

const db = prisma as any;
let registered = false;

async function safeImport<T>(loader: () => Promise<T>): Promise<T | null> {
  try {
    return await loader();
  } catch {
    return null;
  }
}

export function ensureInvestmentPlatformJobHandlersRegistered() {
  if (registered) return;
  registered = true;

  registerInvestmentJobHandler("INVESTMENT_DASHBOARD_RECALCULATE", async (job) => {
    const fundId = job.payloadJson?.fundId ?? null;
    const { PortfolioValuationEngine } = await import("../listedEquity/PortfolioValuationEngine");
    const { ListedEquityAccessService } = await import("../listedEquity/ListedEquityAccessService");

    const fundIds = fundId
      ? [String(fundId)]
      : (
          await prisma.fund.findMany({
            where: ListedEquityAccessService.listedEquityFundWhere(),
            select: { id: true },
          })
        ).map((f) => f.id);

    const snapshots = [];
    for (const id of fundIds) {
      snapshots.push(await PortfolioValuationEngine.runFundValuation(id));
    }

    const result = {
      recalculatedAt: new Date().toISOString(),
      fundId,
      fundIds,
      snapshotCount: snapshots.length,
      ok: true,
      navs: snapshots.map((s: any) => ({
        fundId: s.fundId,
        nav: s.navBaseCurrency != null ? String(s.navBaseCurrency) : null,
        asOf: s.asOf,
      })),
    };
    await InvestmentOutboxService.enqueue({
      aggregateType: "DASHBOARD",
      aggregateId: fundId || "ALL",
      aggregateVersion: 1,
      eventType: "DASHBOARD_RECALCULATED",
      payloadJson: result,
      idempotencyKey: `outbox:dashboard:${job.idempotencyKey}`,
    });
    return result;
  });

  registerInvestmentJobHandler("PRICE_INGEST", async (job) => {
    const sourceCode = String(job.payloadJson?.sourceCode || "ZSE").toUpperCase();
    const mod = await safeImport(() => import("../listedEquity/MarketDataScraperService"));
    if (mod?.MarketDataScraperService?.scrapeSource) {
      const data = await mod.MarketDataScraperService.scrapeSource(sourceCode);
      await InvestmentOutboxService.enqueue({
        aggregateType: "PRICE_INGEST",
        aggregateId: sourceCode,
        aggregateVersion: 1,
        eventType: "PRICE_INGEST_COMPLETED",
        payloadJson: { sourceCode, batchId: data?.batch?.id ?? data?.id ?? null },
        idempotencyKey: `outbox:price-ingest:${job.idempotencyKey}`,
      });
      return data;
    }
    return { ok: true, deferred: true, sourceCode };
  });

  registerInvestmentJobHandler("ROUTING_RETRY", async (job) => {
    const hopId = job.payloadJson?.hopId;
    const tradeId = job.payloadJson?.tradeId;
    if (!hopId) return { ok: false, reason: "hopId required" };
    const hop = await db.listedEquityTradeRoutingHop.findUnique({ where: { id: hopId } });
    if (!hop) return { ok: false, reason: "hop not found" };
    if (hop.status === "CONFIRMED") return { ok: true, skipped: true, status: hop.status };

    const mod = await safeImport(() => import("../listedEquity/StakeholderDispatchService"));
    if (!mod?.StakeholderDispatchService) return { ok: false, reason: "dispatch unavailable" };

    if (hop.target === "BROKER") {
      await mod.StakeholderDispatchService.dispatchBroker(tradeId || hop.tradeId, hopId);
    } else if (hop.target === "CUSTODIAN") {
      await mod.StakeholderDispatchService.dispatchCustodian(tradeId || hop.tradeId, hopId);
    } else {
      return { ok: false, reason: `unsupported target ${hop.target}` };
    }

    await InvestmentOutboxService.enqueue({
      aggregateType: "ROUTING_HOP",
      aggregateId: hopId,
      aggregateVersion: Number(hop.attemptCount || 0) + 1,
      eventType: "ROUTING_RETRY_DISPATCHED",
      payloadJson: { hopId, tradeId: tradeId || hop.tradeId, target: hop.target },
      idempotencyKey: `outbox:routing-retry:${job.idempotencyKey}`,
    });
    return { ok: true, hopId };
  });

  registerInvestmentJobHandler("INVESTMENT_SIMULATION_COMMAND", async (job) => {
    return {
      ok: true,
      simulationRunId: job.payloadJson?.simulationRunId ?? job.aggregateId ?? null,
      processedAt: new Date().toISOString(),
    };
  });

  registerInvestmentJobHandler("ACCOUNTING_INTEGRATION", async (job) => {
    const eventId = job.payloadJson?.eventId || job.aggregateId;
    if (!eventId) return { ok: false, reason: "eventId required" };
    const mod = await safeImport(() => import("./InvestmentAccountingFacadeService"));
    if (mod?.InvestmentAccountingFacadeService?.retryEvent) {
      const data = await mod.InvestmentAccountingFacadeService.retryEvent(
        eventId,
        job.payloadJson?.idempotencyKey || `job:${job.id}:accounting-retry`,
        job.payloadJson?.userId || "system",
        { role: { name: "admin" } }
      );
      await InvestmentOutboxService.enqueue({
        aggregateType: "ACCOUNTING_EVENT",
        aggregateId: eventId,
        aggregateVersion: 1,
        eventType: "ACCOUNTING_INTEGRATION_RETRY",
        payloadJson: { eventId },
        idempotencyKey: `outbox:accounting:${job.idempotencyKey}`,
      });
      return data;
    }
    return { ok: true, deferred: true, eventId };
  });

  registerInvestmentJobHandler("LEDGER_EXPORT", async (job) => {
    return {
      ok: true,
      exportId: job.payloadJson?.exportId ?? job.aggregateId ?? null,
      processedAt: new Date().toISOString(),
    };
  });

  registerInvestmentJobHandler("TRADING_POSITIONS_RECALCULATE", async (job) => {
    return {
      ok: true,
      fundId: job.payloadJson?.fundId ?? null,
      recalculatedAt: new Date().toISOString(),
    };
  });

  registerInvestmentJobHandler("FILE_UPLOAD_SESSION", async () => ({ ok: true }));
  registerInvestmentJobHandler("DOCUMENT_CREATE_IDEMPOTENCY", async () => ({ ok: true }));
  registerInvestmentJobHandler("DOCUMENT_VERSION_IDEMPOTENCY", async () => ({ ok: true }));

  registerInvestmentJobHandler("REPORT_GENERATE", async (job) => {
    const { InvestmentReportingService } = await import("./InvestmentReportingService");
    return InvestmentReportingService.processGenerateJob(job);
  });
}

ensureInvestmentPlatformJobHandlersRegistered();

export { InvestmentJobWorkerService };
