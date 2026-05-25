// @ts-nocheck
import type { Prisma } from "@prisma/client";
import { prisma } from "../utils/database";
import { syncCompanyGoalsToCeoContract } from "./CeoPerformanceContractLinkService";
import { isCEO } from "./performanceScorecardSupport";

export type PerformanceContractDb = Prisma.TransactionClient | typeof prisma;

const ACTIVE = { notIn: ["ARCHIVED", "CANCELLED"] as string[] };

const MIN_CALENDAR_YEAR = 2000;
const MAX_CALENDAR_YEAR = 2100;

/** Thrown when an ACTIVE contract already exists for the same entity + calendar year (HTTP API returns 409). */
export class PerformanceContractDuplicateError extends Error {
  readonly code = "PERFORMANCE_CONTRACT_DUPLICATE" as const;
  constructor(
    public readonly entityDescription: string,
    public readonly periodYear: number,
    public readonly existingContractId: string
  ) {
    super(
      `A performance contract already exists for ${entityDescription} for calendar year ${periodYear} (existing id: ${existingContractId}).`
    );
    this.name = "PerformanceContractDuplicateError";
  }
}

export function isPerformanceContractDuplicateError(e: unknown): e is PerformanceContractDuplicateError {
  return e instanceof PerformanceContractDuplicateError;
}

/** UTC bounds for a calendar year (annual performance cycle, e.g. Jan–Dec 2026). */
export function utcCalendarYearBounds(year: number) {
  return {
    periodStart: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
  };
}

/**
 * Default annual period from “today” (UTC year).
 * Used by backfill scripts only — HTTP APIs must send an explicit period (see `parseRequiredAnnualPerformancePeriod`).
 */
export function defaultEmployeePerformanceContractPeriod(now: Date = new Date()) {
  const year = now.getUTCFullYear();
  const { periodStart, periodEnd } = utcCalendarYearBounds(year);
  return {
    periodLabel: String(year),
    periodStart,
    periodEnd
  };
}

export type CreatePeriodInput = {
  periodYear?: number;
  periodLabel?: string;
  periodStart?: string | Date;
  periodEnd?: string | Date;
};

/**
 * Every performance contract covers **exactly one UTC calendar year** (Jan 1 00:00:00.000Z – Dec 31 23:59:59.999Z).
 * Callers must send either:
 * - **periodYear** (integer), or
 * - **periodStart** and **periodEnd** matching those bounds for that year (for clients that prefer ISO datetimes).
 * Optional **periodLabel** defaults to the calendar year string.
 */
