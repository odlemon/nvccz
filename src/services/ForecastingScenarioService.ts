// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import {
  accountNoInRange,
  FORECAST_ERROR_CODES,
  FORECAST_GRANULARITIES,
  parseCoaRangePreset
} from "../constants/forecastingEngine";
import { buildPeriodKeys, monthsBetweenInclusive, validateHorizonMonths } from "../utils/forecastPeriodUtils";
import { ForecastingAccessService } from "./ForecastingAccessService";
import { ForecastingAuditService } from "./ForecastingAuditService";
import { ForecastingError } from "./ForecastingError";
import { formatForecastUserName } from "../utils/forecastUserDisplay";

function parseDateOnly(v: string | Date): Date {
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  const d = new Date(v);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export class ForecastingScenarioService {
  /** Strip internal fields and add entity_id to the public response. */
  static omitInternalFields<T extends Record<string, unknown>>(row: T): T {
    const { companyProfileId, ...rest } = row as any;
    return rest;
  }

  static async create(input: {
    name: string;
    description?: string;
    entityId?: string;
    fundId?: string;
    baseCurrency: string;
    horizonStartDate: string;
    horizonEndDate: string;
    granularity: string;
    dimensions?: Array<{ type: string; value_id: string; range_start?: number; range_end?: number }>;
    userId: string;
  }) {
    if (!FORECAST_GRANULARITIES.includes(input.granularity as any)) {
      throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_HORIZON, "Invalid granularity", 400);
    }
    const start = parseDateOnly(input.horizonStartDate);
    const end = parseDateOnly(input.horizonEndDate);
    if (end < start) {
      throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_HORIZON, "horizon_end_date before start", 400);
    }
    const months = monthsBetweenInclusive(start, end);
    if (!validateHorizonMonths(months)) {
      throw new ForecastingError(
        FORECAST_ERROR_CODES.INVALID_HORIZON,
        "Horizon must be 12, 24, or 60 months",
        400
      );
    }
    // Resolve entity — use provided entity_id, or fall back to default entity
    const entityId = await ForecastingAccessService.resolveEntityId(input.entityId);
    await ForecastingAccessService.assertFundExists(input.fundId);

    const dims = input.dimensions || [];
    for (const d of dims) {
      if (d.type === "ACCOUNT" && d.value_id.startsWith("COA_RANGE_")) {
        const preset = parseCoaRangePreset(d.value_id);
        if (!preset) {
          throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_ACCOUNT, `Unknown ${d.value_id}`, 400);
        }
      }
    }

    const entity = await prisma.forecastEntity.findUnique({
      where: { id: entityId },
      select: { name: true }
    });
    const fund = input.fundId
      ? await prisma.fund.findUnique({ where: { id: input.fundId }, select: { name: true } })
      : null;

    const scenario = await prisma.$transaction(async (tx) => {
      const created = await tx.forecastScenario.create({
        data: {
          name: input.name.trim(),
          description: input.description?.trim() || null,
          entityId,
          fundId: input.fundId || null,
          baseCurrency: input.baseCurrency.toUpperCase(),
          horizonStartDate: start,
          horizonEndDate: end,
          granularity: input.granularity,
          status: "DRAFT",
          createdById: input.userId
        }
      });
      for (const d of dims) {
        const preset = d.type === "ACCOUNT" ? parseCoaRangePreset(d.value_id) : null;
        await tx.forecastDimension.create({
          data: {
            scenarioId: created.id,
            dimensionType: d.type,
            valueId: d.value_id,
            rangeStart: d.range_start ?? preset?.rangeStart ?? null,
            rangeEnd: d.range_end ?? preset?.rangeEnd ?? null
          }
        });
      }
      await ForecastingAuditService.log(tx, {
        scenarioId: created.id,
        userId: input.userId,
        actionType: "SCENARIO_CREATE",
        deltaPayload: {
          name: input.name,
          entity_id: entityId,
          entity_name: entity?.name ?? null,
          fund_id: input.fundId ?? null,
          fund_name: fund?.name ?? null,
          horizon_start: start.toISOString().slice(0, 10),
          horizon_end: end.toISOString().slice(0, 10),
          granularity: input.granularity,
          base_currency: input.baseCurrency.toUpperCase()
        }
      });
      return created;
    });

    return {
      id: scenario.id,
      status: scenario.status,
      name: scenario.name,
      entity_id: scenario.entityId,
      horizon_start_date: scenario.horizonStartDate.toISOString().slice(0, 10),
      horizon_end_date: scenario.horizonEndDate.toISOString().slice(0, 10),
      granularity: scenario.granularity,
      cell_count: 0
    };
  }

  static async list(user: { id: string; roleCode?: string | null }, query: Record<string, any>) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const where: any = { ...ForecastingAccessService.listScopeFilter(user) };
    if (query.fund_id) where.fundId = String(query.fund_id);
    if (query.status) {
      const statuses = String(query.status).split(",").map((s) => s.trim()).filter(Boolean);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (query.base_currency) where.baseCurrency = String(query.base_currency).toUpperCase();
    if (query.granularity) where.granularity = String(query.granularity);
    if (query.created_by_id) where.createdById = String(query.created_by_id);
    if (query.search) {
      where.OR = [
        { name: { contains: String(query.search) } },
        { description: { contains: String(query.search) } }
      ];
    }
    const sortField = String(query.sort || "-updated_at").replace(/^-/, "");
    const sortDir = String(query.sort || "").startsWith("-") ? "desc" : "asc";
    const orderByMap: Record<string, any> = {
      updated_at: { updatedAt: sortDir },
      created_at: { createdAt: sortDir },
      name: { name: sortDir },
      horizon_start_date: { horizonStartDate: sortDir }
    };
    const orderBy = orderByMap[sortField] || { updatedAt: "desc" };

    const [rows, total] = await Promise.all([
      prisma.forecastScenario.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          fund: { select: { id: true, name: true } },
          entity: { select: { id: true, name: true, type: true } },
          _count: { select: { cells: true, drivers: true } }
        }
      }),
      prisma.forecastScenario.count({ where })
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      entity_id: r.entityId,
      entity_name: (r as any).entity?.name ?? null,
      fund_id: r.fundId,
      fund_name: r.fund?.name ?? null,
      base_currency: r.baseCurrency,
      horizon_start_date: r.horizonStartDate.toISOString().slice(0, 10),
      horizon_end_date: r.horizonEndDate.toISOString().slice(0, 10),
      granularity: r.granularity,
      status: r.status,
      version_label: r.versionLabel,
      driver_count: r._count.drivers,
      cell_count: r._count.cells,
      last_gl_sync_at: r.lastGlSyncAt?.toISOString() ?? null,
      created_by_name: formatForecastUserName(r.createdBy),
      updated_at: r.updatedAt.toISOString()
    }));

    return { items, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 1 } };
  }

  static async counts(user: { id: string; roleCode?: string | null }) {
    const scope = ForecastingAccessService.listScopeFilter(user);
    const [draft, active, locked, total] = await Promise.all([
      prisma.forecastScenario.count({ where: { ...scope, status: "DRAFT" } }),
      prisma.forecastScenario.count({ where: { ...scope, status: "ACTIVE" } }),
      prisma.forecastScenario.count({ where: { ...scope, status: "LOCKED" } }),
      prisma.forecastScenario.count({ where: scope })
    ]);
    return { draft, active, locked, total };
  }

  static async getDetail(scenarioId: string, user?: any) {
    const scenario = await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    const periodKeys = buildPeriodKeys(
      scenario.horizonStartDate,
      scenario.horizonEndDate,
      scenario.granularity as any
    );
    const [cellCount, driverCount] = await Promise.all([
      prisma.forecastCell.count({ where: { scenarioId } }),
      prisma.forecastDriver.count({ where: { scenarioId } })
    ]);
    return {
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      entity_id: scenario.entityId,
      entity_name: scenario.entity?.name ?? null,
      entity_type: scenario.entity?.type ?? null,
      fund_id: scenario.fundId,
      base_currency: scenario.baseCurrency,
      horizon_start_date: scenario.horizonStartDate.toISOString().slice(0, 10),
      horizon_end_date: scenario.horizonEndDate.toISOString().slice(0, 10),
      granularity: scenario.granularity,
      status: scenario.status,
      version_label: scenario.versionLabel,
      locked_at: scenario.lockedAt?.toISOString() ?? null,
      locked_by_name: formatForecastUserName(scenario.lockedBy),
      last_gl_sync_at: scenario.lastGlSyncAt?.toISOString() ?? null,
      last_compute_at: scenario.lastComputeAt?.toISOString() ?? null,
      created_by_name: formatForecastUserName(scenario.createdBy),
      created_at: scenario.createdAt.toISOString(),
      updated_at: scenario.updatedAt.toISOString(),
      dimensions: scenario.dimensions,
      drivers: scenario.drivers,
      fund: scenario.fund,
      period_keys: periodKeys,
      cell_count: cellCount,
      driver_count: driverCount
    };
  }

  static async getSummary(scenarioId: string, user?: any) {
    const scenario = await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    const agg = await prisma.forecastCell.aggregate({
      where: { scenarioId },
      _sum: { forecastValue: true, varianceAbsolute: true },
      _count: true
    });
    return {
      scenario_id: scenarioId,
      status: scenario.status,
      cell_count: agg._count,
      total_forecast: agg._sum.forecastValue ?? new Decimal(0),
      total_variance: agg._sum.varianceAbsolute ?? new Decimal(0),
      last_compute_at: scenario.lastComputeAt?.toISOString() ?? null,
      last_gl_sync_at: scenario.lastGlSyncAt?.toISOString() ?? null
    };
  }

  static async patch(
    scenarioId: string,
    user: { id: string },
    body: { name?: string; description?: string; status?: string }
  ) {
    const scenario = await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    ForecastingAccessService.assertScenarioEditable(scenario);
    const data: any = {};
    if (body.name != null) data.name = String(body.name).trim();
    if (body.description != null) data.description = body.description;
    if (body.status === "ACTIVE" && scenario.status === "DRAFT") {
      data.status = "ACTIVE";
    }
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.forecastScenario.update({ where: { id: scenarioId }, data });
      await ForecastingAuditService.log(tx, {
        scenarioId,
        userId: user.id,
        actionType: body.status === "ACTIVE" ? "SCENARIO_PROMOTE" : "SCENARIO_UPDATE",
        deltaPayload: {
          before: { status: scenario.status, name: scenario.name },
          after: data,
          from: scenario.status,
          to: data.status ?? scenario.status
        }
      });
      return row;
    });
    return ForecastingScenarioService.omitInternalFields(updated);
  }

  /**
   * Resolve which EntityChartOfAccount rows drive this scenario's compute.
   * Queries the per-entity cloned accounts (not the global ChartOfAccounts).
   */
  static async resolveAccountsForScenario(scenarioId: string) {
    const scenario = await prisma.forecastScenario.findUnique({
      where: { id: scenarioId },
      select: { entityId: true, dimensions: true }
    });
    if (!scenario) return [];

    const dims = scenario.dimensions;
    const accountRanges = dims
      .filter((d) => d.dimensionType === "ACCOUNT")
      .map((d) => ({
        start: d.rangeStart ?? parseCoaRangePreset(d.valueId)?.rangeStart ?? 0,
        end: d.rangeEnd ?? parseCoaRangePreset(d.valueId)?.rangeEnd ?? 99999
      }));
    if (!accountRanges.length) {
      accountRanges.push({ start: 4000, end: 5999 });
    }

    // Load per-entity accounts — this is the core multi-entity change
    const accounts = await prisma.entityChartOfAccount.findMany({
      where: { entityId: scenario.entityId, isActive: true },
      select: {
        id: true,
        accountNo: true,
        accountName: true,
        accountType: true,
        sourceAccountId: true
      }
    });
    return accounts.filter((a) =>
      accountRanges.some((r) => accountNoInRange(a.accountNo, r.start, r.end))
    );
  }
}
