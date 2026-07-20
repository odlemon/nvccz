import { randomUUID } from "crypto";
import { NextFunction, Response } from "express";
import { Decimal } from "@prisma/client/runtime/library";
import { AuthRequest } from "./authenticate";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{8,200}$/;

export type InvestmentListQuery = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  search?: string;
  sortBy: string;
  sortDirection: "asc" | "desc";
  sortDir: "asc" | "desc";
  from?: string;
  to?: string;
};

export class InvestmentOpsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details: unknown = null,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "InvestmentOpsError";
  }
}

function singleQueryValue(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null) return undefined;
  const text = String(raw).trim();
  return text || undefined;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(singleQueryValue(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function dateQueryValue(value: unknown, field: string): string | undefined {
  const text = singleQueryValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new InvestmentOpsError(
      "INVALID_LIST_FILTER",
      `${field} must be a valid ISO date`,
      400,
      { field, value: text }
    );
  }
  return date.toISOString();
}

export function parseInvestmentListQuery(query: Record<string, unknown>): InvestmentListQuery {
  const page = positiveInteger(query.page, 1);
  const pageSize = Math.min(200, positiveInteger(query.pageSize ?? query.limit, 50));
  const direction = singleQueryValue(query.sortDirection ?? query.sortDir)?.toLowerCase();
  const sortDirection: "asc" | "desc" = direction === "asc" ? "asc" : "desc";
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    search: singleQueryValue(query.search),
    sortBy: singleQueryValue(query.sortBy) || "createdAt",
    sortDirection,
    sortDir: sortDirection,
    from: dateQueryValue(query.from, "from"),
    to: dateQueryValue(query.to, "to"),
  };
}

export function getRequestId(req: AuthRequest): string {
  return String((req as any).investmentOps?.requestId || "");
}

/**
 * Resolve Idempotency-Key for investment-ops writes.
 * Header is optional — missing/invalid values are auto-minted (never IDEMPOTENCY_KEY_REQUIRED).
 */
export function getIdempotencyKey(req: AuthRequest): string {
  const fromCtx = String((req as any).investmentOps?.idempotencyKey || "").trim();
  if (fromCtx && IDEMPOTENCY_KEY_PATTERN.test(fromCtx)) return fromCtx;
  const key = singleQueryValue(req.headers["idempotency-key"]);
  if (key && IDEMPOTENCY_KEY_PATTERN.test(key)) return key;
  const minted = `auto-${randomUUID()}`;
  (req as any).investmentOps = {
    ...(req as any).investmentOps,
    idempotencyKey: minted,
    idempotencyKeyMinted: true,
  };
  req.headers["idempotency-key"] = minted;
  return minted;
}

/** Optional header; always continues. Mints a key when absent. */
export function requireIdempotencyKey(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const key = getIdempotencyKey(req);
  (req as any).investmentOps = {
    ...(req as any).investmentOps,
    idempotencyKey: key,
  };
  if ((req as any).investmentOps?.idempotencyKeyMinted) {
    res.setHeader("X-Idempotency-Key", key);
  }
  next();
}

export function getExpectedVersion(req: AuthRequest): string {
  const bodyVersion = singleQueryValue((req.body as any)?.expectedVersion);
  const rawIfMatch = singleQueryValue(req.headers["if-match"]);
  const ifMatch = rawIfMatch?.replace(/^W\//, "").replace(/^"|"$/g, "");
  const version = bodyVersion || ifMatch;
  if (!version || version === "*") {
    throw new InvestmentOpsError(
      "EXPECTED_VERSION_REQUIRED",
      "If-Match or body.expectedVersion is required",
      428,
      { headers: ["If-Match"], bodyField: "expectedVersion" }
    );
  }
  if (bodyVersion && ifMatch && bodyVersion !== ifMatch) {
    throw new InvestmentOpsError(
      "EXPECTED_VERSION_MISMATCH",
      "If-Match and body.expectedVersion must match",
      400,
      { ifMatch, expectedVersion: bodyVersion }
    );
  }
  return version;
}

export function requireExpectedVersion(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const expectedVersion = getExpectedVersion(req);
    (req as any).investmentOps = { ...(req as any).investmentOps, expectedVersion };
    next();
  } catch (error) {
    sendInvestmentOpsError(res, error);
  }
}

function isAdmin(user: any): boolean {
  const roleName = String(user?.role?.name || "").trim().toLowerCase();
  const roleCode = String(user?.roleCode || "").trim().toLowerCase();
  return ["admin", "system administrator"].includes(roleName) || roleCode === "admin";
}

function permissionEntries(user: any): Array<{ name?: string; value?: boolean }> {
  return Array.isArray(user?.role?.permissions) ? user.role.permissions : [];
}

