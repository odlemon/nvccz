// @ts-nocheck
import { prisma } from "../utils/database";
import { FORECAST_DRIVER_TYPES, FORECAST_ERROR_CODES } from "../constants/forecastingEngine";
import {
  normalizeFormulaDialect,
  resolveDefaultDriverFormula
} from "../utils/forecastFormulaDialect";
import { ForecastFormulaParser } from "./ForecastFormulaParser";
import { ForecastingDagEngine } from "./ForecastingDagEngine";
import { ForecastingAccessService } from "./ForecastingAccessService";
import { ForecastingAuditService } from "./ForecastingAuditService";
import { ForecastingComputeService } from "./ForecastingComputeService";
import { ForecastingError } from "./ForecastingError";

export class ForecastingDriverService {
  static async replaceDrivers(
    scenarioId: string,
    user: { id: string },
    drivers: Array<{
      target_account_range_start: number;
      target_account_range_end: number;
      driver_type: string;
      formula_expression: string;
      parameters: Record<string, unknown>;
    }>
  ) {
    const scenario = await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    ForecastingAccessService.assertScenarioEditable(scenario);

    const normalizedDrivers = drivers.map((d) => {
      const formula_expression =
        String(d.formula_expression || "").trim() ||
        resolveDefaultDriverFormula(d.driver_type) ||
        "0";
      return { ...d, formula_expression: normalizeFormulaDialect(formula_expression) };
    });

    for (const d of normalizedDrivers) {
      if (!FORECAST_DRIVER_TYPES.includes(d.driver_type as any)) {
        throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_FORMULA, `Unknown driver_type ${d.driver_type}`, 400);
      }
      const validation = ForecastFormulaParser.validateRich(d.formula_expression, {
        parameters: d.parameters || {},
        requireParameters: true
      });
      if (!validation.valid) {
        throw ForecastingError.invalidFormula(validation.errors.join("; "));
      }
    }

    ForecastingDagEngine.validateScenarioDrivers(
      normalizedDrivers.map((d, i) => ({
        id: String(i),
        formulaExpression: d.formula_expression,
        targetAccountRangeStart: d.target_account_range_start,
        targetAccountRangeEnd: d.target_account_range_end
      }))
    );

    await prisma.$transaction(
      async (tx) => {
        await tx.forecastDriver.deleteMany({ where: { scenarioId } });
        if (normalizedDrivers.length) {
          await tx.forecastDriver.createMany({
            data: normalizedDrivers.map((d) => ({
              scenarioId,
              targetAccountRangeStart: d.target_account_range_start,
              targetAccountRangeEnd: d.target_account_range_end,
              driverType: d.driver_type,
              formulaExpression: d.formula_expression,
              parameters: d.parameters || {}
            }))
          });
        }
        await ForecastingAuditService.log(tx, {
          scenarioId,
          userId: user.id,
          actionType: "DRIVER_UPDATE",
          deltaPayload: {
            driver_count: normalizedDrivers.length,
            drivers: normalizedDrivers.map((d) => ({
              driver_type: d.driver_type,
              target_account_range_start: d.target_account_range_start,
              target_account_range_end: d.target_account_range_end,
              formula_expression: d.formula_expression,
              parameters: d.parameters || {}
            }))
          }
        });
      },
      { maxWait: 15_000, timeout: 30_000 }
    );

    const compute = await ForecastingComputeService.run({
      scenarioId,
      editType: "DRIVER",
      user,
      userId: user.id,
      options: { skip_manual_overrides: false, include_elapsed_variance: true }
    });
    return { drivers_saved: normalizedDrivers.length, compute };
  }

  static async list(scenarioId: string, user?: any) {
    await ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
    return prisma.forecastDriver.findMany({ where: { scenarioId }, orderBy: { createdAt: "asc" } });
  }
}
