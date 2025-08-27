// @ts-nocheck
import { Request, Response, NextFunction } from "express";

// Attaches request IP and User-Agent so services/controllers can log them
export function attachRequestMeta(req: Request, _res: Response, next: NextFunction) {
  try {
    const forwarded = (req.headers["x-forwarded-for"] as string) || "";
    const ipFromForwarded = forwarded.split(",")[0]?.trim();
    const ipAddress = ipFromForwarded || (req.ip || (req.socket as any)?.remoteAddress || "");

    (req as any).requestMeta = {
      ipAddress,
      userAgent: (req.headers["user-agent"] as string) || "",
    };
  } catch (_e) {
    // swallow - do not block request
    (req as any).requestMeta = { ipAddress: "", userAgent: "" };
  }
  next();
}