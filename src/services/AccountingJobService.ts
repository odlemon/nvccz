// @ts-nocheck
/**
 * Accounting's scheduled jobs: one in-process scheduler (started from app.ts) for everything the Accounting SRDs say runs
 * on its own — interest accrual on short-term investments at 23:59, month-end FX revaluation of investments, maturity
 * alerts, the monthly depreciation run, recurring journals, the daily official rate, overdue receivables, month-end close
 * reminders and a daily ledger integrity check.
 *
 * Time is the tenant's (resolveStiFiscalIanaTimezone: settings → company profile → FISCAL_TIMEZONE → Africa/Harare), not
 * the server's. Each run is a row in `accounting_job_runs` keyed by (job, slot): inserting the slot is the lease, so a
 * second server or a second tick never runs the same slot twice, and every run leaves a record (status, summary, error)
 * that Accounting → Settings → Scheduled jobs shows, with Run now. Every job is also idempotent on its own (a day already
 * accrued, a month already depreciated, a template already run this month is skipped).
 *
 * Off switches: ACCOUNTING_JOBS=off (all), ACCOUNTING_JOB_<KEY>=off (one; key upper-cased, dots → underscores), or the
 * per-job switch on the Scheduled jobs screen (accounting_job_settings).
 */
import crypto from "crypto";
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";
import { resolveStiFiscalIanaTimezone, ShortTermInvestmentService } from "./ShortTermInvestmentService";
import { dispatchProcurementNotification } from "./ProcurementNotificationService";

type Schedule =
  | { kind: "daily"; at: string } // HH:MM tenant time, every day
  | { kind: "monthly"; day: number; at: string } // on that day of the month (or the last day, if shorter)
  | { kind: "month-end"; at: string } // on the last day of the month
  | { kind: "business-days"; days: number; at: string }; // on each of the first N working days (Mon–Fri) of the month

type JobContext = { actorId: string; slot: string; local: LocalNow; trigger: "schedule" | "manual" };
type JobDef = { key: string; label: string; description: string; schedule: Schedule; postsToLedger: boolean; run: (ctx: JobContext) => Promise<any> };

type LocalNow = { date: string; year: number; month: number; day: number; hh: number; mm: number; weekday: number; lastDay: number };

/** The tenant's local calendar and clock at `d`. */
export function localNow(d: Date, tz: string): LocalNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(d).map((p) => [p.type, p.value])
  );
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, year, month, day, hh: Number(parts.hour), mm: Number(parts.minute), weekday: wd, lastDay: new Date(Date.UTC(year, month, 0)).getUTCDate() };
}
const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const pad = (n: number) => String(n).padStart(2, "0");
const ym = (l: LocalNow) => `${l.year}-${pad(l.month)}`;
const prevYm = (l: LocalNow) => (l.month === 1 ? `${l.year - 1}-12` : `${l.year}-${pad(l.month - 1)}`);
function businessDayOfMonth(l: LocalNow): number {
  let n = 0;
  for (let d = 1; d <= l.day; d++) { const wd = new Date(Date.UTC(l.year, l.month - 1, d)).getUTCDay(); if (wd !== 0 && wd !== 6) n++; }
  return l.weekday === 0 || l.weekday === 6 ? 0 : n;
}

/** The slot a schedule is due for at `l`, or null when nothing is due now. */
export function dueSlot(s: Schedule, l: LocalNow): string | null {
  const t = l.hh * 60 + l.mm;
  if (s.kind === "daily") return t >= hm(s.at) ? l.date : null;
  if (s.kind === "monthly") { const day = Math.min(s.day, l.lastDay); return l.day > day || (l.day === day && t >= hm(s.at)) ? ym(l) : null; }
  if (s.kind === "month-end") return l.day === l.lastDay && t >= hm(s.at) ? ym(l) : null;
  if (s.kind === "business-days") { const bd = businessDayOfMonth(l); return bd >= 1 && bd <= s.days && t >= hm(s.at) ? l.date : null; }
  return null;
}

