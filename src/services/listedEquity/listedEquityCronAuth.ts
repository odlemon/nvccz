import type { Request } from "express";

export function isLoopback(req: Request): boolean {
  const ip = req.ip || req.socket?.remoteAddress || "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export function verifyMarketDataCronSecret(req: Request): boolean {
  const secret =
    req.headers["x-market-data-cron-secret"] || req.headers["x-cron-secret"];
  const expected = process.env.MARKET_DATA_CRON_SECRET || process.env.CRON_SECRET;
  if (!expected) return isLoopback(req);
  return secret === expected;
}

export function verifyTradeRouterCronSecret(req: Request): boolean {
  const secret =
    req.headers["x-trade-router-cron-secret"] || req.headers["x-cron-secret"];
  const expected = process.env.TRADE_ROUTER_CRON_SECRET || process.env.CRON_SECRET;
  if (!expected) return isLoopback(req);
  return secret === expected;
}
