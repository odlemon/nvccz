// @ts-nocheck
import { randomBytes } from "crypto";

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
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || Number(query.limit) || 50));
  const skip = (page - 1) * pageSize;
  const sortBy = (query.sortBy as string) || "createdAt";
  const sortDir = String(query.sortDir || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  return { page, pageSize, skip, take: pageSize, sortBy, sortDir };
}

export function paginatedResult<T>(rows: T[], total: number, page: number, pageSize: number) {
  return { items: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
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
