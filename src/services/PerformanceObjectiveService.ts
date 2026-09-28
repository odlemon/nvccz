// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { PerformanceGoalService } from "./PerformanceGoalService";

class ObjectiveError extends Error {
  statusCode: number;
  constructor(m: string, s = 400) {
    super(m);
    this.statusCode = s;
  }
}
export { ObjectiveError };
export const CONFIDENCE = ["high", "medium", "low"];

export class PerformanceObjectiveService {
  /** Record a check-in: an amount added to progress, a confidence call and a note. */
  static async checkIn(goalId: string, input: any, actor: any) {
    const goal = await prisma.performanceGoal.findUnique({ where: { id: goalId }, select: { id: true, title: true, status: true } });
    if (!goal) throw new ObjectiveError("Objective not found.", 404);
    if (["completed", "cancelled"].includes(String(goal.status).toLowerCase())) throw new ObjectiveError("A completed or cancelled objective takes no check-in.");
    const value = Number(input.value);
    if (input.value === undefined || input.value === "" || !Number.isFinite(value)) throw new ObjectiveError("Enter the amount achieved since the last check-in.");
    if (value === 0 && !String(input.note || "").trim()) throw new ObjectiveError("A check-in with no movement needs a note.");
    const confidence = input.confidence ? String(input.confidence) : null;
    if (confidence && !CONFIDENCE.includes(confidence)) throw new ObjectiveError("Confidence must be high, medium or low.");
    const note = String(input.note || "").trim().slice(0, 500) || null;
    const before = new Date();
    if (value !== 0) await PerformanceGoalService.updateGoalProgress(goalId, value, actor.id);
    const ev = await prisma.performanceGoalProgressEvent.findFirst({ where: { goalId, createdById: actor.id, createdAt: { gte: new Date(before.getTime() - 2000) } }, orderBy: { createdAt: "desc" } });
    if (ev && note) await prisma.$executeRawUnsafe("UPDATE `performance_goal_progress_events` SET `note` = ? WHERE `id` = ?", note, ev.id);
    await prisma.performanceGoal.update({ where: { id: goalId }, data: { lastCheckDate: new Date() } });
    if (confidence) await prisma.$executeRawUnsafe("UPDATE `performance_goals` SET `confidence` = ? WHERE `id` = ?", confidence, goalId);
    if (!ev && note) {
      await prisma.performanceGoalProgressEvent.create({ data: { goalId, amount: 0, recordedAt: new Date(), source: "manual", sourceRef: `checkin:${Date.now()}`, createdById: actor.id } }).then((e) => prisma.$executeRawUnsafe("UPDATE `performance_goal_progress_events` SET `note` = ? WHERE `id` = ?", note, e.id));
    }
    await AuditService.log({ userId: actor.id, action: "CHECKIN", entityType: "PerformanceGoal", entityId: goalId, newValues: { value, confidence, note } });
    return PerformanceObjectiveService.history(goalId);
  }

  static async history(goalId: string) {
    const rows = await prisma.$queryRawUnsafe<any[]>("SELECT e.`id`, e.`amount`, e.`recorded_at` AS recordedAt, e.`source`, e.`note`, e.`created_by_id` AS createdById, e.`journal_status` AS journalStatus, e.`journal_note` AS journalNote, j.`referenceNumber` AS journalReference FROM `performance_goal_progress_events` e LEFT JOIN `journal_entries` j ON j.`id` = e.`journal_entry_id` WHERE e.`goal_id` = ? ORDER BY e.`recorded_at` DESC, e.`created_at` DESC LIMIT 50", goalId);
    const ids = [...new Set(rows.map((r) => r.createdById).filter(Boolean))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, email: true } }) : [];
    const nm = new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email]));
    return rows.map((r) => ({ ...r, amount: Number(r.amount), actorName: nm.get(r.createdById) || null }));
  }
}
