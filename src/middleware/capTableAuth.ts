// @ts-nocheck
import { Response, NextFunction } from "express";
import { AuthRequest } from "./authenticate";
import { CapTableAccessService } from "../services/capTable/CapTableAccessService";

export interface CapTableRequest extends AuthRequest {
  portfolioCompanyId?: string;
}

export async function requireCapTableView(req: CapTableRequest, res: Response, next: NextFunction) {
  try {
    const portfolioCompanyId = req.params.portfolioCompanyId;
    if (!portfolioCompanyId) return res.status(400).json({ success: false, message: "portfolioCompanyId required" });
    await CapTableAccessService.assertCanView(req.user, portfolioCompanyId);
    req.portfolioCompanyId = portfolioCompanyId;
    next();
  } catch (e: any) {
    next(e);
  }
}

export async function requireCapTableConfigure(req: CapTableRequest, res: Response, next: NextFunction) {
  try {
    const portfolioCompanyId = req.params.portfolioCompanyId;
    await CapTableAccessService.assertCanConfigure(req.user, portfolioCompanyId);
    req.portfolioCompanyId = portfolioCompanyId;
    next();
  } catch (e: any) {
    next(e);
  }
}

export async function requireCapTableEditTx(req: CapTableRequest, res: Response, next: NextFunction) {
  try {
    const portfolioCompanyId = req.params.portfolioCompanyId;
    await CapTableAccessService.assertCanEditTransactions(req.user, portfolioCompanyId);
    req.portfolioCompanyId = portfolioCompanyId;
    next();
  } catch (e: any) {
    next(e);
  }
}

export function requireCapTableApprove(req: CapTableRequest, res: Response, next: NextFunction) {
  try {
    CapTableAccessService.assertCanApprove(req.user);
    next();
  } catch (e: any) {
    next(e);
  }
}

export function requireCapTableAdmin(req: CapTableRequest, res: Response, next: NextFunction) {
  try {
    CapTableAccessService.assertCanIntegrationStub(req.user);
    next();
  } catch (e: any) {
    next(e);
  }
}