export function parseRequiredAnnualPerformancePeriod(input: CreatePeriodInput): {
  periodLabel: string;
  periodYear: number;
  periodStart: Date;
  periodEnd: Date;
} {
  const rawYear = input.periodYear;
  const hasYear =
    rawYear !== undefined &&
    rawYear !== null &&
    !(typeof rawYear === "string" && String(rawYear).trim() === "");

  const psIn = input.periodStart;
  const peIn = input.periodEnd;
  const hasStart = psIn !== undefined && psIn !== null && String(psIn).trim() !== "";
  const hasEnd = peIn !== undefined && peIn !== null && String(peIn).trim() !== "";

  if (!hasYear && (!hasStart || !hasEnd)) {
    throw new Error(
      "periodYear (calendar year integer) is required, or provide both periodStart and periodEnd for the full UTC calendar year (Jan 1 00:00:00.000Z through Dec 31 23:59:59.999Z)"
    );
  }

  if (hasYear && hasStart && hasEnd) {
    const y = Math.floor(Number(rawYear));
    if (!Number.isFinite(y) || y < MIN_CALENDAR_YEAR || y > MAX_CALENDAR_YEAR) {
      throw new Error(`periodYear must be an integer between ${MIN_CALENDAR_YEAR} and ${MAX_CALENDAR_YEAR}`);
    }
    const bounds = utcCalendarYearBounds(y);
    const ps = new Date(psIn);
    const pe = new Date(peIn);
    if (Number.isNaN(ps.getTime()) || Number.isNaN(pe.getTime())) {
      throw new Error("periodStart and periodEnd must be valid dates");
    }
    if (ps.getTime() !== bounds.periodStart.getTime() || pe.getTime() !== bounds.periodEnd.getTime()) {
      throw new Error(
        `periodStart must be ${bounds.periodStart.toISOString()} and periodEnd must be ${bounds.periodEnd.toISOString()} for periodYear ${y}`
      );
    }
    const label = input.periodLabel?.trim() || String(y);
    return { periodLabel: label, periodYear: y, periodStart: bounds.periodStart, periodEnd: bounds.periodEnd };
  }

  if (hasYear && (!hasStart || !hasEnd)) {
    const y = Math.floor(Number(rawYear));
    if (!Number.isFinite(y) || y < MIN_CALENDAR_YEAR || y > MAX_CALENDAR_YEAR) {
      throw new Error(`periodYear must be an integer between ${MIN_CALENDAR_YEAR} and ${MAX_CALENDAR_YEAR}`);
    }
    const bounds = utcCalendarYearBounds(y);
    const label = input.periodLabel?.trim() || String(y);
    return { periodLabel: label, periodYear: y, periodStart: bounds.periodStart, periodEnd: bounds.periodEnd };
  }

  const ps = new Date(psIn);
  const pe = new Date(peIn);
  if (Number.isNaN(ps.getTime()) || Number.isNaN(pe.getTime())) {
    throw new Error("periodStart and periodEnd must be valid dates");
  }
  if (ps.getTime() > pe.getTime()) {
    throw new Error("periodStart must be on or before periodEnd");
  }
  const y = ps.getUTCFullYear();
  if (y < MIN_CALENDAR_YEAR || y > MAX_CALENDAR_YEAR) {
    throw new Error(`Period must fall between ${MIN_CALENDAR_YEAR} and ${MAX_CALENDAR_YEAR}`);
  }
  const bounds = utcCalendarYearBounds(y);
  if (ps.getTime() !== bounds.periodStart.getTime() || pe.getTime() !== bounds.periodEnd.getTime()) {
    throw new Error(
      "periodStart and periodEnd must be exactly the UTC calendar-year window for one year. Prefer sending periodYear (e.g. 2026)."
    );
  }
  const label = input.periodLabel?.trim() || String(y);
  return { periodLabel: label, periodYear: y, periodStart: bounds.periodStart, periodEnd: bounds.periodEnd };
}

/** One active contract per entity per calendar year: match exact stored period bounds (no fuzzy overlap). */
function sameAnnualContractWhere(periodStart: Date, periodEnd: Date) {
  return {
    periodStart,
    periodEnd
  };
}

/**
 * Creates an EMPLOYEE performance contract (Manager/HR at period start — not payroll onboarding).
 * If **rejectIfDuplicate** is true (HTTP API), throws **PerformanceContractDuplicateError** when one already exists.
 * If false (default), returns existing row — used by backfill scripts.
 */
export async function createEmployeePerformanceContractInTransaction(
  db: PerformanceContractDb,
  params: {
    subjectUserId: string;
    departmentName: string | null;
    createdById: string;
    employeeFirstName: string;
    employeeLastName: string;
    periodYear?: number;
    periodLabel?: string;
    periodStart?: string | Date;
    periodEnd?: string | Date;
    /** Default false — backfill skips without error. Set true for REST duplicate = 409. */
    rejectIfDuplicate?: boolean;
  }
) {
  const { periodLabel, periodStart, periodEnd, periodYear } = parseRequiredAnnualPerformancePeriod({
    periodYear: params.periodYear,
    periodLabel: params.periodLabel,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd
  });

  const empRow = await db.employee.findUnique({
    where: { userId: params.subjectUserId },
    select: { terminated: true, isActive: true }
  });
  if (empRow && (empRow.terminated === true || empRow.isActive === false)) {
    throw new Error(
      "Cannot create an employee performance contract for a terminated or inactive payroll employee. Reinstate the payroll employee record before creating a contract."
    );
  }

  const existing = await db.performanceContract.findFirst({
    where: {
      contractType: "EMPLOYEE",
      subjectUserId: params.subjectUserId,
      status: ACTIVE,
      ...sameAnnualContractWhere(periodStart, periodEnd)
    },
    orderBy: { updatedAt: "desc" }
  });
  if (existing) {
    if (params.rejectIfDuplicate === true) {
      throw new PerformanceContractDuplicateError(
        "this employee",
        periodYear,
        existing.id
      );
    }
    return { contract: existing, created: false };
  }

  const name = `${params.employeeFirstName} ${params.employeeLastName}`.trim() || "Employee";
  const contract = await db.performanceContract.create({
    data: {
      contractType: "EMPLOYEE",
      title: `Individual performance contract — ${name} (${periodLabel})`,
      status: "ACTIVE",
      periodLabel,
      periodStart,
      periodEnd,
      subjectUserId: params.subjectUserId,
      departmentName: params.departmentName,
      createdById: params.createdById,
      metadata: { source: "manager_or_hr_period_setup" }
    }
  });
  return { contract, created: true };
}