/** A person to record as the actor of automatic postings: an active module administrator. */
async function systemActorId(): Promise<string | null> {
  const roles = await prisma.role.findMany({ select: { id: true, name: true, permissions: true } });
  const ids = roles.filter((r) => String(r.name).toLowerCase() === "admin" || (Array.isArray(r.permissions) && r.permissions.some((p) => p && p.value === true && p.name === "accounting.access.manage"))).map((r) => r.id);
  const u = ids.length ? await prisma.user.findFirst({ where: { roleId: { in: ids }, status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true } }) : null;
  return u?.id || null;
}

/** Everyone whose role holds one of `keys` (active users). */
async function holders(keys: string[]): Promise<string[]> {
  const roles = await prisma.role.findMany({ select: { id: true, permissions: true, name: true } });
  const ids = roles.filter((r) => Array.isArray(r.permissions) && r.permissions.some((p) => p && p.value === true && keys.includes(p.name))).map((r) => r.id);
  if (!ids.length) return [];
  return (await prisma.user.findMany({ where: { roleId: { in: ids }, status: "ACTIVE" }, select: { id: true } })).map((u) => u.id);
}
async function notify(userIds: string[], title: string, message: string, path: string, data: any = {}) {
  if (!userIds.length) return 0;
  try {
    await dispatchProcurementNotification({ userIds, title, message, type: "ACCOUNTING_JOB", relatedEntity: "AccountingJob", relatedEntityId: data.jobKey || null, data: { path, ...data } });
    return userIds.length;
  } catch (e: any) {
    logger.warn("Accounting job notification failed", { title, message: e?.message });
    return 0;
  }
}
const money = (n: any) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ------------------------------------------------------------------------------------------------------------ the jobs
export const ACCOUNTING_JOBS: JobDef[] = [
  {
    key: "rates.daily", label: "Official exchange rate", postsToLedger: false,
    description: "Records the day's official USD→ZiG rate. If the source cannot be reached, the last stored rate stays in use and finance is told.",
    schedule: { kind: "daily", at: "09:00" },
    run: async (ctx) => {
      const { resolveUsdZwgWithSource } = await import("./UsdZwgRateResolver");
      const [usd, zig] = await Promise.all([prisma.currency.findFirst({ where: { code: "USD" } }), prisma.currency.findFirst({ where: { code: { in: ["ZIG", "ZWG"] } } })]);
      if (!usd || !zig) return { outcome: "skipped", reason: "USD or ZiG currency is not set up" };
      const day = new Date(`${ctx.local.date}T00:00:00.000Z`);
      const existing = await prisma.exchangeRate.findUnique({ where: { date_fromCurrencyId_toCurrencyId: { date: day, fromCurrencyId: usd.id, toCurrencyId: zig.id } } });
      if (existing) return { outcome: "already_recorded", rate: Number(existing.rate) };
      const resolved: any = await resolveUsdZwgWithSource(prisma).catch((e) => ({ error: e?.message }));
      const rate = resolved && resolved.source === "zimrate" ? Number(resolved.row?.avg) : null;
      if (!rate || !Number.isFinite(rate) || rate <= 0) {
        const last = await prisma.exchangeRate.findFirst({ where: { fromCurrencyId: usd.id, toCurrencyId: zig.id }, orderBy: { date: "desc" } });
        const sent = await notify(await holders(["manage_accounting", "accounting.access.manage"]), "Official exchange rate not updated",
          `The official USD→ZiG rate for ${ctx.local.date} could not be fetched${resolved?.error ? ` (${resolved.error})` : ""}. ${last ? `The last stored rate (${Number(last.rate)} from ${last.date.toISOString().slice(0, 10)}) stays in use.` : "No rate is stored yet."} Record today's rate on Accounting → FX Revaluation if needed.`,
          "/accounting/fx-revaluation", { jobKey: "rates.daily" });
        throw Object.assign(new Error("The official rate source could not be reached; the last stored rate stays in use."), { summary: { notified: sent, lastStored: last ? Number(last.rate) : null } });
      }
      const row = await prisma.exchangeRate.create({ data: { date: day, fromCurrencyId: usd.id, toCurrencyId: zig.id, rate, source: "URL", createdById: ctx.actorId } });
      return { outcome: "recorded", date: ctx.local.date, rate: Number(row.rate) };
    },
  },
  {
    key: "sti.accrual", label: "Short-term investment interest accrual", postsToLedger: true,
    description: "Accrues each active investment's interest for every day up to today (catching up any missed days) and posts it as draft or approved, per the treasury posting setting.",
    schedule: { kind: "daily", at: "23:59" },
    run: async (ctx) => {
      const r = await ShortTermInvestmentService.runDailyAccrualJob({ actorId: ctx.actorId, asOfIso: ctx.local.date });
      if (r.errors.length) throw Object.assign(new Error(`${r.errors.length} instrument(s) could not be accrued: ${r.errors.slice(0, 3).join("; ")}`), { summary: r });
      return r;
    },
  },
  {
    key: "sti.maturity", label: "Investment maturity alerts", postsToLedger: false,
    description: "Tells treasury about investments maturing in the next 7 days, and about any past maturity that has not been settled.",
    schedule: { kind: "daily", at: "07:00" },
    run: async (ctx) => {
      const today = new Date(`${ctx.local.date}T00:00:00.000Z`);
      const soon = new Date(today.getTime() + 7 * 86400000);
      const rows = await prisma.shortTermInvestmentInstrument.findMany({ where: { status: "ACTIVE", maturityDate: { not: null, lte: soon } }, select: { id: true, name: true, broker: true, maturityDate: true, principal: true } }).catch(() => []);
      if (!rows.length) return { due: 0, overdue: 0 };
      const overdue = rows.filter((r) => r.maturityDate < today), due = rows.filter((r) => r.maturityDate >= today);
      const line = (r) => `${r.name}${r.broker ? ` at ${r.broker}` : ""} (${r.maturityDate.toISOString().slice(0, 10)}, principal ${money(r.principal)})`;
      const sent = await notify(await holders(["accounting.treasury.manage", "accounting.treasury.approve"]),
        overdue.length ? `${overdue.length} investment(s) past maturity and not settled` : `${due.length} investment(s) maturing within 7 days`,
        [overdue.length ? `Past maturity: ${overdue.map(line).join("; ")}.` : "", due.length ? `Maturing: ${due.map(line).join("; ")}.` : ""].filter(Boolean).join(" "),
        "/accounting/short-term-investments", { jobKey: "sti.maturity" });
      return { due: due.length, overdue: overdue.length, notified: sent };
    },
  },
  {
    key: "sti.fx-month-end", label: "Investment FX revaluation (month end)", postsToLedger: true,
    description: "At month end, revalues foreign-currency investments (principal and accrued interest) at the closing rate and posts the unrealised gain or loss.",
    schedule: { kind: "month-end", at: "23:45" },
    run: async (ctx) => ({ yearMonth: ym(ctx.local), results: await ShortTermInvestmentService.runMonthEndRevaluation({ yearMonth: ym(ctx.local), actorId: ctx.actorId }) }),
  },
  {
    key: "fx.revaluation", label: "Foreign-currency revaluation (month end)", postsToLedger: false,
    description: "At month end, values every foreign-currency balance (banks, receivables, payables) at the closing rate and prepares the unrealised gain or loss as a draft journal for an approver. Nothing is prepared when every balance is already carried at the closing rate.",
    schedule: { kind: "month-end", at: "23:50" },
    run: async (ctx) => {
      const { FxRevaluationService } = await import("./FxRevaluationService");
      try {
        const r = await FxRevaluationService.prepare(ctx.local.date, ctx.actorId);
        await notify(await holders(["manage_ledger"]), "Month-end revaluation waiting", `${r.journal.referenceNumber}: ${r.lines} foreign-currency balance(s), net ${r.net}. Post it from the Approval Queue.`, "/accounting/approvals", { journalEntryId: r.journal.id });
        return { outcome: "prepared", asOf: ctx.local.date, journal: r.journal.referenceNumber, net: r.net, lines: r.lines };
      } catch (e: any) {
        if (e?.statusCode === 409) return { outcome: "nothing_to_book", asOf: ctx.local.date, reason: e.message };
        throw e;
      }
    },
  },
  {
    key: "assets.depreciation", label: "Monthly depreciation", postsToLedger: true,
    description: "On the 1st, posts the previous month's depreciation for every asset in service. A month already depreciated is not posted again.",
    schedule: { kind: "monthly", day: 1, at: "02:15" },
    run: async (ctx) => {
      const { AssetService } = await import("./AssetService");
      // always the last completed month: a month is depreciated once it has ended (the service skips a month already posted)
      const period = prevYm(ctx.local);
      const [y, m] = period.split("-").map(Number);
      const asOf = new Date(Date.UTC(y, m, 0, 12));
      const r = await AssetService.postMonthlyDepreciation({ createdById: ctx.actorId, period, asOfDate: asOf });
      return { period: r.period, processedAssets: r.processedAssets, skippedNotDue: r.skippedNotDue, skippedErrors: r.skippedErrors, totalDepreciation: r.totalDepreciation, errorSamples: r.errorSamples };
    },
  },
  {
    key: "recurring.run-due", label: "Recurring journals", postsToLedger: true,
    description: "Creates this month's journal from every active recurring schedule due today. A schedule already run this month is skipped.",
    schedule: { kind: "daily", at: "06:00" },
    run: async (ctx) => {
      const { RecurringJournalService } = await import("./RecurringJournalService");
      const r = await RecurringJournalService.runDueTemplates(new Date(`${ctx.local.date}T12:00:00.000Z`));
      const failed = (r.posted || []).filter((x) => x.error);
      if (failed.length) throw Object.assign(new Error(`${failed.length} schedule(s) failed: ${failed.slice(0, 3).map((x) => `${x.templateName || x.templateId}: ${x.error}`).join("; ")}`), { summary: r });
      return { created: (r.posted || []).filter((x) => x.journalEntryId).length, skipped: (r.posted || []).filter((x) => x.skipped).length, posted: r.posted };
    },
  },
  {
    key: "ar.overdue", label: "Overdue receivables", postsToLedger: false,
    description: "Each morning, tells the receivables team which customer invoices are past due, with amounts and days overdue.",
    schedule: { kind: "daily", at: "08:00" },
    run: async (ctx) => {
      const today = new Date(`${ctx.local.date}T00:00:00.000Z`);
      const rows = await prisma.invoice.findMany({ where: { status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] }, dueDate: { lt: today }, outstandingAmount: { gt: 0 } }, select: { id: true, invoiceNumber: true, dueDate: true, outstandingAmount: true, customer: { select: { name: true } } }, orderBy: { dueDate: "asc" } });
      if (!rows.length) return { overdue: 0 };
      const total = rows.reduce((a, r) => a + Number(r.outstandingAmount || 0), 0);
      const top = rows.slice(0, 8).map((r) => `${r.invoiceNumber || r.id} ${r.customer?.name || ""} ${money(r.outstandingAmount)} (${Math.round((today.getTime() - r.dueDate.getTime()) / 86400000)} days)`);
      const sent = await notify(await holders(["manage_accounting"]), `${rows.length} customer invoice(s) overdue (${money(total)})`, `Overdue: ${top.join("; ")}${rows.length > 8 ? `; and ${rows.length - 8} more` : ""}.`, "/accounting/receivables", { jobKey: "ar.overdue" });
      return { overdue: rows.length, outstanding: Math.round(total * 100) / 100, notified: sent };
    },
  },
  {
    key: "close.reminders", label: "Month-end close reminders", postsToLedger: false,
    description: "On each of the first five working days of the month, reminds task owners of close tasks still open for the month just ended.",
    schedule: { kind: "business-days", days: 5, at: "08:00" },
    run: async (ctx) => {
      const tasks = await prisma.accountingCloseTask.findMany({ where: { status: { not: "COMPLETE" } }, select: { id: true, task: true, ownerId: true, dueAt: true, workstream: true } }).catch(() => []);
      if (!tasks.length) return { open: 0 };
      const byOwner = new Map<string, any[]>();
      for (const t of tasks) if (t.ownerId) byOwner.set(t.ownerId, [...(byOwner.get(t.ownerId) || []), t]);
      let sent = 0;
      for (const [owner, list] of byOwner) sent += await notify([owner], `${list.length} month-end close task(s) still open`, `Open: ${list.slice(0, 8).map((t) => `${t.task}${t.dueAt ? ` (due ${t.dueAt.toISOString().slice(0, 10)})` : ""}`).join("; ")}.`, "/accounting/close", { jobKey: "close.reminders" });
      const unowned = tasks.filter((t) => !t.ownerId).length;
      if (unowned) sent += await notify(await holders(["accounting.period_lock.manage"]), `${unowned} month-end close task(s) have no owner`, "Assign an owner on Accounting → Month-End Close.", "/accounting/close", { jobKey: "close.reminders" });
      return { open: tasks.length, owners: byOwner.size, unowned, notified: sent };
    },
  },
  {
    key: "ledger.integrity", label: "Ledger integrity check", postsToLedger: false,
    description: "Each morning, records in the cashbook the bank side of any journal another module posted without one, then checks that every posted journal balances, that the trial balance nets to zero and that no day falls in two fiscal periods, and alerts finance if not.",
    schedule: { kind: "daily", at: "05:00" },
    run: async () => {
      // first, the bank side of any journal another module posted without a cashbook line (FINDINGS C-05)
      const { recordMissingBankLegs } = await import("./CashbookJournalLinkService");
      const bankLegs = await recordMissingBankLegs().catch((e) => ({ error: e.message }));
      // every posted journal must balance on its own lines, VR-/REV- included: reversing a balanced journal always
      // balances too, so a VR- that does not is broken, not a normal void — excluding it here (rather than only from
      // the *reports*' trial balance below, which is right: it avoids double-counting activity that nets to zero) let
      // 13 unbalanced VR-PAYROLL-… journals sit posted, undetected, for weeks (A12 in the migration log)
      const unbalanced: any[] = await prisma.$queryRawUnsafe(
        "SELECT je.id, je.referenceNumber AS ref, SUM(l.debitAmount) AS dr, SUM(l.creditAmount) AS cr FROM journal_entries je JOIN journal_entry_lines l ON l.journalEntryId = je.id WHERE je.status = 'POSTED' GROUP BY je.id, je.referenceNumber HAVING ABS(SUM(l.debitAmount) - SUM(l.creditAmount)) > 0.005 LIMIT 50"
      );
      // the reports' rule: a voided journal and its reversal (VR-/REV-) are left out together, so this is the trial
      // balance a statement would show, not a raw sum of everything posted
      const tb: any[] = await prisma.$queryRawUnsafe("SELECT SUM(l.debitAmount) AS dr, SUM(l.creditAmount) AS cr FROM journal_entries je JOIN journal_entry_lines l ON l.journalEntryId = je.id WHERE je.status = 'POSTED' AND je.referenceNumber NOT LIKE 'VR-%' AND je.referenceNumber NOT LIKE 'REV-%'");
      const diff = Math.round((Number(tb[0]?.dr || 0) - Number(tb[0]?.cr || 0)) * 100) / 100;
      // a day in two periods lets a lock on one be missed through the other (see run-accounting-fiscal-dedupe-migration.ts)
      const overlaps: any[] = await prisma.$queryRawUnsafe(
        "SELECT a.name AS a, b.name AS b FROM fiscal_periods a JOIN fiscal_periods b ON a.id < b.id AND a.start_date <= b.end_date AND b.start_date <= a.end_date LIMIT 20"
      );
      const ok = !unbalanced.length && Math.abs(diff) < 0.01 && !overlaps.length;
      if (!ok) {
        await notify(await holders(["manage_ledger", "accounting.access.manage"]), "Ledger integrity check found problems",
          `${unbalanced.length} posted journal(s) do not balance${unbalanced.length ? ` (${unbalanced.slice(0, 5).map((u) => u.ref || u.id).join(", ")})` : ""}; trial balance difference ${money(diff)}${overlaps.length ? `; ${overlaps.length} pair(s) of fiscal periods overlap (${overlaps.slice(0, 3).map((o) => `${o.a} / ${o.b}`).join(", ")})` : ""}.`, "/accounting/general-ledger", { jobKey: "ledger.integrity" });
      }
      return { ok, bankLinesRecorded: (bankLegs as any).recorded ?? 0, unbalancedJournals: unbalanced.length, trialBalanceDifference: diff, overlappingPeriods: overlaps.length, samples: unbalanced.slice(0, 5).map((u) => u.ref || u.id) };
    },
  },
];

