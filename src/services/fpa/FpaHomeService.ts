// @ts-nocheck
import { prisma } from "../../utils/database";

async function sumByCode(modelId: string, versionId: string | null, codes: string[]) {
  const lineItems = await prisma.planningLineItem.findMany({
    where: { modelId, code: { in: codes } },
  });
  const idToCode = Object.fromEntries(lineItems.map((l) => [l.id, l.code]));
  const where: any = { modelId, lineItemId: { in: lineItems.map((l) => l.id) } };
  if (versionId) where.versionId = versionId;
  const cells = await prisma.planningCell.findMany({ where });
  const sums: Record<string, number> = {};
  for (const c of codes) sums[c] = 0;
  for (const cell of cells) {
    const code = idToCode[cell.lineItemId];
    if (code) sums[code] += Number(cell.value || 0);
  }
  return sums;
}

export class FpaHomeService {
  static async dashboard(query: any = {}, userId?: string) {
    const modelId = query.modelId;
    let model = null;
    if (modelId) {
      model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    } else {
      model = await prisma.planningModel.findFirst({
        where: { status: { not: "ARCHIVED" } },
        orderBy: { updatedAt: "desc" },
      });
    }

    if (!model) {
      return {
        kpis: null,
        workflowProgress: [],
        openTasks: [],
        scenarioCompare: null,
        overBudgetDepartments: [],
        message: "No planning models yet",
      };
    }

    const working = await prisma.planningVersion.findFirst({
      where: { modelId: model.id, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
    });
    const versionId = query.versionId || working?.id || null;
    const sums = await sumByCode(model.id, versionId, ["REVENUE", "EBITDA", "CLOSING_CASH"]);
    const monthlyBurn = Math.max(0, -Number(sums.EBITDA || 0) / 12);
    const runwayMonths =
      monthlyBurn > 0 ? Number((Number(sums.CLOSING_CASH || 0) / monthlyBurn).toFixed(1)) : null;

    const workflows = await prisma.planningWorkflow.findMany({
      where: { modelId: model.id, status: "ACTIVE" },
      include: { tasks: true },
    });
    const workflowProgress = workflows.map((w) => {
      const total = w.tasks.length || 1;
      const done = w.tasks.filter((t) => ["APPROVED", "COMPLETED"].includes(t.status)).length;
      return {
        id: w.id,
        name: w.name,
        stage: w.stage,
        completedTasks: done,
        totalTasks: w.tasks.length,
        percent: Math.round((done / total) * 100),
      };
    });

    const openTasks = await prisma.planningTask.findMany({
      where: {
        workflow: { modelId: model.id },
        status: { in: ["PENDING", "RETURNED", "SUBMITTED"] },
        ...(userId ? { OR: [{ assigneeId: userId }, { assigneeId: null }] } : {}),
      },
      take: 20,
      orderBy: { dueDate: "asc" },
    });

    const scenarios = await prisma.planningScenario.findMany({
      where: { modelId: model.id },
      take: 2,
      orderBy: { createdAt: "asc" },
    });
    let scenarioCompare = null;
    if (scenarios.length >= 2 && versionId) {
      const [a, b] = scenarios;
      const cellsA = await prisma.planningCell.findMany({
        where: { modelId: model.id, versionId, scenarioId: a.id },
        include: { lineItem: true },
      });
      const cellsB = await prisma.planningCell.findMany({
        where: { modelId: model.id, versionId, scenarioId: b.id },
        include: { lineItem: true },
      });
      const pick = (cells, code) =>
        cells.filter((c) => c.lineItem?.code === code).reduce((s, c) => s + Number(c.value || 0), 0);
      scenarioCompare = {
        left: { id: a.id, name: a.name, revenue: pick(cellsA, "REVENUE"), ebitda: pick(cellsA, "EBITDA") },
        right: { id: b.id, name: b.name, revenue: pick(cellsB, "REVENUE"), ebitda: pick(cellsB, "EBITDA") },
      };
    }

    const overBudgetDepartments = [];
    const deptCells = await prisma.planningCell.findMany({
      where: { modelId: model.id, ...(versionId ? { versionId } : {}), departmentId: { not: null } },
      include: { lineItem: true },
    });
    const byDept: Record<string, { plan: number; actual: number }> = {};
    for (const c of deptCells) {
      if (!c.departmentId) continue;
      if (!byDept[c.departmentId]) byDept[c.departmentId] = { plan: 0, actual: 0 };
      const v = Number(c.value || 0);
      if (c.sourceType === "ACTUAL") byDept[c.departmentId].actual += v;
      else byDept[c.departmentId].plan += v;
    }
    const deptIds = Object.keys(byDept);
    const depts = deptIds.length
      ? await prisma.department.findMany({
          where: { id: { in: deptIds } },
          select: { id: true, name: true },
        })
      : [];
    const deptNameById = Object.fromEntries(depts.map((d) => [d.id, d.name]));
    for (const [departmentId, vals] of Object.entries(byDept)) {
      if (vals.actual > vals.plan && vals.plan > 0) {
        overBudgetDepartments.push({
          departmentId,
          departmentName: deptNameById[departmentId] || null,
          plan: vals.plan,
          actual: vals.actual,
          overBy: vals.actual - vals.plan,
        });
      }
    }

    const auditRows = await prisma.planningAuditLog.findMany({
      where: { modelId: model.id },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    const activity = auditRows.map((a) => ({
      at: a.createdAt,
      userId: a.userId,
      userName: a.user
        ? [a.user.firstName, a.user.lastName].filter(Boolean).join(" ") || a.user.email
        : null,
      action: a.actionType,
      entityType: a.cellId ? "cell" : a.versionId ? "version" : a.scenarioId ? "scenario" : "model",
      entityId: a.cellId || a.versionId || a.scenarioId || a.modelId,
    }));

    return {
      model: { id: model.id, name: model.name, status: model.status },
      versionId,
      kpis: {
        revenue: sums.REVENUE || 0,
        ebitda: sums.EBITDA || 0,
        closingCash: sums.CLOSING_CASH || 0,
        runwayMonths,
      },
      workflowProgress,
      openTasks,
      scenarioCompare,
      overBudgetDepartments,
      activity,
    };
  }
}
