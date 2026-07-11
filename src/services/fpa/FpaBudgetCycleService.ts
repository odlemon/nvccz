// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";
import { FpaActualsService } from "./FpaActualsService";
import { FpaModelSetupService } from "./FpaModelSetupService";
import { FpaVersionService } from "./FpaVersionService";
import { FpaExportService } from "./FpaExportService";

export const BUDGET_INPUT_CATEGORIES = [
  "REVENUE",
  "COST_OF_SALES",
  "PAYROLL",
  "OPERATING_EXPENSES",
  "DEPARTMENTAL",
  "PROJECT",
  "CAPEX",
  "TAX",
  "CASH_MOVEMENT",
  "FUNDING",
] as const;

const OWNER_EDITABLE = new Set(["DRAFT", "OPEN_FOR_INPUT", "RETURNED_FOR_CORRECTION"]);

/** Map budget input categories → line-item category / code hints */
const CATEGORY_LINE_MATCH: Record<string, { categories?: string[]; codes?: string[]; types?: string[] }> = {
  REVENUE: { categories: ["REVENUE"], types: ["REVENUE"] },
  COST_OF_SALES: { categories: ["EXPENSE", "COST_OF_SALES"], codes: ["COGS", "COST_OF_SALES"] },
  PAYROLL: { categories: ["WORKFORCE", "PAYROLL"], codes: ["SALARIES", "HEADCOUNT", "PAYROLL"] },
  OPERATING_EXPENSES: { categories: ["EXPENSE", "OPERATING_EXPENSES"], codes: ["RENT", "MARKETING"] },
  DEPARTMENTAL: { categories: ["EXPENSE", "DEPARTMENTAL", "GENERAL"] },
  PROJECT: { categories: ["PROJECT"], codes: ["PROJECT"] },
  CAPEX: { categories: ["CAPEX"], codes: ["CAPEX"] },
  TAX: { categories: ["TAX"], codes: ["TAX"] },
  CASH_MOVEMENT: { categories: ["CASH"], codes: ["CLOSING_CASH", "OPENING_CASH"], types: ["CASH"] },
  FUNDING: { categories: ["FUNDING"], codes: ["FUNDING"] },
};

function asStringArray(v: any): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function userDisplayName(u: any): string | null {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || null;
}

export class FpaBudgetCycleService {
  static assertFpaManager(user: any) {
    FpaAccessService.assertCanApprove(user);
  }

  static assertCfo(user: any) {
    FpaAccessService.assertCanApprove(user);
  }

  static async list(query: any = {}) {
    const where: any = {};
    if (query.modelId) where.modelId = String(query.modelId);
    if (query.fiscalYear != null) where.fiscalYear = Number(query.fiscalYear);
    if (query.status) where.status = String(query.status);
    const rows = await prisma.planningBudgetCycle.findMany({
      where,
      include: { owners: true },
      orderBy: [{ fiscalYear: "desc" }, { createdAt: "desc" }],
    });
    return Promise.all(rows.map((r) => FpaBudgetCycleService.serialize(r)));
  }

  static async get(id: string) {
    const cycle = await prisma.planningBudgetCycle.findUnique({
      where: { id },
      include: {
        owners: true,
        workflow: { include: { tasks: { include: { approvals: true } } } },
      },
    });
    if (!cycle) throw new FpaError(404, "NOT_FOUND", "Budget cycle not found");
    const validation = await FpaBudgetCycleService.validate(id, { persist: false });
    const data = await FpaBudgetCycleService.serialize(cycle);
    return { ...data, validation, workflow: cycle.workflow };
  }

