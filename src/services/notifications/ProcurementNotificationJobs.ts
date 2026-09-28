// @ts-nocheck
import { prisma } from "../../utils/database";
import { notify, getRules, usersWithPermission } from "./ProcurementNotifier";
import { PROCUREMENT_PERMISSIONS as P } from "../../config/procurementPermissions";

/**
 * SRD §34: the time-driven notifications (deadline approaching, evaluation overdue, an approval waiting too long) and the vendor
 * document cycle. Each rule's thresholds come from the notification rules; a switched-off rule does nothing. A notification is
 * sent once per record and event (the log records what was sent), so running the cycle every hour never repeats one.
 */
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const ymd = (d: Date) => new Date(d).toISOString().slice(0, 10);

/** Which of these records already have this event sent (one query for all of them, not one each). */
async function alreadySentSet(eventKey: string, entityIds: string[], sinceMs: number): Promise<Set<string>> {
  if (!entityIds.length) return new Set();
  const marks = entityIds.map(() => "?").join(",");
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT entity_id FROM procurement_notification_log WHERE event_key = ? AND status IN ('SENT','BLOCKED') AND created_at >= ? AND entity_id IN (${marks})`,
    eventKey, new Date(Date.now() - sinceMs), ...entityIds,
  );
  return new Set(rows.map((r) => String(r.entity_id)));
}

const person = (u: any) => (u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email : "");

export async function runDeadlineJob() {
  const rules = await getRules();
  const rule = rules.SOURCING_DEADLINE;
  if (!rule.enabled) return { sent: 0, skipped: "rule off" };
  const days = rule.params?.daysBefore ?? 2;
  const now = new Date();
  const rfqs = await prisma.procurementRfq.findMany({
    where: { status: { in: ["PUBLISHED", "OPEN"] }, closingAt: { gt: now, lte: new Date(now.getTime() + days * DAY) } },
    select: { id: true, rfqNumber: true, title: true, closingAt: true, createdById: true, _count: { select: { quotations: true } } },
  });
  let sent = 0;
  const done = await alreadySentSet("SOURCING_DEADLINE", rfqs.map((r) => r.id), 400 * DAY);
  for (const r of rfqs) {
    if (done.has(r.id)) continue;
    await notify("SOURCING_DEADLINE", { userIds: [r.createdById], entityType: "ProcurementRfq", entityId: r.id, vars: { ref: r.rfqNumber, title: r.title, closing: ymd(r.closingAt!), bids: r._count.quotations } });
    sent += 1;
  }
  return { sent };
}

export async function runEvaluationOverdueJob() {
  const rules = await getRules();
  const rule = rules.EVALUATION_OVERDUE;
  if (!rule.enabled) return { sent: 0, skipped: "rule off" };
  const days = rule.params?.daysAfterClose ?? 5;
  const cutoff = new Date(Date.now() - days * DAY);
  const rfqs = await prisma.procurementRfq.findMany({
    where: { status: { in: ["CLOSED", "UNDER_EVALUATION"] }, closingAt: { lte: cutoff } },
    select: { id: true, rfqNumber: true, title: true, closingAt: true, createdById: true },
  });
  let sent = 0;
  const pending = rfqs.length ? await prisma.rfqEvaluationMember.findMany({ where: { rfqId: { in: rfqs.map((r) => r.id) }, recused: false, scorecardSubmittedAt: null }, select: { rfqId: true, userId: true } }) : [];
  const byRfq = new Map<string, string[]>();
  for (const m of pending) byRfq.set(m.rfqId, [...(byRfq.get(m.rfqId) ?? []), m.userId]);
  const done = await alreadySentSet("EVALUATION_OVERDUE", [...byRfq.keys()], 1 * DAY);
  for (const r of rfqs) {
    const members = byRfq.get(r.id);
    if (!members?.length || done.has(r.id)) continue;
    await notify("EVALUATION_OVERDUE", {
      userIds: [...members, r.createdById], entityType: "ProcurementRfq", entityId: r.id,
      vars: { ref: r.rfqNumber, title: r.title, days, closed: ymd(r.closingAt!), pending: members.length },
    });
    sent += 1;
  }
  return { sent };
}

export async function runEscalationJob() {
  const rules = await getRules();
  const rule = rules.TASK_ESCALATION;
  if (!rule.enabled) return { sent: 0, skipped: "rule off" };
  const hours = rule.params?.afterHours ?? 48;
  const cutoff = new Date(Date.now() - hours * HOUR);
  const waiting = await prisma.approval.findMany({
    where: { status: "PENDING", createdAt: { lte: cutoff }, request: { status: "PENDING" } },
    include: { approver: { select: { firstName: true, lastName: true, email: true } }, request: { select: { id: true, entityId: true, stageType: true } } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const managers = await usersWithPermission(P.rfqAward, P.ordersSend);
  const done = await alreadySentSet("TASK_ESCALATION", waiting.map((a) => a.id), 400 * DAY);
  const reqIds = [...new Set(waiting.filter((a) => a.request.stageType === "PURCHASE_REQUISITION").map((a) => a.request.entityId))];
  const reqs = reqIds.length ? await prisma.purchaseRequisition.findMany({ where: { id: { in: reqIds } }, select: { id: true, requisitionNumber: true } }) : [];
  const refOf = new Map(reqs.map((r) => [r.id, r.requisitionNumber]));
  let sent = 0;
  for (const a of waiting) {
    if (done.has(a.id)) continue;
    await notify("TASK_ESCALATION", {
      userIds: managers.filter((id) => id !== a.approverId), entityType: "Approval", entityId: a.id,
      vars: { ref: refOf.get(a.request.entityId) ?? a.request.entityId, approver: person(a.approver), hours: Math.floor((Date.now() - new Date(a.createdAt).getTime()) / HOUR) },
    });
    sent += 1;
  }
  return { sent };
}

export async function runAllNotificationJobs(opts: { vendorDocuments?: boolean } = {}) {
  const out: any = {};
  try { out.closedRfqs = await (await import("../status/ProcurementLifecycleService")).ProcurementLifecycleService.closeExpiredRfqs(); } catch (e: any) { out.closedRfqs = { error: String(e?.message || e) }; }
  for (const [k, fn] of Object.entries({ deadline: runDeadlineJob, evaluationOverdue: runEvaluationOverdueJob, escalation: runEscalationJob })) {
    try { out[k] = await (fn as any)(); } catch (e: any) { out[k] = { error: String(e?.message || e) }; }
  }
  if (opts.vendorDocuments) try {
    const { VendorComplianceJobService } = await import("../VendorComplianceJobService");
    out.vendorDocuments = await VendorComplianceJobService.runCycle();
  } catch (e: any) { out.vendorDocuments = { error: String(e?.message || e) }; }
  return out;
}

export function startNotificationScheduler() {
  if (String(process.env.PROCUREMENT_NOTIFICATION_JOB || "").toLowerCase() === "off") return;
  const run = () => runAllNotificationJobs().then((s) => console.log("[procurement-notifications]", JSON.stringify(s))).catch((e) => console.error("[procurement-notifications] failed:", e?.message || e));
  setTimeout(run, 150_000).unref?.();
  setInterval(run, 1 * HOUR).unref?.();
}
