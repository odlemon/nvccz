// @ts-nocheck
import { createHash, randomUUID } from "crypto";
import { NextFunction, Response } from "express";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import type { LpPortalRequest } from "./lpPortalAuth";
import {
  LpPortalAccessService,
  type LpPortalRole,
} from "../services/lpPortal/LpPortalAccessService";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{8,200}$/;

export class LpPortalError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly fieldErrors: Record<string, string> | null = null,
    public readonly details: unknown = null,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "LpPortalError";
  }
}

/** Role → permission matrix (SRD §3.5). Staff (GP impersonation) gets full set. */
const ROLE_PERMS: Record<string, string[]> = {
  VIEWER: [
    "lp.portal.access",
    "lp.portal.switch_fund",
    "lp.portal.view_notifications",
    "lp.dashboard.view",
    "lp.investments.view",
    "lp.commitment.view",
    "lp.capital_account.view",
    "lp.holdings.view",
    "lp.capital_calls.view",
    "lp.capital_calls.download_notice",
    "lp.distributions.view",
    "lp.distributions.download",
    "lp.dealing.view",
    "lp.dealing.estimate",
    "lp.performance.view",
    "lp.performance.download_report",
    "lp.activity.view",
    "lp.activity.export",
    "lp.documents.view",
    "lp.documents.download",
    "lp.notices.view",
    "lp.requests.view",
    "lp.messages.view",
    "lp.organisation.view",
    "lp.settings.view",
  ],
  SIGNATORY: [],
  MANAGER: [],
};

ROLE_PERMS.SIGNATORY = [
  ...ROLE_PERMS.VIEWER,
  "lp.capital_calls.acknowledge",
  "lp.capital_calls.upload_payment_confirmation",
  "lp.dealing.subscribe",
  "lp.dealing.redeem",
  "lp.notices.acknowledge",
  "lp.requests.create",
  "lp.messages.reply",
  "lp.settings.manage_mfa",
];

ROLE_PERMS.MANAGER = [
  ...ROLE_PERMS.SIGNATORY,
  "lp.organisation.manage_colleagues",
];

// Legacy LP_MANAGER / ADMIN map to MANAGER
const ROLE_ALIASES: Record<string, LpPortalRole> = {
  VIEWER: "VIEWER",
  SIGNATORY: "SIGNATORY",
  MANAGER: "MANAGER",
  LP_MANAGER: "MANAGER",
  ADMIN: "MANAGER",
  LP_VIEWER: "VIEWER",
};

export function normalizeLpRole(role: string | null | undefined): LpPortalRole {
  if (!role) return "VIEWER";
  const key = String(role).toUpperCase();
  return ROLE_ALIASES[key] || (key as LpPortalRole) || "VIEWER";
}

export function permissionsForRole(role: string | null | undefined, isStaff: boolean): Set<string> {
  if (isStaff) {
    return new Set([
      ...ROLE_PERMS.MANAGER,
      "lp.organisation.manage_colleagues",
    ]);
  }
  const normalized = normalizeLpRole(role);
  return new Set(ROLE_PERMS[normalized] || ROLE_PERMS.VIEWER);
}

export function hasLpPermission(
  ctx: { lpRole: string | null; isStaff: boolean },
  permission: string
): boolean {
  return permissionsForRole(ctx.lpRole, ctx.isStaff).has(permission);
}

export function requireLpPermission(permission: string) {
  return (req: LpPortalRequest, res: Response, next: NextFunction) => {
    const ctx = req.lpPortal;
    if (!ctx) {
      return res.status(401).json(errorBody("LP_UNAUTHORIZED", "Unauthorized", 401));
    }
    if (!hasLpPermission(ctx, permission)) {
      return res.status(403).json(
        errorBody("LP_FORBIDDEN", `Missing permission ${permission}`, 403)
      );
    }
    return next();
  };
}

export function decimalSafe(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Decimal) return value.toFixed();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    // Keep integers clean; money-ish floats as fixed-ish strings when clearly decimal
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  if (Array.isArray(value)) return value.map(decimalSafe);
  if (typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = decimalSafe(v);
    }
    return out;
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function moneyStr(value: unknown): string {
  if (value == null) return "0";
  if (value instanceof Decimal) return value.toFixed(2);
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(2);
}

export function successBody(
  data: unknown,
  message?: string,
  requestId?: string
) {
  return {
    success: true,
    ...(message ? { message } : {}),
    data: decimalSafe(data),
    timestamp: new Date().toISOString(),
    meta: { requestId: requestId || randomUUID() },
  };
}

export function listBody(
  items: unknown[],
  page: number,
  pageSize: number,
  total: number,
  message?: string,
  requestId?: string
) {
  return successBody(
    {
      items: decimalSafe(items),
      page,
      pageSize,
      total,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    },
    message,
    requestId
  );
}

