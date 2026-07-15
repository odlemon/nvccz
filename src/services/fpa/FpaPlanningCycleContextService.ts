import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type PlanningCycleContext =
  | {
      kind: "budget";
      cycle: {
        id: string;
        versionId: string;
        scenarioId: string | null;
        actualsCutoffDate: Date | null;
      };
      versionId: string;
      scenarioId: string | null;
      actualsCutoffDate: Date | null;
    }
  | {
      kind: "model";
      cycle: {
        id: string;
        sourceModelVersionId: string;
        baseScenarioId: string | null;
        actualsCutoffPeriod: Date | null;
      };
      versionId: string;
      scenarioId: string | null;
      actualsCutoffDate: Date | null;
    };

/** Resolve a cycle id to either a budget execution cycle or a model planning cycle. */
export class FpaPlanningCycleContextService {
  static isPublishedVersionStatus(status?: string | null): boolean {
    return String(status || "").toUpperCase() === "LOCKED";
  }

  static async resolve(cycleId: string): Promise<PlanningCycleContext | null> {
    const id = String(cycleId);

    const budget = await prisma.planningBudgetCycle.findUnique({ where: { id } });
    if (budget) {
      return {
        kind: "budget",
        cycle: budget,
        versionId: budget.versionId,
        scenarioId: budget.scenarioId,
        actualsCutoffDate: budget.actualsCutoffDate,
      };
    }

    const modelCycle = await prisma.modelPlanningCycle.findUnique({ where: { id } });
    if (modelCycle) {
      return {
        kind: "model",
        cycle: modelCycle,
        versionId: modelCycle.sourceModelVersionId,
        scenarioId: modelCycle.baseScenarioId,
        actualsCutoffDate: modelCycle.actualsCutoffPeriod,
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
