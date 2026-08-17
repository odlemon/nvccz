// @ts-nocheck
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import {
  InvestmentOpsError,
  parseInvestmentListQuery,
} from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";
import { InvestmentAuditEventService } from "../investmentOps/InvestmentAuditEventService";
import { InvestmentOutboxService } from "../investmentOps/InvestmentOutboxService";
import { investmentOpsIsAdmin } from "../investmentOps/investmentOpsFourEye";

export const db = prisma as any;

export const CALCULATION_VERSION_USD = "AVAIL-USD-v4";
export const CALCULATION_VERSION = "AVAIL-v1";

const MONEY_EPS = new Decimal("0.000001");
const ENC_ALGO = "aes-256-gcm";
const IV_LEN = 12;

export function d(v: unknown): Decimal {
  if (v == null || v === "") return new Decimal(0);
  if (Decimal.isDecimal(v)) return v as Decimal;
  try {
    return new Decimal(String(v));
  } catch {
    throw new InvestmentOpsError("INVALID_DECIMAL", `Invalid decimal: ${v}`, 400);
  }
}

export function moneyStr(v: unknown): string {
  return d(v).toFixed(2);
}

export function moneyStrPrecise(v: unknown, places = 6): string {
  return d(v).toFixed(places);
}

export type BalanceLine = {
  debit?: unknown;
  credit?: unknown;
  signedCashAmount?: unknown;
};

export function assertBalanced(lines: BalanceLine[]): void {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new InvestmentOpsError(
      "UNBALANCED_JOURNAL",
      "Journal requires at least two lines",
      400
    );
  }
  let debitSum = new Decimal(0);
  let creditSum = new Decimal(0);
  for (const line of lines) {
    debitSum = debitSum.plus(d(line.debit ?? 0));
    creditSum = creditSum.plus(d(line.credit ?? 0));
  }
  if (debitSum.minus(creditSum).abs().gt(MONEY_EPS)) {
    throw new InvestmentOpsError(
      "UNBALANCED_JOURNAL",
      `Journal lines are unbalanced (debits=${moneyStr(debitSum)}, credits=${moneyStr(creditSum)})`,
      400,
      { debitTotal: moneyStr(debitSum), creditTotal: moneyStr(creditSum) }
    );
  }
}

export function fingerprint(parts: Array<string | number | null | undefined>): string {
  const payload = parts.map((p) => String(p ?? "")).join("|");
  return createHash("sha256").update(payload).digest("hex");
}

function deriveEncKey(): Buffer {
  const secret =
    process.env.SP_CASH_ENCRYPTION_KEY ||
    process.env.VENDOR_ARTIFACTS_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "dev-only-sp-cash-key";
  return createHash("sha256").update(String(secret)).digest();
}

/** Encrypt external account identifier; returns opaque base64 payload. */
export function encryptExternalId(plain: string): string {
  const key = deriveEncKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ENC_ALGO, key, iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptExternalId(payload: string): string {
  const buf = Buffer.from(String(payload), "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const data = buf.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ENC_ALGO, deriveEncKey(), iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function maskAccount(id: string): string {
  const s = String(id || "");
  if (s.length <= 4) return `****${s}`;
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

/** Prisma/cuid-style opaque ids — never use these as operator-facing labels. */
export function isOpaqueDbId(value: unknown): boolean {
  const s = String(value || "").trim();
  return /^c[a-z0-9]{20,}$/i.test(s);
}

export function formatUserDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  id?: string;
} | null | undefined): string | null {
  if (!user) return null;
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  if (name) return name;
  if (user.email) return user.email;
  return null;
}

/**
 * Human labels for recon tables. Never surfaces Prisma cuids as account/client labels.
 * Cleartext bank numbers stay encrypted; operators get masked + client name.
 */
export function presentCashAccountLabels(account: any | null | undefined): {
  accountNumber: string | null;
  accountNumberMasked: string | null;
  cashAccountLabel: string | null;
  cashAccountName: string | null;
  clientName: string | null;
} {
  if (!account) {
    return {
      accountNumber: null,
      accountNumberMasked: null,
      cashAccountLabel: null,
      cashAccountName: null,
      clientName: null,
    };
  }
  const maskedRaw = account.accountNumberMasked || account.maskedIdentifier || null;
  const masked =
    maskedRaw && !isOpaqueDbId(maskedRaw) ? String(maskedRaw) : null;
  const clientName =
    account.clientName && !isOpaqueDbId(account.clientName)
      ? String(account.clientName)
      : null;
  // Operators see the vehicle/client name — never ****FUND as the account column.
  const human = clientName || null;
  return {
    accountNumber: human,
    accountNumberMasked: masked,
    cashAccountLabel: human,
    cashAccountName: human,
    clientName,
  };
}

export async function loadCashAccountLabelMap(
  accountIds: string[]
): Promise<Record<string, ReturnType<typeof presentCashAccountLabels>>> {
  const ids = [...new Set(accountIds.filter(Boolean))];
  if (!ids.length) return {};
  const rows = await db.spCashClientAccount.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      clientName: true,
      accountNumberMasked: true,
      maskedIdentifier: true,
      accountType: true,
      moneyClass: true,
      portfolioId: true,
    },
  });
  return Object.fromEntries(
    rows.map((r: any) => [r.id, presentCashAccountLabels(r)])
  );
}

