// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";
import { createJournalEntryWithAuditSequence } from "./AuditTrailSequenceService";
import { KPIService } from "./KPIService";
import {
  computeAchievementPercent,
  computeParentRollupFromChildren,
  deriveParentStageFromRollup,
  isTargetMet
} from "./performanceGoalRollupUtils";
import { resolveDefaultDepartmentGoalAssigneeId } from "./performanceGoalDefaultAssignee";

export class PerformanceWorkflowService {
  /**
   * Automatically assign organizational goals to departments
   */
  static async autoAssignGoals(organizationalGoalId: string): Promise<void> {
    try {
      console.log(`🔄 Auto-assigning organizational goal ${organizationalGoalId} to departments...`);

      const organizationalGoal = await prisma.performanceGoal.findUnique({
        where: { id: organizationalGoalId },
        include: {
          createdBy: true
        }
      });

      if (!organizationalGoal) {
        throw new Error("Organizational goal not found");
      }

      if (organizationalGoal.type !== "company") {
        throw new Error("Goal must be a company-level goal for auto-assignment");
      }

      if (String(organizationalGoal.status).toLowerCase() !== "active") {
        throw new Error("Company goal must be active before auto-assigning department goals.");
      }

      // Get all active departments
      const departments = await prisma.department.findMany({
        where: { isActive: true }
      });

      // Create department goals for each department
      for (const department of departments) {
        const departmentAssigneeId = await resolveDefaultDepartmentGoalAssigneeId(department.name);
        const departmentGoal = await prisma.performanceGoal.create({
          data: {
            title: `Department Goal: ${organizationalGoal.title}`,
            description: `Department-specific goal based on: ${organizationalGoal.title}`,
            type: "department",
            scorecardPillar: organizationalGoal.scorecardPillar,
            pillarId: organizationalGoal.pillarId,
            parentGoalId: organizationalGoalId,
            departmentName: department.name,
            targetValue: Math.round(organizationalGoal.targetValue / departments.length),
            targetUnit: organizationalGoal.targetUnit,
            currentValue: 0,
            kpiId: organizationalGoal.kpiId,
            priority: organizationalGoal.priority,
            startDate: organizationalGoal.startDate,
            endDate: organizationalGoal.endDate,
            assignedToId: departmentAssigneeId,
            createdById: organizationalGoal.createdById,
            status: "active",
            stage: "planning"
          }
        });

        if (organizationalGoal.kpiId) {
          await KPIService.syncKpiActiveFromLinkedGoals(organizationalGoal.kpiId);
        }

        console.log(`✅ Created department goal for ${department.name}: ${departmentGoal.id}`);
      }

      console.log(`✅ Auto-assigned organizational goal to ${departments.length} departments`);
    } catch (error) {
      console.error('❌ Error auto-assigning goals:', error);
      throw error;
    }
  }

