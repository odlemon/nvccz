// @ts-nocheck
import { prisma } from "../../utils/database";

async function sumByCode(
  modelId: string,
  versionId: string | null,
  codes: string[],
  scenarioId?: string | null
) {
  const lineItems = await prisma.planningLineItem.findMany({
    where: { modelId, code: { in: codes } },
  });
  const idToCode = Object.fromEntries(lineItems.map((l) => [l.id, l.code]));
  const where: any = { modelId, lineItemId: { in: lineItems.map((l) => l.id) } };
  if (versionId) where.versionId = versionId;
  if (scenarioId) where.scenarioId = scenarioId;
  const cells = await prisma.planningCell.findMany({ where });
  const sums: Record<string, number> = {};
  for (const c of codes) sums[c] = 0;
  for (const cell of cells) {
    const code = idToCode[cell.lineItemId];
    if (code) sums[code] += Number(cell.value || 0);
  }
  return sums;
}

async function monthlyByCodes(
  modelId: string,
  versionId: string | null,
  codes: string[],
  scenarioId?: string | null
) {
  const lineItems = await prisma.planningLineItem.findMany({
    where: { modelId, code: { in: codes } },
  });
  const idToCode = Object.fromEntries(lineItems.map((l) => [l.id, l.code]));
  const where: any = { modelId, lineItemId: { in: lineItems.map((l) => l.id) } };
  if (versionId) where.versionId = versionId;
  if (scenarioId) where.scenarioId = scenarioId;
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
    const expense = byPeriod[period].OPEX || byPeriod[period].EXPENSE || Math.max(0, revenue - ebitda);
    return {
      period,
      opening: null as number | null,
      inflows: Math.max(0, revenue),
      outflows: Math.max(0, expense),
      closing,
      revenue,
      ebitda,
      expense,
    };
  });
  for (let i = 0; i < cashByMonth.length; i++) {
    cashByMonth[i].opening = i === 0 ? null : cashByMonth[i - 1].closing;
  }
  return { periods, sparklines, cashByMonth, byPeriod };
}

function userDisplayName(u: any): string | null {
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email || null;
}

