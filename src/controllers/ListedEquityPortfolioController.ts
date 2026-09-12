// @ts-nocheck
import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { ListedEquityPortfolioService } from "../services/listedEquity/ListedEquityPortfolioService";
import { ListedEquityAccessService } from "../services/listedEquity/ListedEquityAccessService";

export class ListedEquityPortfolioController {
  static async listFunds(req: AuthRequest, res: Response) {
    try {
      const data = await ListedEquityPortfolioService.listFunds(req.user!.id, req.user);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async holdings(req: AuthRequest, res: Response) {
    try {
      const data = await ListedEquityPortfolioService.getHoldings(
        req.params.fundId,
        req.user!.id,
        req.user
      );
      res.json({ success: true, data });
    } catch (e: any) {
      const status = e.message === "FORBIDDEN_FUND_ACCESS" ? 403 : 400;
      res.status(status).json({ success: false, message: e.message });
    }
  }

  static async pnl(req: AuthRequest, res: Response) {
    try {
      const data = await ListedEquityPortfolioService.getPnl(
        req.params.fundId,
        req.user!.id,
        req.user
      );
      res.json({ success: true, data });
    } catch (e: any) {
      const status = e.message === "FORBIDDEN_FUND_ACCESS" ? 403 : 400;
      res.status(status).json({ success: false, message: e.message });
    }
  }

  static async valuations(req: AuthRequest, res: Response) {
    try {
      const data = await ListedEquityPortfolioService.listValuations(
        req.params.fundId,
        req.user!.id,
        req.user
      );
      res.json({ success: true, data });
    } catch (e: any) {
      const status = e.message === "FORBIDDEN_FUND_ACCESS" ? 403 : 400;
      res.status(status).json({ success: false, message: e.message });
    }
  }

  static async runValuation(req: AuthRequest, res: Response) {
    try {
      const data = await ListedEquityPortfolioService.forceValuationRun(
        req.params.fundId,
        req.user!.id,
        req.user
      );
      res.json({ success: true, data });
    } catch (e: any) {
      const status = e.message === "FORBIDDEN_FUND_ACCESS" ? 403 : 400;
      res.status(status).json({ success: false, message: e.message });
    }
  }

  static async getWatchlist(req: AuthRequest, res: Response) {
    try {
      const data = await ListedEquityPortfolioService.getWatchlist(req.user!.id);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async putWatchlist(req: AuthRequest, res: Response) {
    try {
      const securityIds = req.body.securityIds || [];
      const data = await ListedEquityPortfolioService.replaceWatchlist(req.user!.id, securityIds);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}