  /**
   * Automatically assign department goals to team members
   */
  static async autoAssignDepartmentGoals(departmentGoalId: string): Promise<void> {
    try {
      console.log(`🔄 Auto-assigning department goal ${departmentGoalId} to team members...`);

      const departmentGoal = await prisma.performanceGoal.findUnique({
        where: { id: departmentGoalId },
        include: {
          createdBy: true
        }
      });

      if (!departmentGoal) {
        throw new Error("Department goal not found");
      }

      if (departmentGoal.type !== "department") {
        throw new Error("Goal must be a department-level goal for auto-assignment");
      }

      if (String(departmentGoal.status).toLowerCase() !== "active") {
        throw new Error("Department goal must be active before assigning individual goals.");
      }

      const deptName = departmentGoal.departmentName != null ? String(departmentGoal.departmentName).trim() : "";
      const departmentRow = deptName
        ? await prisma.department.findFirst({
            where: { name: deptName, isActive: true }
          })
        : null;

      if (!deptName && !departmentRow?.id) {
        console.log(
          `⚠️ Department goal ${departmentGoalId} has no departmentName — cannot resolve users for auto-assign.`
        );
        return;
      }

      const orClause: Array<{ departmentId?: string; userDepartment?: string }> = [];
      if (departmentRow?.id) orClause.push({ departmentId: departmentRow.id });
      if (deptName) orClause.push({ userDepartment: deptName });

      const departmentUsersRaw = await prisma.user.findMany({
        where: {
          isActive: true,
          OR: orClause
        },
        include: {
          role: true
        }
      });

      const uniqueById = new Map();
      for (const u of departmentUsersRaw) uniqueById.set(u.id, u);
      const departmentUsers = Array.from(uniqueById.values());

      if (departmentUsers.length === 0) {
        console.log(
          `⚠️ No users found for department goal ${departmentGoalId}` +
            (deptName ? ` (departmentName: ${deptName})` : " (missing departmentName on goal)")
        );
        return;
      }

      const { IndividualGoalToTaskService } = await import("./IndividualGoalToTaskService");

      // Create individual goals for each user
      for (const user of departmentUsers) {
        const individualGoal = await prisma.performanceGoal.create({
          data: {
            title: `Individual Goal: ${departmentGoal.title}`,
            description: `Individual goal for ${user.firstName} ${user.lastName} based on: ${departmentGoal.title}`,
            type: "individual",
            scorecardPillar: departmentGoal.scorecardPillar,
            pillarId: departmentGoal.pillarId,
            parentGoalId: departmentGoalId,
            departmentName: departmentGoal.departmentName,
            targetValue: Math.round(Number(departmentGoal.targetValue || 0) / departmentUsers.length),
            targetUnit: departmentGoal.targetUnit,
            currentValue: 0,
            kpiId: departmentGoal.kpiId,
            priority: departmentGoal.priority,
            startDate: departmentGoal.startDate,
            endDate: departmentGoal.endDate,
            assignedToId: user.id,
            createdById: departmentGoal.createdById,
            status: "active",
            stage: "planning"
          }
        });

        if (departmentGoal.kpiId) {
          await KPIService.syncKpiActiveFromLinkedGoals(departmentGoal.kpiId);
        }

        console.log(`✅ Created individual goal for ${user.firstName} ${user.lastName}: ${individualGoal.id}`);

        try {
          await IndividualGoalToTaskService.convertIndividualGoalsToTasks(individualGoal.id);
          console.log(`✅ Created task from individual goal ${individualGoal.id}`);
        } catch (e: any) {
          console.error(`❌ Failed to create task for individual goal ${individualGoal.id}:`, e);
          throw new Error(`Task could not be created from individual goal: ${e?.message ?? String(e)}`);
        }
      }

      console.log(`✅ Auto-assigned department goal to ${departmentUsers.length} team members`);
    } catch (error) {
      console.error('❌ Error auto-assigning department goals:', error);
      throw error;
    }
  }