  static async create(input: any, user: any, ip?: string) {
    FpaBudgetCycleService.assertFpaManager(user);
    const modelId = String(input.modelId || "");
    const name = String(input.name || "").trim();
    const fiscalYear = Number(input.fiscalYear);
    const ownersIn = Array.isArray(input.owners) ? input.owners : [];

    if (!modelId) throw new FpaError(400, "VALIDATION", "modelId is required");
    if (!name) throw new FpaError(400, "VALIDATION", "name is required");
    if (!Number.isFinite(fiscalYear)) throw new FpaError(400, "VALIDATION", "fiscalYear is required");
    if (!ownersIn.length) {
      throw new FpaError(400, "NO_OWNERS", "At least one owner is required", [
        { code: "NO_OWNERS", step: "ASSIGN_OWNERS", message: "owners must have ≥ 1 department" },
      ]);
    }

    const model = await prisma.planningModel.findUnique({
      where: { id: modelId },
      include: { versions: true, scenarios: true },
    });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");

    const versionId =
      String(input.versionId || "") ||
      model.versions.find((v) => String(v.status).toUpperCase() !== "ARCHIVED")?.id ||
      model.versions[0]?.id;
    const scenarioId =
      String(input.scenarioId || "") ||
      model.scenarios.find((s) => s.isOfficial)?.id ||
      model.scenarios[0]?.id ||
      null;
    if (!versionId) throw new FpaError(400, "VALIDATION", "model has no version; create a version first");

    const existing = await prisma.planningBudgetCycle.findFirst({
      where: {
        modelId,
        fiscalYear,
        status: { notIn: ["LOCKED"] },
      },
    });
    if (existing) {
      throw new FpaError(409, "CYCLE_EXISTS", `Active budget cycle already exists for FY${fiscalYear}`, [
        { code: "CYCLE_EXISTS", message: `Existing cycle ${existing.id}` },
      ]);
    }

    const deptIds = ownersIn.map((o) => String(o.departmentId));
    const depts = await prisma.department.findMany({ where: { id: { in: deptIds } } });
    const deptOk = new Set(depts.map((d) => d.id));
    for (const id of deptIds) {
      if (!deptOk.has(id)) {
        throw new FpaError(400, "UNKNOWN_DEPARTMENT", `Department not found: ${id}`, [
          { code: "UNKNOWN_DEPARTMENT", field: "owners", message: `Unknown department ${id}` },
        ]);
      }
    }
    const assigneeIds = ownersIn.map((o) => o.assigneeId).filter(Boolean).map(String);
    if (assigneeIds.length) {
      const users = await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true } });
      const ok = new Set(users.map((u) => u.id));
      for (const id of assigneeIds) {
        if (!ok.has(id)) {
          throw new FpaError(400, "UNKNOWN_ASSIGNEE", `Assignee not found: ${id}`, [
            { code: "UNKNOWN_ASSIGNEE", field: "owners", message: `Unknown assignee ${id}` },
          ]);
        }
      }
    }

    const inputCategories =
      Array.isArray(input.inputCategories) && input.inputCategories.length
        ? input.inputCategories.map(String)
        : [...BUDGET_INPUT_CATEGORIES];
    const loadPriorActuals = input.loadPriorActuals !== false;
    const loadBaseline = input.loadBaseline !== false;
    const startDate = input.startDate ? new Date(input.startDate) : new Date(Date.UTC(fiscalYear, 0, 1));
    const endDate = input.endDate ? new Date(input.endDate) : new Date(Date.UTC(fiscalYear, 11, 31));

    const cycle = await prisma.$transaction(async (tx) => {
      const workflow = await tx.planningWorkflow.create({
        data: {
          modelId,
          name,
          workflowType: "BUDGET",
          stage: "OWNER_INPUT",
          status: "ACTIVE",
          startDate,
          endDate,
          createdById: user.id,
        },
      });

      const ownerRows = [];
      for (const o of ownersIn) {
        const departmentId = String(o.departmentId);
        const dept = depts.find((d) => d.id === departmentId);
        const categories =
          Array.isArray(o.categories) && o.categories.length ? o.categories.map(String) : inputCategories;
        const task = await tx.planningTask.create({
          data: {
            workflowId: workflow.id,
            title: `${dept?.name || "Department"} budget input`,
            departmentId,
            assigneeId: o.assigneeId ? String(o.assigneeId) : null,
            status: "PENDING",
            priority: "NORMAL",
            dueDate: endDate,
          },
        });
        ownerRows.push({
          departmentId,
          assigneeId: o.assigneeId ? String(o.assigneeId) : null,
          taskId: task.id,
          categoriesJson: categories,
          status: "PENDING",
        });
      }

      const created = await tx.planningBudgetCycle.create({
        data: {
          name,
          modelId,
          versionId,
          scenarioId,
          workflowId: workflow.id,
          fiscalYear,
          status: "OPEN_FOR_INPUT",
          currentStage: "OWNER_INPUT",
          startDate,
          endDate,
          inputCategoriesJson: inputCategories,
          createdById: user.id,
          owners: { create: ownerRows },
        },
        include: { owners: true },
      });
      return created;
    });

    let actualsRowCount = 0;
    if (loadPriorActuals) {
      try {
        const priorStart = new Date(Date.UTC(fiscalYear - 1, 0, 1));
        const priorEnd = new Date(Date.UTC(fiscalYear - 1, 11, 31));
        await prisma.planningBudgetCycle.update({
          where: { id: cycle.id },
          data: { status: "LOADING_ACTUALS", currentStage: "LOAD_ACTUALS" },
        });
        const job = await FpaActualsService.sync(
          {
            modelId,
            versionId,
            scenarioId,
            periodStart: priorStart.toISOString().slice(0, 10),
            periodEnd: priorEnd.toISOString().slice(0, 10),
          },
          user.id,
          ip
        );
        actualsRowCount = job?.rowCount ?? job?.data?.rowCount ?? 0;
      } catch {
        actualsRowCount = 0;
      }
    }

    if (loadBaseline) {
      try {
        await prisma.planningBudgetCycle.update({
          where: { id: cycle.id },
          data: { status: "LOADING_BASELINE", currentStage: "LOAD_BASELINE" },
        });
        await FpaModelSetupService.setBaseline(
          modelId,
          { mode: "NONE", sourceVersionId: null },
          user.id,
          ip
        );
      } catch {
        /* non-fatal */
      }
    }

    const opened = await prisma.planningBudgetCycle.update({
      where: { id: cycle.id },
      data: { status: "OPEN_FOR_INPUT", currentStage: "OWNER_INPUT" },
      include: { owners: true },
    });

    await FpaAuditService.log("BUDGET_CYCLE_CREATE", user.id, { modelId, ip });
    const data = await FpaBudgetCycleService.serialize(opened);
    return { ...data, actualsRowCount };
  }

  static async setOwners(cycleId: string, input: any, user: any, ip?: string) {
    FpaBudgetCycleService.assertFpaManager(user);
    const cycle = await FpaBudgetCycleService.assertCycle(cycleId);
    if (!OWNER_EDITABLE.has(cycle.status)) {
      throw new FpaError(409, "INVALID_TRANSITION", `Cannot reassign owners in status ${cycle.status}`);
    }
    const ownersIn = Array.isArray(input.owners) ? input.owners : [];
    if (!ownersIn.length) throw new FpaError(400, "NO_OWNERS", "owners required");

    const deptIds = ownersIn.map((o) => String(o.departmentId));
    const depts = await prisma.department.findMany({ where: { id: { in: deptIds } } });
    const deptMap = Object.fromEntries(depts.map((d) => [d.id, d]));
    for (const id of deptIds) {
      if (!deptMap[id]) throw new FpaError(400, "UNKNOWN_DEPARTMENT", `Department not found: ${id}`);
    }

    if (!cycle.workflowId) throw new FpaError(400, "VALIDATION", "Cycle has no workflow");

    await prisma.$transaction(async (tx) => {
      const existing = await tx.planningBudgetCycleOwner.findMany({ where: { cycleId } });
      const keep = new Set(deptIds);
      for (const o of existing) {
        if (!keep.has(o.departmentId)) {
          if (o.taskId) {
            await tx.planningTask.update({ where: { id: o.taskId }, data: { status: "CANCELLED" } });
          }
          await tx.planningBudgetCycleOwner.delete({ where: { id: o.id } });
        }
      }
      const inputCategories = asStringArray(cycle.inputCategoriesJson);
      for (const o of ownersIn) {
        const departmentId = String(o.departmentId);
        const categories =
          Array.isArray(o.categories) && o.categories.length ? o.categories.map(String) : inputCategories;
        const prev = existing.find((e) => e.departmentId === departmentId);
        if (prev) {
          if (prev.taskId) {
            await tx.planningTask.update({
              where: { id: prev.taskId },
              data: {
                assigneeId: o.assigneeId ? String(o.assigneeId) : null,
                status: prev.status === "CANCELLED" ? "PENDING" : undefined,
              },
            });
          }
          await tx.planningBudgetCycleOwner.update({
            where: { id: prev.id },
            data: {
              assigneeId: o.assigneeId ? String(o.assigneeId) : null,
              categoriesJson: categories,
              status: "PENDING",
            },
          });
        } else {
          const task = await tx.planningTask.create({
            data: {
              workflowId: cycle.workflowId,
              title: `${deptMap[departmentId]?.name || "Department"} budget input`,
              departmentId,
              assigneeId: o.assigneeId ? String(o.assigneeId) : null,
              status: "PENDING",
              priority: "NORMAL",
            },
          });
          await tx.planningBudgetCycleOwner.create({
            data: {
              cycleId,
              departmentId,
              assigneeId: o.assigneeId ? String(o.assigneeId) : null,
              taskId: task.id,
              categoriesJson: categories,
              status: "PENDING",
            },
          });
        }
      }
    });

    await FpaAuditService.log("BUDGET_CYCLE_OWNERS", user.id, { modelId: cycle.modelId, ip });
    return FpaBudgetCycleService.get(cycleId);
  }

  static async loadActuals(cycleId: string, input: any, user: any, ip?: string) {
    FpaBudgetCycleService.assertFpaManager(user);
    const cycle = await FpaBudgetCycleService.assertCycle(cycleId);
    await prisma.planningBudgetCycle.update({
      where: { id: cycleId },
      data: { status: "LOADING_ACTUALS", currentStage: "LOAD_ACTUALS" },
    });
    const fy = cycle.fiscalYear;
    const periodStart = input.periodStart || `${fy - 1}-01-01`;
    const periodEnd = input.periodEnd || `${fy - 1}-12-31`;
    let rowCount = 0;
    try {
      const job = await FpaActualsService.sync(
        {
          modelId: cycle.modelId,
          versionId: cycle.versionId,
          scenarioId: cycle.scenarioId,
          periodStart,
          periodEnd,
        },
        user.id,
        ip
      );
      rowCount = job?.rowCount ?? 0;
    } catch {
      rowCount = 0;
    }
    const updated = await prisma.planningBudgetCycle.update({
      where: { id: cycleId },
      data: { status: "OPEN_FOR_INPUT", currentStage: "OWNER_INPUT" },
      include: { owners: true },
    });
    await FpaAuditService.log("BUDGET_CYCLE_LOAD_ACTUALS", user.id, { modelId: cycle.modelId, ip });
    return { ...(await FpaBudgetCycleService.serialize(updated)), rowCount };
  }

  static async loadBaseline(cycleId: string, input: any, user: any, ip?: string) {
    FpaBudgetCycleService.assertFpaManager(user);
    const cycle = await FpaBudgetCycleService.assertCycle(cycleId);
    await prisma.planningBudgetCycle.update({
      where: { id: cycleId },
      data: { status: "LOADING_BASELINE", currentStage: "LOAD_BASELINE" },
    });
    await FpaModelSetupService.setBaseline(
      cycle.modelId,
      {
        mode: input.mode || "NONE",
        sourceVersionId: input.sourceVersionId || null,
        sourceScenarioId: input.sourceScenarioId || null,
      },
      user.id,
      ip
    );
    const updated = await prisma.planningBudgetCycle.update({
      where: { id: cycleId },
      data: { status: "OPEN_FOR_INPUT", currentStage: "OWNER_INPUT" },
      include: { owners: true },
    });
    await FpaAuditService.log("BUDGET_CYCLE_LOAD_BASELINE", user.id, { modelId: cycle.modelId, ip });
    return FpaBudgetCycleService.serialize(updated);
  }

  static async validate(cycleId: string, opts: { persist?: boolean } = {}) {
    const cycle = await prisma.planningBudgetCycle.findUnique({
      where: { id: cycleId },
      include: { owners: true },
    });
    if (!cycle) throw new FpaError(404, "NOT_FOUND", "Budget cycle not found");

    const errors = [];
    const lineItems = await prisma.planningLineItem.findMany({ where: { modelId: cycle.modelId } });
    const cells = await prisma.planningCell.findMany({
      where: {
        modelId: cycle.modelId,
        versionId: cycle.versionId,
        ...(cycle.scenarioId ? { scenarioId: cycle.scenarioId } : {}),
      },
      include: { lineItem: true },
    });

    for (const owner of cycle.owners) {
      const categories = asStringArray(owner.categoriesJson);
      for (const cat of categories) {
        const match = CATEGORY_LINE_MATCH[cat] || { categories: [cat] };
        const relevant = lineItems.filter((li) => {
          const code = String(li.code).toUpperCase();
          const category = String(li.category).toUpperCase();
          const type = String(li.lineItemType).toUpperCase();
          if (match.codes?.some((c) => code === c || code.includes(c))) return true;
          if (match.categories?.some((c) => category === c || category.includes(c))) return true;
          if (match.types?.some((t) => type === t)) return true;
          return false;
        });
        if (!relevant.length) continue;
        const filled = relevant.some((li) =>
          cells.some(
            (c) =>
              c.lineItemId === li.id &&
              (c.departmentId == null || c.departmentId === owner.departmentId) &&
              c.value != null &&
              Number(c.value) !== 0
          )
        );
        // Also accept model-level cells (no department) with any value for the category
        const anyFilled = relevant.some((li) =>
          cells.some((c) => c.lineItemId === li.id && c.value != null && String(c.value) !== "")
        );
        if (!filled && !anyFilled) {
          errors.push({
            code: "MISSING_CATEGORY",
            message: `${cat} lines empty for department ${owner.departmentId}`,
            departmentId: owner.departmentId,
            category: cat,
          });
        }
      }
    }

    const commentaryNeeded = await prisma.planningVarianceResult.findMany({
      where: { modelId: cycle.modelId, commentaryRequired: true },
      take: 20,
    });
    for (const v of commentaryNeeded) {
      const comment = await prisma.planningComment.findFirst({ where: { varianceId: v.id } });
      if (!comment) {
        errors.push({
          code: "MISSING_COMMENTARY",
          message: "Commentary required on variance > threshold",
          departmentId: v.departmentId || undefined,
        });
      }
    }

    const passed = errors.length === 0;
    if (opts.persist !== false) {
      await prisma.planningBudgetCycle.update({
        where: { id: cycleId },
        data: {
          status: passed ? cycle.status : "PENDING_VALIDATION",
          currentStage: "VALIDATE",
        },
      });
    }
    return { passed, errors };
  }

  static async submitFpa(cycleId: string, input: any, user: any, ip?: string) {
    const cycle = await FpaBudgetCycleService.assertCycle(cycleId);
    if (!["OPEN_FOR_INPUT", "RETURNED_FOR_CORRECTION", "PENDING_VALIDATION"].includes(cycle.status)) {
      throw new FpaError(409, "INVALID_TRANSITION", `Cannot submit-fpa from ${cycle.status}`);
    }
    const validation = await FpaBudgetCycleService.validate(cycleId, { persist: false });
    if (!validation.passed) {
      await prisma.planningBudgetCycle.update({
        where: { id: cycleId },
        data: { status: "PENDING_VALIDATION", currentStage: "VALIDATE" },
      });
      throw new FpaError(400, "VALIDATION", "Budget cycle incomplete", validation.errors);
    }

    const owners = await prisma.planningBudgetCycleOwner.findMany({ where: { cycleId } });
    for (const o of owners) {
      if (o.taskId) {
        const task = await prisma.planningTask.findUnique({ where: { id: o.taskId } });
        if (task && !["SUBMITTED", "APPROVED"].includes(task.status)) {
          // Auto-mark submitted when cycle-level submit and validation passed
          await prisma.planningTask.update({
            where: { id: o.taskId },
            data: { status: "SUBMITTED", submittedAt: new Date() },
          });
        }
      }
      await prisma.planningBudgetCycleOwner.update({
        where: { id: o.id },
        data: { status: "SUBMITTED" },
      });
    }

    if (cycle.workflowId) {
      await prisma.planningWorkflow.update({
        where: { id: cycle.workflowId },
        data: { stage: "FPA_REVIEW" },
      });
      await prisma.planningApproval.create({
        data: {
          workflowId: cycle.workflowId,
          actorId: user.id,
          action: "SUBMIT_FPA",
          comment: input?.comment || null,
        },
      });
    }

    const updated = await prisma.planningBudgetCycle.update({
      where: { id: cycleId },
      data: { status: "PENDING_FPA_REVIEW", currentStage: "FPA_REVIEW" },
      include: { owners: true },
    });
    await FpaAuditService.log("BUDGET_CYCLE_SUBMIT_FPA", user.id, {
      modelId: cycle.modelId,
      reason: input?.comment,
      ip,
    });
    return FpaBudgetCycleService.serialize(updated);
  }

  static async fpaAccept(cycleId: string, input: any, user: any, ip?: string) {
    FpaBudgetCycleService.assertFpaManager(user);
    const cycle = await FpaBudgetCycleService.assertCycle(cycleId);
    if (cycle.status !== "PENDING_FPA_REVIEW") {
      throw new FpaError(409, "INVALID_TRANSITION", `Cannot fpa-accept from ${cycle.status}`);
    }
    if (cycle.workflowId) {
      await prisma.planningWorkflow.update({ where: { id: cycle.workflowId }, data: { stage: "CFO_REVIEW" } });
      await prisma.planningApproval.create({
        data: {
          workflowId: cycle.workflowId,
          actorId: user.id,
          action: "FPA_ACCEPT",
          comment: input?.comment || null,
        },
      });
    }
    const updated = await prisma.planningBudgetCycle.update({
      where: { id: cycleId },
      data: { status: "PENDING_CFO_REVIEW", currentStage: "CFO_REVIEW" },
      include: { owners: true },
    });
    await FpaAuditService.log("BUDGET_CYCLE_FPA_ACCEPT", user.id, { modelId: cycle.modelId, ip });
    return FpaBudgetCycleService.serialize(updated);
  }

  static async fpaReturn(cycleId: string, input: any, user: any, ip?: string) {
    FpaBudgetCycleService.assertFpaManager(user);
    const comment = String(input?.comment || "").trim();
    if (!comment) throw new FpaError(400, "VALIDATION", "comment is required for return");
    const cycle = await FpaBudgetCycleService.assertCycle(cycleId);
    if (cycle.status !== "PENDING_FPA_REVIEW") {
      throw new FpaError(409, "INVALID_TRANSITION", `Cannot fpa-return from ${cycle.status}`);
    }
    const departmentIds = Array.isArray(input.departmentIds) ? input.departmentIds.map(String) : null;
    await FpaBudgetCycleService.reopenOwners(cycleId, departmentIds, comment, user, "FPA_RETURN");
    const updated = await prisma.planningBudgetCycle.update({
      where: { id: cycleId },
      data: { status: "RETURNED_FOR_CORRECTION", currentStage: "OWNER_INPUT" },
      include: { owners: true },
    });
    await FpaAuditService.log("BUDGET_CYCLE_FPA_RETURN", user.id, {
      modelId: cycle.modelId,
      reason: comment,
      ip,
    });
    return FpaBudgetCycleService.serialize(updated);
  }

  static async cfoApprove(cycleId: string, input: any, user: any, ip?: string) {
    FpaBudgetCycleService.assertCfo(user);
    const cycle = await FpaBudgetCycleService.assertCycle(cycleId);
    if (cycle.status !== "PENDING_CFO_REVIEW") {
      throw new FpaError(409, "INVALID_TRANSITION", `Cannot cfo-approve from ${cycle.status}`);
    }
    if (cycle.workflowId) {
      await prisma.planningWorkflow.update({ where: { id: cycle.workflowId }, data: { stage: "APPROVED" } });
      await prisma.planningApproval.create({
        data: {
          workflowId: cycle.workflowId,
          actorId: user.id,
          action: "CFO_APPROVE",
          comment: input?.comment || null,
        },
      });
    }
    const updated = await prisma.planningBudgetCycle.update({
      where: { id: cycleId },
      data: {
        status: "APPROVED",
        currentStage: "LOCK",
        approvedAt: new Date(),
        approvedById: user.id,
      },
      include: { owners: true },
    });
    await FpaAuditService.log("BUDGET_CYCLE_CFO_APPROVE", user.id, { modelId: cycle.modelId, ip });
    return FpaBudgetCycleService.serialize(updated);
  }

  static async cfoReturn(cycleId: string, input: any, user: any, ip?: string) {
    FpaBudgetCycleService.assertCfo(user);
    const comment = String(input?.comment || "").trim();
    if (!comment) throw new FpaError(400, "VALIDATION", "comment is required for return");
    const cycle = await FpaBudgetCycleService.assertCycle(cycleId);
    if (cycle.status !== "PENDING_CFO_REVIEW") {
      throw new FpaError(409, "INVALID_TRANSITION", `Cannot cfo-return from ${cycle.status}`);
    }
    await FpaBudgetCycleService.reopenOwners(cycleId, null, comment, user, "CFO_RETURN");
    const updated = await prisma.planningBudgetCycle.update({
      where: { id: cycleId },
      data: { status: "RETURNED_FOR_CORRECTION", currentStage: "OWNER_INPUT" },
      include: { owners: true },
    });
    await FpaAuditService.log("BUDGET_CYCLE_CFO_RETURN", user.id, {
      modelId: cycle.modelId,
      reason: comment,
      ip,
    });
    return FpaBudgetCycleService.serialize(updated);
  }

  static async lock(cycleId: string, input: any, user: any, ip?: string) {
    FpaAccessService.assertCanLock(user);
    const cycle = await FpaBudgetCycleService.assertCycle(cycleId);
    if (!["APPROVED", "LOCKED"].includes(cycle.status)) {
      throw new FpaError(409, "INVALID_TRANSITION", `Cannot lock from ${cycle.status}; approve first`);
    }
    if (cycle.status === "LOCKED" && cycle.lockedAt) {
      return FpaBudgetCycleService.serialize(
        await prisma.planningBudgetCycle.findUnique({ where: { id: cycleId }, include: { owners: true } })
      );
    }
    await FpaVersionService.lock(cycle.versionId, user, input?.reason || "Budget cycle approved", ip);
    const updated = await prisma.planningBudgetCycle.update({
      where: { id: cycleId },
      data: {
        status: "LOCKED",
        currentStage: "LOCK",
        lockedAt: new Date(),
        lockedById: user.id,
      },
      include: { owners: true },
    });
    if (cycle.workflowId) {
      await prisma.planningWorkflow.update({
        where: { id: cycle.workflowId },
        data: { stage: "LOCKED", status: "COMPLETED" },
      });
    }
    await FpaAuditService.log("BUDGET_CYCLE_LOCK", user.id, { modelId: cycle.modelId, ip });
    return FpaBudgetCycleService.serialize(updated);
  }

  static async boardPack(cycleId: string, input: any, user: any, ip?: string) {
    FpaAccessService.assertCanApprove(user);
    const cycle = await FpaBudgetCycleService.assertCycle(cycleId);
    if (!["APPROVED", "LOCKED"].includes(cycle.status)) {
      throw new FpaError(409, "INVALID_TRANSITION", `Board pack requires APPROVED or LOCKED (got ${cycle.status})`);
    }
    const job = await FpaExportService.createBoardPack(
      {
        modelId: cycle.modelId,
        versionId: cycle.versionId,
        exportType: input?.exportType || "BOARD_PACK",
        meta: { budgetCycleId: cycleId, fiscalYear: cycle.fiscalYear, ...(input?.meta || {}) },
      },
      user.id,
      ip
    );
    const url = job.downloadUrl || job.fileUrl || `/api/v1/fpa/exports/${job.id}/download`;
    const updated = await prisma.planningBudgetCycle.update({
      where: { id: cycleId },
      data: {
        boardPackUrl: url,
        currentStage: "REPORTS",
        status: cycle.status === "APPROVED" ? "LOCKED" : cycle.status,
        lockedAt: cycle.lockedAt || new Date(),
        lockedById: cycle.lockedById || user.id,
      },
      include: { owners: true },
    });
    if (cycle.status === "APPROVED") {
      try {
        await FpaVersionService.lock(cycle.versionId, user, "Board pack — auto-lock", ip);
      } catch {
        /* already locked */
      }
    }
    await FpaAuditService.log("BUDGET_CYCLE_BOARD_PACK", user.id, { modelId: cycle.modelId, ip });
    return { url, cycle: await FpaBudgetCycleService.serialize(updated), exportJobId: job.id };
  }

  static async summary(cycleId: string) {
    const cycle = await FpaBudgetCycleService.assertCycle(cycleId);
    const cells = await prisma.planningCell.findMany({
      where: {
        modelId: cycle.modelId,
        versionId: cycle.versionId,
        ...(cycle.scenarioId ? { scenarioId: cycle.scenarioId } : {}),
      },
      include: { lineItem: true },
    });
    const byCategoryMap: Record<string, number> = {};
    for (const c of cells) {
      const cat = String(c.lineItem?.category || "GENERAL").toUpperCase();
      byCategoryMap[cat] = (byCategoryMap[cat] || 0) + Number(c.value || 0);
    }
    const owners = await prisma.planningBudgetCycleOwner.findMany({ where: { cycleId } });
    const depts = await prisma.department.findMany({
      where: { id: { in: owners.map((o) => o.departmentId) } },
    });
    const deptName = Object.fromEntries(depts.map((d) => [d.id, d.name]));
    const byDepartment = owners.map((o) => {
      const plan = cells
        .filter((c) => c.departmentId === o.departmentId)
        .reduce((s, c) => s + Number(c.value || 0), 0);
      return {
        departmentId: o.departmentId,
        name: deptName[o.departmentId] || null,
        plan,
        status: o.status,
      };
    });
    return {
      byCategory: Object.entries(byCategoryMap).map(([category, plan]) => ({
        category,
        plan,
        priorActual: null,
      })),
      byDepartment,
    };
  }

  static async reopenOwners(
    cycleId: string,
    departmentIds: string[] | null,
    comment: string,
    user: any,
    action: string
  ) {
    const cycle = await FpaBudgetCycleService.assertCycle(cycleId);
    const owners = await prisma.planningBudgetCycleOwner.findMany({ where: { cycleId } });
    const targets = departmentIds?.length
      ? owners.filter((o) => departmentIds.includes(o.departmentId))
      : owners;
    for (const o of targets) {
      if (o.taskId) {
        await prisma.planningTask.update({
          where: { id: o.taskId },
          data: { status: "RETURNED", submittedAt: null },
        });
      }
      await prisma.planningBudgetCycleOwner.update({
        where: { id: o.id },
        data: { status: "RETURNED" },
      });
    }
    if (cycle.workflowId) {
      await prisma.planningWorkflow.update({
        where: { id: cycle.workflowId },
        data: { stage: "OWNER_INPUT" },
      });
      await prisma.planningApproval.create({
        data: {
          workflowId: cycle.workflowId,
          actorId: user.id,
          action,
          comment,
        },
      });
    }
  }

  static async assertCycle(id: string) {
    const cycle = await prisma.planningBudgetCycle.findUnique({ where: { id } });
    if (!cycle) throw new FpaError(404, "NOT_FOUND", "Budget cycle not found");
    return cycle;
  }

  static async serialize(cycle: any) {
    const owners = cycle.owners || [];
    const deptIds = owners.map((o) => o.departmentId);
    const assigneeIds = owners.map((o) => o.assigneeId).filter(Boolean);
    const [depts, users] = await Promise.all([
      deptIds.length
        ? prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } })
        : [],
      assigneeIds.length
        ? prisma.user.findMany({
            where: { id: { in: assigneeIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [],
    ]);
    const deptName = Object.fromEntries(depts.map((d) => [d.id, d.name]));
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    let taskStatusById: Record<string, string> = {};
    const taskIds = owners.map((o) => o.taskId).filter(Boolean);
    if (taskIds.length) {
      const tasks = await prisma.planningTask.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, status: true },
      });
      taskStatusById = Object.fromEntries(tasks.map((t) => [t.id, t.status]));
    }

    return {
      id: cycle.id,
      name: cycle.name,
      modelId: cycle.modelId,
      versionId: cycle.versionId,
      scenarioId: cycle.scenarioId,
      workflowId: cycle.workflowId,
      fiscalYear: cycle.fiscalYear,
      status: cycle.status,
      currentStage: cycle.currentStage,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      owners: owners.map((o) => ({
        departmentId: o.departmentId,
        departmentName: deptName[o.departmentId] || null,
        assigneeId: o.assigneeId,
        assigneeName: userDisplayName(userMap[o.assigneeId]),
        taskId: o.taskId,
        status: o.status === "PENDING" && taskStatusById[o.taskId] === "SUBMITTED" ? "SUBMITTED" : mapOwnerStatus(o, taskStatusById),
        categories: asStringArray(o.categoriesJson),
      })),
      inputCategories: asStringArray(cycle.inputCategoriesJson),
      lockedAt: cycle.lockedAt,
      approvedAt: cycle.approvedAt,
      boardPackUrl: cycle.boardPackUrl,
      createdAt: cycle.createdAt,
    };
  }
}

function mapOwnerStatus(o: any, taskStatusById: Record<string, string>) {
  const ts = o.taskId ? taskStatusById[o.taskId] : null;
  if (ts === "SUBMITTED") return "SUBMITTED";
  if (ts === "RETURNED") return "RETURNED";
  if (ts === "APPROVED") return "APPROVED";
  if (ts === "PENDING" && o.status === "PENDING") return "IN_PROGRESS";
  return o.status || "IN_PROGRESS";
}
