// @ts-nocheck
import { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";
import { MarketDataScraperService } from "../services/listedEquity/MarketDataScraperService";
import { MarketDataScraperCronService } from "../services/listedEquity/MarketDataScraperCronService";
import { MarketDataIngestService } from "../services/listedEquity/MarketDataIngestService";
import { ListedEquityAuditService } from "../services/listedEquity/ListedEquityAuditService";
import { PortfolioValuationEngine } from "../services/listedEquity/PortfolioValuationEngine";
import { verifyMarketDataCronSecret } from "../services/listedEquity/listedEquityCronAuth";
import { ingestLog } from "../services/listedEquity/listedEquityIngestLogger";
import { priceTickReviewable } from "../services/investmentOps/investmentOpsSupport";

export class ListedEquityMarketDataController {
  static async listSecurities(req: Request, res: Response) {
    try {
      const exchange = req.query.exchange as string | undefined;
      const rows = await prisma.listedEquitySecurity.findMany({
        where: {
          isActive: true,
          ...(exchange ? { exchangeCode: exchange } : {}),
        },
        orderBy: { symbol: "asc" },
      });
      res.json({ success: true, data: rows });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async createSecurity(req: AuthRequest, res: Response) {
    try {
      const row = await prisma.listedEquitySecurity.create({ data: req.body });
      res.status(201).json({ success: true, data: row });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async updateSecurity(req: AuthRequest, res: Response) {
    try {
      const row = await prisma.listedEquitySecurity.update({
        where: { id: req.params.id },
        data: req.body,
      });
      res.json({ success: true, data: row });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async getSecurityPrices(req: Request, res: Response) {
    try {
      const ticks = await prisma.listedEquityPriceTick.findMany({
        where: { securityId: req.params.id },
        orderBy: { pricedAt: "desc" },
        take: 200,
      });
      res.json({ success: true, data: ticks });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async latestPrices(req: Request, res: Response) {
    try {
      const symbols = String(req.query.symbols || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const securities = await prisma.listedEquitySecurity.findMany({
        where: symbols.length ? { symbol: { in: symbols } } : { isActive: true },
      });
      const out = [];
      for (const sec of securities) {
        const tick = await prisma.listedEquityPriceTick.findFirst({
          where: { securityId: sec.id, validationStatus: "APPROVED" },
          orderBy: { pricedAt: "desc" },
        });
        out.push({ security: sec, latestTick: tick });
      }
      res.json({ success: true, data: out });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async runIngest(req: AuthRequest, res: Response) {
    const code = req.body?.sourceCode || "MANUAL";
    const manual = Boolean(req.body?.ticks?.length);
    ingestLog("api.ingest/run", { sourceCode: code, manual, userId: req.user?.id });
    const started = Date.now();
    try {
      const { sourceCode, ticks } = req.body;
      const result = ticks?.length
        ? await MarketDataScraperService.scrapeSource(code, ticks)
        : await MarketDataScraperService.scrapeSource(code);
      ingestLog("api.ingest/run complete", {
        sourceCode: code,
        batchId: result?.batch?.id,
        ms: Date.now() - started,
      });
      res.json({ success: true, data: result });
    } catch (e: any) {
      ingestLog("api.ingest/run failed", { sourceCode: code, ms: Date.now() - started, error: e.message });
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async listBatches(req: Request, res: Response) {
    try {
      const rows = await prisma.listedEquityMarketDataIngestBatch.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      res.json({ success: true, data: rows });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async getBatch(req: Request, res: Response) {
    try {
      const data = await MarketDataIngestService.getBatchWithVerify(req.params.id);
      if (!data) return res.status(404).json({ success: false, message: "Batch not found" });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async validationQueue(req: Request, res: Response) {
    try {
      const rows = await prisma.listedEquityPriceTick.findMany({
        where: { validationStatus: "PENDING_REVIEW" },
        include: { security: true },
        orderBy: { pricedAt: "desc" },
      });
      res.json({
        success: true,
        data: rows.map((tick) => ({
          ...tick,
          price: tick.price != null ? String(tick.price) : null,
          previousClose: tick.previousClose != null ? String(tick.previousClose) : null,
          deviationPct: tick.deviationPct != null ? String(tick.deviationPct) : null,
          reviewable: priceTickReviewable(tick.validationStatus),
        })),
      });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async approveTick(req: AuthRequest, res: Response) {
    try {
      const tick = await prisma.listedEquityPriceTick.update({
        where: { id: req.params.tickId },
        data: {
          validationStatus: "APPROVED",
          reviewedById: req.user?.id,
          reviewedAt: new Date(),
        },
      });
      await ListedEquityAuditService.log(
        "PRICE_TICK_APPROVED",
        "ListedEquityPriceTick",
        tick.id,
        {},
        req.user?.id
      );
      await PortfolioValuationEngine.recalcForSecurities([tick.securityId]);
      res.json({ success: true, data: tick });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async rejectTick(req: AuthRequest, res: Response) {
    try {
      const tick = await prisma.listedEquityPriceTick.update({
        where: { id: req.params.tickId },
        data: {
          validationStatus: "REJECTED",
          reviewedById: req.user?.id,
          reviewedAt: new Date(),
        },
      });
      await ListedEquityAuditService.log(
        "PRICE_TICK_REJECTED",
        "ListedEquityPriceTick",
        tick.id,
        {},
        req.user?.id
      );
      res.json({ success: true, data: tick });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async webhookIngress(req: Request, res: Response) {
    const secret = process.env.MARKET_DATA_WEBHOOK_SECRET?.trim();
    if (!secret) {
      return res.status(503).json({
        success: false,
        code: "WEBHOOK_SECRET_MISSING",
        message: "MARKET_DATA_WEBHOOK_SECRET is not configured",
      });
    }

    const sigHeader = String(req.headers["x-market-data-signature"] || "");
    const timestampHeader = String(req.headers["x-market-data-timestamp"] || "");
    const nonceHeader = String(req.headers["x-market-data-nonce"] || "");
    const rawBody =
      (req as any).rawBody instanceof Buffer
        ? (req as any).rawBody
        : Buffer.from(
            typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}),
            "utf8"
          );

    const ts = Number(timestampHeader);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
      return res.status(403).json({
        success: false,
        code: "WEBHOOK_REPLAY_REJECTED",
        message: "Webhook timestamp outside replay window",
      });
    }
    if (!nonceHeader || nonceHeader.length < 8) {
      return res.status(403).json({
        success: false,
        code: "WEBHOOK_NONCE_REQUIRED",
        message: "x-market-data-nonce is required",
      });
    }

    const expected = createHmac("sha256", secret)
      .update(`${timestampHeader}.${nonceHeader}.`)
      .update(rawBody)
      .digest("hex");
    const provided = sigHeader.replace(/^sha256=/i, "");
    const ok =
      provided.length === expected.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!ok) {
      return res.status(403).json({ success: false, message: "Invalid webhook signature" });
    }

    const replayKey = `webhook-replay:${String(req.params.providerCode || "WEBHOOK").toUpperCase()}:${timestampHeader}:${nonceHeader}`;
    try {
      const existing = await prisma.investmentJob.findUnique({
        where: { idempotencyKey: replayKey },
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          code: "WEBHOOK_REPLAY",
          message: "Webhook replay rejected",
        });
      }
      await prisma.investmentJob.create({
        data: {
          jobType: "WEBHOOK_REPLAY_GUARD",
          aggregateType: "WEBHOOK",
          aggregateId: String(req.params.providerCode || "WEBHOOK"),
          payloadJson: { timestamp: timestampHeader, nonce: nonceHeader },
          idempotencyKey: replayKey,
          status: "COMPLETED",
          completedAt: new Date(),
          maxAttempts: 1,
          attemptCount: 1,
        },
      });
    } catch (e: any) {
      if (String(e?.code) === "P2002") {
        return res.status(409).json({
          success: false,
          code: "WEBHOOK_REPLAY",
          message: "Webhook replay rejected",
        });
      }
      throw e;
    }

    res.status(202).json({ success: true, accepted: true });
    setImmediate(async () => {
      try {
        const providerCode = String(req.params.providerCode || "WEBHOOK").toUpperCase();
        const body =
          typeof req.body === "string"
            ? JSON.parse(req.body || "{}")
            : req.body && typeof req.body === "object"
              ? req.body
              : JSON.parse(rawBody.toString("utf8") || "{}");
        const rows = Array.isArray(body) ? body : body.ticks || [body];
        const ticks = [];
        for (const row of rows) {
          let securityId = row.securityId;
          if (!securityId && row.vendorSymbol) {
            const map = await prisma.listedEquitySecurityVendorSymbol.findFirst({
              where: { providerCode, vendorSymbol: String(row.vendorSymbol) },
            });
            securityId = map?.securityId;
          }
          const sec = securityId
            ? await prisma.listedEquitySecurity.findUnique({ where: { id: securityId } })
            : await prisma.listedEquitySecurity.findFirst({
                where: { symbol: String(row.symbol || row.vendorSymbol).toUpperCase() },
              });
          if (!sec) continue;
          ticks.push({
            symbol: sec.symbol,
            exchangeCode: sec.exchangeCode,
            priceType: String(row.priceType || "LIVE").toUpperCase(),
            price: Number(row.price),
            pricedAt: row.pricedAt ? new Date(row.pricedAt) : new Date(),
            tickFrequency: row.tickFrequency || "LIVE",
          });
        }
        if (ticks.length) {
          await MarketDataIngestService.ingestBatch({
            sourceType: "WEBHOOK",
            sourceCode: providerCode,
            asOfDate: new Date(),
            ticks,
          });
        }
      } catch (e) {
        console.error("[webhookIngress]", e);
      }
    });
  }

  static async cronScrapeDomestic(req: Request, res: Response) {
    if (!verifyMarketDataCronSecret(req)) {
      return res.status(403).json({ success: false, message: "Invalid cron secret" });
    }
    try {
      const data = await MarketDataScraperCronService.runDomesticScrape();
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  static async cronRetryFailedIngest(req: Request, res: Response) {
    if (!verifyMarketDataCronSecret(req)) {
      return res.status(403).json({ success: false, message: "Invalid cron secret" });
    }
    try {
      const data = await MarketDataScraperCronService.retryFailedIngest();
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  }
}
