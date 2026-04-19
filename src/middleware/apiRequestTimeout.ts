import type { NextFunction, Request, Response } from "express";

/**
 * Enforces a maximum time-to-first-byte budget for API routes (default 5s).
 * Some paths (LLM extraction, batch pay, user-configured prefixes) use a longer ceiling.
 *
 * Env:
 * - API_REQUEST_TIMEOUT_MS — default 5000; set 0 to disable this middleware.
 * - API_REQUEST_LONG_TIMEOUT_MS — default 120000 for long-running routes.
 * - API_LONG_TIMEOUT_PATH_PREFIXES — comma-separated extra path prefixes (must match start of URL path after stripping query).
 *
 * Built-in long-timeout GETs: multi-currency **reports** (e.g. unrealized FX) and **trial balance** (incl. consolidated / wide periods) — GL aggregation can exceed the default 5s SLA on large datasets.
 */
function parseMs(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

export function pathOnlyFromRequest(req: Pick<Request, "originalUrl" | "url" | "path">): string {
  const raw = req.originalUrl || req.url || req.path || "";
  const q = raw.indexOf("?");
  return q >= 0 ? raw.slice(0, q) : raw;
}

/**
 * Exported for unit-style scripts; keep in sync with middleware behaviour.
 */
export function shouldUseLongTimeout(
  req: Pick<Request, "method" | "originalUrl" | "url" | "path">,
  extraPrefixes: string[]
): boolean {
  const p = pathOnlyFromRequest(req);
  const method = (req.method || "GET").toUpperCase();

  if (p.startsWith("/api/procurement/suite06")) {
    if (method === "POST") return true;
    if (method === "PATCH" && /\/intakes\/[^/]+\/verify$/i.test(p)) return true;
  }
  if (method === "POST" && p.startsWith("/api/accounting/purchase-invoices/batch-pay")) {
    return true;
  }
  if (
    method === "POST" &&
    /^\/api\/accounting\/purchase-invoices\/[^/]+\/(submit|pay)$/i.test(p)
  ) {
    return true;
  }
  if (method === "POST" && p === "/api/accounting/purchase-invoices/from-purchase-order") {
    return true;
  }
  if (method === "POST" && p.startsWith("/api/cron")) {
    return true;
  }
  if (method === "POST" && p.startsWith("/api/cashbook/batches/import")) {
    return true;
  }
  if (method === "POST" && p.startsWith("/api/applicant/")) {
    return true;
  }
  if (method === "POST" && p.startsWith("/api/company-profile")) {
    return true;
  }
  if (method === "POST" && /\/api\/procurement\/invoices\/[^/]+\/payment$/i.test(p)) {
    return true;
  }
  if (method === "POST" && /\/api\/performance\/goals\/[^/]+\/attachments/i.test(p)) {
    return true;
  }
  if (method === "POST" && /\/api\/cashbook\/entries\/[^/]+\/receipt-attachment$/i.test(p)) {
    return true;
  }
  if (method === "POST" && /\/api\/cashbook\/[^/]+\/post-batch$/i.test(p)) {
    return true;
  }

  /** Month-end / GL reports — scans journals & open balances; often >5s on dev-api. */
  if (method === "GET" && p.startsWith("/api/accounting/multi-currency/reports/")) {
    return true;
  }
  /** Trial balance (single or consolidated UI) — period rollups over many lines. */
  if (method === "GET" && p.startsWith("/api/accounting/trial-balance")) {
    return true;
  }

  for (const prefix of extraPrefixes) {
    if (prefix && p.startsWith(prefix)) return true;
  }
  return false;
}

export function apiRequestTimeout(): (req: Request, res: Response, next: NextFunction) => void {
  const defaultMs = parseMs("API_REQUEST_TIMEOUT_MS", 5000);
  const longMs = Math.max(defaultMs, parseMs("API_REQUEST_LONG_TIMEOUT_MS", 120000));

  const extraPrefixes = (process.env.API_LONG_TIMEOUT_PATH_PREFIXES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (req: Request, res: Response, next: NextFunction) => {
    if ((req.method || "GET").toUpperCase() === "OPTIONS") {
      return next();
    }

    const p = pathOnlyFromRequest(req);
    if (!p.startsWith("/api")) {
      return next();
    }

    if (defaultMs <= 0) {
      return next();
    }

    const ms = shouldUseLongTimeout(req, extraPrefixes) ? longMs : defaultMs;

    const tid = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({
          success: false,
          message: `Request timed out after ${ms}ms (API SLA). Narrow queries, paginate, or use async jobs for heavy work.`,
          error: "REQUEST_TIMEOUT",
        });
      }
    }, ms);

    const done = () => clearTimeout(tid);
    res.on("finish", done);
    res.on("close", done);

    next();
  };
}
