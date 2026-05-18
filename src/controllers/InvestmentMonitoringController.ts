// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { InvestmentMonitoringService } from "../services/InvestmentMonitoringService";

function parseIsoDate(s: unknown, field: string): Date {
  if (s == null || s === "") throw new Error(`${field} is required`);
  const d = new Date(String(s));
  if (Number.isNaN(d.getTime())) throw new Error(`${field} must be a valid date`);
  return d;
}

export class InvestmentMonitoringController {
  static async listValuationEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const { investmentImplementationId } = req.params;
      const data = await InvestmentMonitoringService.listValuationEvents(
        investmentImplementationId
      );
      res.status(200).json({ success: true, data });
    } catch (e: any) {
      const msg = e?.message || "Failed to list valuation events";
      const code = msg.includes("not found") ? 404 : 400;
      res.status(code).json({ success: false, message: msg });
    }
  }

  static async createValuationEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const { investmentImplementationId } = req.params;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const {
        valuationDate,
        valuationType,
        valuationAmount,
        currencyId,
        notes,
      } = req.body;

      if (currencyId == null || String(currencyId).trim() === "") {
        return res.status(400).json({
          success: false,
          message: "currencyId is required",
        });
      }

      const data = await InvestmentMonitoringService.createValuationEvent({
        investmentImplementationId,
        valuationDate: parseIsoDate(valuationDate, "valuationDate"),
        valuationType: String(valuationType || "").trim(),
        valuationAmount: Number(valuationAmount),
        currencyId: String(currencyId).trim(),
        notes: notes ?? null,
        createdById: userId,
      });

      res.status(201).json({ success: true, data });
    } catch (e: any) {
      const msg = e?.message || "Failed to create valuation event";
      const code = msg.includes("not found") ? 404 : 400;
      res.status(code).json({ success: false, message: msg });
    }
  }

  static async updateValuationEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const { investmentImplementationId, valuationEventId } = req.params;
      const { valuationDate, valuationType, valuationAmount, currencyId, notes } =
        req.body;

      const data = await InvestmentMonitoringService.updateValuationEvent(
        investmentImplementationId,
        valuationEventId,
        {
          ...(valuationDate != null
            ? { valuationDate: parseIsoDate(valuationDate, "valuationDate") }
            : {}),
          ...(valuationType != null ? { valuationType: String(valuationType) } : {}),
          ...(valuationAmount != null ? { valuationAmount: Number(valuationAmount) } : {}),
          ...(currencyId !== undefined ? { currencyId } : {}),
          ...(notes !== undefined ? { notes } : {}),
        }
      );

      res.status(200).json({ success: true, data });
    } catch (e: any) {
      const msg = e?.message || "Failed to update valuation event";
      const code = msg.includes("not found") ? 404 : 400;
      res.status(code).json({ success: false, message: msg });
    }
  }

  static async deleteValuationEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const { investmentImplementationId, valuationEventId } = req.params;
      await InvestmentMonitoringService.deleteValuationEvent(
        investmentImplementationId,
        valuationEventId
      );
      res.status(200).json({ success: true, message: "Valuation event deleted" });
    } catch (e: any) {
      const msg = e?.message || "Failed to delete valuation event";
      const code = msg.includes("not found") ? 404 : 400;
      res.status(code).json({ success: false, message: msg });
    }
  }

  static async getExit(req: Request, res: Response, next: NextFunction) {
    try {
      const { investmentImplementationId } = req.params;
      const data = await InvestmentMonitoringService.getExit(investmentImplementationId);
      res.status(200).json({ success: true, data: data ? [data] : [] });
    } catch (e: any) {
      const msg = e?.message || "Failed to load exit";
      const code = msg.includes("not found") ? 404 : 400;
      res.status(code).json({ success: false, message: msg });
    }
  }

  static async recordExit(req: Request, res: Response, next: NextFunction) {
    try {
      const { investmentImplementationId } = req.params;
      const userId = (req as any).user?.id;
      const { exitDate, exitType, exitProceedsAmount, currencyId, notes } = req.body;

      if (currencyId == null || String(currencyId).trim() === "") {
        return res.status(400).json({
          success: false,
          message: "currencyId is required",
        });
      }

      const result = await InvestmentMonitoringService.recordExit({
        investmentImplementationId,
        exitDate: parseIsoDate(exitDate, "exitDate"),
        exitType: String(exitType || "").trim(),
        exitProceedsAmount: Number(exitProceedsAmount),
        currencyId: String(currencyId).trim(),
        notes: notes ?? null,
        recordedById: userId,
      });

      res.status(200).json({ success: true, data: result });
    } catch (e: any) {
      const msg = e?.message || "Failed to record exit";
      res.status(400).json({ success: false, message: msg });
    }
  }

  static async deleteExit(req: Request, res: Response, next: NextFunction) {
    try {
      const { investmentImplementationId } = req.params;
      await InvestmentMonitoringService.deleteExit(investmentImplementationId);
      res.status(200).json({ success: true, message: "Exit removed; statuses reverted" });
    } catch (e: any) {
      const msg = e?.message || "Failed to delete exit";
      const code = msg.includes("not found") ? 404 : 400;
      res.status(code).json({ success: false, message: msg });
    }
  }
}
