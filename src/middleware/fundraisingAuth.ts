// @ts-nocheck
import { Response, NextFunction } from "express";
import { AuthRequest } from "./authenticate";
import { FundraisingAccessService } from "../services/fundraising/FundraisingAccessService";

export interface FundraisingRequest extends AuthRequest {
  campaignId?: string;
  dealId?: string;
}

export async function requireFundraisingView(req: FundraisingRequest, res: Response, next: NextFunction) {
  try {
    const campaignId = req.params.campaignId;
    if (!campaignId) return res.status(400).json({ success: false, message: "campaignId required" });
    await FundraisingAccessService.assertCanView(req.user, campaignId);
    req.campaignId = campaignId;
    next();
  } catch (e: any) {
    next(e);
  }
}

export async function requireFundraisingDealView(req: FundraisingRequest, res: Response, next: NextFunction) {
  try {
    const deal = await FundraisingAccessService.getDeal(req.params.dealId);
    await FundraisingAccessService.assertCanView(req.user, deal.campaignId);
    req.dealId = deal.id;
    req.campaignId = deal.campaignId;
    next();
  } catch (e: any) {
    next(e);
  }
}

export function requireFundraisingEdit(req: FundraisingRequest, res: Response, next: NextFunction) {
  try {
    FundraisingAccessService.assertCanEdit(req.user);
    next();
  } catch (e: any) {
    next(e);
  }
}

export function requireFundraisingMail(req: FundraisingRequest, res: Response, next: NextFunction) {
  try {
    FundraisingAccessService.assertCanMail(req.user);
    next();
  } catch (e: any) {
    next(e);
  }
}

export function requireFundraisingClose(req: FundraisingRequest, res: Response, next: NextFunction) {
  try {
    FundraisingAccessService.assertCanClose(req.user);
    next();
  } catch (e: any) {
    next(e);
  }
}
