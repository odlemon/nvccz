// @ts-nocheck
/**
 * Rolling forecast summary + cutoff/method/roll-forward for sidebar Forecasts tab.
 */
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";

const METHODS = [
  { code: "DRIVER", label: "Driver-based" },
  { code: "RUN_RATE", label: "Run-rate" },
  { code: "GROWTH", label: "Growth" },
];

function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function iso(d: Date | null | undefined) {
  if (!d) return null;
  return monthStart(new Date(d)).toISOString().slice(0, 10);
}

async function loadSettings(modelId: string, versionId: string | null) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM fpa_rolling_forecast_settings WHERE model_id = ? AND (version_id <=> ?) LIMIT 1`,
    modelId,
    versionId
  );
  return rows[0] || null;
}

async function upsertSettings(
  modelId: string,
  versionId: string | null,
  data: {
    actualsCutoff?: Date | null;
    forecastStart?: Date | null;
    horizonMonths?: number | null;
    activeMethod?: string | null;
  },
  userId: string
) {
  const existing = await loadSettings(modelId, versionId);
  if (existing) {
    await prisma.$executeRawUnsafe(
      `UPDATE fpa_rolling_forecast_settings SET
        actuals_cutoff = COALESCE(?, actuals_cutoff),
        forecast_start = COALESCE(?, forecast_start),
        horizon_months = COALESCE(?, horizon_months),
        active_method = COALESCE(?, active_method),
        updated_by = ?,
        updated_at = NOW(3)
       WHERE id = ?`,
      data.actualsCutoff || null,
      data.forecastStart || null,
      data.horizonMonths ?? null,
      data.activeMethod || null,
      userId,
      existing.id
    );
    return loadSettings(modelId, versionId);
  }
  const id = `rfs_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO fpa_rolling_forecast_settings
      (id, model_id, version_id, actuals_cutoff, forecast_start, horizon_months, active_method, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
    id,
    modelId,
    versionId,
    data.actualsCutoff || null,
    data.forecastStart || null,
    data.horizonMonths ?? 12,
    data.activeMethod || "DRIVER",
    userId,
    userId
  );
  return loadSettings(modelId, versionId);
}

