// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";

export class RollupCalculationService {
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
              type: true,
              unitSymbol: true,
              unitPosition: true
            }
          }
        }
      });

      if (!goal) {
        throw new Error("Goal not found");
      }

      // Calculate roll-up data
      const rollupData = await this.calculateRollupData(goal);

      // Calculate progress percentage from stored values or recalculate
      const currentValueNum = goal.currentValue ? parseFloat(goal.currentValue.toString()) : 0;
      const targetValueNum = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
      const progressPercentage = goal.progressPercentage 
        ? parseFloat(goal.progressPercentage.toString()).toFixed(2)
        : (targetValueNum > 0 ? ((currentValueNum / targetValueNum) * 100).toFixed(2) : "0");

      return {
        goal: {
          id: goal.id,
          title: goal.title,
          type: goal.type,
          category: goal.category,
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
      rollup.overallProgressPercentage = goalTarget > 0 
        ? Math.min(((goalCurrent / goalTarget) * 100), 100).toFixed(2) 
        : "0";
      
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
        targetValue: deptGoal.targetValue ? deptGoal.targetValue.toString() : "0",
        currentValue: deptGoal.currentValue ? deptGoal.currentValue.toString() : "0",
        progressPercentage: deptTarget > 0 
          ? ((deptCurrent / deptTarget) * 100).toFixed(2) 
          : "0",
        stage: deptGoal.stage,
        individualGoals: deptData.individualBreakdown
      });

      rollup.individualBreakdown.push(...deptData.individualBreakdown);
    }

    // Calculate overall progress (capped at 100%)
    rollup.overallProgressPercentage = rollup.totalTargetValue > 0 ? 
      Math.min(((rollup.totalCurrentValue / rollup.totalTargetValue) * 100), 100).toFixed(2) : "0";

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
        targetValue: indGoal.targetValue ? indGoal.targetValue.toString() : "0",
        currentValue: indGoal.currentValue ? indGoal.currentValue.toString() : "0",
        progressPercentage: indTarget > 0 
          ? ((indCurrent / indTarget) * 100).toFixed(2) 
          : "0",
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

    let totalTargetValue = 0;
    let totalCurrentValue = 0;
    let allCompleted = true;
    let anyInProgress = false;

    for (const subGoal of goal.subGoals) {
      totalTargetValue += parseFloat(subGoal.targetValue?.toString() || '0');
      totalCurrentValue += parseFloat(subGoal.currentValue?.toString() || '0');
      
      if (subGoal.stage !== 'completed') {
        allCompleted = false;
      }
      
      if (subGoal.stage === 'in_progress') {
        anyInProgress = true;
      }
    }

    // Determine new stage
    let newStage = goal.stage;
    if (allCompleted && goal.subGoals.length > 0) {
      newStage = 'completed';
    } else if (anyInProgress || totalCurrentValue > 0) {
      newStage = 'in_progress';
    }

    // Calculate progress percentage
    const goalTarget = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
    const progressPercentage = goalTarget > 0 
      ? Math.min((totalCurrentValue / goalTarget) * 100, 100) 
      : 0;

    // Update the goal
    await prisma.performanceGoal.update({
      where: { id: goal.id },
      data: {
        currentValue: totalCurrentValue,
        progressPercentage: progressPercentage,
        stage: newStage,
        status: allCompleted ? 'completed' : 'active',
        updatedAt: new Date()
      }
    });
  }
}
