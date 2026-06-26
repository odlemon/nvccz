// @ts-nocheck
import { Response, NextFunction } from "express";
import type { AuthRequest } from "./authenticate";
import { ExchangeRateDisplayAccessService } from "../services/exchangeRateDisplay/ExchangeRateDisplayAccessService";

export type ExchangeRateDisplayRequest = AuthRequest;

export function requireExchangeRateDisplayAdmin(
  req: ExchangeRateDisplayRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
    ExchangeRateDisplayAccessService.assertFinanceAdmin(req.user);
    return next();
  } catch (e: any) {
    return res.status(e.statusCode || 403).json({ success: false, message: e.message });
  }
}
