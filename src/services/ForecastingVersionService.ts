// @ts-nocheck
import crypto from "crypto";
import { prisma } from "../utils/database";
import { FORECAST_ERROR_CODES } from "../constants/forecastingEngine";
import { ForecastingAccessService } from "./ForecastingAccessService";
import { ForecastingAuditService } from "./ForecastingAuditService";
import { ForecastingScenarioService } from "./ForecastingScenarioService";
import { ForecastingError } from "./ForecastingError";
import { formatForecastUserName } from "../utils/forecastUserDisplay";
import { buildCellNaturalKeyHash, normalizeCellDimension } from "../utils/forecastCellKey";

function sanitizeSnapshotPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return payload;
  const copy = { ...(payload as Record<string, unknown>) };
  if (Array.isArray(copy.cells)) {
    copy.cells = copy.cells.map((cell: any) => {
      const { entityId, companyProfileId, ...rest } = cell || {};
      return rest;
    });
  }
  return copy;
}

export class ForecastingVersionService {
  static async lock(
    scenarioId: string,
    user: { id: string; firstName?: string; lastName?: string; email?: string },
    versionLabel: string
  ) {
    const scenario = await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    if (scenario.status === "LOCKED") {
      throw ForecastingError.locked("Scenario is already locked");
    }

    const [cells, drivers] = await Promise.all([
      prisma.forecastCell.findMany({ where: { scenarioId } }),
      prisma.forecastDriver.findMany({ where: { scenarioId } })
    ]);
    const snapshot = { cells, drivers, locked_at: new Date().toISOString() };
    const checksum = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

    const result = await prisma.$transaction(async (tx) => {
      const version = await tx.forecastVersion.create({
        data: {
          scenarioId,
          versionLabel: versionLabel.trim(),
          snapshotPayload: snapshot,
          checksumSha256: checksum,
          lockedById: user.id,
          lockedAt: new Date()
        }
      });
      const updated = await tx.forecastScenario.update({
        where: { id: scenarioId },
        data: {
          status: "LOCKED",
          versionLabel: versionLabel.trim(),
          lockedAt: new Date(),
          lockedById: user.id
        }
      });
      await ForecastingAuditService.log(tx, {
        scenarioId,
        userId: user.id,
        actionType: "LOCK",
        deltaPayload: {
          version_id: version.id,
          version_label: versionLabel,
          checksum_sha256: checksum
        },
        priority: "HIGH"
      });
      return { version, scenario: updated };
    });

    return {
      scenario_id: scenarioId,
      status: "LOCKED",
      version_id: result.version.id,
      version_label: result.version.versionLabel,
      locked_by_name: formatForecastUserName(user),
      checksum_sha256: checksum
    };
  }

  static async list(scenarioId: string, user?: any) {
    await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    const rows = await prisma.forecastVersion.findMany({
      where: { scenarioId },
      orderBy: { lockedAt: "desc" },
      include: { lockedBy: { select: { firstName: true, lastName: true, email: true } } }
    });
    return rows.map((v) => ({
      id: v.id,
      scenario_id: v.scenarioId,
      version_label: v.versionLabel,
      locked_at: v.lockedAt.toISOString(),
      locked_by_name: formatForecastUserName(v.lockedBy),
      checksum_sha256: v.checksumSha256
    }));
  }

  static async get(scenarioId: string, versionId: string, user?: any) {
    await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    const version = await prisma.forecastVersion.findFirst({
      where: { id: versionId, scenarioId }
    });
    if (!version) {
      throw new ForecastingError(FORECAST_ERROR_CODES.VERSION_NOT_FOUND, "Version not found", 404);
    }
    return {
      ...version,
      snapshotPayload: sanitizeSnapshotPayload(version.snapshotPayload)
    };
  }

  static async compare(scenarioId: string, versionIdA: string, versionIdB: string, user?: any) {
    const [a, b] = await Promise.all([
      ForecastingVersionService.get(scenarioId, versionIdA, user),
      ForecastingVersionService.get(scenarioId, versionIdB, user)
    ]);
    const cellsA = (a.snapshotPayload as any)?.cells || [];
    const cellsB = (b.snapshotPayload as any)?.cells || [];
    const mapB = new Map(cellsB.map((c: any) => [c.naturalKeyHash || c.id, c]));
    const diffs: any[] = [];
    for (const ca of cellsA) {
      const cb = mapB.get(ca.naturalKeyHash || ca.id);
      if (!cb) {
        diffs.push({ key: ca.naturalKeyHash, type: "removed_in_b", a: ca.forecastValue });
        continue;
      }
      if (String(ca.forecastValue) !== String(cb.forecastValue)) {
        diffs.push({
          key: ca.naturalKeyHash,
          period_key: ca.periodKey,
          account_id: ca.accountId,
          value_a: ca.forecastValue,
          value_b: cb.forecastValue
        });
      }
    }
    return { version_a: versionIdA, version_b: versionIdB, diff_count: diffs.length, diffs: diffs.slice(0, 500) };
  }