export function requireInvestmentPermission(permission: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendInvestmentOpsError(
        res,
        new InvestmentOpsError("UNAUTHENTICATED", "Authentication is required", 401)
      );
      return;
    }
    if (isAdmin(req.user)) {
      next();
      return;
    }
    const granted = new Set(
      permissionEntries(req.user)
        .filter((entry) => entry?.value === true)
        .map((entry) => String(entry.name || ""))
    );
    const allowed =
      granted.has(permission) ||
      granted.has("investments.*") ||
      granted.has("investments.admin") ||
      (permission.startsWith("sp.cash.") &&
        (granted.has("sp.cash.access") ||
          granted.has("investments.read") ||
          granted.has("investments.write") ||
          granted.has("investments.approve")));
    if (!allowed) {
      sendInvestmentOpsError(
        res,
        new InvestmentOpsError(
          "INSUFFICIENT_PERMISSION",
          `Permission ${permission} is required`,
          403,
          { requiredPermission: permission }
        )
      );
      return;
    }
    next();
  };
}

function decimalSafe(value: any, seen = new WeakSet<object>()): any {
  if (value == null) return value;
  if (Decimal.isDecimal(value)) return value.toString();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => decimalSafe(item, seen));
  if (typeof value !== "object") return value;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return value;
  if (seen.has(value)) {
    throw new InvestmentOpsError(
      "RESPONSE_SERIALIZATION_FAILED",
      "Response contains a circular value",
      500
    );
  }
  seen.add(value);
  const serialized = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, decimalSafe(child, seen)])
  );
  seen.delete(value);
  return serialized;
}

function errorCode(error: any): string {
  if (error instanceof InvestmentOpsError) return error.code;
  const message = String(error?.message || "");
  const known = new Set([
    "FORBIDDEN_FUND_ACCESS",
    "FUND_NOT_LISTED_EQUITY",
    "FUND_NOT_FOUND",
    "LISTED_EQUITY_CONFIG_NOT_FOUND",
  ]);
  if (known.has(message)) return message;
  if (/not found/i.test(message)) return "RESOURCE_NOT_FOUND";
  if (/invalid|required|cannot|failed|must/i.test(message)) return "VALIDATION_ERROR";
  return "INVESTMENT_OPS_ERROR";
}

function errorStatus(error: any): number {
  if (error instanceof InvestmentOpsError) return error.status;
  const code = errorCode(error);
  if (code === "FORBIDDEN_FUND_ACCESS") return 403;
  if (code === "RESOURCE_NOT_FOUND" || code === "FUND_NOT_FOUND") return 404;
  if (code === "FUND_NOT_LISTED_EQUITY") return 400;
  return 400;
}

function responseMeta(res: Response, extra?: Record<string, unknown>) {
  return {
    ...extra,
    requestId: String(res.locals.investmentOpsRequestId || ""),
    serverTime: new Date().toISOString(),
  };
}

export function sendInvestmentOpsError(res: Response, error: any): Response {
  const code = errorCode(error);
  const message = String(error?.message || "Investment Operations request failed");
  const details = error instanceof InvestmentOpsError ? error.details : null;
  const retryable = error instanceof InvestmentOpsError ? error.retryable : false;
  return res.status(errorStatus(error)).json({
    success: false,
    code,
    message,
    details,
    retryable,
    error: { code, message, details, retryable },
  });
}

export function investmentOpsContract(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const incoming = singleQueryValue(req.headers["x-request-id"]);
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  (req as any).investmentOps = { ...(req as any).investmentOps, requestId };
  res.locals.investmentOpsRequestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    const normalized =
      body && typeof body === "object"
        ? { ...body }
        : res.statusCode >= 400
          ? { success: false, message: String(body ?? "Request failed") }
          : { success: true, data: body };

    if (normalized.success === false || res.statusCode >= 400) {
      const source = normalized.error || normalized;
      const code = source.code || normalized.code || errorCode({ message: source.message });
      const message = source.message || normalized.message || "Investment Operations request failed";
      const details = source.details ?? normalized.details ?? null;
      const retryable = Boolean(source.retryable ?? normalized.retryable ?? false);
      return originalJson(
        decimalSafe({
          ...normalized,
          success: false,
          code,
          message,
          details,
          retryable,
          error: { code, message, details, retryable },
          meta: responseMeta(res, normalized.meta),
        })
      );
    }

    const data = Object.prototype.hasOwnProperty.call(normalized, "data")
      ? normalized.data
      : normalized;
    const pagination =
      data &&
      !Array.isArray(data) &&
      Array.isArray(data.items) &&
      ["page", "pageSize", "total"].every((key) => data[key] != null)
        ? {
            page: data.page,
            pageSize: data.pageSize,
            total: data.total,
            totalPages: data.totalPages,
          }
        : undefined;
    return originalJson(
      decimalSafe({
        ...normalized,
        success: true,
        data,
        meta: responseMeta(res, {
          ...(normalized.meta || {}),
          ...(pagination ? { pagination } : {}),
        }),
      })
    );
  }) as any;
  next();
}

type InMemoryIdempotencyEntry<T> = {
  expiresAt: number;
  value: T;
};

/**
 * Process-local helper for tests/single-process adapters only. It is deliberately
 * not wired as durable command idempotency; database persistence is required for that.
 */
export class InMemoryIdempotencyStore<T = unknown> {
  private readonly entries = new Map<string, InMemoryIdempotencyEntry<T>>();

  constructor(private readonly ttlMs = 5 * 60_000) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.entries.clear();
  }
}
