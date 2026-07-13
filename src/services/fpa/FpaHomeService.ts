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

async function monthlySeries(modelId: string, versionId: string | null, codes: string[]) {
  const lineItems = await prisma.planningLineItem.findMany({
    where: { modelId, code: { in: codes } },
  });
  const idToCode = Object.fromEntries(lineItems.map((l) => [l.id, l.code]));
  const where: any = { modelId, lineItemId: { in: lineItems.map((l) => l.id) } };
  if (versionId) where.versionId = versionId;
  const cells = await prisma.planningCell.findMany({
    where,
    orderBy: { periodDate: "asc" },
  });
  const byPeriod: Record<string, Record<string, number>> = {};
  for (const cell of cells) {
    const key = new Date(cell.periodDate).toISOString().slice(0, 10);
    const code = idToCode[cell.lineItemId];
    if (!code) continue;
    if (!byPeriod[key]) byPeriod[key] = Object.fromEntries(codes.map((c) => [c, 0]));
    byPeriod[key][code] += Number(cell.value || 0);
  }
  const periods = Object.keys(byPeriod).sort();
  const sparklines: Record<string, number[]> = {};
  for (const c of codes) sparklines[c] = periods.map((p) => byPeriod[p][c] || 0);
  const cashByMonth = periods.map((period) => {
    const closing = byPeriod[period].CLOSING_CASH || 0;
    const revenue = byPeriod[period].REVENUE || 0;
    const ebitda = byPeriod[period].EBITDA || 0;
    // Approximate: treat positive ebitda as net inflow contribution when cash line missing detail
    const inflows = Math.max(0, revenue);
    const outflows = Math.max(0, revenue - ebitda);
    return {
      period,
      opening: null as number | null,
      inflows,
      outflows,
      closing,
      revenue,
      ebitda,
    };
  });
  // Fill opening as prior closing
  for (let i = 0; i < cashByMonth.length; i++) {
    cashByMonth[i].opening = i === 0 ? null : cashByMonth[i - 1].closing;
  }
  return { periods, sparklines, cashByMonth };
}

function userDisplayName(u: any): string | null {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || null;
}

export class FpaHomeService {
  static async dashboard(query: any = {}, userId?: string) {
    const modelId = query.modelId;
    let model = null;
    if (modelId) {
      model = await prisma.planningModel.findUnique({
        where: { id: modelId },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true, email: true, backgroundImage: true } },
        },
      });
    } else {
      model = await prisma.planningModel.findFirst({
        where: { status: { not: "ARCHIVED" } },
        orderBy: { updatedAt: "desc" },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true, email: true, backgroundImage: true } },
        },
      });
    }

    if (!model) {
      return {
        kpis: null,
        workflowProgress: [],
        openTasks: [],
        scenarioCompare: null,
        overBudgetDepartments: [],
        activity: [],
        cashByMonth: [],
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

    const { sparklines, cashByMonth } = await monthlySeries(model.id, versionId, [
      "REVENUE",
      "EBITDA",
      "CLOSING_CASH",
    ]);

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

    const openTasksRaw = await prisma.planningTask.findMany({
      where: {
        workflow: { modelId: model.id },
        status: { in: ["PENDING", "RETURNED", "SUBMITTED"] },
        ...(userId ? { OR: [{ assigneeId: userId }, { assigneeId: null }] } : {}),
      },
      take: 20,
      orderBy: { dueDate: "asc" },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
        workflow: { select: { id: true, name: true, stage: true } },
      },
    });
    const openDeptIds = [
      ...new Set(openTasksRaw.map((t) => t.departmentId).filter(Boolean)),
    ] as string[];
    const openDepts = openDeptIds.length
      ? await prisma.department.findMany({
          where: { id: { in: openDeptIds } },
          select: { id: true, name: true },
        })
      : [];
    const openDeptName = Object.fromEntries(openDepts.map((d) => [d.id, d.name]));
    const openTasks = openTasksRaw.map((t) => ({
      ...t,
      departmentName: t.departmentId ? openDeptName[t.departmentId] || null : null,
      department: t.departmentId ? openDeptName[t.departmentId] || null : null,
      assigneeName: userDisplayName(t.assignee),
    }));

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

    // Owner names from active budget-cycle owners for this model
    const cycleOwners = await prisma.planningBudgetCycleOwner.findMany({
      where: { cycle: { modelId: model.id, status: { not: "LOCKED" } } },
      select: { departmentId: true, assigneeId: true },
    });
    const ownerUserIds = [...new Set(cycleOwners.map((o) => o.assigneeId).filter(Boolean))];
    const ownerUsers = ownerUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: ownerUserIds as string[] } },
          select: { id: true, firstName: true, lastName: true, email: true, backgroundImage: true },
        })
      : [];
    const ownerById = Object.fromEntries(ownerUsers.map((u) => [u.id, u]));
    const ownerByDept: Record<string, any> = {};
    for (const o of cycleOwners) {
      if (o.assigneeId && ownerById[o.assigneeId]) ownerByDept[o.departmentId] = ownerById[o.assigneeId];
    }

    for (const [departmentId, vals] of Object.entries(byDept)) {
      if (vals.actual > vals.plan && vals.plan > 0) {
        const owner = ownerByDept[departmentId];
        overBudgetDepartments.push({
          departmentId,
          departmentName: deptNameById[departmentId] || null,
          ownerName: userDisplayName(owner),
          ownerAvatarUrl: owner?.backgroundImage || null,
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
      model: {
        id: model.id,
        name: model.name,
        status: model.status,
        ownerName: userDisplayName(model.owner),
        ownerAvatarUrl: model.owner?.backgroundImage || null,
      },
      versionId,
      kpis: {
        revenue: sums.REVENUE || 0,
        ebitda: sums.EBITDA || 0,
        closingCash: sums.CLOSING_CASH || 0,
        runwayMonths,
        sparklines: {
          revenue: sparklines.REVENUE || [],
          ebitda: sparklines.EBITDA || [],
          closingCash: sparklines.CLOSING_CASH || [],
        },
      },
      cashByMonth,
      workflowProgress,
      openTasks,
      scenarioCompare,
      overBudgetDepartments,
      activity,
    };
  }
}
