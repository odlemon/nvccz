// @ts-nocheck
/**
 * Performance → general ledger, per progress event: the single place a goal's progress is posted to (or reversed out
 * of) Accounting, and where the outcome is recorded.
 *
 * Every progress event on a goal whose KPI posts to the GL gets a `journal_status`:
 *   posted    — a journal `PERF-GOAL-{goalId}-{eventId}` holds it (journalEntryId set)
 *   reversed  — a downward correction; a reversing journal (sides swapped) holds it, capped at what was posted
 *   skipped   — the KPI or goal does not post (the reason is in `journal_note`)
 *   failed    — posting was refused (closed period, missing account, …); `journal_note` says why. The progress stands,
 *               the failure is audited and administrators are notified, and it is retried (scheduler / on demand)
 *               under the same reference, so a retry can never post twice
 *   voided    — Accounting voided the journal; Performance keeps the progress and shows the void
 *
 * Reconciliation: for each goal, the net of its posted/reversed events must equal the net movement of its Performance
 * journals on the KPI's account (`reconcile`).
 */
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";
import AuditService from "./AuditService";
import { KpiAccountingIntegrationService, performanceProgressJournalReference } from "./KpiAccountingIntegrationService";
import { dispatchProcurementNotification } from "./ProcurementNotificationService";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One posting per goal at a time, so two check-ins together cannot both post the same difference. An in-process queue:
 * a MySQL named lock is held by one pooled connection and was released on another, leaving it stuck.
 */
const goalQueues = new Map<string, Promise<unknown>>();
async function withGoalLock<T>(goalId: string, fn: () => Promise<T>): Promise<T> {
  const prev = goalQueues.get(goalId) || Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  goalQueues.set(goalId, tail);
  try {
    return await run;
  } finally {
    if (goalQueues.get(goalId) === tail) goalQueues.delete(goalId);
  }
}
const STATUS = { posted: "posted", reversed: "reversed", skipped: "skipped", failed: "failed", voided: "voided" };

async function setOutcome(eventId: string, status: string, note: string | null, journalEntryId?: string | null, journalAmount?: number | null) {
  const sets = ["`journal_status` = ?", "`journal_note` = ?", "`journal_attempts` = `journal_attempts` + 1", "`journal_attempted_at` = ?"];
  const vals: any[] = [status, note ? String(note).slice(0, 500) : null, new Date()];
  if (journalEntryId !== undefined) { sets.push("`journal_entry_id` = ?"); vals.push(journalEntryId); }
  if (journalAmount !== undefined) { sets.push("`journal_amount` = ?"); vals.push(journalAmount); }
  await prisma.$executeRawUnsafe(`UPDATE \`performance_goal_progress_events\` SET ${sets.join(", ")} WHERE \`id\` = ?`, ...vals, eventId);
}

/** Administrators and anyone who manages integrations hear about a posting that failed (once per event). */
async function notifyFailure(goal: any, eventId: string, reason: string) {
  try {
    const roles = await prisma.role.findMany({ select: { id: true, name: true, permissions: true } });
    const roleIds = roles
      .filter((r) => Array.isArray(r.permissions) && r.permissions.some((p) => p && p.value === true && (p.name === "performance.integration.manage" || p.name === "performance.access.manage")))
      .map((r) => r.id);
    const users = roleIds.length ? await prisma.user.findMany({ where: { roleId: { in: roleIds }, status: "ACTIVE" }, select: { id: true } }) : [];
    if (!users.length) return;
    const title = `Accounting posting failed: ${goal.title}`;
    await dispatchProcurementNotification({
      userIds: users.map((u) => u.id),
      title,
      message: `${title}. ${reason} The progress is recorded; the posting will be retried. Open Integrations → Accounting postings to retry it now.`,
      type: "PERFORMANCE_INTEGRATION_FAILURE",
      relatedEntity: "PerformanceGoalProgressEvent",
      relatedEntityId: eventId,
      data: { path: "/performance/integrations" }
    });
  } catch (e: any) {
    logger.warn("Performance GL failure notification could not be sent", { eventId, message: e?.message });
  }
}

export class PerformanceGlPostingService {
  /** Progress that Performance itself originated (a GL-sourced sync event is never posted back into the GL). */
  static POSTABLE_SOURCES = ["manual", "task", "activity"];