// ------------------------------------------------------------------------------------------------------------ running
const envOff = (key: string) => {
  if (String(process.env.ACCOUNTING_JOBS || "").toLowerCase() === "off") return true;
  return String(process.env[`ACCOUNTING_JOB_${key.toUpperCase().replace(/[.-]/g, "_")}`] || "").toLowerCase() === "off";
};
async function enabledMap(): Promise<Map<string, boolean>> {
  const rows: any[] = await prisma.$queryRawUnsafe("SELECT job_key, enabled FROM accounting_job_settings").catch(() => []);
  return new Map(rows.map((r) => [r.job_key, !!Number(r.enabled)]));
}

export class AccountingJobService {
  static async timezone() { return resolveStiFiscalIanaTimezone(); }

  /** Runs one job for one slot. Returns null when the slot was already taken (another tick or server ran it). */
  static async runSlot(job: JobDef, slot: string, trigger: "schedule" | "manual", actorId?: string | null) {
    const id = crypto.randomUUID();
    // a slot already run is the common case on every tick: look first, so the unique key only settles a genuine race
    const taken: any[] = await prisma.$queryRawUnsafe("SELECT id FROM accounting_job_runs WHERE job_key = ? AND slot = ? LIMIT 1", job.key, slot);
    if (taken.length) return null;
    try {
      await prisma.$executeRawUnsafe("INSERT INTO accounting_job_runs (id, job_key, slot, `trigger`, triggered_by_id, status, started_at) VALUES (?, ?, ?, ?, ?, 'running', UTC_TIMESTAMP(3))", id, job.key, slot, trigger, trigger === "manual" ? actorId || null : null);
    } catch (e: any) {
      if (/Duplicate|unique/i.test(String(e?.message))) return null;
      throw e;
    }
    const tz = await this.timezone();
    const local = localNow(new Date(), tz);
    try {
      const actor = actorId || (await systemActorId());
      if (!actor) throw new Error("No active administrator to record as the actor of automatic postings.");
      const summary = await job.run({ actorId: actor, slot, local, trigger });
      await prisma.$executeRawUnsafe("UPDATE accounting_job_runs SET status = 'succeeded', finished_at = UTC_TIMESTAMP(3), summary = ? WHERE id = ?", JSON.stringify(summary ?? {}), id);
      logger.info("Accounting job succeeded", { job: job.key, slot });
      return { id, status: "succeeded", summary };
    } catch (e: any) {
      await prisma.$executeRawUnsafe("UPDATE accounting_job_runs SET status = 'failed', finished_at = UTC_TIMESTAMP(3), error = ?, summary = ? WHERE id = ?", String(e?.message || e).slice(0, 4000), JSON.stringify(e?.summary ?? {}), id);
      logger.error("Accounting job failed", { job: job.key, slot, message: e?.message });
      return { id, status: "failed", error: e?.message };
    }
  }

