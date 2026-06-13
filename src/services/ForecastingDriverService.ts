// @ts-nocheck
import { prisma } from "../utils/database";
import { FORECAST_DRIVER_TYPES, FORECAST_ERROR_CODES } from "../constants/forecastingEngine";
import { ForecastFormulaParser } from "./ForecastFormulaParser";
import { ForecastingDagEngine } from "./ForecastingDagEngine";
import { ForecastingAccessService } from "./ForecastingAccessService";
import { ForecastingAuditService } from "./ForecastingAuditService";
import { ForecastingComputeService } from "./ForecastingComputeService";
import { ForecastingError } from "./ForecastingError";

export class ForecastingDriverService {
  static async replaceDrivers(
    scenarioId: string,
    userId: string,
    drivers: Array<{
      target_account_range_start: number;
      target_account_range_end: number;
      driver_type: string;
      formula_expression: string;
      parameters: Record<string, unknown>;
    }>
  ) {
    const scenario = await ForecastingAccessService.loadScenarioOrThrow(scenarioId);
    ForecastingAccessService.assertScenarioEditable(scenario);

    for (const d of drivers) {
      if (!FORECAST_DRIVER_TYPES.includes(d.driver_type as any)) {
        throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_FORMULA, `Unknown driver_type ${d.driver_type}`, 400);
      }
      const validation = ForecastFormulaParser.validate(d.formula_expression || "0");
      if (!validation.ok) {
        throw ForecastingError.invalidFormula(validation.errors.join("; "));
      }
    }

    const graph = ForecastingDagEngine.buildDriverGraph(
      drivers.map((d, i) => ({ id: String(i), formulaExpression: d.formula_expression }))
    );
    ForecastingDagEngine.assertAcyclic(graph);

    await prisma.$transaction(async (tx) => {
      await tx.forecastDriver.deleteMany({ where: { scenarioId } });
      for (const d of drivers) {
        await tx.forecastDriver.create({
          data: {
            scenarioId,
            targetAccountRangeStart: d.target_account_range_start,
            targetAccountRangeEnd: d.target_account_range_end,
            driverType: d.driver_type,
            formulaExpression: d.formula_expression,
            parameters: d.parameters || {}
          }
        });
      }
      await ForecastingAuditService.log(tx, {
        scenarioId,
        userId,
        actionType: "DRIVER_UPDATE",
        deltaPayload: { driver_count: drivers.length }
      });
    });

    const compute = await ForecastingComputeService.run({
      scenarioId,
      editType: "DRIVER",
      userId,
      options: { skip_manual_overrides: false, include_elapsed_variance: true }
    });
    return { drivers_saved: drivers.length, compute };
  }

  static async list(scenarioId: string) {
    await ForecastingAccessService.loadScenarioOrThrow(scenarioId);
    return prisma.forecastDriver.findMany({ where: { scenarioId }, orderBy: { createdAt: "asc" } });
  }
}