  /** Net amount of a goal's progress currently held in the GL by Performance journals (voided journals excluded). */
  static async netPostedForGoal(goalId: string): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<Array<{ amt: any }>>(
      "SELECT COALESCE(SUM(e.`journal_amount`), 0) AS amt FROM `performance_goal_progress_events` e JOIN `journal_entries` j ON j.`id` = e.`journal_entry_id` " +
        "WHERE e.`goal_id` = ? AND e.`journal_status` IN ('posted','reversed') AND j.`status` = 'POSTED'",
      goalId
    );
    return round2(Number(rows[0]?.amt || 0));
  }

  /**
   * What the GL should hold for a goal: the positive part of the progress Performance originated, less anything
   * Accounting has voided (a voided posting is Accounting's decision and is not silently posted again).
   */
  static async targetForGoal(goalId: string): Promise<number> {
    const marks = PerformanceGlPostingService.POSTABLE_SOURCES.map(() => "?").join(",");
    const rows = await prisma.$queryRawUnsafe<Array<{ total: any; voided: any }>>(
      `SELECT COALESCE(SUM(CASE WHEN \`source\` IN (${marks}) THEN \`amount\` ELSE 0 END), 0) AS total, COALESCE(SUM(CASE WHEN \`journal_status\` = 'voided' THEN \`journal_amount\` ELSE 0 END), 0) AS voided FROM \`performance_goal_progress_events\` WHERE \`goal_id\` = ?`,
      ...PerformanceGlPostingService.POSTABLE_SOURCES, goalId
    );
    return round2(Math.max(0, Number(rows[0]?.total || 0) - Number(rows[0]?.voided || 0)));
  }

  /**
   * Brings the GL up to date for the goal behind one progress event: posts (or reverses) the difference between what the
   * GL should hold and what it holds, and records the outcome on the event. One goal at a time (a lock), so two check-ins
   * together cannot both post the same difference. Idempotent: a posted event is left alone, and the journal reference is
   * fixed per event. Never throws for a posting problem — it records it.
   */
  static async postEvent(eventId: string, actorId?: string | null): Promise<{ status: string; note?: string | null; journalEntryId?: string | null }> {
    const ev = await prisma.performanceGoalProgressEvent.findUnique({ where: { id: eventId } });
    if (!ev) return { status: "missing" };
    const cur = await prisma.$queryRawUnsafe<Array<{ s: string | null }>>("SELECT `journal_status` AS s FROM `performance_goal_progress_events` WHERE `id` = ?", eventId);
    if ([STATUS.posted, STATUS.reversed, STATUS.voided].includes(String(cur[0]?.s || ""))) return { status: String(cur[0].s), journalEntryId: ev.journalEntryId };
    if (!PerformanceGlPostingService.POSTABLE_SOURCES.includes(String(ev.source))) {
      await setOutcome(eventId, STATUS.skipped, "Progress read from the general ledger is not posted back to it.");
      return { status: STATUS.skipped };
    }
    const goal = await prisma.performanceGoal.findUnique({ where: { id: ev.goalId }, include: { kpi: true } });
    if (!goal?.kpi) {
      await setOutcome(eventId, STATUS.skipped, "The goal has no KPI, so nothing posts to the general ledger.");
      return { status: STATUS.skipped };
    }
    const actor = actorId || ev.createdById || goal.createdById;
    return withGoalLock(goal.id, async () => {
    let delta = 0, held = 0, target = 0;
    try {
      [held, target] = await Promise.all([PerformanceGlPostingService.netPostedForGoal(goal.id), PerformanceGlPostingService.targetForGoal(goal.id)]);
      delta = round2(target - held);
      if (Math.abs(delta) < 0.005) {
        // nothing to move: either an earlier posting (e.g. a retry catching up) already covered it, or the goal's
        // total sits at or below zero, where the ledger holds nothing
        const status = Number(ev.amount) > 0 && target > 0 ? STATUS.posted : STATUS.skipped;
        const note = status === STATUS.posted ? "Already reflected in the general ledger by another posting." : "The goal's total is at or below zero, so the general ledger holds nothing for it.";
        await setOutcome(eventId, status, note, undefined, 0);
        return { status, note };
      }
      const res = await KpiAccountingIntegrationService.postPerformanceProgressJournal({ goalId: goal.id, eventId, amount: delta, recordedAt: ev.recordedAt, actorId: actor, detailed: true });
      if (!res || !res.journalEntryId) {
        const reason = (res && res.skipReason) || "The KPI does not post to the general ledger.";
        await setOutcome(eventId, STATUS.skipped, reason);
        return { status: STATUS.skipped, note: reason };
      }
      const status = delta < 0 ? STATUS.reversed : STATUS.posted;
      const note = Math.abs(delta - round2(Number(ev.amount))) >= 0.005 ? `Posted ${delta}: the general ledger moved from ${held} to ${target} for this goal.` : null;
      await setOutcome(eventId, status, note, res.journalEntryId, delta);
      await AuditService.log({ userId: actor, action: delta < 0 ? "GL_REVERSED" : "GL_POSTED", entityType: "PerformanceGoalProgressEvent", entityId: eventId, newValues: { goalId: goal.id, amount: delta, heldBefore: held, target, journalEntryId: res.journalEntryId, reference: performanceProgressJournalReference(goal.id, eventId) } });
      return { status, note, journalEntryId: res.journalEntryId };
    } catch (e: any) {
      const reason = String(e?.message || e).replace(/\s+/g, " ").slice(0, 400);
      const firstFailure = String(cur[0]?.s || "") !== STATUS.failed;
      await setOutcome(eventId, STATUS.failed, reason, null, null);
      await AuditService.log({ userId: actor, action: "GL_POST_FAILED", entityType: "PerformanceGoalProgressEvent", entityId: eventId, newValues: { goalId: goal.id, amount: delta, heldBefore: held, target, reason } });
      logger.warn("Performance GL posting failed", { eventId, goalId: goal.id, reason });
      if (firstFailure) await notifyFailure(goal, eventId, reason);
      return { status: STATUS.failed, note: reason };
    }
    });
  }

  /** Retries failed postings (oldest first). Same journal reference, so nothing posts twice. */
  static async retryFailed(opts: { limit?: number; goalId?: string; eventId?: string; actorId?: string | null } = {}) {
    const params: any[] = [];
    let where = "`journal_status` = 'failed'";
    if (opts.eventId) { where += " AND `id` = ?"; params.push(opts.eventId); }
    if (opts.goalId) { where += " AND `goal_id` = ?"; params.push(opts.goalId); }
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT \`id\` FROM \`performance_goal_progress_events\` WHERE ${where} ORDER BY \`recorded_at\` ASC LIMIT ${Math.max(1, Math.min(500, Number(opts.limit) || 100))}`, ...params);
    const out = { tried: rows.length, posted: 0, stillFailing: 0, skipped: 0 };
    for (const r of rows) {
      const res = await PerformanceGlPostingService.postEvent(r.id, opts.actorId || null);
      if (res.status === STATUS.posted || res.status === STATUS.reversed) out.posted++;
      else if (res.status === STATUS.failed) out.stillFailing++;
      else out.skipped++;
    }
    return out;
  }

  /**
   * Before a goal is deleted: everything it holds in the GL is reversed by one journal per goal (the progress events
   * cascade away with the goal, so the journals would otherwise be orphaned in the ledger).
   */
  static async reverseAllForGoal(goalId: string, actorId: string, reason: string) {
    const held = await PerformanceGlPostingService.netPostedForGoal(goalId);
    if (Math.abs(held) < 0.005) return { reversed: 0 };
    const goal = await prisma.performanceGoal.findUnique({ where: { id: goalId }, include: { kpi: true } });
    if (!goal?.kpi) return { reversed: 0 };
    const marks = PerformanceGlPostingService.POSTABLE_SOURCES.map(() => "?").join(",");
    const t = await prisma.$queryRawUnsafe<Array<{ total: any }>>(
      `SELECT COALESCE(SUM(\`amount\`), 0) AS total FROM \`performance_goal_progress_events\` WHERE \`goal_id\` = ? AND \`source\` IN (${marks})`,
      goalId, ...PerformanceGlPostingService.POSTABLE_SOURCES
    );
    // an event that brings the Performance-originated total to zero, so the posting reverses exactly what the GL holds
    const ev = await prisma.performanceGoalProgressEvent.create({ data: { goalId, amount: -Math.max(0, Number(t[0]?.total || 0)), recordedAt: new Date(), source: "manual", sourceRef: `gl_reversal:${reason}:${Date.now()}`, createdById: actorId } });
    const res = await PerformanceGlPostingService.postEvent(ev.id, actorId);
    if (res.status !== STATUS.reversed) throw new Error(`The goal's postings could not be reversed in Accounting (${res.note || res.status}), so it was not deleted. Retry from Integrations first.`);
    return { reversed: held, journalEntryId: res.journalEntryId };
  }

  /** Accounting voided one of our journals: record it on the event, tell the goal owner, keep the progress. */
  static async onJournalVoided(journalEntryId: string, actorId: string | null) {
    const events = await prisma.performanceGoalProgressEvent.findMany({ where: { journalEntryId }, include: { goal: { select: { id: true, title: true, assignedToId: true, createdById: true } } } });
    for (const ev of events) {
      await setOutcome(ev.id, STATUS.voided, "The journal was voided in Accounting. The progress is kept; post it again or correct it from Performance.");
      await AuditService.log({ userId: actorId || ev.createdById, action: "GL_VOIDED_IN_ACCOUNTING", entityType: "PerformanceGoalProgressEvent", entityId: ev.id, newValues: { goalId: ev.goalId, journalEntryId } });
      const to = [ev.goal?.assignedToId, ev.goal?.createdById].filter(Boolean);
      if (to.length) {
        await dispatchProcurementNotification({ userIds: [...new Set(to)], title: `Accounting voided a posting for ${ev.goal.title}`, message: `The general-ledger journal for a progress update on ${ev.goal.title} was voided in Accounting. The progress still counts in Performance.`, type: "PERFORMANCE_INTEGRATION_FAILURE", relatedEntity: "PerformanceGoalProgressEvent", relatedEntityId: ev.id, data: { path: "/performance/integrations" } }).catch(() => undefined);
      }
    }
    return events.length;
  }

  /** Posting outcomes for the Integrations page: counts and the events that need attention. */
  static async overview() {
    const counts = await prisma.$queryRawUnsafe<Array<{ s: string; n: any; amt: any }>>(
      "SELECT COALESCE(`journal_status`, 'none') AS s, COUNT(*) AS n, COALESCE(SUM(`amount`),0) AS amt FROM `performance_goal_progress_events` GROUP BY COALESCE(`journal_status`, 'none')"
    );
    const attention = await prisma.$queryRawUnsafe<Array<any>>(
      "SELECT e.`id`, e.`goal_id` AS goalId, e.`amount`, e.`recorded_at` AS recordedAt, e.`journal_status` AS status, e.`journal_note` AS note, e.`journal_attempts` AS attempts, e.`journal_attempted_at` AS attemptedAt, g.`title` AS goalTitle " +
        "FROM `performance_goal_progress_events` e JOIN `performance_goals` g ON g.`id` = e.`goal_id` WHERE e.`journal_status` IN ('failed','voided') ORDER BY e.`recorded_at` DESC LIMIT 200"
    );
    return {
      counts: Object.fromEntries(counts.map((c) => [c.s, { events: Number(c.n), amount: round2(Number(c.amt)) }])),
      attention: attention.map((a) => ({ ...a, amount: Number(a.amount), attempts: Number(a.attempts) }))
    };
  }

  /**
   * Tie-out per goal: Performance's net posted progress vs the net movement its journals made on the KPI's account
   * (credits minus debits for a Credit-side KPI, and the reverse for a Debit-side KPI), POSTED journals only.
   */
  static async reconcile(goalId?: string) {
    const goals = await prisma.performanceGoal.findMany({ where: { ...(goalId ? { id: goalId } : {}), kpi: { accountNumber: { not: null } } }, include: { kpi: true } });
    const out = [];
    for (const g of goals) {
      // what Performance says the GL should hold for the goal (so a failed or outstanding posting shows as a difference)
      const perf = await PerformanceGlPostingService.targetForGoal(g.id);
      const side = g.kpi.journalEntryType === "Debit" ? "Debit" : "Credit";
      const rows = await prisma.$queryRawUnsafe<Array<{ dr: any; cr: any; n: any }>>(
        "SELECT COALESCE(SUM(l.`debitAmount`),0) AS dr, COALESCE(SUM(l.`creditAmount`),0) AS cr, COUNT(DISTINCT j.`id`) AS n FROM `journal_entries` j JOIN `journal_entry_lines` l ON l.`journalEntryId` = j.`id` JOIN `chart_of_accounts` a ON a.`id` = l.`chartOfAccountId` " +
          // Accounting's own statements count POSTED journals and leave out `VR-` void reversals (a void is the original
          // marked VOID plus an audit-only reversal), so the tie-out does the same
          "WHERE j.`status` = 'POSTED' AND a.`accountNo` = ? AND (j.`referenceNumber` LIKE ? OR j.`referenceNumber` = ?)",
        g.kpi.accountNumber, `PERF-GOAL-${g.id}-%`, `KPI-GOAL-${g.id}`
      );
      const dr = Number(rows[0]?.dr || 0), cr = Number(rows[0]?.cr || 0);
      const gl = round2(side === "Credit" ? cr - dr : dr - cr);
      out.push({ goalId: g.id, goalTitle: g.title, kpi: `${g.kpi.code || ""} ${g.kpi.name}`.trim(), account: g.kpi.accountNumber, side, performance: perf, ledger: gl, journals: Number(rows[0]?.n || 0), difference: round2(perf - gl), ties: Math.abs(perf - gl) < 0.005 });
    }
    return out;
  }
}