export function errorBody(
  code: string,
  message: string,
  _status = 400,
  fieldErrors: Record<string, string> | null = null,
  details: unknown = null,
  retryable = false
) {
  return {
    success: false,
    message,
    error: {
      code,
      message,
      ...(fieldErrors ? { fieldErrors } : {}),
      ...(details != null ? { details } : {}),
      retryable,
    },
    timestamp: new Date().toISOString(),
    meta: { requestId: randomUUID() },
  };
}

export function parseListQuery(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page || "1"), 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(String(query.pageSize ?? query.limit ?? "50"), 10) || 50)
  );
  const direction = String(query.sortDirection ?? query.sortDir ?? "desc").toLowerCase();
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    search: query.search ? String(query.search).trim() : undefined,
    sortBy: query.sortBy ? String(query.sortBy) : "createdAt",
    sortDirection: direction === "asc" ? ("asc" as const) : ("desc" as const),
    from: query.from ? String(query.from) : undefined,
    to: query.to ? String(query.to) : undefined,
    fundId: query.fundId && String(query.fundId) !== "all" ? String(query.fundId) : undefined,
    asOfDate: query.asOfDate ? String(query.asOfDate) : undefined,
    presentationCurrency: query.presentationCurrency
      ? String(query.presentationCurrency).toUpperCase()
      : undefined,
    status: query.status ? String(query.status) : undefined,
  };
}

export function assertFundAccess(ctx: { fundScope: string[] | null }, fundId: string) {
  if (!LpPortalAccessService.fundAllowed(ctx as any, fundId)) {
    throw new LpPortalError("LP_FORBIDDEN", "Not entitled to this fund", 403);
  }
}

export function lpPortalContract(req: LpPortalRequest, res: Response, next: NextFunction) {
  const headerId = req.header("X-Request-Id") || req.header("x-request-id");
  const requestId =
    headerId && REQUEST_ID_PATTERN.test(headerId) ? headerId : randomUUID();
  (req as any).lpRequestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    if (body && typeof body === "object" && body.success === true && body.meta == null) {
      body.meta = { requestId };
      if (!body.timestamp) body.timestamp = new Date().toISOString();
      if (body.data !== undefined) body.data = decimalSafe(body.data);
    }
    return originalJson(body);
  };
  next();
}

export function lpPortalErrorHandler(
  err: any,
  _req: LpPortalRequest,
  res: Response,
  next: NextFunction
) {
  if (res.headersSent) return next(err);
  if (err instanceof LpPortalError) {
    return res
      .status(err.status)
      .json(errorBody(err.code, err.message, err.status, err.fieldErrors, err.details, err.retryable));
  }
  if (err?.statusCode || err?.status) {
    const status = err.statusCode || err.status;
    const code =
      status === 401
        ? "LP_UNAUTHORIZED"
        : status === 403
          ? "LP_FORBIDDEN"
          : status === 404
            ? "LP_NOT_FOUND"
            : "LP_VALIDATION";
    return res.status(status).json(errorBody(code, err.message || "Error", status));
  }
  console.error("[lp-portal]", err);
  return res.status(500).json(errorBody("LP_EXPORT_FAILED", err?.message || "Internal error", 500));
}

function payloadHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
}

export function requireLpIdempotencyKey(action: string) {
  return async (req: LpPortalRequest, res: Response, next: NextFunction) => {
    try {
      const key = String(req.header("Idempotency-Key") || "").trim();
      if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
        throw new LpPortalError(
          "LP_VALIDATION",
          "Idempotency-Key header required (8–200 printable ASCII)",
          400
        );
      }
      const ctx = req.lpPortal;
      if (!ctx) throw new LpPortalError("LP_UNAUTHORIZED", "Unauthorized", 401);

      const hash = payloadHash(req.body);
      const scope = `${ctx.clientId}:${action}:${req.method}:${req.path}`;

      const existing = await (prisma as any).lpPortalIdempotencyKey.findUnique({
        where: { scope_idempotencyKey: { scope, idempotencyKey: key } },
      });

      if (existing) {
        if (existing.payloadHash !== hash) {
          throw new LpPortalError(
            "LP_IDEMPOTENCY_KEY_REUSED",
            "Idempotency-Key already used with a different payload",
            409
          );
        }
        res.setHeader("Idempotent-Replay", "true");
        return res.status(existing.statusCode || 200).json(JSON.parse(existing.responseJson));
      }

      (req as any).lpIdempotency = { key, scope, hash, action };
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        const statusCode = res.statusCode || 200;
        if (statusCode >= 200 && statusCode < 300) {
          void (prisma as any).lpPortalIdempotencyKey
            .create({
              data: {
                id: randomUUID(),
                clientId: ctx.clientId,
                userId: req.user?.id || null,
                scope,
                idempotencyKey: key,
                payloadHash: hash,
                statusCode,
                responseJson: JSON.stringify(body),
              },
            })
            .catch(() => undefined);
        }
        return originalJson(body);
      };
      return next();
    } catch (e) {
      return next(e);
    }
  };
}
