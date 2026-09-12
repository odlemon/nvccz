export const ACCOUNTING_MODULE_CODES = [
  "GL",
  "AR",
  "AP",
  "BANK",
  "IC",
  "OE",
  "PO",
] as const;

export type AccountingModuleCode = (typeof ACCOUNTING_MODULE_CODES)[number];

export type PeriodLockSource = "API" | "JOB" | "IMPORT" | "SYSTEM";

export type LockPolicy = "ERROR" | "WARN";

export type DraftModuleLockEntry = {
  fiscalPeriodId: string;
  moduleCode: string;
  lockStatus: "OPEN" | "LOCKED" | "CLOSED";
  reason?: string | null;
};

export type PeriodLockDraftJson = {
  moduleLocks: DraftModuleLockEntry[];
};

export function getYmdInTimeZone(d: Date, timeZone: string): { y: number; m: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { y, m, day };
}

/** UTC midnight for calendar y-m-d (storage probe for period range compare). */
export function utcDateFromYmd(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, day));
}

export class PeriodLockRejectedError extends Error {
  public readonly code = "PERIOD_LOCK_REJECTED";
  constructor(
    message: string,
    public readonly moduleCode: string,
    public readonly fiscalPeriodLabel: string,
    public readonly accountingDateYmd: string
  ) {
    super(message);
    this.name = "PeriodLockRejectedError";
  }
}
