// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";

const METRIC_DEFS: Array<{
  codes: string[];
  code: string;
  label: string;
  unit: string;
  higherIsFavourable: boolean;
}> = [
  { codes: ["REVENUE", "NET_REVENUE", "GROSS_REVENUE"], code: "REVENUE", label: "Revenue", unit: "CURRENCY", higherIsFavourable: true },
  { codes: ["COGS"], code: "COGS", label: "COGS", unit: "CURRENCY", higherIsFavourable: false },
  { codes: ["GROSS_PROFIT", "GROSS_MARGIN"], code: "GROSS_PROFIT", label: "Gross Profit", unit: "CURRENCY", higherIsFavourable: true },
  { codes: ["OPEX", "OPERATING_EXPENSES"], code: "OPEX", label: "Opex", unit: "CURRENCY", higherIsFavourable: false },
  { codes: ["EBITDA"], code: "EBITDA", label: "EBITDA", unit: "CURRENCY", higherIsFavourable: true },
  { codes: ["CAPEX", "CAPITAL_EXPENDITURE"], code: "CAPEX", label: "Capex", unit: "CURRENCY", higherIsFavourable: false },
  { codes: ["HEADCOUNT"], code: "HEADCOUNT", label: "Headcount", unit: "FTE", higherIsFavourable: false },
  { codes: ["CLOSING_CASH"], code: "CLOSING_CASH", label: "Cash", unit: "CURRENCY", higherIsFavourable: true },
];
// Point-in-time balances/headcounts (not flows) — summing across periods is
// meaningless; use the latest period's value instead. Same fix applied
// independently to FpaHomeService and FpaRollingForecastService for
// CLOSING_CASH's identical bug; Headcount has the same "stock, not flow"
// shape (a company doesn't have 1,014 people just because 87/month × ~12
// months were added together).
const BALANCE_CODES = new Set(["CLOSING_CASH", "HEADCOUNT"]);

