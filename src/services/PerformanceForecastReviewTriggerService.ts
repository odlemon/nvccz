// @ts-nocheck
/**
 * Forecast Review Trigger queue (SRD-4 §22-25, direction 2). A human FP&A
 * reviewer records a decision here; this service never itself writes to
 * FP&A planning data (guardrail #2/#6/#12 — no automatic reforecast
 * approval). Closing a trigger with a resulting forecast version only
 * records which version the reviewer separately produced.
 */
import { prisma } from "../utils/database";
import { FpaError } from "./fpa/FpaError";

const OPEN_STATUSES = ["OPEN", "UNDER_REVIEW"];
const VALID_STATUSES = ["OPEN", "UNDER_REVIEW", "NO_FORECAST_CHANGE", "FORECAST_CHANGE_PROPOSED", "FORECAST_UPDATED", "CLOSED"];

export class PerformanceForecastReviewTriggerService {
  static async list(query: any = {}) {
    const where: any = {};
    if (query.status) where.status = String(query.status).toUpperCase();
    else if (query.openOnly === "true" || query.openOnly === true) where.status = { in: OPEN_STATUSES };
    if (query.kpiId) where.kpiId = String(query.kpiId);
    if (query.fpaReviewerId) where.fpaReviewerId = String(query.fpaReviewerId);

    const rows = await prisma.performanceForecastReviewTrigger.findMany({
      where,
      orderBy: { triggerDate: "desc" },
      take: Math.min(200, Number(query.limit) || 100),
    });
    const goalIds = [...new Set(rows.map((r) => r.performanceGoalId))];
    const kpiIds = [...new Set(rows.map((r) => r.kpiId))];
    const [goals, kpis] = await Promise.all([
      prisma.performanceGoal.findMany({ where: { id: { in: goalIds } }, select: { id: true, title: true, assignedToId: true } }),
      prisma.kPI.findMany({ where: { id: { in: kpiIds } }, select: { id: true, name: true } }),
    ]);
    const goalById = Object.fromEntries(goals.map((g) => [g.id, g]));
    const kpiById = Object.fromEntries(kpis.map((k) => [k.id, k]));
    return rows.map((r) => ({
      ...r,
      goalTitle: goalById[r.performanceGoalId]?.title || null,
      kpiName: kpiById[r.kpiId]?.name || null,
    }));
  }

  static async get(id: string) {
    const row = await prisma.performanceForecastReviewTrigger.findUnique({ where: { id } });
    if (!row) throw new FpaError(404, "NOT_FOUND", "Forecast review trigger not found");
    return row;
  }

  /** A reviewer claims the trigger (moves OPEN -> UNDER_REVIEW). */
  static async claim(id: string, reviewerId: string) {
    const row = await prisma.performanceForecastReviewTrigger.findUnique({ where: { id } });
    if (!row) throw new FpaError(404, "NOT_FOUND", "Forecast review trigger not found");
    if (row.status !== "OPEN") {
      throw new FpaError(409, "INVALID_STATUS", `Trigger is ${row.status}, not OPEN`);
    }
    return prisma.performanceForecastReviewTrigger.update({
      where: { id },
      data: { status: "UNDER_REVIEW", fpaReviewerId: reviewerId },
    });
  }

  /**
   * Record the reviewer's decision. `status` must be one of
   * NO_FORECAST_CHANGE | FORECAST_CHANGE_PROPOSED | FORECAST_UPDATED | CLOSED.
   * `resultingForecastVersionId`, if given, must be a real, existing
   * PlanningVersion — this only records the link, it never creates or
   * modifies the version itself.
   */
  static async decide(
    id: string,
    body: { status: string; reviewDecision?: string; resultingForecastVersionId?: string | null },
    reviewerId: string
  ) {
    const row = await prisma.performanceForecastReviewTrigger.findUnique({ where: { id } });
    if (!row) throw new FpaError(404, "NOT_FOUND", "Forecast review trigger not found");
    const status = String(body.status || "").toUpperCase();
    if (!VALID_STATUSES.includes(status)) {
      throw new FpaError(400, "VALIDATION", `status must be one of ${VALID_STATUSES.join(", ")}`);
    }
    if (status === "OPEN") {
      throw new FpaError(400, "VALIDATION", "Cannot set status back to OPEN via a decision");
    }
    if (body.resultingForecastVersionId) {
      const version = await prisma.planningVersion.findUnique({ where: { id: String(body.resultingForecastVersionId) } });
      if (!version) throw new FpaError(404, "NOT_FOUND", "Resulting forecast version not found");
    }
    return prisma.performanceForecastReviewTrigger.update({
      where: { id },
      data: {
        status,
        reviewStatus: status,
        reviewDecision: body.reviewDecision ? String(body.reviewDecision) : row.reviewDecision,
        resultingForecastVersionId: body.resultingForecastVersionId ? String(body.resultingForecastVersionId) : row.resultingForecastVersionId,
        fpaReviewerId: row.fpaReviewerId || reviewerId,
      },
    });
  }
}
