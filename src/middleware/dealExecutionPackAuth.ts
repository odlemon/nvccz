// @ts-nocheck
import { Response, NextFunction } from "express";
import { AuthRequest } from "./authenticate";
import { DealExecutionPackAccessService } from "../services/dealExecutionPack/DealExecutionPackAccessService";

export interface DealExecutionPackRequest extends AuthRequest {
  packId?: string;
  fundId?: string;
}

export async function requireDealExecutionPackView(
  req: DealExecutionPackRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const packId = req.params.packId;
    if (!packId) return res.status(400).json({ success: false, message: "packId required" });
    const pack = await DealExecutionPackAccessService.getPack(packId);
    await DealExecutionPackAccessService.assertFundAccess(req.user, pack.fundId);
    req.packId = packId;
    req.fundId = pack.fundId;
    next();
  } catch (e: any) {
    next(e);
  }
}

export function requireDealExecutionPackEdit(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
  try {
    DealExecutionPackAccessService.assertCanEditWorkspace(req.user);
    next();
  } catch (e: any) {
    next(e);
  }
}

export function requireDealExecutionPackExecute(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
  try {
    DealExecutionPackAccessService.assertCanExecute(req.user);
    next();
  } catch (e: any) {
    next(e);
  }
}
