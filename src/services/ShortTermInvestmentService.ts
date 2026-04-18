import { Prisma, type ShortTermInvestmentApyRate } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { randomBytes } from "crypto";
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import {
  assignNextAuditIdAndCreateJournal,
  createJournalEntryWithAuditSequence,
  reserveAuditSequencesInTx,
} from "./AuditTrailSequenceService";
import { JournalEntryService } from "./JournalEntryService";
import { MultiCurrencyService } from "./MultiCurrencyService";
import {
  ShortTermInvestmentAccrualCalculator,
  type StiCompoundingMethod,
  type StiDayCountConvention,
} from "./ShortTermInvestmentAccrualCalculator";
import { logger } from "../utils/logger";
import { normalizeApyInputToDecimal } from "../utils/stiApyInput";
import PeriodLockService from "./PeriodLockService";

const SETTINGS_ID = "default";

/** True when Prisma reports duplicate (instrument_id, accrual_date) on STI accrual insert. */
function isStiAccrualDateUniqueConflict(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; meta?: { target?: string | string[]; modelName?: string } };
  if (err.code !== "P2002") return false;
  const raw = err.meta?.target;
  const t = Array.isArray(raw) ? raw.join(" ") : String(raw ?? "");
  if (t.includes("instrument_id_accrual_date") || t.includes("short_term_investment_accruals")) {
    return true;
  }
  if (err.meta?.modelName === "ShortTermInvestmentAccrual") return true;
  return false;
}

export type StiPostingMode = "DRAFT" | "APPROVED";

export function accrualDateFromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addOneCalendarDayIso(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export function compareIsoDate(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** YYYY-MM-DD in IANA time zone (e.g. fiscal "today"). */
export function formatYyyyMmDdInTimeZone(d: Date, ianaTimeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function getOrCreateSettingsRow(): Promise<{
  postingMode: string;
  fiscalTimezone: string | null;
}> {
  const row = await prisma.shortTermInvestmentSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      postingMode: "DRAFT",
    },
    update: {},
  });
  return row;
}

export async function resolveStiFiscalIanaTimezone(): Promise<string> {
  const settings = await prisma.shortTermInvestmentSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (settings?.fiscalTimezone?.trim()) {
    return settings.fiscalTimezone.trim();
  }
  const cp = await prisma.companyProfile.findFirst({
    select: { fiscalTimezone: true },
  });
  if (cp?.fiscalTimezone?.trim()) {
    return cp.fiscalTimezone.trim();
  }
  const env = process.env.FISCAL_TIMEZONE?.trim();
  if (env) return env;
  return "UTC";
}

export class ShortTermInvestmentService {
  static async getSettings() {
    await getOrCreateSettingsRow();
    return prisma.shortTermInvestmentSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
  }