export async function loadUserDisplayMap(
  userIds: string[]
): Promise<Record<string, { name: string | null; email: string | null }>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return Object.fromEntries(
    users.map((u: any) => [
      u.id,
      { name: formatUserDisplayName(u), email: u.email || null },
    ])
  );
}

export async function loadFundNameMap(
  fundIds: string[]
): Promise<Record<string, string | null>> {
  const ids = [...new Set(fundIds.filter(Boolean))];
  if (!ids.length) return {};
  const funds = await db.fund.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return Object.fromEntries(funds.map((f: any) => [f.id, f.name || null]));
}

export function hashFile(content: string | Buffer): string {
  return createHash("sha256")
    .update(typeof content === "string" ? content : content)
    .digest("hex");
}

export function assertMakerNotChecker(
  makerId: string | null | undefined,
  checkerId: string,
  actorUser?: any
): void {
  if (actorUser && investmentOpsIsAdmin(actorUser)) return;
  if (makerId && String(makerId) === String(checkerId)) {
    throw new InvestmentOpsError(
      "MAKER_CHECKER_CONFLICT",
      "Maker cannot act as checker on the same item",
      409
    );
  }
}

export function assertVersion(row: { version?: number } | null | undefined, expected: unknown): void {
  const expectedNum = Number(expected);
  if (!Number.isFinite(expectedNum)) {
    throw new InvestmentOpsError(
      "EXPECTED_VERSION_REQUIRED",
      "expectedVersion is required",
      400
    );
  }
  if (!row || Number(row.version) !== expectedNum) {
    throw new InvestmentOpsError(
      "STALE_VERSION",
      "Resource was modified; refresh and retry",
      409,
      { expected: expectedNum, actual: row?.version ?? null }
    );
  }
}

export type CashAuditParams = {
  actorId?: string | null;
  roleName?: string | null;
  tenantId?: string | null;
  legalEntityId?: string | null;
  objectType: string;
  objectId: string;
  objectVersion?: number | null;
  eventType: string;
  correlationId?: string | null;
  reason?: string | null;
  beforeHash?: string | null;
  afterHash?: string | null;
  outcome?: string | null;
  ipAddress?: string | null;
  payloadJson?: Record<string, unknown> | null;
  tx?: any;
};

export async function audit(params: CashAuditParams) {
  const client = params.tx || db;
  return client.spCashAuditEvent.create({
    data: {
      actorId: params.actorId ?? null,
      roleName: params.roleName ?? null,
      tenantId: params.tenantId ?? null,
      legalEntityId: params.legalEntityId ?? null,
      objectType: params.objectType,
      objectId: params.objectId,
      objectVersion: params.objectVersion ?? null,
      eventType: params.eventType,
      correlationId: params.correlationId ?? null,
      reason: params.reason ?? null,
      beforeHash: params.beforeHash ?? null,
      afterHash: params.afterHash ?? null,
      outcome: params.outcome ?? "SUCCESS",
      ipAddress: params.ipAddress ?? null,
      payloadJson: params.payloadJson ?? null,
    },
  });
}

export type EmitCashParams = {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion?: number;
  actorId?: string | null;
  payload?: Record<string, unknown>;
  reason?: string | null;
  tenantId?: string | null;
  legalEntityId?: string | null;
  correlationId?: string | null;
  tx?: any;
};