  /** One scheduler tick: every enabled job whose slot is due and not yet run. */
  static async tick(now = new Date()) {
    const tz = await this.timezone();
    const local = localNow(now, tz);
    const enabled = await enabledMap();
    const out: any[] = [];
    for (const job of ACCOUNTING_JOBS) {
      if (envOff(job.key) || enabled.get(job.key) === false) continue;
      const slot = dueSlot(job.schedule, local);
      if (!slot) continue;
      const r = await this.runSlot(job, slot, "schedule");
      if (r) out.push({ job: job.key, slot, status: r.status });
    }
    return out;
  }

  /** "Run now" from the screen: its own slot, so it never blocks or replaces the scheduled one. */
  static async runNow(key: string, actorId: string) {
    const job = ACCOUNTING_JOBS.find((j) => j.key === key);
    if (!job) throw Object.assign(new Error("Unknown job."), { statusCode: 404 });
    return this.runSlot(job, `manual:${new Date().toISOString()}`, "manual", actorId);
  }

  static async setEnabled(key: string, enabled: boolean, actorId: string) {
    if (!ACCOUNTING_JOBS.some((j) => j.key === key)) throw Object.assign(new Error("Unknown job."), { statusCode: 404 });
    await prisma.$executeRawUnsafe("INSERT INTO accounting_job_settings (job_key, enabled, updated_by_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_by_id = VALUES(updated_by_id)", key, enabled ? 1 : 0, actorId);
    return this.list();
  }

