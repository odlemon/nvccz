import type { FiscalPeriod, FiscalYear } from "@prisma/client";
import { prisma } from "../utils/database";
import { getYmdInTimeZone, utcDateFromYmd } from "./fiscalPeriodLockTypes";

/**
 * Resolves fiscal IANA timezone: company profile, then env `FISCAL_TIMEZONE`, then UTC.
 */
export async function resolveCompanyFiscalIanaTimezone(): Promise<string> {
  const row = await prisma.companyProfile.findFirst({
    select: { fiscalTimezone: true },
    orderBy: { updatedAt: "desc" },
  });
  const fromProfile = row?.fiscalTimezone?.trim();
  if (fromProfile) return fromProfile;
  const envTz = process.env.FISCAL_TIMEZONE?.trim();
  if (envTz) return envTz;
  // the tenant's own zone, the same fallback as the investment and scheduled-job clocks (resolveStiFiscalIanaTimezone):
  // with UTC here, between midnight in Harare and midnight UTC "today" was refused as a future date (D19)
  return "Africa/Harare";
}

export default class FiscalCalendarService {
  static async getFiscalTimezone(): Promise<string> {
    return resolveCompanyFiscalIanaTimezone();
  }

  /**
   * Find fiscal period containing this instant, using fiscal-calendar day in company TZ.
   */
  static async getPeriodForDate(accountingDate: Date): Promise<
    | (FiscalPeriod & {
        fiscalYear: FiscalYear;
      })
    | null
  > {
    const tz = await this.getFiscalTimezone();
    const { y, m, day } = getYmdInTimeZone(accountingDate, tz);
    const probe = utcDateFromYmd(y, m, day);

    const period = await prisma.fiscalPeriod.findFirst({
      where: {
        startDate: { lte: probe },
        endDate: { gte: probe },
      },
      include: { fiscalYear: true },
    });
    return period;
  }

  static async listCalendarWithLocks(): Promise<{
    lockConfigVersion: number;
    policy: { lockedPeriodPolicy: string; allowOverridePosting: boolean; glErrorBatchEnabled: boolean };
    fiscalYears: Array<{
      fiscalYear: FiscalYear;
      periods: Array<
        FiscalPeriod & {
          moduleLocks: Array<{ moduleCode: string; lockStatus: string; reason: string | null }>;
        }
      >;
    }>;
  }> {
    const [policy, years] = await Promise.all([
      prisma.companyAccountingPolicy.findUnique({ where: { id: "default" } }),
      prisma.fiscalYear.findMany({
        orderBy: { startDate: "asc" },
        include: {
          periods: {
            orderBy: { periodNumber: "asc" },
            include: {
              moduleLocks: {
                select: { moduleCode: true, lockStatus: true, reason: true },
              },
            },
          },
        },
      }),
    ]);

    const p = policy ?? {
      lockedPeriodPolicy: "ERROR",
      allowOverridePosting: false,
      glErrorBatchEnabled: true,
      lockConfigVersion: 0,
    };

    return {
      lockConfigVersion: p.lockConfigVersion,
      policy: {
        lockedPeriodPolicy: p.lockedPeriodPolicy,
        allowOverridePosting: p.allowOverridePosting,
        glErrorBatchEnabled: p.glErrorBatchEnabled,
      },
      fiscalYears: years.map((fy) => ({
        fiscalYear: {
          id: fy.id,
          name: fy.name,
          startDate: fy.startDate,
          endDate: fy.endDate,
          status: fy.status,
          createdAt: fy.createdAt,
          updatedAt: fy.updatedAt,
        },
        periods: fy.periods,
      })),
    };
  }
}