function pctDelta(current: number, prior: number): number | null {
  if (!Number.isFinite(prior) || prior === 0) return null;
  return Number((((current - prior) / Math.abs(prior)) * 100).toFixed(1));
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
        revenueExpenseTrend: [],
        workflowProgress: [],
        workflowStatusSlices: [],
        openTasks: [],
        scenarioCompare: { scenarios: [], metrics: [] },
        overBudgetDepartments: [],
        cashRunway: null,
        recentActivity: [],
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
    const scenarioId = query.scenarioId ? String(query.scenarioId) : null;
    const cycleId = query.cycleId ? String(query.cycleId) : null;

    const codes = ["REVENUE", "EBITDA", "CLOSING_CASH", "OPEX", "EXPENSE"];
    const sums = await sumByCode(model.id, versionId, codes, scenarioId);
    const { sparklines, cashByMonth, byPeriod, periods } = await monthlyByCodes(
      model.id,
      versionId,
      codes,
      scenarioId
    );

    const revenue = sums.REVENUE || 0;
    const ebitda = sums.EBITDA || 0;
    const closingCash = sums.CLOSING_CASH || 0;
    const opex = sums.OPEX || sums.EXPENSE || 0;
    const monthlyBurn = Math.max(0, -Number(ebitda || 0) / 12) || Math.max(0, opex / Math.max(1, periods.length));
    const runwayMonths =
      monthlyBurn > 0 ? Number((closingCash / monthlyBurn).toFixed(1)) : null;

    // Prior half of series for deltas (honest; null when thin)
    const revSpark = sparklines.REVENUE || [];
    const mid = Math.floor(revSpark.length / 2);
    const priorRev = mid > 0 ? revSpark.slice(0, mid).reduce((a, b) => a + b, 0) : 0;
    const curRev = mid > 0 ? revSpark.slice(mid).reduce((a, b) => a + b, 0) : revenue;

    // Forecast accuracy from variance results when present
    let forecastAccuracy: number | null = null;
    const varRows = await prisma.planningVarianceResult.findMany({
      where: { modelId: model.id },
      take: 200,
      orderBy: { createdAt: "desc" },
    });
    if (varRows.length) {
      const withPlan = varRows.filter((v) => Number(v.planValue || 0) !== 0);
      if (withPlan.length) {
        const mape =
          withPlan.reduce((s, v) => s + Math.abs(Number(v.variancePercent || 0)), 0) / withPlan.length;
        forecastAccuracy = Number(Math.max(0, 100 - mape).toFixed(1));
      }
    }

    const revenueExpenseTrend = periods.map((period) => ({
      period,
      revenue: byPeriod[period]?.REVENUE || 0,
      expense: byPeriod[period]?.OPEX || byPeriod[period]?.EXPENSE || 0,
      ebitda: byPeriod[period]?.EBITDA || 0,
    }));

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

    // Status donut: MPC cycles for model (+ optional focus cycle)
    const mpcWhere: any = { sourceModelId: model.id };
    if (cycleId) mpcWhere.id = cycleId;
    const mpcCycles = await prisma.modelPlanningCycle.findMany({
      where: { sourceModelId: model.id },
      select: { id: true, name: true, status: true, currentStage: true },
    });
    const statusCounts: Record<string, number> = {};
    for (const c of mpcCycles) {
      const st = String(c.status || "UNKNOWN").toUpperCase();
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    }
    const workflowStatusSlices = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    }));

    let activeCycle = null;
    if (cycleId) {
      activeCycle = mpcCycles.find((c) => c.id === cycleId) || null;
    } else if (mpcCycles.length) {
      activeCycle =
        mpcCycles.find((c) => ["OPEN", "SUBMITTED", "UNDER_REVIEW"].includes(String(c.status))) ||
        mpcCycles[0];
    }

    const taskWhere: any = {
      workflow: { modelId: model.id },
      status: { in: ["PENDING", "OPEN", "RETURNED", "SUBMITTED", "IN_PROGRESS"] },
    };
    if (userId) taskWhere.OR = [{ assigneeId: userId }, { assigneeId: null }];
    const openTasksRaw = await prisma.planningTask.findMany({
      where: taskWhere,
      take: 20,
      orderBy: { dueDate: "asc" },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
        workflow: { select: { id: true, name: true, stage: true } },
      },
    });
    const ownerSliceTaskIds = new Set(
      (
        await prisma.modelPlanningCycleOwner.findMany({
          where: { cycle: { sourceModelId: model.id }, taskId: { not: null } },
          select: { taskId: true },
        })
      )
        .map((o) => o.taskId)
        .filter(Boolean)
    );
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
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
      priority: t.priority,
      departmentId: t.departmentId,
      departmentName: t.departmentId ? openDeptName[t.departmentId] || null : null,
      assigneeId: t.assigneeId,
      assigneeName: userDisplayName(t.assignee),
      workflowId: t.workflowId,
      cycleId: activeCycle?.id || cycleId || null,
      taskKind: ownerSliceTaskIds.has(t.id) ? "OWNER_SLICE" : "PLANNING",
    }));

    const scenarios = await prisma.planningScenario.findMany({
      where: { modelId: model.id, status: { not: "ARCHIVED" } },
      take: 6,
      orderBy: { createdAt: "asc" },
    });
    const metricCodes = [
      { key: "revenue", code: "REVENUE", label: "Revenue" },
      { key: "ebitda", code: "EBITDA", label: "EBITDA" },
      { key: "cash", code: "CLOSING_CASH", label: "Closing cash" },
    ];
    const scenarioPayload = [];
    for (const s of scenarios) {
      const sSums = await sumByCode(model.id, versionId, ["REVENUE", "EBITDA", "CLOSING_CASH"], s.id);
      scenarioPayload.push({
        id: s.id,
        name: s.name,
        scenarioType: s.scenarioType,
        revenue: sSums.REVENUE || 0,
        ebitda: sSums.EBITDA || 0,
        cash: sSums.CLOSING_CASH || 0,
      });
    }
    const anchor = scenarioId
      ? scenarioPayload.find((s) => s.id === scenarioId) || scenarioPayload[0]
      : scenarioPayload[0];
    const metrics = metricCodes.map((m) => {
      const anchorVal = anchor ? Number(anchor[m.key] || 0) : 0;
      return {
        key: m.key,
        label: m.label,
        values: scenarioPayload.map((s) => {
          const v = Number(s[m.key] || 0);
          const varianceAbs = v - anchorVal;
          const variancePct =
            anchorVal !== 0 ? Number(((varianceAbs / Math.abs(anchorVal)) * 100).toFixed(1)) : null;
          return { scenarioId: s.id, scenarioName: s.name, value: v, varianceAbs, variancePct };
        }),
      };
    });
    const scenarioCompare = {
      anchorScenarioId: anchor?.id || null,
      scenarios: scenarioPayload,
      metrics,
      // legacy pair for older FE
      left: scenarioPayload[0]
        ? {
            id: scenarioPayload[0].id,
            name: scenarioPayload[0].name,
            revenue: scenarioPayload[0].revenue,
            ebitda: scenarioPayload[0].ebitda,
          }
        : null,
      right: scenarioPayload[1]
        ? {
            id: scenarioPayload[1].id,
            name: scenarioPayload[1].name,
            revenue: scenarioPayload[1].revenue,
            ebitda: scenarioPayload[1].ebitda,
          }
        : null,
    };

    const overBudgetDepartments = [];
    const deptCells = await prisma.planningCell.findMany({
      where: {
        modelId: model.id,
        ...(versionId ? { versionId } : {}),
        ...(scenarioId ? { scenarioId } : {}),
        departmentId: { not: null },
      },
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

    const cycleOwners = await prisma.modelPlanningCycleOwner.findMany({
      where: { cycle: { sourceModelId: model.id } },
      select: { departmentId: true, assigneeId: true },
      take: 100,
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
    const recentActivity = auditRows.map((a) => ({
      at: a.createdAt,
      userId: a.userId,
      userName: a.user
        ? [a.user.firstName, a.user.lastName].filter(Boolean).join(" ") || a.user.email
        : null,
      action: a.actionType,
      entityType: a.cellId ? "cell" : a.versionId ? "version" : a.scenarioId ? "scenario" : "model",
      entityId: a.cellId || a.versionId || a.scenarioId || a.modelId,
    }));

    const cashRunway = {
      closingCash,
      runwayMonths,
      monthlyBurn: monthlyBurn || null,
      byMonth: cashByMonth.map((r) => ({ period: r.period, closing: r.closing })),
    };

    return {
      model: {
        id: model.id,
        name: model.name,
        status: model.status,
        ownerName: userDisplayName(model.owner),
        ownerAvatarUrl: model.owner?.backgroundImage || null,
      },
      versionId,
      scenarioId,
      cycleId: activeCycle?.id || cycleId || null,
      activeCycle: activeCycle
        ? {
            id: activeCycle.id,
            name: activeCycle.name,
            status: activeCycle.status,
            currentStage: activeCycle.currentStage,
          }
        : null,
      kpis: {
        revenue,
        ebitda,
        closingCash,
        cash: closingCash,
        runwayMonths,
        forecastAccuracy,
        revenueDeltaPct: pctDelta(curRev, priorRev),
        ebitdaDeltaPct: null,
        sparklines: {
          revenue: sparklines.REVENUE || [],
          ebitda: sparklines.EBITDA || [],
          closingCash: sparklines.CLOSING_CASH || [],
          headcount: [],
        },
      },
      revenueExpenseTrend,
      cashByMonth,
      cashRunway,
      workflowProgress,
      workflowStatusSlices,
      openTasks,
      scenarioCompare,
      overBudgetDepartments,
      recentActivity,
      activity: recentActivity,
    };
  }
}
