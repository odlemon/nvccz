// @ts-nocheck
import { Request, Response } from "express";
import { createReadStream } from "fs";
import { AuthRequest } from "../middleware/authenticate";
import { TradeOrchestratorService } from "../services/listedEquity/TradeOrchestratorService";
import { TradeRoutingRetryCronService } from "../services/listedEquity/TradeRoutingRetryCronService";
import { ListedEquityAccessService } from "../services/listedEquity/ListedEquityAccessService";
import { CustodianSettlementDocService } from "../services/listedEquity/CustodianSettlementDocService";
import { verifyTradeRouterCronSecret } from "../services/listedEquity/listedEquityCronAuth";
import { prisma } from "../utils/database";

export class ListedEquityTradeController {
  static async create(req: AuthRequest, res: Response) {
    try {
      await ListedEquityAccessService.assertFundAccess(req.user!.id, req.body.fundId, req.user);
      const trade = await TradeOrchestratorService.createDraft(req.body);
      res.status(201).json({ success: true, data: trade });
    } catch (e: any) {
      const status = e.message === "FORBIDDEN_FUND_ACCESS" ? 403 : 400;
      res.status(status).json({ success: false, message: e.message });
    }
  }

  static async list(req: AuthRequest, res: Response) {
    try {
      const scope = await ListedEquityAccessService.getAccessibleFundIds(req.user!.id, req.user);
      const data = await TradeOrchestratorService.listTrades({
        fundId: req.query.fundId as string,
        status: req.query.status as string,
        fundScope: scope,
      });
      const { InvestmentOrderService } = require("../services/investmentOps/InvestmentOrderService");
      const withOrders = await InvestmentOrderService.attachOrderLinks(data);
      const enriched = withOrders.map((t: any) => InvestmentOrderService.enrichTradeBlotter(t));
      res.json({ success: true, data: enriched });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async get(req: AuthRequest, res: Response) {
    try {
      const trade = await TradeOrchestratorService.getTradeDetail(req.params.id);
      if (!trade) return res.status(404).json({ success: false, message: "Not found" });
      await ListedEquityAccessService.assertFundAccess(req.user!.id, trade.fundId, req.user);
      const { InvestmentOrderService } = require("../services/investmentOps/InvestmentOrderService");
      const [linked] = await InvestmentOrderService.attachOrderLinks([trade]);
      res.json({ success: true, data: InvestmentOrderService.enrichTradeBlotter(linked) });
    } catch (e: any) {
      const status = e.message === "FORBIDDEN_FUND_ACCESS" ? 403 : 400;
      res.status(status).json({ success: false, message: e.message });
    }
  }

  static async execute(req: AuthRequest, res: Response) {
    try {
      const trade = await prisma.listedEquityTrade.findUnique({ where: { id: req.params.id } });
      if (!trade) return res.status(404).json({ success: false, message: "Not found" });
      await ListedEquityAccessService.assertFundAccess(req.user!.id, trade.fundId, req.user);
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      const data = await TradeOrchestratorService.execute(req.params.id, req.user!.id, idempotencyKey);
      res.json({ success: true, data });
    } catch (e: any) {
      const status = e.message === "FORBIDDEN_FUND_ACCESS" ? 403 : 400;
      res.status(status).json({ success: false, message: e.message });
    }
  }

  static async cancel(req: AuthRequest, res: Response) {
    try {
      const trade = await prisma.listedEquityTrade.findUnique({ where: { id: req.params.id } });
      if (!trade) return res.status(404).json({ success: false, message: "Not found" });
      await ListedEquityAccessService.assertFundAccess(req.user!.id, trade.fundId, req.user);
      const data = await TradeOrchestratorService.cancel(req.params.id);
      res.json({ success: true, data });
    } catch (e: any) {
      const status = e.message === "FORBIDDEN_FUND_ACCESS" ? 403 : 400;
      res.status(status).json({ success: false, message: e.message });
    }
  }

  static async routingHops(req: AuthRequest, res: Response) {
    try {
      const trade = await TradeOrchestratorService.getTradeDetail(req.params.id);
      if (!trade) return res.status(404).json({ success: false, message: "Not found" });
      await ListedEquityAccessService.assertFundAccess(req.user!.id, trade.fundId, req.user);
      res.json({ success: true, data: trade.routingHops });
    } catch (e: any) {
      const status = e.message === "FORBIDDEN_FUND_ACCESS" ? 403 : 400;
      res.status(status).json({ success: false, message: e.message });
    }
  }

  static async retryHop(req: AuthRequest, res: Response) {
    try {
      const hop = await prisma.listedEquityTradeRoutingHop.findUnique({
        where: { id: req.params.hopId },
        include: { trade: true },
      });
      if (!hop) return res.status(404).json({ success: false, message: "Hop not found" });
      await ListedEquityAccessService.assertFundAccess(req.user!.id, hop.trade.fundId, req.user);
      const data = await TradeOrchestratorService.retryHop(req.params.hopId, req.user!.id);
      res.json({ success: true, data });
    } catch (e: any) {
      const status = e.message === "FORBIDDEN_FUND_ACCESS" ? 403 : 400;
      res.status(status).json({ success: false, message: e.message });
    }
  }

  static async confirmHop(req: AuthRequest, res: Response) {
    try {
      const hop = await prisma.listedEquityTradeRoutingHop.findUnique({
        where: { id: req.params.hopId },
        include: { trade: true },
      });
      if (!hop) return res.status(404).json({ success: false, message: "Hop not found" });
      await ListedEquityAccessService.assertFundAccess(req.user!.id, hop.trade.fundId, req.user);
      const data = await TradeOrchestratorService.confirmHop(
        req.params.hopId,
        req.user!.id,
        req.body?.externalRef
      );
      res.json({ success: true, data });
    } catch (e: any) {
      const status = e.message === "FORBIDDEN_FUND_ACCESS" ? 403 : 400;
      res.status(status).json({ success: false, message: e.message });
    }
  }

  static async settlementDocument(req: AuthRequest, res: Response) {
    try {
      const trade = await prisma.listedEquityTrade.findUnique({
        where: { id: req.params.id },
        include: { settlement: true },
      });
      if (!trade) return res.status(404).json({ success: false, message: "Not found" });
      await ListedEquityAccessService.assertFundAccess(req.user!.id, trade.fundId, req.user);
      const path = trade.settlement?.settlementDocumentRef;
      if (path) {
        res.setHeader("Content-Type", "application/pdf");
        createReadStream(path).pipe(res);
        return;
      }
      const buffer = await CustodianSettlementDocService.buildPdfBuffer(req.params.id);
      res.setHeader("Content-Type", "application/pdf");
      res.send(buffer);
    } catch (e: any) {
      const status = e.message === "FORBIDDEN_FUND_ACCESS" ? 403 : 400;
      res.status(status).json({ success: false, message: e.message });
    }
  }

  static async cronRetryFailedRouting(req: Request, res: Response) {
    if (!verifyTradeRouterCronSecret(req)) {
      return res.status(403).json({ success: false, message: "Invalid cron secret" });
    }
    try {
      const data = await TradeRoutingRetryCronService.retryFailedRouting();
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  }
}
