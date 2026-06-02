// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import {
  computeAchievementPercent,
  computeParentRollupFromChildren,
  deriveParentStageFromRollup,
  formatProgressPercent
} from "./performanceGoalRollupUtils";
import { resolveGoalTargetUnitForApi } from "./performanceGoalTargetUnit";

export class RollupCalculationService {
  /** Reverse-aware 0–100 progress for breakdown rows (never uncapped straight ratios). */
  private static goalProgressPercent(goal: {
    currentValue?: unknown;
    targetValue?: unknown;
    targetOperator?: string | null;
    isReverseKpi?: boolean | null;
    progressPercentage?: unknown;
    kpi?: { isReverseKpi?: boolean | null } | null;
  }): string {
    const pct = computeAchievementPercent({
      currentValue: goal.currentValue,
      targetValue: goal.targetValue,
      targetOperator: goal.targetOperator,
      isReverseKpi: goal.isReverseKpi ?? goal.kpi?.isReverseKpi,
      progressPercentage: goal.progressPercentage
    });
    return formatProgressPercent(pct);
  }

  /**
   * Calculate roll-up progress for a goal and all its children
   */
  static async calculateGoalRollup(goalId: string) {
    try {
      const goal = await prisma.performanceGoal.findUnique({
        where: { id: goalId },
        include: {
          subGoals: {
            include: {
              subGoals: true // Include individual goals
            }
          },
          kpi: {
            select: {
              id: true,
              name: true,
              code: true,
              unitCategory: true,
              unit: true,
              hasUnit: true,
              isReverseKpi: true,
              unitSymbol: true,
              unitPosition: true,
              scorecardPillar: true,
            }
          }
        }
      });

      if (!goal) {
        throw new Error("Goal not found");
      }

      // Calculate roll-up data
      const rollupData = await this.calculateRollupData(goal);

      // Prefer stored reverse-aware progress; recompute when missing
      const progressPercentage =
        goal.progressPercentage != null && String(goal.progressPercentage).trim() !== ""
          ? formatProgressPercent(parseFloat(String(goal.progressPercentage)))
          : RollupCalculationService.goalProgressPercent(goal);

      return {
        goal: {
          id: goal.id,
          title: goal.title,
          type: goal.type,
          scorecardPillar: goal.scorecardPillar,
          targetUnit: resolveGoalTargetUnitForApi(goal),
          targetValue: goal.targetValue ? goal.targetValue.toString() : "0",
          currentValue: goal.currentValue ? goal.currentValue.toString() : "0",
          progressPercentage: progressPercentage,
          stage: goal.stage,
          kpi: goal.kpi
        },
        rollup: rollupData
      };
    } catch (error) {
      console.error("Error calculating goal rollup:", error);
      throw error;
    }
  }

  /**
   * Calculate roll-up data for a goal
   */
  private static async calculateRollupData(goal: any) {
    const rollup = {
      totalSubGoals: 0,
      completedSubGoals: 0,
      inProgressSubGoals: 0,
      notStartedSubGoals: 0,
      totalTargetValue: 0,
      totalCurrentValue: 0,
      overallProgressPercentage: "0",
      departmentBreakdown: [],
      individualBreakdown: []
    };

    // If goal has no sub-goals, use the goal's own values
    if (!goal.subGoals || goal.subGoals.length === 0) {
      const goalTarget = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
      const goalCurrent = goal.currentValue ? parseFloat(goal.currentValue.toString()) : 0;

      rollup.totalTargetValue = goalTarget;
      rollup.totalCurrentValue = goalCurrent;
      rollup.overallProgressPercentage = RollupCalculationService.goalProgressPercent(goal);

      return rollup;
    }

    // Process department goals
    for (const deptGoal of goal.subGoals) {
      const deptData = await this.calculateDepartmentRollup(deptGoal);
      
      rollup.totalSubGoals += deptData.totalSubGoals + 1; // +1 for the department goal itself
      rollup.completedSubGoals += deptData.completedSubGoals + (deptGoal.stage === 'completed' ? 1 : 0);
      rollup.inProgressSubGoals += deptData.inProgressSubGoals + (deptGoal.stage === 'in_progress' ? 1 : 0);
      rollup.notStartedSubGoals += deptData.notStartedSubGoals + (deptGoal.stage === 'planning' ? 1 : 0);
      
      const deptTarget = deptGoal.targetValue ? parseFloat(deptGoal.targetValue.toString()) : 0;
      const deptCurrent = deptGoal.currentValue ? parseFloat(deptGoal.currentValue.toString()) : 0;
      
      rollup.totalTargetValue += deptTarget;
      rollup.totalCurrentValue += deptCurrent;

      rollup.departmentBreakdown.push({
        id: deptGoal.id,
        title: deptGoal.title,
        department: deptGoal.departmentName,
        targetUnit: resolveGoalTargetUnitForApi(deptGoal, goal.kpi),
        targetValue: deptGoal.targetValue ? deptGoal.targetValue.toString() : "0",
        currentValue: deptGoal.currentValue ? deptGoal.currentValue.toString() : "0",
        progressPercentage: RollupCalculationService.goalProgressPercent({
          ...deptGoal,
          kpi: goal.kpi
        }),
        stage: deptGoal.stage,
        individualGoals: deptData.individualBreakdown
      });

      rollup.individualBreakdown.push(...deptData.individualBreakdown);
    }

    // Weighted roll-up for parent goals (respects reverse KPI on each child)
    const subInputs = goal.subGoals.map((s: any) => ({
      id: s.id,
      activities: s.activities,
      scorecardWeight: s.scorecardWeight,
      currentValue: s.currentValue,
      targetValue: s.targetValue,
      targetOperator: s.targetOperator,
      isReverseKpi: s.isReverseKpi ?? goal.isReverseKpi ?? goal.kpi?.isReverseKpi,
      progressPercentage: s.progressPercentage,
      stage: s.stage,
      status: s.status
    }));
    const parentRollup = computeParentRollupFromChildren(subInputs, goal.targetValue);
    rollup.overallProgressPercentage = formatProgressPercent(parentRollup.progressPercentage);

    return rollup;
  }