  /** Every job with its schedule, switch, next slot and last runs (Scheduled jobs screen). */
  static async list() {
    const tz = await this.timezone();
    const enabled = await enabledMap();
    const runs: any[] = await prisma.$queryRawUnsafe("SELECT id, job_key, slot, `trigger`, triggered_by_id, status, started_at, finished_at, summary, error FROM accounting_job_runs ORDER BY started_at DESC LIMIT 400");
    return {
      timezone: tz,
      now: localNow(new Date(), tz),
      jobs: ACCOUNTING_JOBS.map((j) => {
        const mine = runs.filter((r) => r.job_key === j.key);
        return {
          key: j.key, label: j.label, description: j.description, schedule: j.schedule, postsToLedger: j.postsToLedger,
          enabled: !envOff(j.key) && enabled.get(j.key) !== false, disabledByEnvironment: envOff(j.key),
          lastRun: mine[0] ? AccountingJobService.shape(mine[0]) : null,
          lastSuccess: mine.find((r) => r.status === "succeeded") ? AccountingJobService.shape(mine.find((r) => r.status === "succeeded")) : null,
          recent: mine.slice(0, 10).map(AccountingJobService.shape),
        };
      }),
    };
  }
  static shape(r: any) {
    let summary = r.summary; try { if (typeof summary === "string") summary = JSON.parse(summary); } catch (_) { /* raw */ }
    return { id: r.id, slot: r.slot, trigger: r.trigger, triggeredById: r.triggered_by_id, status: r.status, startedAt: r.started_at, finishedAt: r.finished_at, summary, error: r.error };
  }

  /** Runs left 'running' by a stopped server are marked failed, so their slot shows what happened. */
  static async recoverStale() {
    await prisma.$executeRawUnsafe("UPDATE accounting_job_runs SET status = 'failed', finished_at = UTC_TIMESTAMP(3), error = 'The server stopped while this run was in progress.' WHERE status = 'running' AND started_at < (UTC_TIMESTAMP(3) - INTERVAL 2 HOUR)").catch(() => 0);
  }
}

let timer: any = null;
/** Started from app.ts: a tick every minute (first after 90 s). */
export function startAccountingJobScheduler() {
  if (String(process.env.ACCOUNTING_JOBS || "").toLowerCase() === "off") { logger.info("Accounting jobs are off (ACCOUNTING_JOBS=off)"); return; }
  if (timer) return;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await AccountingJobService.tick(); } catch (e: any) { logger.error("Accounting job scheduler tick failed", { message: e?.message }); } finally { busy = false; }
  };
  setTimeout(() => { AccountingJobService.recoverStale().finally(tick); timer = setInterval(tick, 60 * 1000); }, 90 * 1000);
  logger.info("Accounting job scheduler started");
}
