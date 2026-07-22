// @ts-nocheck
import { randomBytes } from "crypto";
import { parseInvestmentListQuery } from "../../middleware/investmentOpsFoundation";

export function orderRef(): string {
  return `ORD-${Date.now().toString(36)}${randomBytes(2).toString("hex")}`.toUpperCase();
}

export function reportRef(): string {
  return `RPT-${Date.now().toString(36)}`.toUpperCase();
}

export const ORDER_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "COMPLIANCE_REVIEW",
  "APPROVED",
  "SENT_TO_BROKER",
  "BROKER_CONFIRMATION_RECORDED",
  "PARTIALLY_EXECUTED",
  "EXECUTED",
  "PENDING_SETTLEMENT",
  "SETTLED",
  "CANCELLED",
  "REJECTED",
  "FAILED",
  "ARCHIVED",
] as const;

export const PRICE_STATUSES = [
  "PENDING",
  "VALIDATED",
  "APPROVED",
  "REJECTED",
  "STALE",
  "ESTIMATED",
  "MANUAL_OVERRIDE",
  "API_CONFIRMED",
] as const;

/** SRD §5.3 period selector → date range (inclusive start, exclusive end = now). */
export function periodRange(
  period = "YTD",
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date; label: string } {
  const end = customEnd ? new Date(customEnd) : new Date();
  const start = new Date(end);
  const p = String(period).toUpperCase();
  if (p === "CUSTOM" && customStart) {
    return { start: new Date(customStart), end, label: "CUSTOM" };
  }
  if (p === "DAY" || p === "DAILY") {
    start.setHours(0, 0, 0, 0);
    return { start, end, label: "DAY" };
  }
  if (p === "WEEK" || p === "WEEKLY") {
    start.setDate(start.getDate() - 7);
    return { start, end, label: "WEEK" };
  }
  if (p === "MONTH" || p === "MONTHLY" || p === "MTD") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: "MTD" };
  }
  if (p === "QUARTER" || p === "QTD") {
    const q = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(q, 1);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: "QTD" };
  }
  // YTD default
  start.setMonth(0, 1);
  start.setHours(0, 0, 0, 0);
  return { start, end, label: "YTD" };
}

export function parsePagination(query: Record<string, unknown>) {
  return parseInvestmentListQuery(query);
}

export function paginatedResult<T>(rows: T[], total: number, page: number, pageSize: number) {
  return { items: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
}

/** Canonical money/qty display: always a decimal string (never invent values). */
export function moneyStr(value: unknown, fractionDigits = 2): string | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(fractionDigits);
}

export function moneyStr0(value: unknown, fractionDigits = 2): string {
  return moneyStr(value, fractionDigits) ?? (0).toFixed(fractionDigits);
}

const ALLOCATION_BUCKET: Record<string, string> = {
  EQUITY: "equities",
  ETF: "funds",
  CASH: "cash",
  BOND: "bonds",
  FUND: "funds",
  OPTION: "alternatives",
  FUTURE: "alternatives",
  CFD: "alternatives",
  FX_FORWARD: "other",
  COMMODITY: "commodities",
  CERTIFICATE: "other",
  CRYPTO: "crypto",
};

export function allocationBucketForType(typeCode: string): string {
  return ALLOCATION_BUCKET[String(typeCode).toUpperCase()] || "other";
}

export function userDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null | undefined): string | null {
  if (!user) return null;
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return name || user.email || null;
}

/** Compact instrument snapshot for positions/holdings list rows. */
export function instrumentListSnapshot(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    symbol: row.ticker || row.instrumentCode || null,
    shortName: row.shortName || null,
    fullName: row.fullName || null,
    sector: row.sector || null,
    countryCode: row.countryCode || null,
    exchangeCode: row.exchangeCode || null,
    instrumentTypeCode: row.instrumentTypeCode || null,
  };
}

const REVIEWABLE_PRICE_STATUSES = new Set(["PENDING_REVIEW", "PENDING", "VALIDATED"]);

export function priceTickReviewable(validationStatus: string | null | undefined): boolean {
  return REVIEWABLE_PRICE_STATUSES.has(String(validationStatus || "").toUpperCase());
}