  /**
   * Calculate roll-up data for a department goal
   */
  private static async calculateDepartmentRollup(deptGoal: any) {
    const deptData = {
      totalSubGoals: 0,
      completedSubGoals: 0,
      inProgressSubGoals: 0,
      notStartedSubGoals: 0,
      individualBreakdown: []
    };

    // Process individual goals
    for (const indGoal of deptGoal.subGoals || []) {
      deptData.totalSubGoals += 1;
      
      if (indGoal.stage === 'completed') {
        deptData.completedSubGoals += 1;
      } else if (indGoal.stage === 'in_progress') {
        deptData.inProgressSubGoals += 1;
      } else {
        deptData.notStartedSubGoals += 1;
      }

      const indTarget = indGoal.targetValue ? parseFloat(indGoal.targetValue.toString()) : 0;
      const indCurrent = indGoal.currentValue ? parseFloat(indGoal.currentValue.toString()) : 0;
      
      deptData.individualBreakdown.push({
        id: indGoal.id,
        title: indGoal.title,
        assignedTo: indGoal.assignedToId,
        targetUnit: resolveGoalTargetUnitForApi(indGoal, goal.kpi),
        targetValue: indGoal.targetValue ? indGoal.targetValue.toString() : "0",
        currentValue: indGoal.currentValue ? indGoal.currentValue.toString() : "0",
        progressPercentage: RollupCalculationService.goalProgressPercent({
          ...indGoal,
          kpi: deptGoal.kpi
        }),
        stage: indGoal.stage
      });
    }

    return deptData;
  }

  /**
   * Recalculate all roll-up data for a goal hierarchy
   */
  static async recalculateAllRollups(goalId: string) {
    try {
      // Get the root goal
      let rootGoal = await prisma.performanceGoal.findUnique({
        where: { id: goalId }
      });

      // Find the actual root goal (company level)
      while (rootGoal?.parentGoalId) {
        rootGoal = await prisma.performanceGoal.findUnique({
          where: { id: rootGoal.parentGoalId }
        });
      }

      if (!rootGoal) {
        throw new Error("Root goal not found");
      }

      // Recalculate from bottom up
      await this.recalculateFromBottomUp(rootGoal.id);

      return await this.calculateGoalRollup(rootGoal.id);
    } catch (error) {
      console.error("Error recalculating rollups:", error);
      throw error;
    }
  }

  /**
   * Same DB updates as {@link recalculateAllRollups} but skips the heavy
   * {@link calculateGoalRollup} summary query — use after scorecard persist when the
   * return value is unused.
   */
  static async syncEntireGoalHierarchyFromRoot(rootGoalId: string): Promise<void> {
    const root = await prisma.performanceGoal.findUnique({
      where: { id: rootGoalId },
      select: { id: true, parentGoalId: true }
    });
    if (!root) {
      throw new Error("Root goal not found");
    }
    if (root.parentGoalId) {
      throw new Error("syncEntireGoalHierarchyFromRoot expects a top-level goal id");
    }
    await this.recalculateFromBottomUp(root.id);
  }

  /**
   * Recalculate roll-up data from bottom up
   */
  private static async recalculateFromBottomUp(goalId: string) {
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: goalId },
      include: {
        subGoals: {
          include: {
            subGoals: true
          }
        }
      }
    });

    if (!goal) return;

    // First, recalculate all child goals
    for (const subGoal of goal.subGoals || []) {
      await this.recalculateFromBottomUp(subGoal.id);
    }

    // Then recalculate this goal's progress
    if (goal.type === 'company' || goal.type === 'department') {
      await this.updateParentGoalProgress(goal);
    }
  }

  /**
   * Update parent goal progress based on children
   */
  private static async updateParentGoalProgress(goal: any) {
    // If goal has no sub-goals, don't overwrite its values - preserve them
    if (!goal.subGoals || goal.subGoals.length === 0) {
      return;
    }

    const subInputs = goal.subGoals.map((s: any) => ({
      id: s.id,
      activities: s.activities,
      scorecardWeight: s.scorecardWeight,
      currentValue: s.currentValue,
      targetValue: s.targetValue,
      targetOperator: s.targetOperator,
      isReverseKpi: s.isReverseKpi,
      progressPercentage: s.progressPercentage,
      stage: s.stage,
      status: s.status
    }));

    const rollup = computeParentRollupFromChildren(subInputs, goal.targetValue);
    const { stage: newStage, status: newStatus } = deriveParentStageFromRollup({
      allCompleted: rollup.allCompleted,
      anyInProgress: rollup.anyInProgress,
      weightedProgress: rollup.progressPercentage,
      suggestedCurrentValue: rollup.suggestedCurrentValue,
      subGoalCount: goal.subGoals.length,
      previousStage: goal.stage || "planning"
    });

    await prisma.performanceGoal.update({
      where: { id: goal.id },
      data: {
        currentValue: rollup.suggestedCurrentValue,
        progressPercentage: rollup.progressPercentage,
        stage: newStage,
        status: newStatus,
        updatedAt: new Date()
      }
    });
  }
}
