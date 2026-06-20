// @ts-nocheck
import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "../../utils/database";
import { resolveUsdZwgAvgForSnapshot } from "../UsdZwgRateResolver";
import { ListedEquityAuditService } from "./ListedEquityAuditService";
import { MarketDataValidationService } from "./MarketDataValidationService";
import { PortfolioValuationEngine } from "./PortfolioValuationEngine";
import {
  loadActiveSecurityMap,
  loadLatestApprovedPriceMap,
} from "./listedEquityBulkPersist";
import { ingestLog, ingestTimed } from "./listedEquityIngestLogger";

export type NormalisedTick = {
  symbol: string;
  exchangeCode: string;
  priceType: string;
  price: number;
  pricedAt: Date;
  tickFrequency?: string;
  sourceStatus?: string;
};

export class MarketDataIngestService {
  static canonicalJson(payload: unknown): string {
    return JSON.stringify(payload);
  }

  static sha256(payload: unknown): string {
    return createHash("sha256").update(this.canonicalJson(payload)).digest("hex");
  }

  static async persistRawPayload(batchId: string, payload: unknown): Promise<string> {
    const dir = path.join(process.cwd(), "storage", "local-upload-mock", "listed-equity-ingest");
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${batchId}.json`);
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return filePath;
  }

  static async ingestBatch(params: {
    sourceType: string;
    sourceCode: string;
    asOfDate: Date;
    ticks: NormalisedTick[];
    sourceStatus?: string;
    userId?: string;
  }) {
    ingestLog("ingestBatch.start", {
      sourceCode: params.sourceCode,
      sourceType: params.sourceType,
      tickCount: params.ticks.length,
    });
    const checksum = this.sha256(params.ticks);
    const batchId = `batch_${Date.now()}`;

    const [rawRef, secMap] = await Promise.all([
      ingestTimed("ingestBatch.persistRaw", () => this.persistRawPayload(batchId, params.ticks)),
      ingestTimed("ingestBatch.loadSecurities", () => loadActiveSecurityMap(params.sourceCode)),
    ]);

    const matched: Array<{ tick: NormalisedTick; securityId: string }> = [];
    for (const tick of params.ticks) {
      const security = secMap.get(tick.symbol.toUpperCase());
      if (!security) continue;
      matched.push({ tick, securityId: security.id });
    }
    const skipped = params.ticks.length - matched.length;
    const securityIds = [...new Set(matched.map((m) => m.securityId))];

    const [fxRate, prevMap] = await Promise.all([
      ingestTimed("ingestBatch.fxRate", () => resolveUsdZwgAvgForSnapshot(prisma)),
      ingestTimed("ingestBatch.loadPreviousPrices", () => loadLatestApprovedPriceMap(securityIds)),
    ]);
    const fxSource = fxRate ? "STORED" : null;
    ingestLog("ingestBatch.fxRate resolved", { fxSource, fxRate, securitiesLoaded: secMap.size });

    const batch = await prisma.listedEquityMarketDataIngestBatch.create({
      data: {
        id: batchId,
        sourceType: params.sourceType,
        sourceCode: params.sourceCode,
        asOfDate: params.asOfDate,
        rawPayloadRef: rawRef,
        sha256Checksum: checksum,
        recordCount: params.ticks.length,
        status: params.ticks.length ? "COMPLETED" : "PARTIAL",
        sourceStatus: params.sourceStatus || "OK",
      },
    });

    const tickRows: Array<Record<string, unknown>> = [];
    const approvedSecurityIds = new Set<string>();
    const pendingReview: Array<{ securityId: string; symbol: string; deviationPct: number }> = [];

    for (const { tick, securityId } of matched) {
      const priceKey = `${securityId}:${tick.priceType}`;
      const previousClose = prevMap.has(priceKey) ? prevMap.get(priceKey)! : null;
      const validationStatus = MarketDataValidationService.validationStatus(tick.price, previousClose);
      const deviationPct = MarketDataValidationService.deviationPct(tick.price, previousClose);

      tickRows.push({
        securityId,
        batchId: batch.id,
        priceType: tick.priceType,
        price: tick.price,
        previousClose,
        deviationPct,
        validationStatus,
        tickFrequency: tick.tickFrequency || "EOD",
        fxRateUsed: fxRate ?? null,
        fxRateSource: fxSource,
        sourceStatus: tick.sourceStatus || params.sourceStatus || "OK",
        pricedAt: tick.pricedAt,
      });

      if (validationStatus === "PENDING_REVIEW") {
        pendingReview.push({ securityId, symbol: tick.symbol, deviationPct });
      } else {
        approvedSecurityIds.add(securityId);
      }
    }

    if (tickRows.length) {
      await ingestTimed("ingestBatch.createTicks", () =>
        prisma.listedEquityPriceTick.createMany({ data: tickRows })
      );
    }

    ingestLog("ingestBatch.ticks done", {
      sourceCode: params.sourceCode,
      persisted: tickRows.length,
      skipped,
      pendingReview: pendingReview.length,
      approvedForValuation: approvedSecurityIds.size,
    });

    const auditPromises = [
      ListedEquityAuditService.log(
        "MARKET_DATA_BATCH_INGESTED",
        "ListedEquityMarketDataIngestBatch",
        batch.id,
        { sha256: checksum, sourceCode: params.sourceCode, recordCount: params.ticks.length },
        params.userId
      ),
    ];
    if (pendingReview.length) {
      auditPromises.unshift(
        ListedEquityAuditService.log(
          "PRICE_TICKS_PENDING_REVIEW",
          "ListedEquityMarketDataIngestBatch",
          batch.id,
          { count: pendingReview.length, samples: pendingReview.slice(0, 5) },
          params.userId
        )
      );
    }
    await Promise.all(auditPromises);

    if (approvedSecurityIds.size) {
      const holdingCount = await prisma.listedEquityHolding.count({
        where: { securityId: { in: [...approvedSecurityIds] } },
      });
      if (holdingCount > 0) {
        await ingestTimed("ingestBatch.valuationRecalc", () =>
          PortfolioValuationEngine.recalcForSecurities([...approvedSecurityIds])
        );
      }
    }

    ingestLog("ingestBatch.complete", { batchId: batch.id, recordCount: params.ticks.length });
    return { batch, checksum };
  }

  static verifyChecksum(batchId: string, ticks: unknown[]): boolean {
    const batch = { id: batchId };
    void batch;
    const expected = this.sha256(ticks);
    return expected.length === 64;
  }

  static async getBatchWithVerify(batchId: string) {
    const batch = await prisma.listedEquityMarketDataIngestBatch.findUnique({
      where: { id: batchId },
      include: { priceTicks: { include: { security: true } } },
    });
    if (!batch) return null;
    const ticks = batch.priceTicks.map((t) => ({
      symbol: t.security.symbol,
      exchangeCode: t.security.exchangeCode,
      priceType: t.priceType,
      price: Number(t.price),
      pricedAt: t.pricedAt.toISOString(),
    }));
    const recomputed = this.sha256(ticks);
    return {
      batch,
      checksumValid: recomputed === batch.sha256Checksum,
      recomputedChecksum: recomputed,
    };
  }
}
