// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";
import { KPIService } from "./KPIService";
import {
  computeAchievementPercent,
  computeParentRollupFromChildren,
  deriveGoalProgressState,
  deriveParentStageFromRollup
} from "./performanceGoalRollupUtils";
import { resolveDefaultDepartmentGoalAssigneeId } from "./performanceGoalDefaultAssignee";
import { canBypassPerformanceDepartmentGate } from "./PerformanceReviewService";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";
import { isPerfAdmin, perfActor, registerWhere } from "./PerformanceScope";
import { TimesheetService } from "./TimesheetService";

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
      const progressState = deriveGoalProgressState({
        currentValue: newCurrentValue,
        targetValue: goal.targetValue,
        targetOperator: goal.targetOperator,
        isReverseKpi: goal.isReverseKpi,
        previousStage: goal.stage,
        progressPercentage: goal.progressPercentage
      });
      const isCompleted = progressState.isTargetMet;

      const updatedGoal = await prisma.performanceGoal.update({
        where: { id: goal.id },
        data: {
          currentValue: newCurrentValue,
          progressPercentage: progressState.progressPercentage,
          status: progressState.status,
          stage: progressState.stage,
          updatedAt: new Date()
        }
      });

      console.log(`✅ Updated goal ${goal.id} progress: ${newCurrentValue}/${goal.targetValue} (${progressState.progressPercentage}%)`);

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
        await this.triggerAccountingIntegration(parentGoalId, rollup.suggestedCurrentValue);
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

  static async triggerAccountingIntegration(goalId: string, achievedValue: number): Promise<void> {
    const { KpiAccountingIntegrationService } = await import("./KpiAccountingIntegrationService");
    await KpiAccountingIntegrationService.triggerKpiAchievementJournal(goalId, achievedValue);
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

  /**
   * The approval inbox: every item across Performance that is waiting on the signed-in person and that
   * they are actually allowed to act on — the same permission and maker-checker rules the action's own
   * route applies, so nothing is listed that would then be refused. Self-scoped: no resource permission
   * gates the read (like `/tasks/my`), because what is listed is filtered to the caller.
   *
   * Each item says where it is acted on (`page`, optional `tab`), so the inbox opens the right place.
   */
  static async pendingForMe(actor: any) {
    const me = await prisma.user.findUnique({ where: { id: actor.id }, include: { role: true, department: true, employee: true } });
    if (!me) return { total: 0, items: [] };
    const can = (...keys: string[]) => keys.some((k) => userHasEffectivePermission(actor, k));
    const admin = isPerfAdmin(me);
    const nameOf = (u: any) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : "");
    const items: Array<{ kind: string; id: string; title: string; detail: string; since: Date | null; page: string; tab?: string }> = [];
    const USER = { select: { firstName: true, lastName: true, email: true } } as const;

    const tasks: Array<Promise<void>> = [];

    // Timesheets submitted by someone in the approver's department (as TimesheetService.listForManager scopes a team); never one's own.
    if (can("accounting.timesheets.manage")) {
      tasks.push((async () => {
        // timesheets the approve route would accept from this person (TimesheetService.approverReach), narrowed to their own
        // department when they have one: an organisation-wide approver may act on anyone's, but their inbox is their team's
        const pending = await TimesheetService.listPendingApproval(me.id);
        const dept = me.department?.name || me.userDepartment || null;
        const team = await prisma.user.findMany({ where: { OR: [...(me.departmentId ? [{ departmentId: me.departmentId }] : []), ...(dept ? [{ userDepartment: dept }] : [])] }, select: { id: true } });
        const teamIds = new Set(team.map((u) => u.id));
        for (const t of pending.filter((x) => !dept || teamIds.has(x.userId))) {
          items.push({ kind: "timesheet", id: t.id, title: `Timesheet from ${nameOf(t.user)}`, detail: `Week ending ${t.weekEnding.toISOString().slice(0, 10)}`, since: t.submittedAt, page: "timesheets", tab: "audit" });
        }
      })());
    }

    // Reviews: the reviewee's self-assessment, the reviewer's manager review, and finalizing a complete review.
    tasks.push((async () => {
      const bypass = canBypassPerformanceDepartmentGate(me);
      const rows = await prisma.performanceReview.findMany({
        where: { isLocked: false, OR: [{ revieweeId: me.id }, { reviewerId: me.id }, ...(bypass ? [{ stage: "FINAL_REVIEW" }] : [])] },
        include: { reviewee: USER }
      });
      for (const r of rows) {
        const stage = String(r.stage || "").toUpperCase();
        if (r.revieweeId === me.id && ["SELF_REVIEW", "SELF_ASSESSMENT"].includes(stage)) {
          items.push({ kind: "review", id: r.id, title: `Your self-assessment: ${r.title}`, detail: "Write and submit your self-assessment", since: r.updatedAt, page: "reviews", tab: "mine" });
        } else if (r.reviewerId === me.id && r.revieweeId !== me.id && stage === "MANAGER_REVIEW") {
          items.push({ kind: "review", id: r.id, title: `Review ${nameOf(r.reviewee)}: ${r.title}`, detail: "Manager feedback and rating", since: r.updatedAt, page: "reviews", tab: "team" });
        } else if (r.revieweeId !== me.id && (r.reviewerId === me.id || bypass) && String(r.selfFeedback || "").trim() && String(r.managerFeedback || "").trim() && (r.ratingValue != null || r.overallScore != null)) {
          items.push({ kind: "review", id: r.id, title: `Finalize ${nameOf(r.reviewee)}: ${r.title}`, detail: "Complete — ready to finalize", since: r.updatedAt, page: "reviews", tab: "team" });
        }
      }
    })());

    // Contracts that name this person as a signatory, are signable (objectives weighted to 100%), and lack their signature on the current version.
    tasks.push((async () => {
      const contracts = await prisma.performanceContract.findMany({
        where: { status: { notIn: ["ARCHIVED", "CANCELLED", "CLOSED"] }, OR: [{ subjectUserId: me.id }, { reviewerUserId: me.id }, { approverUserId: me.id }] },
        include: { goals: { select: { scorecardWeight: true } } }
      });
      if (!contracts.length) return;
      const sigs = await prisma.performanceContractSignature.findMany({ where: { contractId: { in: contracts.map((c) => c.id) }, userId: me.id } });
      for (const c of contracts) {
        const sum = c.goals.reduce((a, g) => a + Number(g.scorecardWeight || 0), 0);
        const pct = Math.round((sum <= 1.0001 ? sum * 100 : sum) * 100) / 100;
        if (!c.goals.length || Math.abs(pct - 100) > 0.01) continue;
        const roles = [c.subjectUserId === me.id && "employee", c.reviewerUserId === me.id && "reviewer", c.approverUserId === me.id && "approver"].filter(Boolean);
        const unsigned = roles.filter((role) => !sigs.some((s) => s.contractId === c.id && s.role === role && s.versionNo === c.versionNo));
        if (unsigned.length) items.push({ kind: "contract", id: c.id, title: c.title, detail: `Your signature as ${unsigned.join(" and ")}`, since: c.updatedAt, page: "contracts" });
      }
    })());

    // KPI definitions submitted for approval — not by someone who created or owns them (administrators excepted).
    if (can("performance.kpi.manage")) {
      tasks.push((async () => {
        const where: any = { approvalStatus: "pending_approval" };
        if (!admin) where.AND = [{ createdById: { not: me.id } }, { OR: [{ ownerId: null }, { ownerId: { not: me.id } }] }];
        for (const k of await prisma.kPI.findMany({ where, select: { id: true, code: true, name: true, updatedAt: true } })) {
          items.push({ kind: "kpi", id: k.id, title: `KPI ${k.code || ""} ${k.name}`.replace(/\s+/g, " ").trim(), detail: "Definition awaiting approval", since: k.updatedAt, page: "kpiManagement" });
        }
      })());
    }

    // Vault documents in review — not the uploader's or owner's own (administrators excepted).
    if (can("performance.documents.manage")) {
      tasks.push((async () => {
        const where: any = { status: "in_review" };
        if (!admin) where.AND = [{ OR: [{ uploadedById: null }, { uploadedById: { not: me.id } }] }, { OR: [{ ownerId: null }, { ownerId: { not: me.id } }] }];
        // only documents the approver can see (a department manager approves their own department's documents)
        const scope = registerWhere(await perfActor(actor), ["ownerId", "uploadedById"]);
        if (scope.OR) where.AND = [...(where.AND || []), scope];
        for (const d of await prisma.performanceDocument.findMany({ where, select: { id: true, name: true, folder: true, updatedAt: true } })) {
          items.push({ kind: "document", id: d.id, title: d.name, detail: `Document in review · ${d.folder}`, since: d.updatedAt, page: "vault" });
        }
      })());
    }

    // BSC weight proposals — not one's own (administrators excepted). Decided by BSC governance, as the proposal's own route requires.
    if (can("performance.bsc.manage")) {
      tasks.push((async () => {
        const where: any = { status: "pending" };
        if (!admin) where.proposedById = { not: me.id };
        for (const p of await prisma.performancePillarProposal.findMany({ where })) {
          items.push({ kind: "pillar", id: p.id, title: "BSC weight change", detail: String(p.reason || "").slice(0, 140), since: p.createdAt, page: "bscPillars" });
        }
      })());
    }

    // Strategy decisions proposed by someone else (administrators excepted).
    if (can("performance.config.manage")) {
      tasks.push((async () => {
        const where: any = { status: "proposed" };
        if (!admin) where.OR = [{ proposedById: null }, { proposedById: { not: me.id } }];
        for (const d of await prisma.performanceStrategyDecision.findMany({ where })) {
          items.push({ kind: "decision", id: d.id, title: d.title, detail: "Strategy decision awaiting approval", since: d.createdAt, page: "strategy", tab: "reviews" });
        }
      })());
    }

    // Values fed by a source system and held for approval before they count.
    if (can("performance.integration.manage")) {
      tasks.push((async () => {
        for (const g of await prisma.performanceGoal.findMany({ where: { isPendingApproval: true }, select: { id: true, title: true, updatedAt: true } })) {
          items.push({ kind: "integration", id: g.id, title: g.title, detail: "Synced value awaiting approval", since: g.updatedAt, page: "integrations" });
        }
      })());
    }

    await Promise.all(tasks);
    items.sort((a, b) => +new Date(a.since || 0) - +new Date(b.since || 0));
    return { total: items.length, items };
  }
}