  static async updateSettings(params: {
    postingMode?: StiPostingMode;
    fiscalTimezone?: string | null;
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const before = await getOrCreateSettingsRow();
    const data: Prisma.ShortTermInvestmentSettingsUpdateInput = {};
    if (params.postingMode != null) {
      if (params.postingMode !== "DRAFT" && params.postingMode !== "APPROVED") {
        throw new Error("postingMode must be DRAFT or APPROVED");
      }
      data.postingMode = params.postingMode;
    }
    if (params.fiscalTimezone !== undefined) {
      data.fiscalTimezone = params.fiscalTimezone;
    }
    const updated = await prisma.shortTermInvestmentSettings.update({
      where: { id: SETTINGS_ID },
      data,
    });
    await AuditService.log({
      userId: params.userId,
      action: "UPDATE",
      entityType: "ShortTermInvestmentSettings",
      entityId: SETTINGS_ID,
      oldValues: before,
      newValues: updated,
      ipAddress: params.ipAddress ?? undefined,
      userAgent: params.userAgent ?? undefined,
    });
    return updated;
  }

  static async pickApyForDate(instrumentId: string, accrualIso: string) {
    const accrualDay = accrualDateFromIso(accrualIso);
    return prisma.shortTermInvestmentApyRate.findFirst({
      where: {
        instrumentId,
        effectiveFrom: { lte: accrualDay },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: accrualDay } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
  }

  /** If no effective row matches effectiveTo window, fall back to latest effective_from <= day. */
  static async pickApyForDateLoose(instrumentId: string, accrualIso: string) {
    const accrualDay = accrualDateFromIso(accrualIso);
    const row = await prisma.shortTermInvestmentApyRate.findFirst({
      where: { instrumentId, effectiveFrom: { lte: accrualDay } },
      orderBy: { effectiveFrom: "desc" },
    });
    return row;
  }

  /** In-memory APY row pick matching `pickApyForDate` then `pickApyForDateLoose`. */
  private static pickApyForIsoFromRates(rates: ShortTermInvestmentApyRate[], accrualIso: string) {
    const accrualDay = accrualDateFromIso(accrualIso);
    let best: ShortTermInvestmentApyRate | null = null;
    for (const r of rates) {
      if (r.effectiveFrom > accrualDay) continue;
      const toOk = r.effectiveTo == null || r.effectiveTo >= accrualDay;
      if (!toOk) continue;
      if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
    }
    if (best) return best;
    for (const r of rates) {
      if (r.effectiveFrom <= accrualDay) {
        if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
      }
    }
    return best;
  }

  private static jeReferenceForAccrual(instrumentId: string, iso: string): string {
    const suffix = randomBytes(3).toString("hex").toUpperCase();
    return `STI-${instrumentId.slice(0, 8)}-${iso.replace(/-/g, "")}-${suffix}`;
  }

  private static headerAmountFromLines(debitTotal: Decimal): Decimal {
    return new Decimal(debitTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  }

  static async createAccrualJournalInTx(
    tx: Prisma.TransactionClient,
    args: {
      instrument: {
        id: string;
        name: string;
        currencyId: string;
        accruedInterestGlAccountId: string;
        interestIncomeGlAccountId: string;
        negativeYieldExpenseGlAccountId: string;
      };
      accrualIso: string;
      amount: Decimal;
      postingMode: StiPostingMode;
      actorId: string;
      descriptionExtra?: string;
      /** When bulk-reserved (e.g. catch-up), avoids per-JE sequence round-trips. */
      auditTrailSequenceNumber?: number;
    }
  ) {
    const absAmt = args.amount.abs().toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    if (absAmt.equals(0)) {
      return { journalEntry: null as null };
    }

    const lines: Array<{
      chartOfAccountId: string;
      debit: Decimal;
      credit: Decimal;
      description: string;
    }> = [];

    if (args.amount.gte(0)) {
      lines.push({
        chartOfAccountId: args.instrument.accruedInterestGlAccountId,
        debit: absAmt,
        credit: new Decimal(0),
        description: `Accrued interest ${args.instrument.name} ${args.accrualIso}`,
      });
      lines.push({
        chartOfAccountId: args.instrument.interestIncomeGlAccountId,
        debit: new Decimal(0),
        credit: absAmt,
        description: `Interest income ${args.instrument.name} ${args.accrualIso}`,
      });
    } else {
      lines.push({
        chartOfAccountId: args.instrument.negativeYieldExpenseGlAccountId,
        debit: absAmt,
        credit: new Decimal(0),
        description: `Negative yield expense ${args.instrument.name} ${args.accrualIso}`,
      });
      lines.push({
        chartOfAccountId: args.instrument.accruedInterestGlAccountId,
        debit: new Decimal(0),
        credit: absAmt,
        description: `Accrued interest (reduction) ${args.instrument.name} ${args.accrualIso}`,
      });
    }

    const debitTotal = lines.reduce((s, l) => s.plus(l.debit), new Decimal(0));

    const status = args.postingMode === "APPROVED" ? "POSTED" : "PENDING";
    const jePayload = {
      transactionDate: accrualDateFromIso(args.accrualIso),
      referenceNumber: this.jeReferenceForAccrual(args.instrument.id, args.accrualIso),
      description: `Short-term investment accrual — ${args.instrument.name} (${args.accrualIso})${args.descriptionExtra ?? ""}`,
      totalAmount: this.headerAmountFromLines(debitTotal),
      currencyId: args.instrument.currencyId,
      status,
      createdById: args.actorId,
    };

    await PeriodLockService.assertModuleDateOpen({
      moduleCode: "GL",
      accountingDate: jePayload.transactionDate,
      userId: args.actorId,
      source: "JOB",
      actionType: "STI_ACCRUAL_JE",
    });

    const je =
      args.auditTrailSequenceNumber != null
        ? await tx.journalEntry.create({
            data: { ...jePayload, auditTrailSequenceNumber: args.auditTrailSequenceNumber },
          })
        : await assignNextAuditIdAndCreateJournal(tx, jePayload);

    for (const line of lines) {
      await tx.journalEntryLine.create({
        data: {
          journalEntryId: je.id,
          chartOfAccountId: line.chartOfAccountId,
          debitAmount: line.debit,
          creditAmount: line.credit,
          description: line.description,
        },
      });
    }

    return { journalEntry: je };
  }

  static async maybeFillFunctionalReporting(params: {
    instrumentCurrencyId: string;
    functionalCurrencyId: string | null | undefined;
    amountInstrument: Decimal;
    accrualIso: string;
  }): Promise<{
    reportingAmountFunctional: Decimal | null;
    functionalCurrencyId: string | null;
    fxRateUsed: Decimal | null;
  }> {
    const fc = params.functionalCurrencyId;
    if (!fc || fc === params.instrumentCurrencyId) {
      return { reportingAmountFunctional: null, functionalCurrencyId: null, fxRateUsed: null };
    }
    try {
      const conv = await MultiCurrencyService.convertCurrency({
        amount: params.amountInstrument.toNumber(),
        fromCurrencyId: params.instrumentCurrencyId,
        toCurrencyId: fc,
        date: accrualDateFromIso(params.accrualIso),
      });
      return {
        reportingAmountFunctional: new Decimal(conv.convertedAmount),
        functionalCurrencyId: fc,
        fxRateUsed: new Decimal(conv.exchangeRate),
      };
    } catch {
      return { reportingAmountFunctional: null, functionalCurrencyId: fc, fxRateUsed: null };
    }
  }

  /**
   * Core accrual for one instrument and fiscal calendar day (YYYY-MM-DD).
   * Idempotent via unique (instrumentId, accrualDate).
   */
  static async accrueOneCalendarDay(params: {
    instrumentId: string;
    accrualIso: string;
    actorId: string;
    postingModeOverride?: StiPostingMode;
  }): Promise<{
    outcome: "created" | "skipped" | "duplicate";
    reason?: string;
    accrualId?: string;
    journalEntryId?: string | null;
  }> {
    const settings = await getOrCreateSettingsRow();
    const postingMode = params.postingModeOverride ?? (settings.postingMode as StiPostingMode);

    const instrument = await prisma.shortTermInvestmentInstrument.findUnique({
      where: { id: params.instrumentId },
    });
    if (!instrument || instrument.status !== "ACTIVE") {
      return { outcome: "skipped", reason: "not_active_or_missing" };
    }

    if (compareIsoDate(params.accrualIso, instrument.startDate.toISOString().slice(0, 10)) < 0) {
      return { outcome: "skipped", reason: "before_start" };
    }
    if (
      instrument.maturityDate &&
      compareIsoDate(params.accrualIso, instrument.maturityDate.toISOString().slice(0, 10)) > 0
    ) {
      return { outcome: "skipped", reason: "after_maturity" };
    }

    const existing = await prisma.shortTermInvestmentAccrual.findUnique({
      where: {
        instrumentId_accrualDate: {
          instrumentId: params.instrumentId,
          accrualDate: accrualDateFromIso(params.accrualIso),
        },
      },
    });
    if (existing) {
      return { outcome: "duplicate", accrualId: existing.id, journalEntryId: existing.journalEntryId };
    }

    const rate =
      (await this.pickApyForDate(params.instrumentId, params.accrualIso)) ??
      (await this.pickApyForDateLoose(params.instrumentId, params.accrualIso));
    if (!rate) {
      return { outcome: "skipped", reason: "no_apy_rate" };
    }

    const lastAccrual = await prisma.shortTermInvestmentAccrual.findFirst({
      where: { instrumentId: params.instrumentId },
      orderBy: { accrualDate: "desc" },
    });
    const accruedBefore = lastAccrual
      ? new Decimal(lastAccrual.runningAccruedBalance.toString())
      : new Decimal(0);

    const { dailyAmount } = ShortTermInvestmentAccrualCalculator.computeOneDay({
      compoundingMethod: instrument.compoundingMethod as StiCompoundingMethod,
      dayCount: instrument.dayCountConvention as StiDayCountConvention,
      apy: rate.apy,
      principal: instrument.principal,
      accruedInterestBefore: accruedBefore,
      accrualDateIso: params.accrualIso,
    });

    const rounded = dailyAmount.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    const newRun = accruedBefore.plus(rounded);

    const rep = await this.maybeFillFunctionalReporting({
      instrumentCurrencyId: instrument.currencyId,
      functionalCurrencyId: instrument.functionalCurrencyId,
      amountInstrument: rounded,
      accrualIso: params.accrualIso,
    });

    const capitalErosion = new Decimal(rate.apy.toString()).isNegative();
    if (capitalErosion !== instrument.capitalErosion) {
      await prisma.shortTermInvestmentInstrument.update({
        where: { id: instrument.id },
        data: { capitalErosion },
      });
    }

    if (!instrument.dayCountLocked) {
      await prisma.shortTermInvestmentInstrument.update({
        where: { id: instrument.id },
        data: { dayCountLocked: true },
      });
    }

    try {
      return await prisma.$transaction(
        async (tx) => {
        if (rounded.isZero()) {
          const row = await tx.shortTermInvestmentAccrual.create({
            data: {
              instrumentId: instrument.id,
              accrualDate: accrualDateFromIso(params.accrualIso),
              amountInstrumentCcy: new Decimal(0),
              runningAccruedBalance: newRun,
              apyRateId: rate.id,
              status: "POSTED",
              reportingAmountFunctional: rep.reportingAmountFunctional,
              functionalCurrencyId: rep.functionalCurrencyId,
              fxRateUsed: rep.fxRateUsed,
            },
          });
          return {
            outcome: "created" as const,
            accrualId: row.id,
            journalEntryId: null,
          };
        }

        const { journalEntry } = await ShortTermInvestmentService.createAccrualJournalInTx(tx, {
          instrument: {
            id: instrument.id,
            name: instrument.name,
            currencyId: instrument.currencyId,
            accruedInterestGlAccountId: instrument.accruedInterestGlAccountId,
            interestIncomeGlAccountId: instrument.interestIncomeGlAccountId,
            negativeYieldExpenseGlAccountId: instrument.negativeYieldExpenseGlAccountId,
          },
          accrualIso: params.accrualIso,
          amount: rounded,
          postingMode,
          actorId: params.actorId,
        });

        if (!journalEntry) {
          throw new Error("Expected journal entry for non-zero accrual");
        }

        const jeStatus = journalEntry.status;
        const row = await tx.shortTermInvestmentAccrual.create({
          data: {
            instrumentId: instrument.id,
            accrualDate: accrualDateFromIso(params.accrualIso),
            amountInstrumentCcy: rounded,
            runningAccruedBalance: newRun,
            apyRateId: rate.id,
            journalEntryId: journalEntry.id,
            status: jeStatus === "POSTED" ? "POSTED" : "PENDING_POST",
            reportingAmountFunctional: rep.reportingAmountFunctional,
            functionalCurrencyId: rep.functionalCurrencyId,
            fxRateUsed: rep.fxRateUsed,
          },
        });

        await AuditService.log({
          userId: params.actorId,
          action: "CREATE",
          entityType: "ShortTermInvestmentAccrual",
          entityId: row.id,
          newValues: {
            id: row.id,
            instrumentId: row.instrumentId,
            accrualDate: row.accrualDate,
            amountInstrumentCcy: row.amountInstrumentCcy.toString(),
            journalEntryId: row.journalEntryId,
          },
        });

        return {
          outcome: "created" as const,
          accrualId: row.id,
          journalEntryId: journalEntry.id,
        };
        },
        {
          maxWait: 60_000,
          timeout: 120_000,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }
      );
    } catch (e: any) {
      if (isStiAccrualDateUniqueConflict(e)) {
        const existingAfterConflict = await prisma.shortTermInvestmentAccrual.findUnique({
          where: {
            instrumentId_accrualDate: {
              instrumentId: params.instrumentId,
              accrualDate: accrualDateFromIso(params.accrualIso),
            },
          },
        });
        if (existingAfterConflict) {
          return {
            outcome: "duplicate" as const,
            accrualId: existingAfterConflict.id,
            journalEntryId: existingAfterConflict.journalEntryId,
          };
        }
      }
      throw e;
    }
  }

  /**
   * Runs the STI accrual catch-up pass at most once per cooldown (when set), keyed by
   * `lastAccrualWatermark`. On each run, fills missing days through fiscal "today" (login backfill).
   * Swallows DB/module errors (e.g. STI tables not migrated) so callers never fail.
   */
  static async maybeRunDailyAccrualAfterLogin(actorId: string): Promise<void> {
    const cooldownMsRaw = Number(process.env.STI_LOGIN_ACCRUAL_COOLDOWN_MS);
    // Default: run STI check on every login. Cooldown applies only when explicitly configured.
    const cooldownMs = Number.isFinite(cooldownMsRaw) && cooldownMsRaw > 0 ? cooldownMsRaw : 0;

    try {
      logger.info("STI login accrual check started", { actorId, cooldownMs });
      const existing = await prisma.shortTermInvestmentSettings.findUnique({
        where: { id: SETTINGS_ID },
        select: { lastAccrualWatermark: true },
      });
      const last = existing?.lastAccrualWatermark;
      if (last != null) {
        const elapsed = Date.now() - last.getTime();
        if (elapsed < cooldownMs) {
          logger.info("STI login accrual skipped by cooldown", {
            actorId,
            cooldownMs,
            elapsedMs: elapsed,
            lastAccrualWatermark: last.toISOString(),
          });
          return;
        }
      }

      await getOrCreateSettingsRow();
      const result = await this.runDailyAccrualJob({ actorId });
      logger.info("STI login accrual run completed", {
        actorId,
        fiscalDate: result.fiscalDate,
        processed: result.processed,
        duplicates: result.duplicates,
        skipped: result.skipped,
        errors: result.errors.length,
      });
    } catch (e: any) {
      logger.warn("Short-term investment login accrual skipped", {
        message: e?.message ?? String(e),
        code: e?.code,
        actorId,
      });
    }
  }

  static async runDailyAccrualJob(params: {
    asOfIso?: string;
    actorId: string;
  }): Promise<{
    fiscalDate: string;
    processed: number;
    skipped: number;
    duplicates: number;
    errors: string[];
  }> {
    const tz = await resolveStiFiscalIanaTimezone();
    const fiscalToday =
      params.asOfIso?.trim() ||
      formatYyyyMmDdInTimeZone(new Date(), tz);
    const active = await prisma.shortTermInvestmentInstrument.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    const errors: string[] = [];
    let processed = 0;
    let skipped = 0;
    let duplicates = 0;

    for (const row of active) {
      try {
        // Login-triggered run: backfill every missing calendar day from (last accrual + 1) or
        // instrument start through fiscal "today" — same as POST .../catch-up but automatic on login.
        const catchUpRows = await this.catchUpAccruals({
          instrumentId: row.id,
          throughIso: fiscalToday,
          actorId: params.actorId,
        });
        let created = 0;
        let dup = 0;
        let skip = 0;
        for (const c of catchUpRows) {
          if (c.outcome === "created") {
            created += 1;
            processed += 1;
          } else if (c.outcome === "duplicate") {
            dup += 1;
            duplicates += 1;
          } else {
            skip += 1;
            skipped += 1;
          }
        }
        logger.info("STI accrual instrument catch-up finished", {
          instrumentId: row.id,
          throughIso: fiscalToday,
          dayResults: catchUpRows.length,
          created,
          duplicate: dup,
          skipped: skip,
        });
      } catch (e: any) {
        errors.push(`${row.id}: ${e?.message ?? e}`);
        logger.error("STI accrual instrument failed", {
          instrumentId: row.id,
          fiscalDate: fiscalToday,
          message: e?.message ?? String(e),
          code: e?.code,
        });
      }
    }

    // Persist wall-clock completion time for login throttle (see `maybeRunDailyAccrualAfterLogin`).
    await prisma.shortTermInvestmentSettings.update({
      where: { id: SETTINGS_ID },
      data: { lastAccrualWatermark: new Date() },
    });

    logger.info("STI daily accrual job finished", {
      actorId: params.actorId,
      fiscalDate: fiscalToday,
      activeInstrumentCount: active.length,
      processed,
      duplicates,
      skipped,
      errors: errors.length,
    });

    return { fiscalDate: fiscalToday, processed, skipped, duplicates, errors };
  }

  static async catchUpAccruals(params: {
    instrumentId: string;
    throughIso: string;
    actorId: string;
  }) {
    const instrument = await prisma.shortTermInvestmentInstrument.findUnique({
      where: { id: params.instrumentId },
    });
    if (!instrument) throw new Error("Instrument not found");
    if (instrument.status !== "ACTIVE") throw new Error("Instrument is not ACTIVE");

    const settings = await getOrCreateSettingsRow();
    const postingMode = settings.postingMode as StiPostingMode;

    const start = instrument.startDate.toISOString().slice(0, 10);
    const end = params.throughIso;

    const [apyRates, lastAccrualFull] = await Promise.all([
      prisma.shortTermInvestmentApyRate.findMany({
        where: { instrumentId: params.instrumentId },
        orderBy: { effectiveFrom: "asc" },
      }),
      prisma.shortTermInvestmentAccrual.findFirst({
        where: { instrumentId: params.instrumentId },
        orderBy: { accrualDate: "desc" },
      }),
    ]);

    const d = lastAccrualFull?.accrualDate.toISOString().slice(0, 10) ?? null;
    const firstDay = d ? addOneCalendarDayIso(d) : start;
    const results: Array<{ day: string; outcome: string }> = [];
    if (compareIsoDate(firstDay, end) > 0) {
      return results;
    }

    const firstDayDate = accrualDateFromIso(firstDay);
    const endDate = accrualDateFromIso(end);

    await PeriodLockService.assertGlDateRangeOpenForAccruals(
      firstDayDate,
      endDate,
      params.actorId,
      "STI_CATCH_UP"
    );

    const existingRows = await prisma.shortTermInvestmentAccrual.findMany({
      where: {
        instrumentId: params.instrumentId,
        accrualDate: { gte: firstDayDate, lte: endDate },
      },
      select: { accrualDate: true, runningAccruedBalance: true },
    });
    const existingByIso = new Map<string, string>();
    for (const row of existingRows) {
      existingByIso.set(row.accrualDate.toISOString().slice(0, 10), row.runningAccruedBalance.toString());
    }

    const maturityIso = instrument.maturityDate ? instrument.maturityDate.toISOString().slice(0, 10) : null;
    const instrumentCurrencyId = instrument.currencyId;
    const functionalCurrencyId = instrument.functionalCurrencyId;

    type FxRep = Awaited<ReturnType<typeof ShortTermInvestmentService.maybeFillFunctionalReporting>>;
    const fxCache = new Map<string, FxRep>();

    async function fxFor(iso: string, amountInstrument: Decimal): Promise<FxRep> {
      const key = `${iso}:${amountInstrument.toFixed(6)}`;
      const hit = fxCache.get(key);
      if (hit) return hit;
      const rep = await ShortTermInvestmentService.maybeFillFunctionalReporting({
        instrumentCurrencyId,
        functionalCurrencyId,
        amountInstrument,
        accrualIso: iso,
      });
      fxCache.set(key, rep);
      return rep;
    }

    type WorkAccrual =
      | {
          kind: "zero";
          iso: string;
          newRun: Decimal;
          rateId: string;
          rep: FxRep;
        }
      | {
          kind: "je";
          iso: string;
          rounded: Decimal;
          newRun: Decimal;
          rateId: string;
          rep: FxRep;
        };

    const workAccruals: WorkAccrual[] = [];
    let accruedBefore = lastAccrualFull
      ? new Decimal(lastAccrualFull.runningAccruedBalance.toString())
      : new Decimal(0);
    let lastCapitalErosion = instrument.capitalErosion;

    for (
      let cursor = firstDay;
      compareIsoDate(cursor, end) <= 0;
      cursor = addOneCalendarDayIso(cursor)
    ) {
      if (compareIsoDate(cursor, start) < 0) {
        results.push({ day: cursor, outcome: "skipped" });
        break;
      }
      if (maturityIso && compareIsoDate(cursor, maturityIso) > 0) {
        results.push({ day: cursor, outcome: "skipped" });
        break;
      }

      const existingBal = existingByIso.get(cursor);
      if (existingBal !== undefined) {
        results.push({ day: cursor, outcome: "duplicate" });
        accruedBefore = new Decimal(existingBal);
        continue;
      }

      const rate = ShortTermInvestmentService.pickApyForIsoFromRates(apyRates, cursor);
      if (!rate) {
        results.push({ day: cursor, outcome: "skipped" });
        continue;
      }

      const { dailyAmount } = ShortTermInvestmentAccrualCalculator.computeOneDay({
        compoundingMethod: instrument.compoundingMethod as StiCompoundingMethod,
        dayCount: instrument.dayCountConvention as StiDayCountConvention,
        apy: rate.apy,
        principal: instrument.principal,
        accruedInterestBefore: accruedBefore,
        accrualDateIso: cursor,
      });

      const rounded = dailyAmount.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
      const newRun = accruedBefore.plus(rounded);
      const rep = await fxFor(cursor, rounded);

      lastCapitalErosion = new Decimal(rate.apy.toString()).isNegative();

      if (rounded.isZero()) {
        workAccruals.push({ kind: "zero", iso: cursor, newRun, rateId: rate.id, rep });
      } else {
        workAccruals.push({
          kind: "je",
          iso: cursor,
          rounded,
          newRun,
          rateId: rate.id,
          rep,
        });
      }
      results.push({ day: cursor, outcome: "created" });
      accruedBefore = newRun;
    }

    if (workAccruals.length === 0) {
      return results;
    }

    const jeCount = workAccruals.filter((w) => w.kind === "je").length;

    const instrumentPayload: Prisma.ShortTermInvestmentInstrumentUpdateInput = {};
    if (lastCapitalErosion !== instrument.capitalErosion) {
      instrumentPayload.capitalErosion = lastCapitalErosion;
    }
    if (!instrument.dayCountLocked) {
      instrumentPayload.dayCountLocked = true;
    }

    await prisma.$transaction(
      async (tx) => {
        let nextAudit: number | null = null;
        if (jeCount > 0) {
          nextAudit = await reserveAuditSequencesInTx(tx, jeCount);
        }

        for (const w of workAccruals) {
          if (w.kind === "zero") {
            await tx.shortTermInvestmentAccrual.create({
              data: {
                instrumentId: instrument.id,
                accrualDate: accrualDateFromIso(w.iso),
                amountInstrumentCcy: new Decimal(0),
                runningAccruedBalance: w.newRun,
                apyRateId: w.rateId,
                status: "POSTED",
                reportingAmountFunctional: w.rep.reportingAmountFunctional,
                functionalCurrencyId: w.rep.functionalCurrencyId,
                fxRateUsed: w.rep.fxRateUsed,
              },
            });
            continue;
          }

          if (nextAudit == null) {
            throw new Error("Expected reserved audit sequence for non-zero accrual");
          }

          const { journalEntry } = await ShortTermInvestmentService.createAccrualJournalInTx(tx, {
            instrument: {
              id: instrument.id,
              name: instrument.name,
              currencyId: instrument.currencyId,
              accruedInterestGlAccountId: instrument.accruedInterestGlAccountId,
              interestIncomeGlAccountId: instrument.interestIncomeGlAccountId,
              negativeYieldExpenseGlAccountId: instrument.negativeYieldExpenseGlAccountId,
            },
            accrualIso: w.iso,
            amount: w.rounded,
            postingMode,
            actorId: params.actorId,
            auditTrailSequenceNumber: nextAudit,
          });
          nextAudit += 1;

          if (!journalEntry) {
            throw new Error("Expected journal entry for non-zero accrual");
          }

          const jeStatus = journalEntry.status;
          await tx.shortTermInvestmentAccrual.create({
            data: {
              instrumentId: instrument.id,
              accrualDate: accrualDateFromIso(w.iso),
              amountInstrumentCcy: w.rounded,
              runningAccruedBalance: w.newRun,
              apyRateId: w.rateId,
              journalEntryId: journalEntry.id,
              status: jeStatus === "POSTED" ? "POSTED" : "PENDING_POST",
              reportingAmountFunctional: w.rep.reportingAmountFunctional,
              functionalCurrencyId: w.rep.functionalCurrencyId,
              fxRateUsed: w.rep.fxRateUsed,
            },
          });
        }

        if (Object.keys(instrumentPayload).length > 0) {
          await tx.shortTermInvestmentInstrument.update({
            where: { id: instrument.id },
            data: instrumentPayload,
          });
        }
      },
      { maxWait: 120_000, timeout: 900_000 }
    );

    await AuditService.log({
      userId: params.actorId,
      action: "CREATE",
      entityType: "ShortTermInvestmentAccrualCatchUp",
      entityId: params.instrumentId,
      newValues: {
        instrumentId: params.instrumentId,
        fromDay: firstDay,
        throughIso: end,
        rowsCreated: workAccruals.length,
      },
    });

    return results;
  }

  static async approveAccrualJournal(accrualId: string, userId: string) {
    const acc = await prisma.shortTermInvestmentAccrual.findUnique({
      where: { id: accrualId },
    });
    if (!acc) {
      throw new Error(
        "Accrual not found — use the accrual row id from GET /instruments/:id, not the instrument id"
      );
    }
    if (!acc.journalEntryId) {
      throw new Error("Accrual has no journal entry");
    }
    if (acc.status !== "PENDING_POST") {
      throw new Error("Accrual is not pending post");
    }
    await JournalEntryService.postJournalEntry(acc.journalEntryId, userId);
    await prisma.shortTermInvestmentAccrual.update({
      where: { id: accrualId },
      data: { status: "POSTED" },
    });
    return prisma.shortTermInvestmentAccrual.findUnique({ where: { id: accrualId } });
  }

  /**
   * Posts every PENDING_POST accrual for an instrument (draft posting mode).
   * Continues on individual failures; returns a summary for the client.
   */
  static async approveAllPendingAccrualJournalsForInstrument(
    instrumentId: string,
    userId: string
  ): Promise<{
    instrumentId: string;
    pendingFound: number;
    approved: number;
    skipped: Array<{ accrualId: string; reason: string }>;
    failures: Array<{ accrualId: string; error: string }>;
  }> {
    const inst = await prisma.shortTermInvestmentInstrument.findUnique({
      where: { id: instrumentId },
      select: { id: true },
    });
    if (!inst) {
      throw new Error("Instrument not found");
    }

    const pending = await prisma.shortTermInvestmentAccrual.findMany({
      where: { instrumentId, status: "PENDING_POST" },
      orderBy: { accrualDate: "asc" },
      select: { id: true, journalEntryId: true },
    });

    const skipped: Array<{ accrualId: string; reason: string }> = [];
    const failures: Array<{ accrualId: string; error: string }> = [];
    let approved = 0;

    for (const row of pending) {
      if (!row.journalEntryId) {
        skipped.push({ accrualId: row.id, reason: "Accrual has no journal entry" });
        continue;
      }
      try {
        await ShortTermInvestmentService.approveAccrualJournal(row.id, userId);
        approved += 1;
      } catch (e: any) {
        failures.push({
          accrualId: row.id,
          error: e?.message ?? String(e),
        });
      }
    }

    return {
      instrumentId,
      pendingFound: pending.length,
      approved,
      skipped,
      failures,
    };
  }

  static async reverseAccrualLinkedJournal(accrualId: string, actorId: string) {
    const acc = await prisma.shortTermInvestmentAccrual.findUnique({
      where: { id: accrualId },
    });
    if (!acc?.journalEntryId) return;
    if (acc.status === "REVERSED") return;

    const je = await prisma.journalEntry.findUnique({
      where: { id: acc.journalEntryId },
    });
    if (!je || je.status === "VOID") {
      await prisma.shortTermInvestmentAccrual.update({
        where: { id: accrualId },
        data: { status: "REVERSED" },
      });
      return;
    }

    if (je.status === "POSTED") {
      await JournalEntryService.voidJournalEntry(je.id, actorId);
      const reversal = await prisma.journalEntry.findFirst({
        where: { referenceNumber: `VR-${je.referenceNumber}` },
        orderBy: { createdAt: "desc" },
      });
      await prisma.shortTermInvestmentAccrual.update({
        where: { id: accrualId },
        data: {
          status: "REVERSED",
          reversalJournalEntryId: reversal?.id ?? null,
        },
      });
      return;
    }

    if (je.status === "PENDING") {
      await JournalEntryService.voidJournalEntry(je.id, actorId);
      await prisma.shortTermInvestmentAccrual.update({
        where: { id: accrualId },
        data: { status: "REVERSED" },
      });
    }
  }

  static async voidInstrument(params: { instrumentId: string; actorId: string }) {
    const inst = await prisma.shortTermInvestmentInstrument.findUnique({
      where: { id: params.instrumentId },
    });
    if (!inst) throw new Error("Instrument not found");
    if (inst.status === "VOIDED") return inst;

    const accruals = await prisma.shortTermInvestmentAccrual.findMany({
      where: { instrumentId: params.instrumentId, journalEntryId: { not: null } },
      orderBy: { accrualDate: "desc" },
    });
    for (const a of accruals) {
      await this.reverseAccrualLinkedJournal(a.id, params.actorId);
    }

    if (inst.liquidationJournalEntryId) {
      try {
        await JournalEntryService.voidJournalEntry(inst.liquidationJournalEntryId, params.actorId);
      } catch {
        /* ignore */
      }
    }

    const updated = await prisma.shortTermInvestmentInstrument.update({
      where: { id: params.instrumentId },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidedById: params.actorId,
      },
    });

    await AuditService.log({
      userId: params.actorId,
      action: "UPDATE",
      entityType: "ShortTermInvestmentInstrument",
      entityId: params.instrumentId,
      oldValues: inst,
      newValues: updated,
    });

    return updated;
  }

  static async liquidateInstrument(params: {
    instrumentId: string;
    settlementIso: string;
    cashReceived: number;
    actorId: string;
  }) {
    const settlementIso = params.settlementIso.slice(0, 10);
    const settlementDay = accrualDateFromIso(settlementIso);

    const instrument = await prisma.shortTermInvestmentInstrument.findUnique({
      where: { id: params.instrumentId },
      include: { settlementBank: true },
    });
    if (!instrument) throw new Error("Instrument not found");
    if (instrument.status !== "ACTIVE") throw new Error("Instrument must be ACTIVE to settle");

    const startIso = instrument.startDate.toISOString().slice(0, 10);
    const onOrAfterStart = compareIsoDate(settlementIso, startIso) >= 0;

    let lastAccrual = await prisma.shortTermInvestmentAccrual.findFirst({
      where: { instrumentId: params.instrumentId, accrualDate: { lte: settlementDay } },
      orderBy: { accrualDate: "desc" },
    });
    const lastIso = lastAccrual?.accrualDate.toISOString().slice(0, 10) ?? null;
    const needsCatchUp =
      onOrAfterStart && (!lastIso || compareIsoDate(lastIso, settlementIso) < 0);

    if (needsCatchUp) {
      await this.catchUpAccruals({
        instrumentId: params.instrumentId,
        throughIso: settlementIso,
        actorId: params.actorId,
      });
      lastAccrual = await prisma.shortTermInvestmentAccrual.findFirst({
        where: { instrumentId: params.instrumentId, accrualDate: { lte: settlementDay } },
        orderBy: { accrualDate: "desc" },
      });
    }

    const bankGl = instrument.settlementBank?.glAccountId;
    if (!bankGl) {
      throw new Error("Settlement bank must have a linked GL account (Cash / CACE)");
    }
    const accrued = lastAccrual
      ? new Decimal(lastAccrual.runningAccruedBalance.toString())
      : new Decimal(0);
    const principal = new Decimal(instrument.principal.toString());
    const cash = new Decimal(params.cashReceived);
    const plug = cash.minus(principal).minus(accrued);

    const settings = await getOrCreateSettingsRow();
    const postingMode = settings.postingMode as StiPostingMode;

    let carryingFunctional: Decimal | null = null;
    if (instrument.functionalCurrencyId && instrument.currencyId !== instrument.functionalCurrencyId) {
      try {
        const conv = await MultiCurrencyService.convertCurrency({
          amount: principal.plus(accrued).toNumber(),
          fromCurrencyId: instrument.currencyId,
          toCurrencyId: instrument.functionalCurrencyId,
          date: settlementDay,
        });
        carryingFunctional = new Decimal(conv.convertedAmount);
      } catch {
        carryingFunctional = null;
      }
    }

    const ref = `STI-SET-${instrument.id.slice(0, 8)}-${settlementIso.replace(/-/g, "")}-${randomBytes(2).toString("hex").toUpperCase()}`;

    await prisma.$transaction(
      async (tx) => {
        const lineSpecs: Array<{
          chartOfAccountId: string;
          debit: Decimal;
          credit: Decimal;
          description: string;
        }> = [
          {
            chartOfAccountId: bankGl,
            debit: cash,
            credit: new Decimal(0),
            description: `STI settlement receipt — ${instrument.name}`,
          },
          {
            chartOfAccountId: instrument.principalGlAccountId,
            debit: new Decimal(0),
            credit: principal,
            description: `Principal — ${instrument.name}`,
          },
          {
            chartOfAccountId: instrument.accruedInterestGlAccountId,
            debit: new Decimal(0),
            credit: accrued,
            description: `Accrued interest — ${instrument.name}`,
          },
        ];

        if (plug.gt(0)) {
          lineSpecs.push({
            chartOfAccountId: instrument.interestIncomeGlAccountId,
            debit: new Decimal(0),
            credit: plug,
            description: `Settlement plug (premium) — ${instrument.name}`,
          });
        } else if (plug.lt(0)) {
          lineSpecs.push({
            chartOfAccountId: instrument.interestIncomeGlAccountId,
            debit: plug.abs(),
            credit: new Decimal(0),
            description: `Settlement plug (shortfall) — ${instrument.name}`,
          });
        }

        const debitTotal = lineSpecs.reduce((s, l) => s.plus(l.debit), new Decimal(0));

        const je = await assignNextAuditIdAndCreateJournal(tx, {
          transactionDate: settlementDay,
          referenceNumber: ref,
          description: `Short-term investment settlement — ${instrument.name} (${settlementIso})`,
          totalAmount: this.headerAmountFromLines(debitTotal),
          currencyId: instrument.currencyId,
          status: postingMode === "APPROVED" ? "POSTED" : "PENDING",
          createdById: params.actorId,
        });

        for (const line of lineSpecs) {
          await tx.journalEntryLine.create({
            data: {
              journalEntryId: je.id,
              chartOfAccountId: line.chartOfAccountId,
              debitAmount: line.debit,
              creditAmount: line.credit,
              description: line.description,
            },
          });
        }

        await tx.shortTermInvestmentInstrument.update({
          where: { id: instrument.id },
          data: {
            status: "SETTLED",
            liquidationJournalEntryId: je.id,
            liquidationDate: settlementDay,
            liquidationCashReceived: cash,
            carryingFunctionalAtSettlement: carryingFunctional,
          },
        });

        await AuditService.log({
          userId: params.actorId,
          action: "CREATE",
          entityType: "JournalEntry",
          entityId: je.id,
          newValues: { journalEntryId: je.id, referenceNumber: ref, stiSettlement: instrument.id },
        });
      },
      { maxWait: 60_000, timeout: 120_000 }
    );

    const updatedInst = await prisma.shortTermInvestmentInstrument.findUnique({
      where: { id: params.instrumentId },
    });

    if (
      updatedInst?.realizedFxGlAccountId &&
      updatedInst.functionalCurrencyId &&
      carryingFunctional != null
    ) {
      try {
        const cashF = await MultiCurrencyService.convertCurrency({
          amount: cash.toNumber(),
          fromCurrencyId: instrument.currencyId,
          toCurrencyId: updatedInst.functionalCurrencyId,
          date: settlementDay,
        });
        const diff = new Decimal(cashF.convertedAmount).minus(carryingFunctional);
        if (diff.abs().gte("0.01")) {
          const fxRef = `STI-RFX-${instrument.id.slice(0, 8)}-${randomBytes(2).toString("hex").toUpperCase()}`;
          const headerDebit = diff.gt(0) ? diff.abs() : new Decimal(0);
          const headerCredit = diff.lt(0) ? diff.abs() : new Decimal(0);
          if (!headerDebit.isZero() || !headerCredit.isZero()) {
            const jeFx = await createJournalEntryWithAuditSequence({
              transactionDate: settlementDay,
              referenceNumber: fxRef,
              description: `STI realized FX — ${instrument.name}`,
              totalAmount:
                headerDebit.gt(0) ? headerDebit.toDecimalPlaces(2) : headerCredit.toDecimalPlaces(2),
              currencyId: updatedInst.functionalCurrencyId,
              status: postingMode === "APPROVED" ? "POSTED" : "PENDING",
              createdById: params.actorId,
            });
            if (diff.gt(0)) {
              await prisma.journalEntryLine.create({
                data: {
                  journalEntryId: jeFx.id,
                  chartOfAccountId: updatedInst.realizedFxGlAccountId,
                  debitAmount: new Decimal(0),
                  creditAmount: diff.abs().toDecimalPlaces(3),
                  description: "Realized FX gain (functional)",
                },
              });
              await prisma.journalEntryLine.create({
                data: {
                  journalEntryId: jeFx.id,
                  chartOfAccountId: updatedInst.principalGlAccountId,
                  debitAmount: diff.abs().toDecimalPlaces(3),
                  creditAmount: new Decimal(0),
                  description: "STI carrying value settlement (functional)",
                },
              });
            } else {
              await prisma.journalEntryLine.create({
                data: {
                  journalEntryId: jeFx.id,
                  chartOfAccountId: updatedInst.realizedFxGlAccountId,
                  debitAmount: diff.abs().toDecimalPlaces(3),
                  creditAmount: new Decimal(0),
                  description: "Realized FX loss (functional)",
                },
              });
              await prisma.journalEntryLine.create({
                data: {
                  journalEntryId: jeFx.id,
                  chartOfAccountId: updatedInst.principalGlAccountId,
                  debitAmount: new Decimal(0),
                  creditAmount: diff.abs().toDecimalPlaces(3),
                  description: "STI carrying value settlement (functional)",
                },
              });
            }
          }
        }
      } catch {
        /* optional FX JE */
      }
    }

    return updatedInst;
  }

  /** YYYY-MM — last calendar day as YYYY-MM-DD (UTC calendar). */
  static lastDayIsoOfYearMonth(yearMonth: string): string {
    const [ys, ms] = yearMonth.split("-");
    const y = Number(ys);
    const m = Number(ms);
    if (!y || !m) throw new Error("yearMonth must be YYYY-MM");
    const last = new Date(Date.UTC(y, m, 0));
    return last.toISOString().slice(0, 10);
  }

  /**
   * Month-end unrealized FX: compares sum of translated accrual ticks vs fresh translation of carrying
   * at month-end; posts to `unrealizedFxGlAccountId` when configured.
   */
  static async runMonthEndRevaluation(params: { yearMonth: string; actorId: string }) {
    const monthEndIso = this.lastDayIsoOfYearMonth(params.yearMonth);
    const monthEnd = accrualDateFromIso(monthEndIso);

    const instruments = await prisma.shortTermInvestmentInstrument.findMany({
      where: {
        status: "ACTIVE",
        functionalCurrencyId: { not: null },
        unrealizedFxGlAccountId: { not: null },
      },
    });

    const summary: Array<{ instrumentId: string; outcome: string }> = [];

    for (const inst of instruments) {
      const existing = await prisma.shortTermInvestmentFxRevaluation.findUnique({
        where: {
          instrumentId_yearMonth: { instrumentId: inst.id, yearMonth: params.yearMonth },
        },
      });
      if (existing) {
        summary.push({ instrumentId: inst.id, outcome: "already_recorded" });
        continue;
      }

      const lastAccrual = await prisma.shortTermInvestmentAccrual.findFirst({
        where: {
          instrumentId: inst.id,
          accrualDate: { lte: monthEnd },
        },
        orderBy: { accrualDate: "desc" },
      });
      const accrued = lastAccrual
        ? new Decimal(lastAccrual.runningAccruedBalance.toString())
        : new Decimal(0);
      const principal = new Decimal(inst.principal.toString());
      const carrying = principal.plus(accrued);

      let bookFunctional = new Decimal(0);
      try {
        const pConv = await MultiCurrencyService.convertCurrency({
          amount: principal.toNumber(),
          fromCurrencyId: inst.currencyId,
          toCurrencyId: inst.functionalCurrencyId!,
          date: monthEnd,
        });
        bookFunctional = new Decimal(pConv.convertedAmount);
      } catch {
        bookFunctional = new Decimal(0);
      }

      const accruals = await prisma.shortTermInvestmentAccrual.findMany({
        where: {
          instrumentId: inst.id,
          accrualDate: { lte: monthEnd },
        },
      });
      for (const a of accruals) {
        if (a.reportingAmountFunctional != null) {
          bookFunctional = bookFunctional.plus(a.reportingAmountFunctional.toString());
        } else {
          try {
            const c = await MultiCurrencyService.convertCurrency({
              amount: new Decimal(a.amountInstrumentCcy.toString()).toNumber(),
              fromCurrencyId: inst.currencyId,
              toCurrencyId: inst.functionalCurrencyId!,
              date: accrualDateFromIso(a.accrualDate.toISOString().slice(0, 10)),
            });
            bookFunctional = bookFunctional.plus(c.convertedAmount);
          } catch {
            /* skip tick */
          }
        }
      }

      try {
        const revised = await MultiCurrencyService.convertCurrency({
          amount: carrying.toNumber(),
          fromCurrencyId: inst.currencyId,
          toCurrencyId: inst.functionalCurrencyId!,
          date: monthEnd,
        });
        const revisedCarrying = new Decimal(revised.convertedAmount);
        const diff = revisedCarrying.minus(bookFunctional);
        if (diff.abs().lt("0.01")) {
          summary.push({ instrumentId: inst.id, outcome: "immaterial" });
          continue;
        }

        const settings = await getOrCreateSettingsRow();
        const postingMode = settings.postingMode as StiPostingMode;
        const fxRef = `STI-UFX-${inst.id.slice(0, 8)}-${params.yearMonth}-${randomBytes(2).toString("hex").toUpperCase()}`;

        const je = await createJournalEntryWithAuditSequence({
          transactionDate: monthEnd,
          referenceNumber: fxRef,
          description: `STI unrealized FX reval ${params.yearMonth} — ${inst.name}`,
          totalAmount: diff.abs().toDecimalPlaces(2),
          currencyId: inst.functionalCurrencyId!,
          status: postingMode === "APPROVED" ? "POSTED" : "PENDING",
          createdById: params.actorId,
        });

        // UAT/Accounting: FX revaluation must adjust the investment carrying value on the Balance Sheet
        // and book the delta to an Unrealized FX Gain/Loss P&L account.
        const fxGl = inst.unrealizedFxGlAccountId!;
        const invGl = inst.principalGlAccountId;

        if (diff.gt(0)) {
          await prisma.journalEntryLine.create({
            data: {
              journalEntryId: je.id,
              chartOfAccountId: fxGl,
              debitAmount: new Decimal(0),
              creditAmount: diff.abs().toDecimalPlaces(3),
              description: "Unrealized FX gain (functional)",
            },
          });
          await prisma.journalEntryLine.create({
            data: {
              journalEntryId: je.id,
              chartOfAccountId: invGl,
              debitAmount: diff.abs().toDecimalPlaces(3),
              creditAmount: new Decimal(0),
              description: "STI carrying value revaluation (functional)",
            },
          });
        } else {
          await prisma.journalEntryLine.create({
            data: {
              journalEntryId: je.id,
              chartOfAccountId: fxGl,
              debitAmount: diff.abs().toDecimalPlaces(3),
              creditAmount: new Decimal(0),
              description: "Unrealized FX loss (functional)",
            },
          });
          await prisma.journalEntryLine.create({
            data: {
              journalEntryId: je.id,
              chartOfAccountId: invGl,
              debitAmount: new Decimal(0),
              creditAmount: diff.abs().toDecimalPlaces(3),
              description: "STI carrying value revaluation (functional)",
            },
          });
        }

        await prisma.shortTermInvestmentFxRevaluation.create({
          data: {
            instrumentId: inst.id,
            yearMonth: params.yearMonth,
            journalEntryId: je.id,
            priorCarryingFunctional: bookFunctional.toDecimalPlaces(6),
            revisedCarryingFunctional: revisedCarrying.toDecimalPlaces(6),
          },
        });

        summary.push({ instrumentId: inst.id, outcome: "posted" });
      } catch (e: any) {
        summary.push({ instrumentId: inst.id, outcome: `error:${e?.message ?? e}` });
      }
    }

    return { monthEndIso, summary };
  }

  /**
   * Principal + accrued interest through `throughIso` (inclusive), day-by-day, matching posted accrual math
   * (used for projected maturity cash / liquidity buckets).
   */
  private static projectPrincipalPlusAccruedThroughIso(params: {
    principal: Decimal;
    startIso: string;
    throughIso: string;
    compoundingMethod: StiCompoundingMethod;
    dayCount: StiDayCountConvention;
    apyRates: ShortTermInvestmentApyRate[];
  }): Decimal {
    const principal = new Decimal(params.principal.toString());
    let accruedBefore = new Decimal(0);
    if (compareIsoDate(params.startIso, params.throughIso) > 0) {
      return principal;
    }
    for (
      let cursor = params.startIso;
      compareIsoDate(cursor, params.throughIso) <= 0;
      cursor = addOneCalendarDayIso(cursor)
    ) {
      const rate = ShortTermInvestmentService.pickApyForIsoFromRates(params.apyRates, cursor);
      if (!rate) continue;
      const { dailyAmount } = ShortTermInvestmentAccrualCalculator.computeOneDay({
        compoundingMethod: params.compoundingMethod,
        dayCount: params.dayCount,
        apy: rate.apy,
        principal,
        accruedInterestBefore: accruedBefore,
        accrualDateIso: cursor,
      });
      const rounded = dailyAmount.toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
      accruedBefore = accruedBefore.plus(rounded);
    }
    return principal.plus(accruedBefore);
  }

  static readonly dashboardDocumentation = {
    settlementVarianceEntry: {
      instrumentId: "string — short_term_investment_instruments.id",
      instrumentName: "string",
      settlementDate: "YYYY-MM-DD — liquidation / settlement calendar date",
      expectedSettledAmountInstrumentCcy:
        "number — principal + accrued (last accrual row) expected at settlement, instrument currency",
      actualSettledAmountInstrumentCcy: "number | null — cash received, instrument currency",
      varianceInstrumentCcy:
        "number | null — actualSettledAmountInstrumentCcy minus expectedSettledAmountInstrumentCcy",
    },
    alertEntry: {
      type: "PENDING_APPROVAL | CAPITAL_EROSION | RATE_CHANGE",
      instrumentId: "string",
      instrumentName: "string — optional",
      message: "string",
      triggeredAt: "ISO-8601 datetime",
    },
    /** Daily Yield Report series: one row per calendar day in the as-of month through `asOf`. */
    dailyYieldInMonthEntry: {
      accrualDate: "YYYY-MM-DD — UTC calendar date for the bucket (same as dateLabel)",
      dateLabel:
        "YYYY-MM-DD — use this (or accrualDate) for chart tooltip / category name; do not show only “Day DD”",
      amountSum: "number — sum of accrual amounts that day (instrument functional mix per query rules)",
    },
  } as const;

  static async getDashboard(params: { asOfIso: string; broker?: string }) {
    const asOf = accrualDateFromIso(params.asOfIso);
    const active = await prisma.shortTermInvestmentInstrument.findMany({
      where: {
        status: "ACTIVE",
        ...(params.broker != null && params.broker.trim()
          ? { broker: params.broker.trim() }
          : {}),
      },
      include: {
        currency: true,
        functionalCurrency: true,
        apyRates: { orderBy: { effectiveFrom: "asc" } },
      },
    });

    let portfolioPrincipal = new Decimal(0);
    let portfolioAccrued = new Decimal(0);
    const maturityBuckets: Record<string, Decimal> = {
      d30: new Decimal(0),
      d60: new Decimal(0),
      d90: new Decimal(0),
      d90p: new Decimal(0),
    };

    const asOfIsoStr = params.asOfIso.slice(0, 10);
    const monthStartIso = `${asOf.getUTCFullYear()}-${String(asOf.getUTCMonth() + 1).padStart(2, "0")}-01`;

    const instrumentsOut: Array<{
      instrumentId: string;
      instrumentName: string;
      broker: string | null;
      currencyCode: string;
      principal: number;
      accruedInterest: number;
      carryingValue: number;
      maturityDate: string | null;
      projectedMaturityValueInstrumentCcy: number | null;
      apyAsOf: number | null;
      status: "active" | "capital_erosion";
    }> = [];

    const alerts: Array<{
      type: "PENDING_APPROVAL" | "CAPITAL_EROSION" | "RATE_CHANGE";
      instrumentId: string;
      instrumentName?: string;
      message: string;
      triggeredAt: string;
    }> = [];

    const rateAlertWindowStart = asOf.getTime() - 7 * 86400000;
    const rateAlertWindowEnd = asOf.getTime() + 86400000 - 1;

    for (const inst of active) {
      portfolioPrincipal = portfolioPrincipal.plus(inst.principal.toString());
      const last = await prisma.shortTermInvestmentAccrual.findFirst({
        where: { instrumentId: inst.id, accrualDate: { lte: asOf } },
        orderBy: { accrualDate: "desc" },
      });
      const acc = last ? new Decimal(last.runningAccruedBalance.toString()) : new Decimal(0);
      portfolioAccrued = portfolioAccrued.plus(acc);

      const principalN = new Decimal(inst.principal.toString()).toNumber();
      const accN = acc.toNumber();
      const carryingN = principalN + accN;

      const startIso = inst.startDate.toISOString().slice(0, 10);
      const maturityIso = inst.maturityDate ? inst.maturityDate.toISOString().slice(0, 10) : null;

      let projectedMaturity: number | null = null;
      if (maturityIso && compareIsoDate(startIso, maturityIso) <= 0) {
        projectedMaturity = ShortTermInvestmentService.projectPrincipalPlusAccruedThroughIso({
          principal: new Decimal(inst.principal.toString()),
          startIso,
          throughIso: maturityIso,
          compoundingMethod: inst.compoundingMethod as StiCompoundingMethod,
          dayCount: inst.dayCountConvention as StiDayCountConvention,
          apyRates: inst.apyRates,
        }).toNumber();
      }

      if (maturityIso) {
        const daysToMaturity = Math.ceil(
          (accrualDateFromIso(maturityIso).getTime() - asOf.getTime()) / 86400000
        );
        const bucketAmount = new Decimal(projectedMaturity ?? carryingN);
        if (daysToMaturity <= 30) maturityBuckets.d30 = maturityBuckets.d30.plus(bucketAmount);
        else if (daysToMaturity <= 60) maturityBuckets.d60 = maturityBuckets.d60.plus(bucketAmount);
        else if (daysToMaturity <= 90) maturityBuckets.d90 = maturityBuckets.d90.plus(bucketAmount);
        else maturityBuckets.d90p = maturityBuckets.d90p.plus(bucketAmount);
      }

      const apyRow =
        compareIsoDate(asOfIsoStr, startIso) >= 0
          ? ShortTermInvestmentService.pickApyForIsoFromRates(inst.apyRates, asOfIsoStr)
          : null;
      const apyAsOf = apyRow ? new Decimal(apyRow.apy.toString()).toNumber() : null;

      instrumentsOut.push({
        instrumentId: inst.id,
        instrumentName: inst.name,
        broker: inst.broker ?? null,
        currencyCode: inst.currency.code,
        principal: principalN,
        accruedInterest: accN,
        carryingValue: carryingN,
        maturityDate: maturityIso,
        projectedMaturityValueInstrumentCcy: projectedMaturity,
        apyAsOf,
        status: inst.capitalErosion ? "capital_erosion" : "active",
      });

      if (inst.capitalErosion) {
        alerts.push({
          type: "CAPITAL_EROSION",
          instrumentId: inst.id,
          instrumentName: inst.name,
          message: "Instrument is marked as negative yield (capital erosion) for the current APY schedule.",
          triggeredAt: inst.updatedAt.toISOString(),
        });
      }

      for (const r of inst.apyRates) {
        const t = r.createdAt.getTime();
        if (t >= rateAlertWindowStart && t <= rateAlertWindowEnd) {
          alerts.push({
            type: "RATE_CHANGE",
            instrumentId: inst.id,
            instrumentName: inst.name,
            message: `APY schedule updated (effective from ${r.effectiveFrom.toISOString().slice(0, 10)}).`,
            triggeredAt: r.createdAt.toISOString(),
          });
        }
      }
    }

    // Portfolio net yield: sum of accrual ticks for the month-to-date (or broker-scoped), not lifetime running balances.
    // This gives a true net appreciation/depreciation measure for the reporting window.
    const netYieldMonthToDate = await prisma.shortTermInvestmentAccrual.aggregate({
      where: {
        accrualDate: {
          gte: accrualDateFromIso(monthStartIso),
          lte: asOf,
        },
        ...(params.broker != null && params.broker.trim()
          ? { instrument: { broker: params.broker.trim() } }
          : {}),
      },
      _sum: { amountInstrumentCcy: true },
    });

    const pendingAccruals = await prisma.shortTermInvestmentAccrual.findMany({
      where: {
        status: "PENDING_POST",
        accrualDate: { lte: asOf },
        instrument: { status: "ACTIVE" },
      },
      take: 100,
      include: { instrument: { select: { name: true } } },
      orderBy: { accrualDate: "desc" },
    });
    for (const p of pendingAccruals) {
      alerts.push({
        type: "PENDING_APPROVAL",
        instrumentId: p.instrumentId,
        instrumentName: p.instrument.name,
        message: `Accrual ${p.accrualDate.toISOString().slice(0, 10)} awaits journal posting approval.`,
        triggeredAt: p.accrualDate.toISOString(),
      });
    }

    const yieldRows = await prisma.shortTermInvestmentAccrual.groupBy({
      by: ["accrualDate"],
      where: {
        accrualDate: {
          gte: accrualDateFromIso(monthStartIso),
          lte: asOf,
        },
        ...(params.broker != null && params.broker.trim()
          ? { instrument: { broker: params.broker.trim() } }
          : {}),
      },
      _sum: { amountInstrumentCcy: true },
    });

    const amountByDay = new Map<string, number>();
    for (const r of yieldRows) {
      const iso = r.accrualDate.toISOString().slice(0, 10);
      amountByDay.set(iso, r._sum.amountInstrumentCcy ? r._sum.amountInstrumentCcy.toNumber() : 0);
    }

    const dailyYieldInMonth: Array<{
      accrualDate: string;
      /** Same as accrualDate; explicit field for UIs that need a tooltip/category label. */
      dateLabel: string;
      amountSum: number;
    }> = [];
    for (
      let cursor = monthStartIso;
      compareIsoDate(cursor, asOfIsoStr) <= 0;
      cursor = addOneCalendarDayIso(cursor)
    ) {
      dailyYieldInMonth.push({
        accrualDate: cursor,
        dateLabel: cursor,
        amountSum: amountByDay.get(cursor) ?? 0,
      });
    }

    const settled = await prisma.shortTermInvestmentInstrument.findMany({
      where: { status: "SETTLED", liquidationCashReceived: { not: null } },
      select: {
        id: true,
        name: true,
        principal: true,
        liquidationCashReceived: true,
        liquidationDate: true,
      },
    });

    const settlementVariance: Array<{
      instrumentId: string;
      instrumentName: string;
      settlementDate: string | null;
      expectedSettledAmountInstrumentCcy: number;
      actualSettledAmountInstrumentCcy: number | null;
      varianceInstrumentCcy: number | null;
    }> = [];

    for (const s of settled) {
      const last = await prisma.shortTermInvestmentAccrual.findFirst({
        where: { instrumentId: s.id },
        orderBy: { accrualDate: "desc" },
      });
      const acc = last ? new Decimal(last.runningAccruedBalance.toString()) : new Decimal(0);
      const expected = new Decimal(s.principal.toString()).plus(acc).toNumber();
      const actual = s.liquidationCashReceived
        ? new Decimal(s.liquidationCashReceived.toString()).toNumber()
        : null;
      const variance = actual != null ? actual - expected : null;
      settlementVariance.push({
        instrumentId: s.id,
        instrumentName: s.name,
        settlementDate: s.liquidationDate ? s.liquidationDate.toISOString().slice(0, 10) : null,
        expectedSettledAmountInstrumentCcy: expected,
        actualSettledAmountInstrumentCcy: actual,
        varianceInstrumentCcy: variance,
      });
    }

    return {
      asOf: params.asOfIso,
      portfolio: {
        principalTotal: portfolioPrincipal.toNumber(),
        accruedInterestTotal: portfolioAccrued.toNumber(),
        carryingTotal: portfolioPrincipal.plus(portfolioAccrued).toNumber(),
      },
      netYield: {
        // Portfolio-level net interest accrued through `asOf` across the included instruments.
        // Positive = net interest income; Negative = net interest expense / capital erosion.
        accruedInterestTotal: portfolioAccrued.toNumber(),
        monthToDate: netYieldMonthToDate._sum.amountInstrumentCcy
          ? netYieldMonthToDate._sum.amountInstrumentCcy.toNumber()
          : 0,
      },
      instruments: instrumentsOut,
      dailyYieldInMonth,
      maturityBuckets: {
        within30Days: maturityBuckets.d30.toNumber(),
        days31to60: maturityBuckets.d60.toNumber(),
        days61to90: maturityBuckets.d90.toNumber(),
        over90Days: maturityBuckets.d90p.toNumber(),
      },
      settlementVariance,
      alerts,
      documentation: ShortTermInvestmentService.dashboardDocumentation,
    };
  }

  static async createInstrument(
    payload: {
      name: string;
      category?: string | null;
      broker?: string | null;
      principal: number | string;
      currencyId: string;
      functionalCurrencyId?: string | null;
      compoundingMethod: string;
      dayCountConvention?: string;
      settlementBankId: string;
      principalGlAccountId: string;
      accruedInterestGlAccountId: string;
      interestIncomeGlAccountId: string;
      negativeYieldExpenseGlAccountId: string;
      unrealizedFxGlAccountId?: string | null;
      realizedFxGlAccountId?: string | null;
      startDateIso: string;
      maturityDateIso?: string | null;
      initialApy: string | number;
      initialApyEffectiveFromIso?: string;
    },
    ctx: { userId: string; ipAddress?: string | null; userAgent?: string | null }
  ) {
    // For backdated instruments, default APY effective date to instrument start date.
    // This ensures catch-up accrual has an active rate from day one.
    const eff = payload.initialApyEffectiveFromIso ?? payload.startDateIso;

    const allowedDayCounts: StiDayCountConvention[] = ["ACTUAL_365", "ACTUAL_360", "THIRTY_360"];
    const dayCountConvention = (payload.dayCountConvention ?? "ACTUAL_365") as StiDayCountConvention;
    if (!allowedDayCounts.includes(dayCountConvention)) {
      throw new Error(`Unsupported dayCountConvention: ${payload.dayCountConvention}`);
    }

    const allowedCompounding: StiCompoundingMethod[] = ["SIMPLE", "COMPOUND_DAILY", "COMPOUND_MONTHLY"];
    const compoundingMethod = payload.compoundingMethod as StiCompoundingMethod;
    if (!allowedCompounding.includes(compoundingMethod)) {
      throw new Error(`Unsupported compoundingMethod: ${payload.compoundingMethod}`);
    }

    // UAT: block instrument creation if settlement bank lacks a linked Cash/GL account.
    const settlementBank = await prisma.bank.findUnique({
      where: { id: payload.settlementBankId },
      select: { id: true, glAccountId: true, isActive: true },
    });
    if (!settlementBank || !settlementBank.isActive) {
      throw new Error("Settlement bank not found or inactive");
    }
    if (!settlementBank.glAccountId) {
      throw new Error("Settlement bank must have a linked GL account (Cash / CACE)");
    }

    const row = await prisma.shortTermInvestmentInstrument.create({
      data: {
        name: payload.name,
        category: payload.category ?? undefined,
        broker: payload.broker ?? undefined,
        principal: new Decimal(payload.principal.toString()),
        currencyId: payload.currencyId,
        functionalCurrencyId: payload.functionalCurrencyId ?? undefined,
        compoundingMethod,
        dayCountConvention,
        settlementBankId: payload.settlementBankId,
        principalGlAccountId: payload.principalGlAccountId,
        accruedInterestGlAccountId: payload.accruedInterestGlAccountId,
        interestIncomeGlAccountId: payload.interestIncomeGlAccountId,
        negativeYieldExpenseGlAccountId: payload.negativeYieldExpenseGlAccountId,
        unrealizedFxGlAccountId: payload.unrealizedFxGlAccountId ?? undefined,
        realizedFxGlAccountId: payload.realizedFxGlAccountId ?? undefined,
        startDate: accrualDateFromIso(payload.startDateIso),
        maturityDate: payload.maturityDateIso
          ? accrualDateFromIso(payload.maturityDateIso)
          : undefined,
        createdById: ctx.userId,
        apyRates: {
          create: {
            effectiveFrom: accrualDateFromIso(eff),
            apy: normalizeApyInputToDecimal(payload.initialApy),
            createdById: ctx.userId,
          },
        },
      },
      include: { apyRates: true },
    });

    await AuditService.log({
      userId: ctx.userId,
      action: "CREATE",
      entityType: "ShortTermInvestmentInstrument",
      entityId: row.id,
      newValues: { id: row.id, name: row.name, principal: row.principal.toString() },
      ipAddress: ctx.ipAddress ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
    });

    return row;
  }

  static async appendApyRate(params: {
    instrumentId: string;
    effectiveFromIso: string;
    apy: string | number;
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const inst = await prisma.shortTermInvestmentInstrument.findUnique({
      where: { id: params.instrumentId },
    });
    if (!inst) throw new Error("Instrument not found");
    if (inst.status !== "ACTIVE") throw new Error("Can only add rates to ACTIVE instruments");

    // UAT: capture previous effective rate for immutable audit trail.
    const prev = await prisma.shortTermInvestmentApyRate.findFirst({
      where: {
        instrumentId: params.instrumentId,
        effectiveFrom: { lte: accrualDateFromIso(params.effectiveFromIso) },
      },
      orderBy: { effectiveFrom: "desc" },
    });

    const row = await prisma.shortTermInvestmentApyRate.create({
      data: {
        instrumentId: params.instrumentId,
        effectiveFrom: accrualDateFromIso(params.effectiveFromIso),
        apy: normalizeApyInputToDecimal(params.apy),
        createdById: params.userId,
      },
    });

    await AuditService.log({
      userId: params.userId,
      action: "CREATE",
      entityType: "ShortTermInvestmentApyRate",
      entityId: row.id,
      oldValues: prev
        ? { id: prev.id, effectiveFrom: prev.effectiveFrom, apy: prev.apy.toString() }
        : null,
      newValues: { id: row.id, effectiveFrom: row.effectiveFrom, apy: row.apy.toString() },
      ipAddress: params.ipAddress ?? undefined,
      userAgent: params.userAgent ?? undefined,
    });

    return row;
  }
}