export class FpaRollingForecastService {
  static async get(modelId: string, query: any = {}) {
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");

    let versionId = query.versionId ? String(query.versionId) : null;
    const scenarioId = query.scenarioId ? String(query.scenarioId) : null;
    const cycleId = query.cycleId ? String(query.cycleId) : null;

    if (!versionId) {
      const v = await prisma.planningVersion.findFirst({
        where: { modelId, status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "desc" },
      });
      versionId = v?.id || null;
    }

    let settings = await loadSettings(modelId, versionId);
    let actualsCutoff = settings?.actuals_cutoff ? new Date(settings.actuals_cutoff) : null;
    let forecastStart = settings?.forecast_start ? new Date(settings.forecast_start) : null;
    let horizonMonths = settings?.horizon_months != null ? Number(settings.horizon_months) : 12;
    let activeMethod = settings?.active_method || "DRIVER";

    if (cycleId) {
      const cycle = await prisma.modelPlanningCycle.findUnique({ where: { id: cycleId } });
      if (cycle) {
        if (cycle.actualsCutoffPeriod) actualsCutoff = new Date(cycle.actualsCutoffPeriod);
        if (cycle.forecastStartPeriod) forecastStart = new Date(cycle.forecastStartPeriod);
        if (cycle.planningHorizon != null) horizonMonths = Number(cycle.planningHorizon);
        versionId = versionId || cycle.sourceModelVersionId;
      }
    }

    if (!actualsCutoff) {
      const lastActual = await prisma.planningActualsSnapshot.findFirst({
        where: { modelId },
        orderBy: { periodDate: "desc" },
      });
      actualsCutoff = lastActual?.periodDate
        ? monthStart(new Date(lastActual.periodDate))
        : monthStart(addMonths(new Date(), -1));
    }
    if (!forecastStart) forecastStart = addMonths(actualsCutoff, 1);

    const lineItems = await prisma.planningLineItem.findMany({
      where: { modelId, code: { in: ["REVENUE", "EBITDA", "CLOSING_CASH"] } },
    });
    const byCode = Object.fromEntries(lineItems.map((l) => [l.id, l.code]));
    const cellWhere: any = { modelId, lineItemId: { in: lineItems.map((l) => l.id) } };
    if (versionId) cellWhere.versionId = versionId;
    if (scenarioId) cellWhere.scenarioId = scenarioId;
    const cells = lineItems.length ? await prisma.planningCell.findMany({ where: cellWhere }) : [];
    const actuals = await prisma.planningActualsSnapshot.findMany({
      where: { modelId, lineItemId: { in: lineItems.map((l) => l.id) } },
    });

    const sums: Record<string, number> = { REVENUE: 0, EBITDA: 0, CLOSING_CASH: 0 };
    for (const c of cells) {
      const code = byCode[c.lineItemId];
      if (code) sums[code] += Number(c.value || 0);
    }
    const monthlyBurn = Math.max(0, -sums.EBITDA / 12);
    const runwayMonths =
      monthlyBurn > 0 ? Number((sums.CLOSING_CASH / monthlyBurn).toFixed(1)) : null;

    const periodSet = new Set<string>();
    for (const c of cells) periodSet.add(iso(c.periodDate)!);
    for (const a of actuals) periodSet.add(iso(a.periodDate)!);
    const periods = [...periodSet].sort();
    const cutoffIso = iso(actualsCutoff)!;
    const trend = periods.map((period) => {
      const isActual = period <= cutoffIso;
      const revCells = cells.filter(
        (c) => byCode[c.lineItemId] === "REVENUE" && iso(c.periodDate) === period
      );
      const revAct = actuals
        .filter((a) => byCode[a.lineItemId] === "REVENUE" && iso(a.periodDate) === period)
        .reduce((s, a) => s + Number(a.amount || 0), 0);
      const revFc = revCells.reduce((s, c) => s + Number(c.value || 0), 0);
      return {
        period,
        actual: isActual ? revAct || revFc || null : null,
        forecast: !isActual ? revFc || null : null,
      };
    });

    const methods = METHODS.map((m) => {
      const factor = m.code === "GROWTH" ? 1.05 : m.code === "RUN_RATE" ? 0.98 : 1;
      return {
        code: m.code,
        label: m.label,
        revenue: Number((sums.REVENUE * factor).toFixed(2)),
        ebitda: Number((sums.EBITDA * factor).toFixed(2)),
        cash: Number((sums.CLOSING_CASH * factor).toFixed(2)),
      };
    });

    // Accuracy from variance if any
    let accuracyPct: number | null = null;
    const varRows = await prisma.planningVarianceResult.findMany({
      where: { modelId },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    if (varRows.length) {
      const mape =
        varRows.reduce((s, v) => s + Math.abs(Number(v.variancePercent || 0)), 0) / varRows.length;
      accuracyPct = Number(Math.max(0, 100 - mape).toFixed(1));
    }

    return {
      modelId,
      versionId,
      scenarioId,
      cycleId,
      actualsCutoff: cutoffIso,
      forecastStart: iso(forecastStart),
      horizonMonths,
      activeMethod,
      kpis: {
        revenue: sums.REVENUE,
        ebitda: sums.EBITDA,
        cash: sums.CLOSING_CASH,
        runwayMonths,
        accuracyPct,
      },
      trend,
      methods,
    };
  }

  static async setCutoff(modelId: string, body: any, user: any, ip?: string) {
    if (!FpaAccessService.canEdit(user)) {
      throw new FpaError(403, "FORBIDDEN", "No edit permission");
    }
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");

    const versionId = body.versionId ? String(body.versionId) : null;
    const cycleId = body.cycleId ? String(body.cycleId) : null;
    const actualsCutoff = body.actualsCutoff ? monthStart(new Date(body.actualsCutoff)) : null;
    const horizonMonths =
      body.horizonMonths != null ? Math.max(1, Math.min(60, Number(body.horizonMonths))) : null;
    if (actualsCutoff && horizonMonths) {
      const end = addMonths(actualsCutoff, horizonMonths);
      if (end <= actualsCutoff) {
        throw new FpaError(400, "INVALID_CUTOFF", "Cutoff must be before horizon end");
      }
    }
    const forecastStart = actualsCutoff ? addMonths(actualsCutoff, 1) : null;

    if (cycleId) {
      const cycle = await prisma.modelPlanningCycle.findUnique({ where: { id: cycleId } });
      if (!cycle || cycle.sourceModelId !== modelId) {
        throw new FpaError(404, "NOT_FOUND", "Cycle not found for model");
      }
      await prisma.modelPlanningCycle.update({
        where: { id: cycleId },
        data: {
          ...(actualsCutoff ? { actualsCutoffPeriod: actualsCutoff } : {}),
          ...(forecastStart ? { forecastStartPeriod: forecastStart } : {}),
          ...(horizonMonths != null ? { planningHorizon: horizonMonths } : {}),
          updatedById: user.id,
        },
      });
    }

    await upsertSettings(
      modelId,
      versionId,
      { actualsCutoff, forecastStart, horizonMonths },
      user.id
    );
    await FpaAuditService.log("ROLLING_FORECAST_CUTOFF", user.id, {
      modelId,
      versionId,
      reason: body.actualsCutoff || null,
      ip,
    });
    return FpaRollingForecastService.get(modelId, { versionId, cycleId, scenarioId: body.scenarioId });
  }

  static async setMethod(modelId: string, body: any, user: any, ip?: string) {
    if (!FpaAccessService.canEdit(user)) {
      throw new FpaError(403, "FORBIDDEN", "No edit permission");
    }
    const method = String(body.method || "").toUpperCase();
    if (!METHODS.some((m) => m.code === method)) {
      throw new FpaError(400, "VALIDATION", `method must be one of ${METHODS.map((m) => m.code).join(", ")}`);
    }
    const versionId = body.versionId ? String(body.versionId) : null;
    const version = versionId
      ? await prisma.planningVersion.findUnique({ where: { id: versionId } })
      : null;
    if (version && String(version.status).toUpperCase() === "LOCKED") {
      throw new FpaError(403, "LOCKED_VERSION", "Version is locked");
    }
    await upsertSettings(modelId, versionId, { activeMethod: method }, user.id);
    await FpaAuditService.log("ROLLING_FORECAST_METHOD", user.id, { modelId, versionId, reason: method, ip });
    return FpaRollingForecastService.get(modelId, { versionId, scenarioId: body.scenarioId });
  }

  static async rollForward(modelId: string, body: any, user: any, ip?: string) {
    if (!FpaAccessService.canEdit(user)) {
      throw new FpaError(403, "FORBIDDEN", "No edit permission");
    }
    const versionId = body.versionId ? String(body.versionId) : null;
    const months = Math.max(1, Math.min(12, Number(body.months || 1)));
    const version = versionId
      ? await prisma.planningVersion.findUnique({ where: { id: versionId } })
      : null;
    if (version && String(version.status).toUpperCase() === "LOCKED") {
      throw new FpaError(403, "LOCKED_VERSION", "Version is locked");
    }

    const settings = await loadSettings(modelId, versionId);
    let cutoff = settings?.actuals_cutoff
      ? monthStart(new Date(settings.actuals_cutoff))
      : monthStart(addMonths(new Date(), -1));
    cutoff = addMonths(cutoff, months);
    const forecastStart = addMonths(cutoff, 1);
    const horizon =
      settings?.horizon_months != null ? Number(settings.horizon_months) : Number(body.horizonMonths || 12);

    await upsertSettings(
      modelId,
      versionId,
      { actualsCutoff: cutoff, forecastStart, horizonMonths: horizon },
      user.id
    );

    if (body.cycleId) {
      await prisma.modelPlanningCycle.update({
        where: { id: String(body.cycleId) },
        data: {
          actualsCutoffPeriod: cutoff,
          forecastStartPeriod: forecastStart,
          updatedById: user.id,
        },
      });
    }

    await FpaAuditService.log("ROLLING_FORECAST_ROLL_FORWARD", user.id, {
      modelId,
      versionId,
      reason: `+${months}m`,
      ip,
    });
    return FpaRollingForecastService.get(modelId, {
      versionId,
      cycleId: body.cycleId,
      scenarioId: body.scenarioId,
    });
  }
}