/**
 * Board PC: at most one ACTIVE per calendar year.
 * **rejectIfDuplicate** defaults to true — second POST via API throws **PerformanceContractDuplicateError** (409).
 */
export async function createBoardPerformanceContract(params: {
  createdById: string;
  title?: string;
  reviewerUserId?: string;
  approverUserId?: string;
  subjectUserId?: string;
  /** Default true — reject duplicate. Set false only for internal tooling that must skip quietly. */
  rejectIfDuplicate?: boolean;
} & CreatePeriodInput) {
  const { periodLabel, periodStart, periodEnd, periodYear } = parseRequiredAnnualPerformancePeriod(params);
  const rejectDup = params.rejectIfDuplicate !== false;

  const existing = await prisma.performanceContract.findFirst({
    where: {
      contractType: "BOARD",
      status: ACTIVE,
      ...sameAnnualContractWhere(periodStart, periodEnd)
    },
    orderBy: { updatedAt: "desc" }
  });
  if (existing) {
    if (rejectDup) {
      throw new PerformanceContractDuplicateError("the Board", periodYear, existing.id);
    }
    return { contract: existing, created: false };
  }

  const contract = await prisma.performanceContract.create({
    data: {
      contractType: "BOARD",
      title: params.title?.trim() || `Board performance contract (${periodLabel})`,
      status: "ACTIVE",
      periodLabel,
      periodStart,
      periodEnd,
      createdById: params.createdById,
      subjectUserId: params.subjectUserId || null,
      reviewerUserId: params.reviewerUserId || null,
      approverUserId: params.approverUserId || null,
      metadata: { source: "board_chair_period_setup" }
    }
  });
  return { contract, created: true };
}

/**
 * Org has a single CEO: resolve the user id from **roles** named CEO / Chief Executive and `roleCode`
 * hints, then filter with **`isCEO`** (same rules as scorecards). Call when the client omits **subjectUserId**.
 */
export async function resolveCeoSubjectUserIdFromOrg(): Promise<string> {
  const roles = await prisma.role.findMany({
    where: {
      OR: [
        { name: "CEO" },
        { name: "Chief Executive Officer" },
        { name: { contains: "Chief Executive" } },
        { name: { contains: "CEO" } }
      ]
    },
    select: { id: true, name: true }
  });

  const byRoleId = roles.length
    ? await prisma.user.findMany({
        where: { roleId: { in: roles.map((r) => r.id) } },
        include: { role: { select: { name: true } } }
      })
    : [];

  const byCode = await prisma.user.findMany({
    where: {
      roleCode: { in: ["CEO", "CHIEF_EXECUTIVE", "chief_executive", "ceo"] }
    },
    include: { role: { select: { name: true } } }
  });

  const merged = new Map<string, (typeof byRoleId)[0]>();
  for (const u of [...byRoleId, ...byCode]) {
    merged.set(u.id, u);
  }
  const unique = [...merged.values()];
  const ceos = unique.filter((u) => isCEO({ ...u, role: u.role }));

  if (ceos.length === 1) return ceos[0].id;
  if (ceos.length === 0) {
    throw new Error(
      "No CEO user found. Ensure exactly one user has the CEO / Chief Executive role, or pass subjectUserId in the request body."
    );
  }
  throw new Error(
    `Multiple CEO users found (${ceos.length}). There must be only one CEO in the organisation, or pass subjectUserId explicitly. Users: ${ceos.map((u) => `${u.firstName?.trim() ?? ""} ${u.lastName?.trim() ?? ""} (${u.id})`).join("; ")}`
  );
}