  static async duplicate(scenarioId: string, versionId: string, user: { id: string }, name?: string) {
    const version = await ForecastingVersionService.get(scenarioId, versionId, user);
    const source = await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    const snapshot = version.snapshotPayload as any;

    // Remap snapshot account ids (may be legacy global COA ids) to entity account ids
    const entityAccounts = await prisma.entityChartOfAccount.findMany({
      where: { entityId: source.entityId },
      select: { id: true, sourceAccountId: true }
    });
    const entityAccountIds = new Set(entityAccounts.map((a) => a.id));
    const bySourceId = new Map(
      entityAccounts.filter((a) => a.sourceAccountId).map((a) => [a.sourceAccountId!, a.id])
    );
    const resolveSnapshotAccountId = (rawId: string): string | null => {
      if (entityAccountIds.has(rawId)) return rawId;
      return bySourceId.get(rawId) ?? null;
    };

    const created = await prisma.$transaction(
      async (tx) => {
        const scenario = await tx.forecastScenario.create({
          data: {
            name: name || `${source.name} (copy)`,
            description: source.description,
            entityId: source.entityId,
            fundId: source.fundId,
            baseCurrency: source.baseCurrency,
            horizonStartDate: source.horizonStartDate,
            horizonEndDate: source.horizonEndDate,
            granularity: source.granularity,
            status: "DRAFT",
            createdById: user.id
          }
        });
        const dims = await tx.forecastDimension.findMany({ where: { scenarioId } });
        if (dims.length) {
          await tx.forecastDimension.createMany({
            data: dims.map((d) => ({
              scenarioId: scenario.id,
              dimensionType: d.dimensionType,
              valueId: d.valueId,
              rangeStart: d.rangeStart,
              rangeEnd: d.rangeEnd
            }))
          });
        }
        const driverRows = (snapshot.drivers || []).map((d: any) => ({
          scenarioId: scenario.id,
          targetAccountRangeStart: d.targetAccountRangeStart,
          targetAccountRangeEnd: d.targetAccountRangeEnd,
          driverType: d.driverType,
          formulaExpression: d.formulaExpression,
          parameters: d.parameters
        }));
        if (driverRows.length) {
          await tx.forecastDriver.createMany({ data: driverRows });
        }
        const cellRows = (snapshot.cells || [])
          .map((c: any) => {
          const entityId = c.entityId ?? c.companyProfileId ?? source.entityId;
          const accountId = resolveSnapshotAccountId(c.accountId);
          if (!accountId) return null;
          const fundId = normalizeCellDimension(c.fundId || source.fundId);
          const portfolioCompanyId = normalizeCellDimension(c.portfolioCompanyId);
          const analyticalTag = normalizeCellDimension(c.analyticalTag);
          return {
            scenarioId: scenario.id,
            periodKey: c.periodKey,
            accountId,
            entityId,
            fundId,
            portfolioCompanyId,
            analyticalTag,
            naturalKeyHash: buildCellNaturalKeyHash({
              scenarioId: scenario.id,
              periodKey: c.periodKey,
              accountId,
              entityId,
              fundId,
              portfolioCompanyId,
              analyticalTag
            }),
            forecastValue: c.forecastValue,
            actualValueOverride: c.actualValueOverride,
            txCurrency: c.txCurrency,
            txCurrencyValue: c.txCurrencyValue,
            baseCurrencyValue: c.baseCurrencyValue,
            projectedRate: c.projectedRate,
            actualRate: c.actualRate,
            varianceAbsolute: c.varianceAbsolute,
            variancePercent: c.variancePercent,
            isManualOverride: c.isManualOverride
          };
        })
          .filter(Boolean);
        if (cellRows.length) {
          await tx.forecastCell.createMany({ data: cellRows });
        }
        await ForecastingAuditService.log(tx, {
          scenarioId: scenario.id,
          userId: user.id,
          actionType: "VERSION_DUPLICATE",
          deltaPayload: {
            source_scenario_id: scenarioId,
            source_version_id: versionId,
            source_version_label: version.versionLabel,
            new_scenario_id: scenario.id,
            new_scenario_name: scenario.name
          }
        });
        return scenario;
      },
      { maxWait: 15_000, timeout: 60_000 }
    );
    return ForecastingScenarioService.omitInternalFields(created);
  }
}
