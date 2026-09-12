// Period Lockout Service — legacy `/api/cashbook/periods` routes.
// Delegates effective GL+BANK locks to `PeriodLockService` + `ModulePeriodLock` (see fiscal-calendar API).

import { prisma } from "../utils/database";
import { PeriodLockRejectedError, utcDateFromYmd } from "./fiscalPeriodLockTypes";
import PeriodLockService from "./PeriodLockService";

export default class PeriodLockoutService {
  /**
   * Lock accounting period (immediate effect). Syncs ModulePeriodLock, accounting_periods, period_lockouts.
   */
  static async lockPeriod(data: {
    period: string; // Format: YYYY-MM
    isLocked: boolean;
    lockedBy: string;
    reason?: string;
  }) {
    try {
      await PeriodLockService.applyLegacyImmediateLock({
        period: data.period,
        isLocked: data.isLocked,
        userId: data.lockedBy,
        reason: data.reason,
      });

      const periodRow = await prisma.accountingPeriod.findFirst({
        where: { period: data.period },
      });

      return {
        success: true,
        message: `Period ${data.isLocked ? "locked" : "unlocked"} successfully`,
        data: periodRow,
      };
    } catch (error: unknown) {
      console.error("Error locking period:", error);
      const detail =
        error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
      return {
        success: false,
        message: detail,
        error: detail,
      };
    }
  }

  static async isPeriodLocked(period: string) {
    try {
      const m = /^(\d{4})-(\d{2})$/.exec(period.trim());
      if (!m) return false;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      const probe = utcDateFromYmd(y, mo, 15);
      return await PeriodLockService.isLegacyCashbookMonthLocked(probe);
    } catch (error) {
      console.error("Error checking period lock:", error);
      return false;
    }
  }

  static async getPeriodStatus(period: string) {
    try {
      const periodRecord = await prisma.accountingPeriod.findFirst({
        where: { period },
        include: {
          lockedByUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      const effective = await this.isPeriodLocked(period);

      if (!periodRecord) {
        return {
          success: true,
          message: "Period status retrieved successfully",
          data: {
            period,
            isLocked: effective,
            lockedAt: null,
            lockedBy: null,
            reason: null,
            effectiveModuleLock: effective,
          },
        };
      }

      return {
        success: true,
        message: "Period status retrieved successfully",
        data: {
          period: periodRecord.period,
          isLocked: periodRecord.isLocked || effective,
          lockedAt: periodRecord.lockedAt,
          lockedBy: periodRecord.lockedByUser,
          reason: periodRecord.reason,
          effectiveModuleLock: effective,
        },
      };
    } catch (error: any) {
      console.error("Error getting period status:", error);
      return {
        success: false,
        message: "Failed to get period status",
        error: error.message,
      };
    }
  }

  static async getAllPeriods(
    filters: {
      year?: number;
      isLocked?: boolean;
      currencyId?: string;
    } = {}
  ) {
    try {
      const whereClause: Record<string, unknown> = {};

      if (filters.isLocked !== undefined) {
        whereClause.isLocked = filters.isLocked;
      }

      let periodInSet: string[] | null = null;
      if (filters.currencyId) {
        const entries = await prisma.cashbookEntry.findMany({
          where: { bank: { currencyId: filters.currencyId } },
          select: { transactionDate: true },
        });
        const monthSet = new Set<string>();
        for (const e of entries) {
          const d = new Date(e.transactionDate);
          monthSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
        if (monthSet.size === 0) {
          return {
            success: true,
            message: "No accounting periods with cashbook activity in this currency",
            data: [],
          };
        }
        periodInSet = [...monthSet];
      }

      if (filters.year && periodInSet) {
        const y = filters.year.toString();
        periodInSet = periodInSet.filter((p) => p.startsWith(y));
        if (periodInSet.length === 0) {
          return { success: true, message: "No periods match year and currency", data: [] };
        }
        whereClause.period = { in: periodInSet };
      } else if (periodInSet) {
        whereClause.period = { in: periodInSet };
      } else if (filters.year) {
        whereClause.period = { startsWith: filters.year.toString() };
      }

      const periods = await prisma.accountingPeriod.findMany({
        where: whereClause,
        include: {
          lockedByUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: {
          period: "desc",
        },
      });

      return {
        success: true,
        message: "Periods retrieved successfully",
        data: periods,
      };
    } catch (error: any) {
      console.error("Error getting periods:", error);
      return {
        success: false,
        message: "Failed to get periods",
        error: error.message,
      };
    }
  }

  static async validateTransactionDate(transactionDate: Date, userId: string) {
    try {
      try {
        await PeriodLockService.assertModuleDateOpen({
          moduleCode: "BANK",
          accountingDate: transactionDate,
          userId,
          source: "API",
          actionType: "CASHBOOK_VALIDATE",
        });
        await PeriodLockService.assertModuleDateOpen({
          moduleCode: "GL",
          accountingDate: transactionDate,
          userId,
          source: "API",
          actionType: "CASHBOOK_VALIDATE",
        });
      } catch (e) {
        if (e instanceof PeriodLockRejectedError) {
          await prisma.auditLog.create({
            data: {
              action: "ATTEMPT_LOCKED_PERIOD_TRANSACTION",
              entityType: "CASHBOOK_ENTRY",
              entityId: "locked-period-attempt",
              userId,
              oldValues: undefined,
              newValues: {
                transactionDate,
                message: e.message,
              },
            },
          });
          return {
            success: false,
            message: e.message,
          };
        }
        throw e;
      }

      return {
        success: true,
        message: "Transaction date is valid",
        data: null,
      };
    } catch (error: any) {
      console.error("Error validating transaction date:", error);
      return {
        success: false,
        message: "Failed to validate transaction date",
        error: error.message,
      };
    }
  }

  static async getLockoutHistory(period: string) {
    try {
      const raw = await prisma.auditLog.findMany({
        where: {
          action: {
            in: ["LOCK_PERIOD", "UNLOCK_PERIOD"],
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      const history = raw.filter((row) => {
        const nv = row.newValues as { period?: string } | null;
        return nv?.period === period;
      });

      return {
        success: true,
        message: "Lockout history retrieved successfully",
        data: history,
      };
    } catch (error: any) {
      console.error("Error getting lockout history:", error);
      return {
        success: false,
        message: "Failed to get lockout history",
        error: error.message,
      };
    }
  }
}
