// @ts-nocheck
import { Response, NextFunction } from "express";
import type { AuthRequest } from "./authenticate";
import { InvestmentMemoAccessService } from "../services/investmentMemo/InvestmentMemoAccessService";

export interface InvestmentMemoRequest extends AuthRequest {
  applicationId?: string;
}

export async function requireInvestmentMemoView(
  req: InvestmentMemoRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
    const applicationId = req.params.applicationId;
    if (!applicationId) return res.status(400).json({ success: false, message: "applicationId required" });
    await InvestmentMemoAccessService.assertCanView(req.user, applicationId);
    req.applicationId = applicationId;
    return next();
  } catch (e: any) {
    return res.status(e.statusCode || 403).json({ success: false, message: e.message });
  }
}

export async function requireInvestmentMemoEdit(
  req: InvestmentMemoRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
    const applicationId = req.params.applicationId;
    if (!applicationId) return res.status(400).json({ success: false, message: "applicationId required" });
    await InvestmentMemoAccessService.assertCanEdit(req.user, applicationId);
    req.applicationId = applicationId;
    return next();
  } catch (e: any) {
    return res.status(e.statusCode || 403).json({ success: false, message: e.message });
  }
}

export function requireInvestmentMemoCio(req: InvestmentMemoRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
    InvestmentMemoAccessService.assertCanApprove(req.user);
    return next();
  } catch (e: any) {
    return res.status(e.statusCode || 403).json({ success: false, message: e.message });
  }
}
