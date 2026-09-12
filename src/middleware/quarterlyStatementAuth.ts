// @ts-nocheck
import { Response, NextFunction } from "express";
import { AuthRequest } from "./authenticate";
import { QuarterlyStatementAccessService } from "../services/quarterlyStatements/QuarterlyStatementAccessService";

export interface QuarterlyStatementRequest extends AuthRequest {
  runId?: string;
  fundId?: string;
}

export async function requireQuarterlyStatementView(
  req: QuarterlyStatementRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const runId = req.params.runId;
    if (!runId) return res.status(400).json({ success: false, message: "runId required" });
    const run = await QuarterlyStatementAccessService.getRun(runId);
    await QuarterlyStatementAccessService.assertCanView(req.user, run.fundId);
    req.runId = runId;
    req.fundId = run.fundId;
    next();
  } catch (e: any) {
    next(e);
  }
}

export function requireQuarterlyStatementCompile(
  req: QuarterlyStatementRequest,
  res: Response,
  next: NextFunction
) {
  try {
    QuarterlyStatementAccessService.assertCanCompile(req.user);
    next();
  } catch (e: any) {
    next(e);
  }
}

export function requireQuarterlyStatementApprove(
  req: QuarterlyStatementRequest,
  res: Response,
  next: NextFunction
) {
  try {
    QuarterlyStatementAccessService.assertCanApprove(req.user);
    next();
  } catch (e: any) {
    next(e);
  }
}
