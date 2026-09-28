// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { requestContext } from "../utils/requestContext";

// Attaches request IP and User-Agent so services/controllers can log them; also makes them available to the audit writer
// for the whole life of the request (AsyncLocalStorage), so no audit row is written without them.
export function attachRequestMeta(req: Request, _res: Response, next: NextFunction) {
  let meta = { ipAddress: "", userAgent: "" };
  try {
    const forwarded = (req.headers["x-forwarded-for"] as string) || "";
    const ipFromForwarded = forwarded.split(",")[0]?.trim();
    const ipAddress = ipFromForwarded || (req.ip || (req.socket as any)?.remoteAddress || "");
    meta = { ipAddress, userAgent: (req.headers["user-agent"] as string) || "" };
  } catch (_e) {
    // swallow - do not block request
  }
  (req as any).requestMeta = meta;
  requestContext.run(meta, () => next());
}