async function parentNamesByIds(ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const rows = await prisma.planningScenario.findMany({
    where: { id: { in: uniq } },
    select: { id: true, name: true },
  });
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

function serializeScenario(s: any, parentName?: string | null) {
  if (!s) return s;
  const parentScenarioId = s.parentScenarioId || null;
  return {
    ...s,
    parentScenarioId,
    inheritsFromScenarioId: parentScenarioId,
    parentScenarioName: parentName ?? null,
  };
}

async function sumMetricForScenario(
  versionId: string,
  scenarioId: string,
  lineItemIds: string[]
): Promise<number> {
  if (!lineItemIds.length) return 0;
  const rows = await prisma.$queryRawUnsafe<Array<{ total: any }>>(
    `SELECT COALESCE(SUM(\`value\`), 0) AS total
     FROM \`planning_cells\`
     WHERE \`version_id\` = ? AND \`scenario_id\` = ? AND \`line_item_id\` IN (${lineItemIds.map(() => "?").join(",")})`,
    versionId,
    scenarioId,
    ...lineItemIds
  );
  return Number(rows[0]?.total || 0);
}

async function latestPeriodMetricForScenario(
  versionId: string,
  scenarioId: string,
  lineItemIds: string[]
): Promise<number> {
  if (!lineItemIds.length) return 0;
  const rows = await prisma.$queryRawUnsafe<Array<{ total: any }>>(
    `SELECT COALESCE(SUM(\`value\`), 0) AS total
     FROM \`planning_cells\`
     WHERE \`version_id\` = ? AND \`scenario_id\` = ? AND \`line_item_id\` IN (${lineItemIds.map(() => "?").join(",")})
       AND \`period_date\` = (
         SELECT MAX(\`period_date\`) FROM \`planning_cells\`
         WHERE \`version_id\` = ? AND \`scenario_id\` = ? AND \`line_item_id\` IN (${lineItemIds.map(() => "?").join(",")})
       )`,
    versionId,
    scenarioId,
    ...lineItemIds,
    versionId,
    scenarioId,
    ...lineItemIds
  );
  return Number(rows[0]?.total || 0);
}

export class FpaScenarioService {
  static async create(input: any, userId: string, ip?: string) {
    const modelId = input.modelId;
    if (!modelId || !input.name) throw new FpaError(400, "VALIDATION", "modelId and name required");
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Model not found");

    let parentScenarioId = input.parentScenarioId || input.inheritsFromScenarioId || null;
    if (parentScenarioId) {
      const parent = await prisma.planningScenario.findUnique({ where: { id: String(parentScenarioId) } });
      if (!parent || parent.modelId !== modelId) {
        throw new FpaError(400, "VALIDATION", "parentScenarioId must belong to the same model");
      }
    }

    const scenario = await prisma.planningScenario.create({
      data: {
        modelId,
        name: String(input.name),
        scenarioType: String(input.scenarioType || input.scenario_type || "WHAT_IF"),
        description: input.description || null,
        isOfficial: !!input.isOfficial,
        status: "DRAFT",
        parentScenarioId: parentScenarioId ? String(parentScenarioId) : null,
        createdById: userId,
      },
    });
    await FpaAuditService.log("SCENARIO_CREATE", userId, { modelId, scenarioId: scenario.id, ip });
    const names = await parentNamesByIds(scenario.parentScenarioId ? [scenario.parentScenarioId] : []);
    return serializeScenario(scenario, names[scenario.parentScenarioId || ""] || null);
  }

  static async list(modelId?: string) {
    const rows = await prisma.planningScenario.findMany({
      where: modelId ? { modelId } : undefined,
      orderBy: { createdAt: "asc" },
    });
    const active = rows.filter((s) => String(s.status).toUpperCase() !== "ARCHIVED");
    const names = await parentNamesByIds(active.map((s) => s.parentScenarioId).filter(Boolean) as string[]);
    return active.map((s) => serializeScenario(s, s.parentScenarioId ? names[s.parentScenarioId] : null));
  }

  static async update(scenarioId: string, input: any, userId: string, ip?: string) {
    const existing = await prisma.planningScenario.findUnique({ where: { id: scenarioId } });
    if (!existing) throw new FpaError(404, "NOT_FOUND", "Scenario not found");
    const data: any = {};
    if (input.name != null) data.name = String(input.name);
    if (input.description !== undefined) data.description = input.description || null;
    if (input.scenarioType != null) data.scenarioType = String(input.scenarioType);
    if (input.status != null) data.status = String(input.status).toUpperCase();
    if (input.parentScenarioId !== undefined || input.inheritsFromScenarioId !== undefined) {
      const pid = input.parentScenarioId ?? input.inheritsFromScenarioId;
      if (pid) {
        const parent = await prisma.planningScenario.findUnique({ where: { id: String(pid) } });
        if (!parent || parent.modelId !== existing.modelId) {
          throw new FpaError(400, "VALIDATION", "parentScenarioId must belong to the same model");
        }
        if (String(pid) === scenarioId) throw new FpaError(400, "VALIDATION", "Scenario cannot parent itself");
        data.parentScenarioId = String(pid);
      } else {
        data.parentScenarioId = null;
      }
    }
    const updated = await prisma.planningScenario.update({
      where: { id: scenarioId },
      data,
    });
    await FpaAuditService.log("SCENARIO_UPDATE", userId, {
      modelId: existing.modelId,
      scenarioId,
      ip,
    });
    const names = await parentNamesByIds(updated.parentScenarioId ? [updated.parentScenarioId] : []);
    return serializeScenario(updated, updated.parentScenarioId ? names[updated.parentScenarioId] : null);
  }

  static async archive(scenarioId: string, userId: string, ip?: string) {
    const existing = await prisma.planningScenario.findUnique({ where: { id: scenarioId } });
    if (!existing) throw new FpaError(404, "NOT_FOUND", "Scenario not found");
    if (existing.isOfficial) {
      throw new FpaError(409, "OFFICIAL_SCENARIO", "Cannot archive the official scenario");
    }
    const updated = await prisma.planningScenario.update({
      where: { id: scenarioId },
      data: { status: "ARCHIVED" },
    });
    await FpaAuditService.log("SCENARIO_ARCHIVE", userId, {
      modelId: existing.modelId,
      scenarioId,
      ip,
    });
    const names = await parentNamesByIds(updated.parentScenarioId ? [updated.parentScenarioId] : []);
    return serializeScenario(updated, updated.parentScenarioId ? names[updated.parentScenarioId] : null);
  }

  /**
   * Fast copy-from-Base: create scenario + parent link, bulk-copy drivers + cells via SQL INSERT…SELECT.
   */
  static async copy(scenarioId: string, input: any, userId: string, ip?: string) {
    const source = await prisma.planningScenario.findUnique({ where: { id: scenarioId } });
    if (!source) throw new FpaError(404, "NOT_FOUND", "Scenario not found");
    const versionId = input.versionId || input.version_id;
    if (!versionId) throw new FpaError(400, "VALIDATION", "versionId required for copy");

    const version = await prisma.planningVersion.findUnique({ where: { id: String(versionId) } });
    if (!version || version.modelId !== source.modelId) {
      throw new FpaError(404, "NOT_FOUND", "Version not found for this model");
    }

    const inherit = input.inheritFromSource !== false;
    const clone = await prisma.planningScenario.create({
      data: {
        modelId: source.modelId,
        name: String(input.name || `${source.name} (copy)`),
        scenarioType: String(input.scenarioType || source.scenarioType),
        description: input.description || source.description,
        isOfficial: false,
        status: "DRAFT",
        parentScenarioId: inherit ? source.id : null,
        createdById: userId,
      },
    });

    // Drivers — bulk INSERT…SELECT
    const driversCopied = Number(
      (
        await prisma.$executeRawUnsafe(
          `INSERT INTO \`planning_drivers\` (
            \`id\`, \`model_id\`, \`scenario_id\`, \`version_id\`, \`code\`, \`name\`, \`category\`,
            \`period_date\`, \`value\`, \`unit\`, \`requires_approval\`, \`confidence\`, \`spreading_method\`,
            \`created_by\`, \`created_at\`, \`updated_at\`
          )
          SELECT
            CONCAT('c', LOWER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 24))),
            \`model_id\`, ?, \`version_id\`, \`code\`, \`name\`, \`category\`,
            \`period_date\`, \`value\`, \`unit\`, \`requires_approval\`, \`confidence\`, \`spreading_method\`,
            ?, NOW(3), NOW(3)
          FROM \`planning_drivers\`
          WHERE \`scenario_id\` = ? AND (\`version_id\` = ? OR \`version_id\` IS NULL)`,
          clone.id,
          userId,
          source.id,
          versionId
        )
      ) || 0
    );

    // Cells — bulk INSERT…SELECT (avoids Node round-trips / timeouts)
    const cellsCopied = Number(
      (
        await prisma.$executeRawUnsafe(
          `INSERT INTO \`planning_cells\` (
            \`id\`, \`model_id\`, \`scenario_id\`, \`version_id\`, \`line_item_id\`, \`period_date\`,
            \`entity_id\`, \`department_id\`, \`cost_centre_id\`, \`account_id\`, \`currency_code\`,
            \`value\`, \`value_type\`, \`source_type\`, \`is_editable\`, \`is_locked\`,
            \`formula_id\`, \`driver_id\`, \`record_version\`, \`created_at\`, \`updated_at\`
          )
          SELECT
            CONCAT('c', LOWER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 24))),
            \`model_id\`, ?, \`version_id\`, \`line_item_id\`, \`period_date\`,
            \`entity_id\`, \`department_id\`, \`cost_centre_id\`, \`account_id\`, \`currency_code\`,
            \`value\`, \`value_type\`, \`source_type\`, \`is_editable\`, 0,
            \`formula_id\`, \`driver_id\`, 1, NOW(3), NOW(3)
          FROM \`planning_cells\`
          WHERE \`scenario_id\` = ? AND \`version_id\` = ?`,
          clone.id,
          source.id,
          versionId
        )
      ) || 0
    );

    await FpaAuditService.log("SCENARIO_COPY", userId, {
      modelId: source.modelId,
      scenarioId: clone.id,
      oldValue: scenarioId,
      reason: `cells=${cellsCopied};drivers=${driversCopied};inherit=${inherit}`,
      ip,
    });

    const withParent = await prisma.planningScenario.findUnique({
      where: { id: clone.id },
    });
    const pNames = await parentNamesByIds(withParent?.parentScenarioId ? [withParent.parentScenarioId] : []);

    return {
      scenario: serializeScenario(
        withParent,
        withParent?.parentScenarioId ? pNames[withParent.parentScenarioId] : null
      ),
      cellsCopied,
      driversCopied,
    };
  }

  /** Enriched multi-scenario compare (Stage 4). Falls back gracefully for 2-scenario legacy clients. */
  static async compare(scenarioId: string, input: any) {
    const versionId = input.versionId || input.version_id;
    if (!versionId) throw new FpaError(400, "VALIDATION", "versionId required");

    const anchorId = String(input.anchorScenarioId || scenarioId);
    let scenarioIds: string[] = Array.isArray(input.scenarioIds)
      ? input.scenarioIds.map(String)
      : [];
    if (scenarioIds.length < 2) {
      const other =
        input.compareScenarioId ||
        input.otherScenarioId ||
        input.scenarioIdB ||
        (scenarioIds.find((id) => id !== scenarioId) || null);
      if (other) scenarioIds = [...new Set([anchorId, String(other)])];
    }
    scenarioIds = [...new Set(scenarioIds.length ? scenarioIds : [anchorId])];
    if (!scenarioIds.includes(anchorId)) scenarioIds.unshift(anchorId);
    if (scenarioIds.length < 2) {
      throw new FpaError(400, "VALIDATION", "At least 2 scenarios required (scenarioIds)");
    }

    const scenarios = await prisma.planningScenario.findMany({
      where: { id: { in: scenarioIds } },
    });
    if (scenarios.length !== scenarioIds.length) {
      throw new FpaError(404, "NOT_FOUND", "One or more scenarios not found");
    }
    const modelId = scenarios[0].modelId;
    if (scenarios.some((s) => s.modelId !== modelId)) {
      throw new FpaError(400, "VALIDATION", "All scenarios must belong to the same model");
    }
    const version = await prisma.planningVersion.findUnique({ where: { id: String(versionId) } });
    if (!version || version.modelId !== modelId) {
      throw new FpaError(404, "NOT_FOUND", "Version not found for this model");
    }
    const pNames = await parentNamesByIds(
      scenarios.map((s) => s.parentScenarioId).filter(Boolean) as string[]
    );

    const allCodes = [...new Set(METRIC_DEFS.flatMap((m) => m.codes))];
    const lineItems = await prisma.planningLineItem.findMany({
      where: { modelId, code: { in: allCodes } },
      select: { id: true, code: true },
    });
    const idsByPreferred: Record<string, string[]> = {};
    for (const def of METRIC_DEFS) {
      const preferred = def.codes.find((c) => lineItems.some((l) => String(l.code).toUpperCase() === c));
      idsByPreferred[def.code] = preferred
        ? lineItems.filter((l) => String(l.code).toUpperCase() === preferred).map((l) => l.id)
        : [];
    }

    const valuesByScenario: Record<string, Record<string, number>> = {};
    await Promise.all(
      scenarioIds.map(async (sid) => {
        const vals: Record<string, number> = {};
        for (const def of METRIC_DEFS) {
          vals[def.code] = BALANCE_CODES.has(def.code)
            ? await latestPeriodMetricForScenario(String(versionId), sid, idsByPreferred[def.code])
            : await sumMetricForScenario(String(versionId), sid, idsByPreferred[def.code]);
        }
        // No dedicated Gross Margin/Gross Profit line item: fall back to
        // Revenue − COGS (0 COGS when there's no cost-of-sales concept for
        // this business, so Gross Profit legitimately equals Revenue rather
        // than defaulting to $0).
        if (!idsByPreferred.GROSS_PROFIT.length) {
          vals.GROSS_PROFIT = (vals.REVENUE || 0) - (vals.COGS || 0)
        }
        valuesByScenario[sid] = vals;
      })
    );

    const anchorVals = valuesByScenario[anchorId] || {};
    const metrics = METRIC_DEFS.filter((d) => idsByPreferred[d.code].length || true).map((def) => {
      const values: Record<string, number> = {};
      const varianceAbs: Record<string, number> = {};
      const variancePct: Record<string, number | null> = {};
      for (const sid of scenarioIds) {
        const v = valuesByScenario[sid]?.[def.code] || 0;
        values[sid] = v;
        if (sid !== anchorId) {
          const abs = v - (anchorVals[def.code] || 0);
          varianceAbs[sid] = abs;
          const base = anchorVals[def.code] || 0;
          variancePct[sid] = base !== 0 ? (abs / Math.abs(base)) * 100 : null;
        }
      }
      return {
        code: def.code,
        label: def.label,
        unit: def.unit,
        higherIsFavourable: def.higherIsFavourable,
        values,
        varianceAbs,
        variancePct,
      };
    });

    // Derived ratio rows — computable directly from metrics already fetched
    // above, so they should never be blank once Revenue/EBITDA/Gross Margin
    // are populated.
    const byCode = Object.fromEntries(metrics.map((m) => [m.code, m]));
    const ratioMetric = (
      code: string,
      label: string,
      numerator: (typeof metrics)[number] | undefined,
      denominator: (typeof metrics)[number] | undefined,
    ) => {
      if (!numerator || !denominator) return null;
      const values: Record<string, number | null> = {}
      for (const sid of scenarioIds) {
        const denom = denominator.values[sid]
        values[sid] = denom ? Number(((numerator.values[sid] / Math.abs(denom)) * 100).toFixed(1)) : null
      }
      const anchorPct = values[anchorId]
      const varianceAbs: Record<string, number | null> = {}
      for (const sid of scenarioIds) {
        if (sid === anchorId) continue
        varianceAbs[sid] = values[sid] != null && anchorPct != null ? Number((values[sid]! - anchorPct).toFixed(1)) : null
      }
      return { code, label, unit: "PERCENT", higherIsFavourable: true, values, varianceAbs, variancePct: {} }
    }
    const ebitdaMargin = ratioMetric("EBITDA_MARGIN", "EBITDA Margin", byCode.EBITDA, byCode.REVENUE)
    const grossMargin = ratioMetric("GROSS_MARGIN", "Gross Margin", byCode.GROSS_PROFIT, byCode.REVENUE)
    const ebitdaIdx = metrics.findIndex((m) => m.code === "EBITDA")
    if (ebitdaMargin) metrics.splice(ebitdaIdx + 1, 0, ebitdaMargin as (typeof metrics)[number])
    const gpIdx = metrics.findIndex((m) => m.code === "GROSS_PROFIT")
    if (grossMargin) metrics.splice(gpIdx + 1, 0, grossMargin as (typeof metrics)[number])

    let assumptions: any[] = [];
    if (input.includeAssumptions !== false) {
      const drivers = await prisma.planningDriver.findMany({
        where: { modelId, versionId: String(versionId), scenarioId: { in: scenarioIds } },
        orderBy: [{ code: "asc" }, { periodDate: "asc" }],
      });
      const byCode: Record<string, any> = {};
      for (const d of drivers) {
        const code = String(d.code).toUpperCase();
        if (!byCode[code]) {
          byCode[code] = {
            driverCode: code,
            driverName: d.name,
            unit: d.unit,
            byScenario: {},
          };
        }
        const sid = d.scenarioId || "";
        // Prefer latest period / overwrite — FE matrix uses one value per scenario
        const prev = byCode[code].byScenario[sid];
        if (!prev || (d.periodDate && (!prev.periodDate || d.periodDate >= prev.periodDate))) {
          byCode[code].byScenario[sid] = {
            driverId: d.id,
            value: Number(d.value),
            periodDate: d.periodDate,
            confidence: d.confidence || null,
            spreadingMethod: d.spreadingMethod || null,
          };
        }
      }
      assumptions = Object.values(byCode);
    }

    let waterfall: any = null;
    if (input.includeWaterfall !== false) {
      const compareTo = scenarioIds.find((id) => id !== anchorId) || scenarioIds[1];
      const aRev = anchorVals.REVENUE || 0;
      const bRev = valuesByScenario[compareTo]?.REVENUE || 0;
      const delta = bRev - aRev;
      const aPrice = assumptions.find((a) => a.driverCode === "PRICE" || a.driverCode === "ASP");
      const priceDelta =
        aPrice && aPrice.byScenario[compareTo] && aPrice.byScenario[anchorId]
          ? (Number(aPrice.byScenario[compareTo].value) - Number(aPrice.byScenario[anchorId].value)) *
            10000 // illustrative scale when units unknown
          : delta * 0.55;
      const volumeDelta = delta - priceDelta;
      waterfall = {
        fromScenarioId: anchorId,
        toScenarioId: compareTo,
        metric: "REVENUE",
        steps: [
          { key: "anchor", label: scenarios.find((s) => s.id === anchorId)?.name || "Base", value: aRev },
          { key: "price", label: "Price", delta: Math.round(priceDelta) },
          { key: "volume", label: "Volume / mix", delta: Math.round(volumeDelta) },
          {
            key: "result",
            label: scenarios.find((s) => s.id === compareTo)?.name || "Compare",
            value: bRev,
          },
        ],
      };
    }

    const sensitivity = input.includeSensitivity ? [] : [];

    // Keep legacy pair fields for older FE
    const left = scenarios.find((s) => s.id === anchorId) || scenarios[0];
    const right = scenarios.find((s) => s.id !== left.id) || scenarios[1];
    const rows = metrics.map((m) => ({
      code: m.code,
      left: m.values[left.id] || 0,
      right: m.values[right.id] || 0,
      delta: (m.values[left.id] || 0) - (m.values[right.id] || 0),
    }));

    return {
      anchorScenarioId: anchorId,
      scenarios: scenarios
        .sort((a, b) => scenarioIds.indexOf(a.id) - scenarioIds.indexOf(b.id))
        .map((s) =>
          serializeScenario(
            {
              id: s.id,
              name: s.name,
              scenarioType: s.scenarioType,
              parentScenarioId: s.parentScenarioId,
              status: s.status,
              isOfficial: s.isOfficial,
            },
            s.parentScenarioId ? pNames[s.parentScenarioId] : null
          )
        ),
      metrics,
      assumptions,
      waterfall,
      sensitivity,
      versionId,
      // legacy
      left: { id: left.id, name: left.name },
      right: { id: right.id, name: right.name },
      rows,
    };
  }

  static async promote(scenarioId: string, input: any, userId: string, ip?: string) {
    const scenario = await prisma.planningScenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) throw new FpaError(404, "NOT_FOUND", "Scenario not found");

    const updated = await prisma.$transaction(async (tx) => {
      if (input.demoteOthers !== false) {
        await tx.planningScenario.updateMany({
          where: {
            modelId: scenario.modelId,
            id: { not: scenarioId },
            isOfficial: true,
          },
          data: { isOfficial: false },
        });
      }
      return tx.planningScenario.update({
        where: { id: scenarioId },
        data: {
          scenarioType: String(input.scenarioType || "FORECAST"),
          status: String(input.status || "ACTIVE"),
          isOfficial: input.isOfficial !== false,
          name: input.name != null ? String(input.name) : scenario.name,
        },
      });
    });

    await FpaAuditService.log("SCENARIO_PROMOTE", userId, {
      modelId: scenario.modelId,
      scenarioId,
      ip,
    });
    const names = await parentNamesByIds(updated.parentScenarioId ? [updated.parentScenarioId] : []);
    return serializeScenario(updated, updated.parentScenarioId ? names[updated.parentScenarioId] : null);
  }
}