/** Best-effort: SpCash audit (+ async platform sinks — never block caller on hash-chain audit). */
export async function emitCash(params: EmitCashParams) {
  const version = params.aggregateVersion ?? 1;
  const payload = params.payload ?? {};
  await audit({
    actorId: params.actorId,
    tenantId: params.tenantId,
    legalEntityId: params.legalEntityId,
    objectType: params.aggregateType,
    objectId: params.aggregateId,
    objectVersion: version,
    eventType: params.eventType,
    correlationId: params.correlationId,
    reason: params.reason,
    payloadJson: payload,
    tx: params.tx,
  });

  const platform = async () => {
    try {
      await InvestmentAuditEventService.append({
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        eventType: params.eventType,
        actorId: params.actorId,
        correlationId: params.correlationId,
        afterJson: payload,
        metadataJson: { domain: "sp_cash" },
      });
    } catch {
      /* best-effort platform audit */
    }
    try {
      await InvestmentOutboxService.enqueue({
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        aggregateVersion: version,
        eventType: params.eventType,
        payloadJson: { ...payload, actorId: params.actorId ?? null },
        idempotencyKey: `sp-cash:${params.eventType}:${params.aggregateId}:v${version}`,
      });
    } catch {
      /* best-effort outbox */
    }
  };
  // Do not await — concurrent domain writes must not serialize on platform audit chain
  void platform();
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function payloadHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value ?? null)).digest("hex");
}

/**
 * Idempotency helper using sp_cash_idempotency_keys.
 * Replays prior response when same key+hash; conflicts on hash mismatch.
 */
export async function withIdempotency<T>(
  scope: string,
  key: string | null | undefined,
  payload: unknown,
  fn: () => Promise<T>,
  statusCode = 200
): Promise<T> {
  if (!key) return fn();
  const hash = payloadHash(payload);
  const existing = await db.spCashIdempotencyKey.findUnique({
    where: { scope_idempotencyKey: { scope, idempotencyKey: key } },
  });
  if (existing) {
    if (existing.payloadHash !== hash) {
      throw new InvestmentOpsError(
        "IDEMPOTENCY_KEY_REUSE",
        "Idempotency-Key was reused with a different payload",
        409
      );
    }
    return JSON.parse(existing.responseJson) as T;
  }

  const result = await fn();
  try {
    await db.spCashIdempotencyKey.create({
      data: {
        scope,
        idempotencyKey: key,
        payloadHash: hash,
        statusCode,
        responseJson: JSON.stringify(result),
      },
    });
  } catch (error: any) {
    if (String(error?.code) === "P2002") {
      const again = await db.spCashIdempotencyKey.findUnique({
        where: { scope_idempotencyKey: { scope, idempotencyKey: key } },
      });
      if (again && again.payloadHash === hash) {
        return JSON.parse(again.responseJson) as T;
      }
      throw new InvestmentOpsError(
        "IDEMPOTENCY_KEY_REUSE",
        "Idempotency-Key was reused with a different payload",
        409
      );
    }
    throw error;
  }
  return result;
}

export function parsePagination(query: Record<string, unknown> = {}) {
  return parseInvestmentListQuery(query);
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 0,
  };
}

/** 404 without leaking existence when client/vehicle scope mismatches. */
export function hideOrForbidden(
  row: any,
  opts: { clientOrVehicleId?: string | null; tenantId?: string | null } = {}
): never | any {
  if (!row) {
    throw new InvestmentOpsError("NOT_FOUND", "Cash account not found", 404);
  }
  if (
    opts.clientOrVehicleId &&
    row.clientOrVehicleId &&
    String(row.clientOrVehicleId) !== String(opts.clientOrVehicleId)
  ) {
    throw new InvestmentOpsError("NOT_FOUND", "Cash account not found", 404);
  }
  if (opts.tenantId && row.tenantId && String(row.tenantId) !== String(opts.tenantId)) {
    throw new InvestmentOpsError("NOT_FOUND", "Cash account not found", 404);
  }
  return row;
}

export function parseDateOnly(value: unknown, field = "date"): Date | null {
  if (value == null || value === "") return null;
  const text = String(value).slice(0, 10);
  const dt = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) {
    throw new InvestmentOpsError("INVALID_DATE", `${field} must be a valid date`, 400, { field });
  }
  return dt;
}

export function requireStr(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new InvestmentOpsError("VALIDATION_ERROR", `${field} is required`, 400, { field });
  }
  return text;
}

export function moneyPair(amount: unknown, currency: string) {
  return { amount: moneyStr(amount), currency };
}

export function serializeMoneyFields<T extends Record<string, any>>(
  row: T,
  fields: string[]
): T {
  const out: any = { ...row };
  for (const f of fields) {
    if (out[f] != null) out[f] = moneyStr(out[f]);
  }
  return out;
}
