import { userHasEffectivePermission } from "../config/cfoModulePermissions";
import { prisma } from "../utils/database";
import FiscalCalendarService from "./FiscalCalendarService";
import {
  type AccountingModuleCode,
  type DraftModuleLockEntry,
  type PeriodLockDraftJson,
  type PeriodLockSource,
  PeriodLockRejectedError,
  getYmdInTimeZone,
  utcDateFromYmd,
} from "./fiscalPeriodLockTypes";

const OVERRIDE_PERM = "accounting.period_lock.override";

/** Legacy lock / draft commit can touch many rows; default Prisma interactive tx timeout (5s) is too tight on remote DBs. */
const PERIOD_LOCK_TX = { maxWait: 15_000, timeout: 60_000 } as const;

/** Synthetic module code for company-wide audit rows (stored + API display). */
export const AUDIT_MODULE_COMPANY_POLICY = "COMPANY";
export const AUDIT_MODULE_LEGACY_GL_BANK = "GL,BANK";
export const AUDIT_MODULE_COMMIT_BATCH = "COMMIT_BATCH";

class PeriodLockValidationError extends Error {
  statusCode = 400 as const;
  details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "PeriodLockValidationError";
    this.details = details;
  }
}

function ymdString(d: Date, tz: string): string {
  const { y, m, day } = getYmdInTimeZone(d, tz);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function userHasOverride(
  userPermissions: Array<{ name: string; value: boolean }> | undefined,
  user?: unknown
): boolean {
  if (user && userHasEffectivePermission(user, OVERRIDE_PERM)) return true;
  if (!userPermissions?.length) return false;
  return userPermissions.some((p) => p.name === OVERRIDE_PERM && p.value === true);
}

export default class PeriodLockService {
  /** Structured message for API / jobs. */
  static formatLockedMessage(
    moduleCode: string,
    periodName: string,
    dateYmd: string
  ): string {
    return `The ${moduleCode} period for ${periodName} is locked. You cannot create or post transactions dated ${dateYmd} or earlier in this module.`;
  }

  static async logAudit(params: {
    actionType: string;
    moduleCode?: string | null;
    fiscalPeriodId?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
    performedById: string;
    source: PeriodLockSource;
  }) {
    if (params.performedById === "system") return;
    await prisma.periodLockAuditLog.create({
      data: {
        actionType: params.actionType,
        moduleCode: params.moduleCode ?? undefined,
        fiscalPeriodId: params.fiscalPeriodId ?? undefined,
        oldValue: params.oldValue === undefined ? undefined : (params.oldValue as object),
        newValue: params.newValue === undefined ? undefined : (params.newValue as object),
        reason: params.reason ?? undefined,
        performedById: params.performedById,
        source: params.source,
      },
    });
  }

  static async logFailedAttempt(params: {
    moduleCode: string;
    accountingDate: Date;
    userId: string;
    actionType: string;
    source: PeriodLockSource;
    detail: string;
  }) {
    if (params.userId === "system") return;
    try {
      await this.logAudit({
        actionType: "ATTEMPT_REJECTED",
        moduleCode: params.moduleCode,
        oldValue: { action: params.actionType },
        newValue: {
          accountingDate: params.accountingDate.toISOString(),
          message: params.detail,
        },
        performedById: params.userId,
        source: params.source,
      });
    } catch {
      // best-effort audit
    }
    await this.maybeRecordPostingExceptionForRejection(params).catch(() => undefined);
  }

  /**
   * Queues a posting_exceptions row when company policy `glErrorBatchEnabled` is true
   * (same switch as “use error batch / queue for lock rejects” — no env vars).
   */
  private static async maybeRecordPostingExceptionForRejection(params: {
    moduleCode: string;
    accountingDate: Date;
    userId: string;
    actionType: string;
    source: PeriodLockSource;
    detail: string;
  }): Promise<void> {
    const policy = await prisma.companyAccountingPolicy.findUnique({
      where: { id: "default" },
      select: { glErrorBatchEnabled: true },
    });
    if (!policy?.glErrorBatchEnabled) return;

    const y = params.accountingDate.getUTCFullYear();
    const m = params.accountingDate.getUTCMonth() + 1;
    const d = params.accountingDate.getUTCDate();
    const day = new Date(Date.UTC(y, m - 1, d));

    await prisma.postingException.create({
      data: {
        sourceModule: params.source === "API" ? "API" : String(params.source),
        targetModule: String(params.moduleCode),
        sourceDocumentType: params.actionType.slice(0, 64),
        sourceDocumentId: `lock-reject-${params.userId.slice(0, 12)}-${Date.now()}`,
        accountingDate: day,
        reasonCode: "PERIOD_LOCK_REJECTED",
        status: "OPEN",
        payloadSnapshot: {
          message: params.detail,
          actionType: params.actionType,
        },
      },
    });
  }

  /**
   * Adds stable `display` labels so API clients are not stuck interpreting null module/period.
   */
  static enrichAuditRow<
    T extends {
      actionType: string;
      moduleCode: string | null;
      fiscalPeriodId: string | null;
      newValue?: unknown;
      fiscalPeriod: {
        id: string;
        name: string;
        startDate: Date;
        endDate: Date;
      } | null;
    },
  >(row: T): T & {
    display: {
      scope: string;
      moduleLabel: string;
      periodLabel: string;
      summary: string;
    };
  } {
    const fp = row.fiscalPeriod;
    const rawNv = row.newValue;
    const periodFromJson =
      rawNv && typeof rawNv === "object" && rawNv !== null && "period" in rawNv
        ? String((rawNv as { period?: string }).period ?? "")
        : "";

    let scope: string;
    let moduleLabel: string;
    let periodLabel: string;

    switch (row.actionType) {
      case "POLICY_UPDATE":
        scope = "company_policy";
        moduleLabel = `${AUDIT_MODULE_COMPANY_POLICY} (system-wide policy, not a GL/AR/AP line)`;
        periodLabel = "Not applicable — policy is not tied to a fiscal period.";
        break;
      case "COMMIT_WITH_WARNINGS":
        scope = "commit_warnings";
        moduleLabel = row.moduleCode ?? AUDIT_MODULE_COMMIT_BATCH;
        periodLabel = "Not applicable — warnings span the committed draft.";
        break;
      case "LEGACY_LOCK":
      case "LEGACY_UNLOCK":
        scope = "legacy_cashbook";
        moduleLabel = row.moduleCode ?? AUDIT_MODULE_LEGACY_GL_BANK;
        periodLabel = fp?.name ?? (periodFromJson ? `Calendar month ${periodFromJson}` : "See newValue.period");
        break;
      case "COMMIT_MODULE_LOCK":
        scope = "module_period";
        moduleLabel = row.moduleCode ?? "—";
        periodLabel = fp?.name ?? row.fiscalPeriodId ?? "—";
        break;
      case "ATTEMPT_REJECTED":
        scope = "lock_rejection_attempt";
        moduleLabel = row.moduleCode ?? "—";
        periodLabel = fp?.name ?? "—";
        break;
      case "PERIOD_LOCK_OVERRIDE_ALLOW":
        scope = "override";
        moduleLabel = row.moduleCode ?? "—";
        periodLabel = fp?.name ?? row.fiscalPeriodId ?? "—";
        break;
      default:
        scope = "other";
        moduleLabel = row.moduleCode ?? "—";
        periodLabel = fp?.name ?? row.fiscalPeriodId ?? "—";
    }

    const summary = `[${scope}] ${row.actionType}: ${moduleLabel}; period: ${periodLabel}`;

    return {
      ...row,
      display: { scope, moduleLabel, periodLabel, summary },
    };
  }

  /**
   * When no `FiscalPeriod` spans the date, still enforce `period_lockouts` from the legacy cashbook lock API.
   */
  private static async assertLegacyPeriodLockoutAllowsPosting(params: {
    calYear: number;
    calMonth: number;
    dateYmd: string;
    accountingDate: Date;
    moduleCode: string;
    userId: string;
    source: PeriodLockSource;
    actionType: string;
    userPermissions?: Array<{ name: string; value: boolean }>;
    user?: unknown;
    policy: {
      lockedPeriodPolicy: string | null;
      allowOverridePosting: boolean | null;
    } | null;
  }): Promise<void> {
    const row = await prisma.periodLockout.findUnique({
      where: {
        year_month: { year: params.calYear, month: params.calMonth },
      },
    });
    if (!row?.isLocked) return;

    const periodLabel = `${params.calYear}-${String(params.calMonth).padStart(2, "0")}`;
    const msg = this.formatLockedMessage(AUDIT_MODULE_LEGACY_GL_BANK, periodLabel, params.dateYmd);
    const lockedPeriodPolicy = (params.policy?.lockedPeriodPolicy ?? "ERROR") as "ERROR" | "WARN";
    const allowOverridePosting = params.policy?.allowOverridePosting ?? false;

    if (
      lockedPeriodPolicy === "WARN" &&
      allowOverridePosting &&
      userHasOverride(params.userPermissions, params.user)
    ) {
      await this.logAudit({
        actionType: "PERIOD_LOCK_OVERRIDE_ALLOW",
        moduleCode: AUDIT_MODULE_LEGACY_GL_BANK,
        fiscalPeriodId: null,
        newValue: {
          accountingDate: params.dateYmd,
          actionType: params.actionType,
          legacyMonth: periodLabel,
        },
        performedById: params.userId,
        source: params.source,
      });
      return;
    }

    await this.logFailedAttempt({
      moduleCode: params.moduleCode,
      accountingDate: params.accountingDate,
      userId: params.userId,
      actionType: params.actionType,
      source: params.source,
      detail: msg,
    });
    throw new PeriodLockRejectedError(msg, params.moduleCode, periodLabel, params.dateYmd);
  }

  /**
   * Central guard: fiscal period shell + per-module lock + policy (ERROR vs WARN + override).
   */
  static async assertModuleDateOpen(params: {
    moduleCode: AccountingModuleCode | string;
    accountingDate: Date;
    userId: string;
    source: PeriodLockSource;
    actionType: string;
    userPermissions?: Array<{ name: string; value: boolean }>;
    user?: unknown;
  }): Promise<void> {
    const tz = await FiscalCalendarService.getFiscalTimezone();
    const dateYmd = ymdString(params.accountingDate, tz);
    const { y: calYear, m: calMonth } = getYmdInTimeZone(params.accountingDate, tz);

    const [fp, policy] = await Promise.all([
      FiscalCalendarService.getPeriodForDate(params.accountingDate),
      prisma.companyAccountingPolicy.findUnique({ where: { id: "default" } }),
    ]);

    if (!fp) {
      await this.assertLegacyPeriodLockoutAllowsPosting({
        calYear,
        calMonth,
        dateYmd,
        accountingDate: params.accountingDate,
        moduleCode: String(params.moduleCode),
        userId: params.userId,
        source: params.source,
        actionType: params.actionType,
        userPermissions: params.userPermissions,
        user: params.user,
        policy,
      });
      return;
    }

    if (fp.status === "LOCKED" || fp.status === "CLOSED") {
      const msg = this.formatLockedMessage("FISCAL", fp.name, dateYmd);
      await this.logFailedAttempt({
        moduleCode: String(params.moduleCode),
        accountingDate: params.accountingDate,
        userId: params.userId,
        actionType: params.actionType,
        source: params.source,
        detail: msg,
      });
      throw new PeriodLockRejectedError(msg, String(params.moduleCode), fp.name, dateYmd);
    }

    const lockedPeriodPolicy = (policy?.lockedPeriodPolicy ?? "ERROR") as "ERROR" | "WARN";
    const allowOverridePosting = policy?.allowOverridePosting ?? false;

    const row = await prisma.modulePeriodLock.findUnique({
      where: {
        moduleCode_fiscalPeriodId: {
          moduleCode: String(params.moduleCode),
          fiscalPeriodId: fp.id,
        },
      },
    });

    const lockStatus = (row?.lockStatus ?? "OPEN").toUpperCase();
    if (lockStatus !== "LOCKED" && lockStatus !== "CLOSED") {
      return;
    }

    const msg = this.formatLockedMessage(String(params.moduleCode), fp.name, dateYmd);

    if (
      lockedPeriodPolicy === "WARN" &&
      allowOverridePosting &&
      userHasOverride(params.userPermissions, params.user)
    ) {
      await this.logAudit({
        actionType: "PERIOD_LOCK_OVERRIDE_ALLOW",
        moduleCode: String(params.moduleCode),
        fiscalPeriodId: fp.id,
        newValue: { accountingDate: dateYmd, actionType: params.actionType },
        performedById: params.userId,
        source: params.source,
      });
      return;
    }

    await this.logFailedAttempt({
      moduleCode: String(params.moduleCode),
      accountingDate: params.accountingDate,
      userId: params.userId,
      actionType: params.actionType,
      source: params.source,
      detail: msg,
    });
    throw new PeriodLockRejectedError(msg, String(params.moduleCode), fp.name, dateYmd);
  }

  /**
   * Cashbook payments post to BANK + GL. One fiscal/policy fetch and one module_lock query instead of two full assertModuleDateOpen calls.
   */
  static async assertBankAndGlOpenForCashbookPayment(params: {
    accountingDate: Date;
    userId: string;
    source: PeriodLockSource;
    actionType: string;
    userPermissions?: Array<{ name: string; value: boolean }>;
    user?: unknown;
  }): Promise<void> {
    const tz = await FiscalCalendarService.getFiscalTimezone();
    const dateYmd = ymdString(params.accountingDate, tz);
    const { y: calYear, m: calMonth } = getYmdInTimeZone(params.accountingDate, tz);

    const [fp, policy] = await Promise.all([
      FiscalCalendarService.getPeriodForDate(params.accountingDate),
      prisma.companyAccountingPolicy.findUnique({ where: { id: "default" } }),
    ]);

    if (!fp) {
      await this.assertLegacyPeriodLockoutAllowsPosting({
        calYear,
        calMonth,
        dateYmd,
        accountingDate: params.accountingDate,
        moduleCode: "BANK",
        userId: params.userId,
        source: params.source,
        actionType: params.actionType,
        userPermissions: params.userPermissions,
        user: params.user,
        policy,
      });
      return;
    }

    if (fp.status === "LOCKED" || fp.status === "CLOSED") {
      const msg = this.formatLockedMessage("FISCAL", fp.name, dateYmd);
      await this.logFailedAttempt({
        moduleCode: "BANK",
        accountingDate: params.accountingDate,
        userId: params.userId,
        actionType: params.actionType,
        source: params.source,
        detail: msg,
      });
      throw new PeriodLockRejectedError(msg, "BANK", fp.name, dateYmd);
    }

    const lockedPeriodPolicy = (policy?.lockedPeriodPolicy ?? "ERROR") as "ERROR" | "WARN";
    const allowOverridePosting = policy?.allowOverridePosting ?? false;

    const rows = await prisma.modulePeriodLock.findMany({
      where: {
        fiscalPeriodId: fp.id,
        moduleCode: { in: ["BANK", "GL"] },
      },
    });
    const byMod = new Map(rows.map((r) => [String(r.moduleCode).toUpperCase(), r]));

    for (const mod of ["BANK", "GL"] as const) {
      const row = byMod.get(mod);
      const lockStatus = (row?.lockStatus ?? "OPEN").toUpperCase();
      if (lockStatus !== "LOCKED" && lockStatus !== "CLOSED") {
        continue;
      }

      const msg = this.formatLockedMessage(mod, fp.name, dateYmd);

      if (
        lockedPeriodPolicy === "WARN" &&
        allowOverridePosting &&
        userHasOverride(params.userPermissions, params.user)
      ) {
        await this.logAudit({
          actionType: "PERIOD_LOCK_OVERRIDE_ALLOW",
          moduleCode: mod,
          fiscalPeriodId: fp.id,
          newValue: { accountingDate: dateYmd, actionType: params.actionType },
          performedById: params.userId,
          source: params.source,
        });
        continue;
      }

      await this.logFailedAttempt({
        moduleCode: mod,
        accountingDate: params.accountingDate,
        userId: params.userId,
        actionType: params.actionType,
        source: params.source,
        detail: msg,
      });
      throw new PeriodLockRejectedError(msg, mod, fp.name, dateYmd);
    }
  }

  /** True if either GL or BANK module lock (or fiscal shell) blocks this date — cashbook / legacy parity. */
  static async isLegacyCashbookMonthLocked(accountingDate: Date): Promise<boolean> {
    try {
      await this.assertModuleDateOpen({
        moduleCode: "BANK",
        accountingDate,
        userId: "system",
        source: "SYSTEM",
        actionType: "LEGACY_CHECK",
      });
    } catch {
      return true;
    }
    try {
      await this.assertModuleDateOpen({
        moduleCode: "GL",
        accountingDate,
        userId: "system",
        source: "SYSTEM",
        actionType: "LEGACY_CHECK",
      });
    } catch {
      return true;
    }
    return false;
  }

  /**
   * Apply lock from legacy cashbook API: updates `ModulePeriodLock` (GL+BANK), `AccountingPeriod`, `PeriodLockout`.
   */
  static async applyLegacyImmediateLock(params: {
    period: string;
    isLocked: boolean;
    userId: string;
    reason?: string | null;
  }) {
    const m = /^(\d{4})-(\d{2})$/.exec(params.period.trim());
    if (!m) throw new Error("Invalid period (expected YYYY-MM)");

    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const probe = utcDateFromYmd(year, month, 15);
    const fp = await FiscalCalendarService.getPeriodForDate(probe);

    await prisma.companyAccountingPolicy.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        lockedPeriodPolicy: "ERROR",
        allowOverridePosting: false,
        glErrorBatchEnabled: true,
        lockConfigVersion: 0,
      },
      update: {},
    });

    const lockStatus = params.isLocked ? "LOCKED" : "OPEN";
    const modules = ["GL", "BANK"] as const;

    await prisma.$transaction(async (tx) => {
      if (fp) {
        for (const mod of modules) {
          await tx.modulePeriodLock.upsert({
            where: {
              moduleCode_fiscalPeriodId: { moduleCode: mod, fiscalPeriodId: fp.id },
            },
            create: {
              moduleCode: mod,
              fiscalPeriodId: fp.id,
              lockStatus,
              reason: params.reason ?? null,
              updatedById: params.userId,
            },
            update: {
              lockStatus,
              reason: params.reason ?? null,
              updatedById: params.userId,
            },
          });
        }
      }

      const existingAp = await tx.accountingPeriod.findFirst({
        where: { period: params.period },
      });
      if (existingAp) {
        await tx.accountingPeriod.update({
          where: { id: existingAp.id },
          data: {
            isLocked: params.isLocked,
            lockedBy: params.userId,
            lockedAt: params.isLocked ? new Date() : null,
            reason: params.reason ?? undefined,
          },
        });
      } else {
        await tx.accountingPeriod.create({
          data: {
            period: params.period,
            isLocked: params.isLocked,
            lockedBy: params.userId,
            lockedAt: params.isLocked ? new Date() : null,
            reason: params.reason ?? null,
          },
        });
      }

      await tx.periodLockout.upsert({
        where: {
          year_month: { year, month },
        },
        create: {
          year,
          month,
          isLocked: params.isLocked,
          lockedBy: params.isLocked ? params.userId : null,
          lockedAt: params.isLocked ? new Date() : null,
          reason: params.reason ?? null,
          createdById: params.userId,
        },
        update: {
          isLocked: params.isLocked,
          lockedBy: params.isLocked ? params.userId : null,
          lockedAt: params.isLocked ? new Date() : null,
          reason: params.reason ?? null,
        },
      });

      await tx.companyAccountingPolicy.update({
        where: { id: "default" },
        data: { lockConfigVersion: { increment: 1 } },
      });
    }, PERIOD_LOCK_TX);

    await this.logAudit({
      actionType: params.isLocked ? "LEGACY_LOCK" : "LEGACY_UNLOCK",
      moduleCode: AUDIT_MODULE_LEGACY_GL_BANK,
      fiscalPeriodId: fp?.id ?? undefined,
      newValue: {
        period: params.period,
        isLocked: params.isLocked,
        ...(fp ? {} : { note: "No fiscal period row for this month — lock stored in accounting_period + period_lockouts only" }),
      },
      reason: params.reason,
      performedById: params.userId,
      source: "API",
    });
  }

  static async getOrCreateDraft(): Promise<PeriodLockDraftJson> {
    const initial: PeriodLockDraftJson = { moduleLocks: [] };
    const row = await prisma.periodLockDraft.upsert({
      where: { id: "default" },
      create: { id: "default", draftJson: initial as object },
      update: {},
    });
    return row.draftJson as PeriodLockDraftJson;
  }

  static async saveDraft(params: { draft: PeriodLockDraftJson; userId: string }) {
    await prisma.periodLockDraft.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        draftJson: params.draft as object,
        updatedById: params.userId,
      },
      update: {
        draftJson: params.draft as object,
        updatedById: params.userId,
      },
    });
  }

  /** Month-by-month GL probe for STI catch-up ranges (calendar month in UTC matching accrual dates). */
  static async assertGlDateRangeOpenForAccruals(
    start: Date,
    end: Date,
    userId: string,
    actionType: string
  ): Promise<void> {
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth() + 1;
    const endY = end.getUTCFullYear();
    const endM = end.getUTCMonth() + 1;
    while (y < endY || (y === endY && m <= endM)) {
      const probe = new Date(Date.UTC(y, m - 1, 15));
      await this.assertModuleDateOpen({
        moduleCode: "GL",
        accountingDate: probe,
        userId,
        source: "JOB",
        actionType,
      });
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }

  static dependencyWarningsFromDraft(entries: DraftModuleLockEntry[]): string[] {
    const warnings: string[] = [];
    const byPeriod = new Map<string, Set<string>>();
    for (const e of entries) {
      if (!byPeriod.has(e.fiscalPeriodId)) byPeriod.set(e.fiscalPeriodId, new Set());
      if (e.lockStatus === "LOCKED" || e.lockStatus === "CLOSED") {
        byPeriod.get(e.fiscalPeriodId)!.add(e.moduleCode);
      }
    }
    for (const [, mods] of byPeriod) {
      const glLocked = mods.has("GL");
      const apLocked = mods.has("AP");
      const icOpen = !mods.has("IC") || !mods.has("OE");
      if (glLocked && (mods.has("AR") || mods.has("AP")) && icOpen) {
        warnings.push(
          "GL is locked for a period while operational modules (IC/OE) may still be open — feeder postings can fail."
        );
      }
      if (apLocked && !mods.has("PO")) {
        warnings.push(
          "Accounts Payable is locked while Purchase Orders (PO) is not marked locked — new PO activity may create exceptions downstream."
        );
      }
    }
    return [...new Set(warnings)];
  }

  static async commitDraft(params: {
    userId: string;
    reason?: string | null;
    source: PeriodLockSource;
  }): Promise<{ warnings: string[]; lockConfigVersion: number }> {
    await prisma.companyAccountingPolicy.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        lockedPeriodPolicy: "ERROR",
        allowOverridePosting: false,
        glErrorBatchEnabled: true,
        lockConfigVersion: 0,
      },
      update: {},
    });

    const draftRow = await prisma.periodLockDraft.findUnique({ where: { id: "default" } });
    const draft = (draftRow?.draftJson ?? { moduleLocks: [] }) as PeriodLockDraftJson;
    const entries = draft.moduleLocks ?? [];
    const warnings = this.dependencyWarningsFromDraft(entries);

    await prisma.$transaction(
      async (tx) => {
        // Preflight: ensure draft fiscalPeriodIds exist to avoid FK constraint errors.
        const fiscalPeriodIds = [...new Set(entries.map((e) => e.fiscalPeriodId).filter(Boolean))];
        if (fiscalPeriodIds.length > 0) {
          const existing = await tx.fiscalPeriod.findMany({
            where: { id: { in: fiscalPeriodIds } },
            select: { id: true, name: true },
          });
          const existingSet = new Set(existing.map((r) => r.id));
          const missing = fiscalPeriodIds.filter((id) => !existingSet.has(id));
          if (missing.length > 0) {
            throw new PeriodLockValidationError(
              "Draft contains invalid fiscalPeriodId(s). Refresh the fiscal calendar and re-save the draft before committing.",
              { missingFiscalPeriodIds: missing, existingFiscalPeriodsFound: existing.length }
            );
          }
        }

        for (const e of entries) {
          const old = await tx.modulePeriodLock.findUnique({
            where: {
              moduleCode_fiscalPeriodId: {
                moduleCode: e.moduleCode,
                fiscalPeriodId: e.fiscalPeriodId,
              },
            },
          });
          await tx.modulePeriodLock.upsert({
            where: {
              moduleCode_fiscalPeriodId: {
                moduleCode: e.moduleCode,
                fiscalPeriodId: e.fiscalPeriodId,
              },
            },
            create: {
              moduleCode: e.moduleCode,
              fiscalPeriodId: e.fiscalPeriodId,
              lockStatus: e.lockStatus,
              reason: e.reason ?? null,
              updatedById: params.userId,
            },
            update: {
              lockStatus: e.lockStatus,
              reason: e.reason ?? null,
              updatedById: params.userId,
            },
          });
          await tx.periodLockAuditLog.create({
            data: {
              actionType: "COMMIT_MODULE_LOCK",
              moduleCode: e.moduleCode,
              fiscalPeriodId: e.fiscalPeriodId,
              oldValue: old ? { lockStatus: old.lockStatus } : undefined,
              newValue: { lockStatus: e.lockStatus, reason: e.reason },
              reason: params.reason,
              performedById: params.userId,
              source: params.source,
            },
          });
        }

        const pol = await tx.companyAccountingPolicy.update({
          where: { id: "default" },
          data: { lockConfigVersion: { increment: 1 } },
        });

        if (warnings.length > 0) {
          await tx.periodLockAuditLog.create({
            data: {
              actionType: "COMMIT_WITH_WARNINGS",
              moduleCode: AUDIT_MODULE_COMMIT_BATCH,
              newValue: { warnings },
              reason: params.reason,
              performedById: params.userId,
              source: params.source,
            },
          });
        }

        return pol;
      },
      PERIOD_LOCK_TX
    );

    const pol = await prisma.companyAccountingPolicy.findUnique({ where: { id: "default" } });
    return {
      warnings,
      lockConfigVersion: pol?.lockConfigVersion ?? 0,
    };
  }

  static async listAuditLogs(params: { take?: number; skip?: number }) {
    const rows = await prisma.periodLockAuditLog.findMany({
      take: params.take ?? 100,
      skip: params.skip ?? 0,
      orderBy: { createdAt: "desc" },
      include: {
        performedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        fiscalPeriod: { select: { id: true, name: true, startDate: true, endDate: true } },
      },
    });
    return rows.map((r) => this.enrichAuditRow(r));
  }

  static async updatePolicy(params: {
    lockedPeriodPolicy?: "ERROR" | "WARN";
    allowOverridePosting?: boolean;
    glErrorBatchEnabled?: boolean;
    userId: string;
  }) {
    const updated = await prisma.companyAccountingPolicy.update({
      where: { id: "default" },
      data: {
        ...(params.lockedPeriodPolicy != null
          ? { lockedPeriodPolicy: params.lockedPeriodPolicy }
          : {}),
        ...(params.allowOverridePosting != null
          ? { allowOverridePosting: params.allowOverridePosting }
          : {}),
        ...(params.glErrorBatchEnabled != null
          ? { glErrorBatchEnabled: params.glErrorBatchEnabled }
          : {}),
        lockConfigVersion: { increment: 1 },
      },
    });
    await this.logAudit({
      actionType: "POLICY_UPDATE",
      moduleCode: AUDIT_MODULE_COMPANY_POLICY,
      newValue: {
        lockedPeriodPolicy: updated.lockedPeriodPolicy,
        allowOverridePosting: updated.allowOverridePosting,
        glErrorBatchEnabled: updated.glErrorBatchEnabled,
      },
      performedById: params.userId,
      source: "API",
    });
    return updated;
  }
}
