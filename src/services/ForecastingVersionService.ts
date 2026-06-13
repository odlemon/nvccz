// @ts-nocheck
import crypto from "crypto";
import { prisma } from "../utils/database";
import { FORECAST_ERROR_CODES } from "../constants/forecastingEngine";
import { ForecastingAccessService } from "./ForecastingAccessService";
import { ForecastingAuditService } from "./ForecastingAuditService";
import { ForecastingError } from "./ForecastingError";

export class ForecastingVersionService {
  static async lock(scenarioId: string, userId: string, versionLabel: string) {
    const scenario = await ForecastingAccessService.loadScenarioOrThrow(scenarioId);
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
          lockedById: userId,
          lockedAt: new Date()
        }
      });
      const updated = await tx.forecastScenario.update({
        where: { id: scenarioId },
        data: {
          status: "LOCKED",
          versionLabel: versionLabel.trim(),
          lockedAt: new Date(),
          lockedById: userId
        }
      });
      await ForecastingAuditService.log(tx, {
        scenarioId,
        userId,
        actionType: "LOCK",
        deltaPayload: { version_id: version.id, version_label: versionLabel },
        priority: "HIGH"
      });
      return { version, scenario: updated };
    });

    return {
      scenario_id: scenarioId,
      status: "LOCKED",
      version_id: result.version.id,
      version_label: result.version.versionLabel,
      checksum_sha256: checksum
    };
  }

  static async list(scenarioId: string) {
    await ForecastingAccessService.loadScenarioOrThrow(scenarioId);
    return prisma.forecastVersion.findMany({
      where: { scenarioId },
      orderBy: { lockedAt: "desc" },
      include: { lockedBy: { select: { id: true, firstName: true, lastName: true } } }
    });
  }

  static async get(scenarioId: string, versionId: string) {
    const version = await prisma.forecastVersion.findFirst({
      where: { id: versionId, scenarioId }
    });
    if (!version) {
      throw new ForecastingError(FORECAST_ERROR_CODES.VERSION_NOT_FOUND, "Version not found", 404);
    }
    return version;
  }

  static async compare(scenarioId: string, versionIdA: string, versionIdB: string) {
    const [a, b] = await Promise.all([
      ForecastingVersionService.get(scenarioId, versionIdA),
      ForecastingVersionService.get(scenarioId, versionIdB)
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

  static async duplicate(scenarioId: string, versionId: string, userId: string, name?: string) {
    const version = await ForecastingVersionService.get(scenarioId, versionId);
    const source = await ForecastingAccessService.loadScenarioOrThrow(scenarioId);
    const snapshot = version.snapshotPayload as any;

    const created = await prisma.$transaction(async (tx) => {
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
          createdById: userId
        }
      });
      const dims = await tx.forecastDimension.findMany({ where: { scenarioId } });
      for (const d of dims) {
        await tx.forecastDimension.create({
          data: {
            scenarioId: scenario.id,
            dimensionType: d.dimensionType,
            valueId: d.valueId,
            rangeStart: d.rangeStart,
            rangeEnd: d.rangeEnd
          }
        });
      }
      for (const d of snapshot.drivers || []) {
        await tx.forecastDriver.create({
          data: {
            scenarioId: scenario.id,
            targetAccountRangeStart: d.targetAccountRangeStart,
            targetAccountRangeEnd: d.targetAccountRangeEnd,
            driverType: d.driverType,
            formulaExpression: d.formulaExpression,
            parameters: d.parameters
          }
        });
      }
      for (const c of snapshot.cells || []) {
        await tx.forecastCell.create({
          data: {
            scenarioId: scenario.id,
            periodKey: c.periodKey,
            accountId: c.accountId,
            entityId: c.entityId,
            fundId: c.fundId || "",
            portfolioCompanyId: c.portfolioCompanyId || "",
            analyticalTag: c.analyticalTag || "",
            naturalKeyHash: c.naturalKeyHash,
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
          }
        });
      }
      await ForecastingAuditService.log(tx, {
        scenarioId: scenario.id,
        userId,
        actionType: "VERSION_DUPLICATE",
        deltaPayload: { source_scenario_id: scenarioId, source_version_id: versionId }
      });
      return scenario;
    });
    return created;
  }
}