/** CEO PC: at most one ACTIVE per CEO user per calendar year. Default **rejectIfDuplicate** true. */
export async function createCEOPerformanceContract(params: {
  createdById: string;
  subjectUserId: string;
  title?: string;
  reviewerUserId?: string;
  approverUserId?: string;
  rejectIfDuplicate?: boolean;
} & CreatePeriodInput) {
  if (!params.subjectUserId?.trim()) {
    throw new Error("subjectUserId (CEO user) is required for CEO performance contract");
  }
  const { periodLabel, periodStart, periodEnd, periodYear } = parseRequiredAnnualPerformancePeriod(params);
  const rejectDup = params.rejectIfDuplicate !== false;

  const existing = await prisma.performanceContract.findFirst({
    where: {
      contractType: { in: ["CEO", "ceo"] },
      subjectUserId: params.subjectUserId,
      status: ACTIVE,
      ...sameAnnualContractWhere(periodStart, periodEnd)
    },
    orderBy: { updatedAt: "desc" }
  });
  if (existing) {
    if (rejectDup) {
      throw new PerformanceContractDuplicateError(
        `this CEO (user ${params.subjectUserId})`,
        periodYear,
        existing.id
      );
    }
    const { linkedCount } = await syncCompanyGoalsToCeoContract(
      existing.id,
      periodStart,
      periodEnd
    );
    return { contract: existing, created: false, linkedGoalCount: linkedCount };
  }

  const contract = await prisma.performanceContract.create({
    data: {
      contractType: "CEO",
      title: params.title?.trim() || `CEO performance contract (${periodLabel})`,
      status: "ACTIVE",
      periodLabel,
      periodStart,
      periodEnd,
      subjectUserId: params.subjectUserId,
      createdById: params.createdById,
      reviewerUserId: params.reviewerUserId || null,
      approverUserId: params.approverUserId || null,
      metadata: { source: "board_chair_period_setup" }
    }
  });
  const { linkedCount } = await syncCompanyGoalsToCeoContract(
    contract.id,
    periodStart,
    periodEnd
  );
  return { contract, created: true, linkedGoalCount: linkedCount };
}

/** Department PC: at most one ACTIVE per department name per calendar year. Default **rejectIfDuplicate** true. */
export async function createDepartmentPerformanceContract(params: {
  createdById: string;
  departmentName: string;
  title?: string;
  rejectIfDuplicate?: boolean;
} & CreatePeriodInput) {
  const dept = String(params.departmentName || "").trim();
  if (!dept) throw new Error("departmentName is required");

  const { periodLabel, periodStart, periodEnd, periodYear } = parseRequiredAnnualPerformancePeriod(params);
  const rejectDup = params.rejectIfDuplicate !== false;

  const existing = await prisma.performanceContract.findFirst({
    where: {
      contractType: "DEPARTMENT",
      departmentName: dept,
      status: ACTIVE,
      ...sameAnnualContractWhere(periodStart, periodEnd)
    },
    orderBy: { updatedAt: "desc" }
  });
  if (existing) {
    if (rejectDup) {
      throw new PerformanceContractDuplicateError(`department "${dept}"`, periodYear, existing.id);
    }
    return { contract: existing, created: false };
  }

  const contract = await prisma.performanceContract.create({
    data: {
      contractType: "DEPARTMENT",
      title: params.title?.trim() || `Department performance contract — ${dept} (${periodLabel})`,
      status: "ACTIVE",
      periodLabel,
      periodStart,
      periodEnd,
      departmentName: dept,
      createdById: params.createdById,
      metadata: { source: "ceo_or_hr_period_setup" }
    }
  });
  return { contract, created: true };
}
