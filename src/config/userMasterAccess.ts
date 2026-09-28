// @ts-nocheck
/**
 * SRD "User Master" — pure rules (no database access) so both the permission layer and the services can share them.
 *
 * - User status + validity window (effective / end date): who may act at all.
 * - Procurement Function: which procurement areas a person may use, on top of what their role grants.
 * - Access Profile: STANDARD, or READ_ONLY (view-only across procurement).
 * - Segregation-of-duties restriction codes.
 */

export const USER_STATUSES = ["ACTIVE", "SUSPENDED", "LOCKED", "DEACTIVATED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PROCUREMENT_FUNCTIONS = [
  "REQUESTER",
  "BUYER",
  "PROCUREMENT_MANAGER",
  "RECEIVER",
  "AP_CLERK",
  "APPROVER",
  "AUDITOR",
] as const;
export type ProcurementFunction = (typeof PROCUREMENT_FUNCTIONS)[number];

export const ACCESS_PROFILES = ["STANDARD", "READ_ONLY"] as const;
export type AccessProfile = (typeof ACCESS_PROFILES)[number];

/**
 * Duty conflicts an administrator can bar a specific person from.
 * RAISE_AND_APPROVE is enforced for everybody, always (nobody approves a record they raised);
 * listing it on a user is accepted and harmless.
 */
export const SOD_RESTRICTIONS = [
  "RAISE_AND_APPROVE",
  "RECEIVE_AND_APPROVE_INVOICE",
  "CREATE_PO_AND_APPROVE_INVOICE",
  "APPROVE_AND_PAY_INVOICE",
  "REQUEST_AND_RECEIVE_GOODS",
] as const;
export type SodRestriction = (typeof SOD_RESTRICTIONS)[number];

export const SOD_RESTRICTION_LABELS: Record<SodRestriction, string> = {
  RAISE_AND_APPROVE: "Cannot approve a record they raised",
  RECEIVE_AND_APPROVE_INVOICE: "Cannot approve an invoice for goods they received",
  CREATE_PO_AND_APPROVE_INVOICE: "Cannot approve an invoice for a purchase order they created",
  APPROVE_AND_PAY_INVOICE: "Cannot pay an invoice they approved",
  REQUEST_AND_RECEIVE_GOODS: "Cannot receive goods for a requisition they raised",
};

export class UserMasterPolicyError extends Error {
  statusCode: number;
  code: string;
  constructor(code: string, message: string, statusCode = 403) {
    super(message);
    this.name = "UserMasterPolicyError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type Availability = { ok: true } | { ok: false; code: string; message: string };

const STATUS_MESSAGES: Record<string, string> = {
  SUSPENDED: "This account is suspended. Contact your administrator.",
  LOCKED: "This account is locked. Contact your administrator.",
  DEACTIVATED: "This account has been deactivated.",
};

function toDate(v: any): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Status ACTIVE and inside [effectiveDate, endDate]. End date is inclusive of the whole day it names. */
export function userAvailability(user: any, now: Date = new Date()): Availability {
  const status = String(user?.status || "ACTIVE").toUpperCase();
  if (status !== "ACTIVE") {
    return {
      ok: false,
      code: `USER_${status}`,
      message: STATUS_MESSAGES[status] || "This account is not active. Contact your administrator.",
    };
  }
  const start = toDate(user?.effectiveDate);
  if (start && start.getTime() > now.getTime()) {
    return {
      ok: false,
      code: "USER_NOT_YET_EFFECTIVE",
      message: `This account is not active until ${start.toISOString().slice(0, 10)}.`,
    };
  }
  const end = toDate(user?.endDate);
  if (end) {
    const endOfDay = new Date(end);
    endOfDay.setUTCHours(23, 59, 59, 999);
    if (endOfDay.getTime() < now.getTime()) {
      return {
        ok: false,
        code: "USER_EXPIRED",
        message: `This account expired on ${end.toISOString().slice(0, 10)}. Contact your administrator.`,
      };
    }
  }
  return { ok: true };
}

export function isUserAvailable(user: any, now: Date = new Date()): boolean {
  return userAvailability(user, now).ok;
}

const VIEW = /\.view$/;

/** Permission allowed for a function, by the part after `procurement.`. `null` = no function restriction. */
const FUNCTION_RULES: Record<ProcurementFunction, (p: string) => boolean> = {
  REQUESTER: (p) => p === "dashboard.view",
  BUYER: (p) =>
    p === "dashboard.view" ||
    /^(rfq|quotations|contracts|documents)\./.test(p) ||
    ["orders.view", "orders.manage", "vendors.view", "plans.view", "plans.manage"].includes(p),
  PROCUREMENT_MANAGER: (p) => p !== "invoices.pay",
  RECEIVER: (p) =>
    ["dashboard.view", "receiving.view", "receiving.manage", "orders.view", "documents.view"].includes(p),
  AP_CLERK: (p) =>
    ["dashboard.view", "invoices.view", "invoices.pay", "vendors.view", "vendors.banks.view", "orders.view", "documents.view"].includes(p) ||
    /^intake\./.test(p),
  APPROVER: (p) =>
    VIEW.test(p) ||
    ["rfq.award", "receiving.approve", "invoices.approve", "plans.approve", "vendors.approve"].includes(p),
  AUDITOR: (p) => VIEW.test(p),
};

export function normalizeProcurementFunction(v: any): ProcurementFunction | null {
  const s = String(v || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (PROCUREMENT_FUNCTIONS as readonly string[]).includes(s) ? (s as ProcurementFunction) : null;
}

export function normalizeAccessProfile(v: any): AccessProfile | null {
  const s = String(v || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (ACCESS_PROFILES as readonly string[]).includes(s) ? (s as AccessProfile) : null;
}

/**
 * Narrowing applied on top of the role's grants for `procurement.*` permissions. A user with neither a
 * procurement function nor a restrictive access profile is governed by their role alone (unchanged behaviour).
 */
export function procurementScopeAllows(user: any, permissionName: string): boolean {
  if (!permissionName.startsWith("procurement.")) return true;
  const part = permissionName.slice("procurement.".length);
  if (normalizeAccessProfile(user?.accessProfile) === "READ_ONLY" && !VIEW.test(part)) return false;
  const fn = normalizeProcurementFunction(user?.procurementFunction);
  if (fn && !FUNCTION_RULES[fn](part)) return false;
  return true;
}

export function parseSodRestrictions(raw: any): SodRestriction[] {
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      list = raw.split(",");
    }
  }
  if (!Array.isArray(list)) return [];
  const known = new Set<string>(SOD_RESTRICTIONS);
  return [...new Set(list.map((x) => String(x).trim().toUpperCase()).filter((x) => known.has(x)))] as SodRestriction[];
}

export function hasSodRestriction(user: any, code: SodRestriction): boolean {
  return parseSodRestrictions(user?.sodRestrictions).includes(code);
}

export function fullNameOf(user: { firstName?: string | null; lastName?: string | null }): string {
  return [user?.firstName, user?.lastName].map((s) => String(s || "").trim()).filter(Boolean).join(" ");
}
