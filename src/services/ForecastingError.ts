// @ts-nocheck
import { FORECAST_ERROR_CODES } from "../constants/forecastingEngine";

export class ForecastingError extends Error {
  code: string;
  statusCode: number;
  details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = "ForecastingError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  static locked(message = "Scenario is locked and cannot be modified") {
    return new ForecastingError(FORECAST_ERROR_CODES.FORECAST_LOCKED, message, 403);
  }

  static notFound(message = "Scenario not found") {
    return new ForecastingError(FORECAST_ERROR_CODES.SCENARIO_NOT_FOUND, message, 404);
  }

  static circularReference(cycle: string[]) {
    return new ForecastingError(
      FORECAST_ERROR_CODES.CIRCULAR_REFERENCE,
      "Circular reference detected in driver dependency graph",
      409,
      { cycle }
    );
  }

  static staleCellEdit() {
    return new ForecastingError(
      FORECAST_ERROR_CODES.STALE_CELL_EDIT,
      "Cell was modified by another user",
      409
    );
  }

  static invalidFormula(message: string) {
    return new ForecastingError(FORECAST_ERROR_CODES.INVALID_FORMULA, message, 400);
  }

  static featureDisabled() {
    return new ForecastingError(
      FORECAST_ERROR_CODES.FEATURE_DISABLED,
      "Forecasting engine is disabled",
      503
    );
  }
}
