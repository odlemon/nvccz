// @ts-nocheck
import { Response, NextFunction } from "express";
import { AuthRequest } from "./authenticate";
import { TaxReturnPackAccessService } from "../services/taxReturnPack/TaxReturnPackAccessService";

export interface TaxReturnPackRequest extends AuthRequest {
  packId?: string;
  fundId?: string | null;
}

export async function requireTaxReturnPackView(
  req: TaxReturnPackRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const packId = req.params.packId;
    if (!packId) return res.status(400).json({ success: false, message: "packId required" });
    const pack = await TaxReturnPackAccessService.getPack(packId);
    await TaxReturnPackAccessService.assertCanView(req.user, pack.fundId);
    req.packId = packId;
    req.fundId = pack.fundId;
    next();
  } catch (e: any) {
    next(e);
  }
}

export function requireTaxReturnPackCompile(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
  try {
    TaxReturnPackAccessService.assertCanCompile(req.user);
    next();
  } catch (e: any) {
    next(e);
  }
}

export function requireTaxReturnPackApprove(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
  try {
    TaxReturnPackAccessService.assertCanApprove(req.user);
    next();
  } catch (e: any) {
    next(e);
  }
}
