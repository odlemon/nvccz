// @ts-nocheck
import { Response, NextFunction } from "express";
import type { ExchangeRateDisplayRequest } from "../middleware/exchangeRateDisplayAuth";
import { ExchangeRateDisplayResolverService } from "../services/exchangeRateDisplay/ExchangeRateDisplayResolverService";
import { ExchangeRateDisplayConfigService } from "../services/exchangeRateDisplay/ExchangeRateDisplayConfigService";
import { ExchangeRateQuoteService } from "../services/exchangeRateDisplay/ExchangeRateQuoteService";
import { StreetRateIngestService } from "../services/exchangeRateDisplay/StreetRateIngestService";

export class ExchangeRateDisplayController {
  static async getWidget(req: ExchangeRateDisplayRequest, res: Response, next: NextFunction) {
    try {
      const data = await ExchangeRateDisplayResolverService.resolveWidget({
        context: req.query.context as string,
        from: req.query.from as string,
        to: req.query.to as string,
        asOfDate: req.query.asOfDate as string,
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async compare(req: ExchangeRateDisplayRequest, res: Response, next: NextFunction) {
    try {
      const data = await ExchangeRateDisplayResolverService.compare({
        from: req.query.from as string,
        to: req.query.to as string,
        asOfDate: req.query.asOfDate as string,
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async history(req: ExchangeRateDisplayRequest, res: Response, next: NextFunction) {
    try {
      const source = String(req.query.source || "ZIMRATE_STREET");
      const from = String(req.query.from || "USD");
      const to = String(req.query.to || "ZWG");
      const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
      const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;
      const rows = await ExchangeRateQuoteService.listHistory({
        sourceCode: source,
        fromCurrencyCode: from,
        toCurrencyCode: to,
        dateFrom,
        dateTo,
      });
      res.json({
        success: true,
        data: rows.map((r) => ExchangeRateQuoteService.formatQuote(r)),
      });
    } catch (e) {
      next(e);
    }
  }

  static async listConfigs(req: ExchangeRateDisplayRequest, res: Response, next: NextFunction) {
    try {
      const data = await ExchangeRateDisplayConfigService.listConfigs();
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async createConfig(req: ExchangeRateDisplayRequest, res: Response, next: NextFunction) {
    try {
      const data = await ExchangeRateDisplayConfigService.createConfig(req.body);
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async updateConfig(req: ExchangeRateDisplayRequest, res: Response, next: NextFunction) {
    try {
      const data = await ExchangeRateDisplayConfigService.updateConfig(req.params.id, req.body);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async runIngest(req: ExchangeRateDisplayRequest, res: Response, next: NextFunction) {
    try {
      const data = await StreetRateIngestService.ingestLive();
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async postManualQuote(req: ExchangeRateDisplayRequest, res: Response, next: NextFunction) {
    try {
      const { fromCurrencyCode, toCurrencyCode, avg, bid, ask, asOfDate } = req.body || {};
      if (!fromCurrencyCode || !toCurrencyCode || avg == null) {
        return res.status(400).json({ success: false, message: "fromCurrencyCode, toCurrencyCode, avg required" });
      }
      const data = await StreetRateIngestService.postManualOverride({
        fromCurrencyCode,
        toCurrencyCode,
        avg: Number(avg),
        bid: bid != null ? Number(bid) : undefined,
        ask: ask != null ? Number(ask) : undefined,
        asOfDate: asOfDate ? new Date(asOfDate) : undefined,
        actorId: req.user!.id,
      });
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
}