  /**
   * Update goal progress when a task is completed
   */
  static async updateProgressFromTasks(taskId: string): Promise<void> {
    try {
      console.log(`🔄 Updating goal progress from task completion: ${taskId}`);

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          goal: true
        }
      });

      if (!task) {
        throw new Error("Task not found");
      }

      if (!task.goalId || !task.goal) {
        console.log(`⚠️ Task ${taskId} is not linked to a goal`);
        return;
      }

      // Update goal progress based on task completion
      const goal = task.goal;
      const newCurrentValue = (goal.currentValue || 0) + (task.currentValue || 0);
      const targetNum = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
      const progressPercentage = computeAchievementPercent({
        currentValue: newCurrentValue,
        targetValue: goal.targetValue,
        targetOperator: goal.targetOperator,
        isReverseKpi: goal.isReverseKpi,
        progressPercentage: goal.progressPercentage
      });
      const isCompleted = isTargetMet(newCurrentValue, targetNum, goal.targetOperator, goal.isReverseKpi);

      const updatedGoal = await prisma.performanceGoal.update({
        where: { id: goal.id },
        data: {
          currentValue: newCurrentValue,
          progressPercentage,
          status: isCompleted ? "completed" : "active",
          stage: isCompleted ? "completed" : goal.stage,
          updatedAt: new Date()
        }
      });

      console.log(`✅ Updated goal ${goal.id} progress: ${newCurrentValue}/${goal.targetValue} (${progressPercentage.toFixed(1)}%)`);

      // If goal is completed and has KPI integration, trigger accounting
      if (isCompleted && goal.kpiId) {
        await this.triggerAccountingIntegration(goal.id, newCurrentValue);
      }

      // If this is a sub-goal, update parent goal progress
      if (goal.parentGoalId) {
        await this.updateParentGoalProgress(goal.parentGoalId);
      }
    } catch (error) {
      console.error('❌ Error updating progress from tasks:', error);
      throw error;
    }
  }

  /**
   * Update parent goal progress when sub-goals are completed
   */
  static async updateParentGoalProgress(parentGoalId: string): Promise<void> {
    try {
      console.log(`🔄 Updating parent goal progress: ${parentGoalId}`);

      const parentGoal = await prisma.performanceGoal.findUnique({
        where: { id: parentGoalId },
        include: {
          subGoals: true
        }
      });

      if (!parentGoal) {
        throw new Error("Parent goal not found");
      }

      const rollup = computeParentRollupFromChildren(
        parentGoal.subGoals,
        parentGoal.targetValue
      );
      const { stage: newStage, status: newStatus } = deriveParentStageFromRollup({
        allCompleted: rollup.allCompleted,
        anyInProgress: rollup.anyInProgress,
        weightedProgress: rollup.progressPercentage,
        suggestedCurrentValue: rollup.suggestedCurrentValue,
        subGoalCount: parentGoal.subGoals.length,
        previousStage: parentGoal.stage || "planning"
      });

      const updatedParentGoal = await prisma.performanceGoal.update({
        where: { id: parentGoalId },
        data: {
          currentValue: rollup.suggestedCurrentValue,
          progressPercentage: rollup.progressPercentage,
          status: newStatus,
          stage: newStage,
          updatedAt: new Date()
        }
      });

      console.log(
        `✅ Updated parent goal ${parentGoalId} progress: ${rollup.progressPercentage.toFixed(1)}% (weighted)`
      );

      if (rollup.allCompleted && parentGoal.kpiId) {
        await this.triggerAccountingIntegration(parentGoalId, parentGoal.targetValue);
      }

      // If this parent goal has a parent, update it too
      if (parentGoal.parentGoalId) {
        await this.updateParentGoalProgress(parentGoal.parentGoalId);
      }
    } catch (error) {
      console.error('❌ Error updating parent goal progress:', error);
      throw error;
    }
  }

  /**
   * Check KPI thresholds and trigger accounting integration
   */
  static async checkKPIThresholds(goalId: string): Promise<void> {
    try {
      console.log(`🔄 Checking KPI thresholds for goal: ${goalId}`);

      const goal = await prisma.performanceGoal.findUnique({
        where: { id: goalId },
        include: {
          kpi: true
        }
      });

      if (!goal || !goal.kpi) {
        console.log(`⚠️ Goal ${goalId} has no KPI associated`);
        return;
      }

      // Check if goal is completed and KPI threshold is met
      if (goal.status === "completed" && goal.currentValue >= goal.targetValue) {
        await this.triggerAccountingIntegration(goalId, goal.currentValue);
      }
    } catch (error) {
      console.error('❌ Error checking KPI thresholds:', error);
      throw error;
    }
  }

  /**
   * Trigger accounting integration for KPI achievement
   */
  static async triggerAccountingIntegration(goalId: string, achievedValue: number): Promise<void> {
    try {
      console.log(`💰 Triggering accounting integration for goal: ${goalId}`);

      const goal = await prisma.performanceGoal.findUnique({
        where: { id: goalId },
        include: { kpi: true }
      });

      if (!goal || !goal.kpi) {
        console.log(`⚠️ Goal ${goalId} has no KPI associated`);
        return;
      }

      const { resolveKpiAccountingConfig } = await import("../utils/kpiCatalogMetadata");
      const kpiConfig = resolveKpiAccountingConfig(goal.kpi);

      if (kpiConfig && kpiConfig.isFinancial && kpiConfig.accountNumber) {
        // Create journal entry based on KPI completion
        // Use a bank-linked GL account as the cash offset (Cash & Cash Equivalents is a reporting bucket).
        const bank = await prisma.bank.findFirst({
          where: { isActive: true, glAccountId: { not: null } },
          orderBy: { createdAt: "asc" },
          select: { glAccountId: true },
        });
        if (!bank?.glAccountId) {
          throw new Error("No active bank with a GL account linked (banks.glAccountId).");
        }
        const kpiAccount = await prisma.chartOfAccounts.findFirst({
          where: { accountNo: kpiConfig.accountNumber, isActive: true },
          select: { id: true, accountNo: true, accountName: true },
        });
        if (!kpiAccount) {
          throw new Error(`No active chart account found for KPI account number ${kpiConfig.accountNumber}.`);
        }

        const journalEntry = await createJournalEntryWithAuditSequence({
          transactionDate: new Date(),
          referenceNumber: `KPI-${goal.id}-${Date.now()}`,
          description: `KPI Achievement: ${goal.title} - ${achievedValue} ${goal.targetUnit}`,
          totalAmount: achievedValue,
          currencyId: "USD",
          status: "POSTED",
          createdById: goal.createdById,
          journalEntryLines: {
            create: [
              {
                chartOfAccountId: kpiConfig.journalEntryType === "Debit" ? kpiAccount.id : bank.glAccountId,
                debitAmount: kpiConfig.journalEntryType === "Debit" ? achievedValue : 0,
                creditAmount: kpiConfig.journalEntryType === "Credit" ? achievedValue : 0,
                description: `KPI: ${goal.kpi.name}`,
              },
              {
                chartOfAccountId: kpiConfig.journalEntryType === "Credit" ? kpiAccount.id : bank.glAccountId,
                debitAmount: kpiConfig.journalEntryType === "Credit" ? achievedValue : 0,
                creditAmount: kpiConfig.journalEntryType === "Debit" ? achievedValue : 0,
                description: `KPI: ${goal.kpi.name}`,
              },
            ],
          },
        });

        console.log(`✅ Accounting integration triggered for goal ${goalId}: Journal Entry ${journalEntry.id} created`);
      } else {
        console.log(
          `⚠️ KPI ${goal.kpi.code || goal.kpi.name} is not financial or has no GL mapping; no journal entry created`
        );
      }
    } catch (error) {
      console.error('❌ Error triggering accounting integration:', error);
      throw error;
    }
  }

  /**
   * Check for overdue goals and send notifications
   */
  static async checkOverdueGoals(): Promise<void> {
    try {
      console.log('🔄 Checking for overdue goals...');

      const overdueGoals = await prisma.performanceGoal.findMany({
        where: {
          status: "active",
          endDate: {
            lt: new Date()
          }
        },
        include: {
          assignedTo: true,
          department: true,
          createdBy: true
        }
      });

      if (overdueGoals.length > 0) {
        console.log(`⚠️ Found ${overdueGoals.length} overdue goals`);
        
        for (const goal of overdueGoals) {
          // Update goal status to overdue
          await prisma.performanceGoal.update({
            where: { id: goal.id },
            data: {
              status: "overdue",
              stage: "overdue"
            }
          });

          console.log(`✅ Marked goal ${goal.id} as overdue`);
        }
      } else {
        console.log('✅ No overdue goals found');
      }
    } catch (error) {
      console.error('❌ Error checking overdue goals:', error);
      throw error;
    }
  }

  /**
   * Run all workflow automation tasks
   */
  static async runWorkflowAutomation(): Promise<void> {
    try {
      console.log('🚀 Running Performance Workflow Automation...');

      // Check for overdue goals
      await this.checkOverdueGoals();

      // Check for goals that need KPI threshold checking
      const activeGoals = await prisma.performanceGoal.findMany({
        where: {
          status: "active",
          kpiId: { not: null }
        }
      });

      for (const goal of activeGoals) {
        await this.checkKPIThresholds(goal.id);
      }

      console.log('✅ Performance Workflow Automation completed');
    } catch (error) {
      console.error('❌ Performance Workflow Automation failed:', error);
      throw error;
    }
  }
}
