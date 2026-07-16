import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type PlanningCycleContext =
  | {
      kind: "budget";
      cycle: Record<string, unknown>;
      versionId: string;
      scenarioId: string | null;
      actualsCutoffDate: Date | null;
      forecastStartPeriod: Date | null;
    }
  | {
      kind: "model";
      cycle: Record<string, unknown>;
      versionId: string;
      scenarioId: string | null;
      actualsCutoffDate: Date | null;
      forecastStartPeriod: Date | null;
    };

/** First day of UTC month for a date. */
export function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Parse date → UTC month start, or null. */
export function toPeriodStartDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return monthStart(d);
}

/** ISO date `YYYY-MM-01` for period-start dates. */
export function periodStartIso(value: Date | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return monthStart(d).toISOString().slice(0, 10);
}

export function nextPeriodStart(cutoff: Date): Date {
  return new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 1));
}

export function periodMonthKey(d: Date): string {
  return monthStart(d).toISOString().slice(0, 7);
}

export function periodMonthLabel(d: Date): string {
  return monthStart(d).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Resolve cutoff + forecast start; auto-derive forecast = cutoff + 1 month when omitted. */
export function resolveCutoffPair(input: {
  actualsCutoffPeriod?: unknown;
  forecastStartPeriod?: unknown;
}): { actualsCutoffPeriod: Date | null; forecastStartPeriod: Date | null } {
  const cutoff = toPeriodStartDate(input.actualsCutoffPeriod);
  let forecast = toPeriodStartDate(input.forecastStartPeriod);
  if (!forecast && cutoff) forecast = nextPeriodStart(cutoff);
  return { actualsCutoffPeriod: cutoff, forecastStartPeriod: forecast };
}

/** Resolve a cycle id to either a budget execution cycle or a model planning cycle. */
export class FpaPlanningCycleContextService {
  static isPublishedVersionStatus(status?: string | null): boolean {
    return String(status || "").toUpperCase() === "LOCKED";
  }

  static async resolve(cycleId: string): Promise<PlanningCycleContext | null> {
    const id = String(cycleId);

    const budget = await prisma.planningBudgetCycle.findUnique({ where: { id } });
    if (budget) {
      const cutoff = toPeriodStartDate(budget.actualsCutoffDate);
      let forecast = toPeriodStartDate(budget.forecastStartPeriod);
      if (!forecast && cutoff) forecast = nextPeriodStart(cutoff);
      return {
        kind: "budget",
        cycle: budget,
        versionId: budget.versionId,
        scenarioId: budget.scenarioId,
        actualsCutoffDate: cutoff,
        forecastStartPeriod: forecast,
      };
    }

    const modelCycle = await prisma.modelPlanningCycle.findUnique({ where: { id } });
    if (modelCycle) {
      const cutoff = toPeriodStartDate(modelCycle.actualsCutoffPeriod);
      let forecast = toPeriodStartDate(modelCycle.forecastStartPeriod);
      if (!forecast && cutoff) forecast = nextPeriodStart(cutoff);
      return {
        kind: "model",
        cycle: modelCycle,
        versionId: modelCycle.sourceModelVersionId,
        scenarioId: modelCycle.baseScenarioId,
        actualsCutoffDate: cutoff,
        forecastStartPeriod: forecast,
      };
    }

    return null;
  }

  static async isModelPlanningCycle(cycleId: string): Promise<boolean> {
    const row = await prisma.modelPlanningCycle.findUnique({
      where: { id: String(cycleId) },
      select: { id: true },
    });
    return Boolean(row);
  }
}
