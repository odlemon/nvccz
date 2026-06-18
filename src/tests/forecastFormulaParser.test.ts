import { ForecastFormulaParser } from "../services/ForecastFormulaParser";
import { ForecastingDagEngine } from "../services/ForecastingDagEngine";
import { ForecastingComputeService } from "../services/ForecastingComputeService";
import {
  isDefaultDriverFormula,
  normalizeFormulaDialect,
  preprocessCellRefs,
  validateDriverParameters
} from "../utils/forecastFormulaDialect";

describe("forecastFormulaDialect", () => {
  test("normalizes IF THEN ELSE", () => {
    const raw = "IF t > 3 THEN HISTORICAL_BASE * 1.05 ELSE HISTORICAL_BASE";
    expect(normalizeFormulaDialect(raw)).toBe(
      "IF(t > 3, HISTORICAL_BASE * 1.05, HISTORICAL_BASE)"
    );
  });

  test("isDefaultDriverFormula for CAGR", () => {
    expect(
      isDefaultDriverFormula(
        "CAGR_DRIVEN",
        "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t"
      )
    ).toBe(true);
    expect(
      isDefaultDriverFormula(
        "CAGR_DRIVEN",
        "IF t > 3 THEN HISTORICAL_BASE * 1.05 ELSE HISTORICAL_BASE"
      )
    ).toBe(false);
  });

  test("preprocessCellRefs", () => {
    const { expression, cellRefs } = preprocessCellRefs("CELL[2026-06|4000] + 1");
    expect(cellRefs).toEqual(["2026-06|4000"]);
    expect(expression).toContain("__CELL_0_");
  });
});

describe("ForecastFormulaParser", () => {
  test("validates IF expression", () => {
    const r = ForecastFormulaParser.validate("IF(t > 1, 100, 50)");
    expect(r.ok).toBe(true);
  });

  test("validates IF THEN ELSE dialect", () => {
    const r = ForecastFormulaParser.validateRich(
      "IF t > 1 THEN 100 ELSE 50",
      { parameters: {} }
    );
    expect(r.valid).toBe(true);
    expect(r.normalized_expression).toContain("IF(t > 1");
  });

  test("evaluates CAGR with correct exponent precedence", () => {
    const v = ForecastFormulaParser.evaluate("HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t", {
      t: 2,
      HISTORICAL_BASE: 10000,
      parameters: { cagr_scalar: 0.05 }
    });
    expect(v).toBeCloseTo(11025, 0);
  });

  test("LAG uses lag resolver", () => {
    const v = ForecastFormulaParser.evaluate("LAG(1) + t", {
      t: 3,
      lag: (n) => (n === 1 ? 100 : 0)
    });
    expect(v).toBe(103);
  });

  test("t-12 resolves via lag cell value", () => {
    const v = ForecastFormulaParser.evaluate("t-12", {
      t: 14,
      lag: (n) => (n === 12 ? 42000 : 0)
    });
    expect(v).toBe(42000);
  });

  test("validateRich reports missing parameters when required", () => {
    const r = ForecastFormulaParser.validateRich(
      "HISTORICAL_BASE * parameters.cagr_scalar",
      { parameters: {}, requireParameters: true }
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("cagr_scalar"))).toBe(true);
  });

  test("validateDriverParameters requires historical_base when HISTORICAL_BASE used", () => {
    const r = validateDriverParameters(
      "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
      { cagr_scalar: 0.05 }
    );
    expect(r.missing).toContain("historical_base");
  });

  test("rejects invalid characters", () => {
    const r = ForecastFormulaParser.validate("eval('bad')");
    expect(r.ok).toBe(false);
  });
});

describe("ForecastingComputeService.validateFormula", () => {
  test("invalid when parameters missing", async () => {
    const r = await ForecastingComputeService.validateFormula({
      expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
      parameters: { cagr_scalar: 0.05 },
      driver_type: "CAGR_DRIVEN"
    });
    expect(r.valid).toBe(false);
    expect(r.parameter_errors.some((e) => e.key === "historical_base")).toBe(true);
    expect(r.sample_result).toBeNull();
  });

  test("valid with complete parameters", async () => {
    const r = await ForecastingComputeService.validateFormula({
      expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
      parameters: { cagr_scalar: 0.05, historical_base: 10000, tx_currency: "USD" },
      driver_type: "CAGR_DRIVEN",
      sample_t: 2
    });
    expect(r.valid).toBe(true);
    expect(r.sample_result).not.toBeNull();
    expect(r.uses_builtin_path).toBe(true);
    expect(r.expression_errors).toEqual([]);
    expect(r.parameter_errors).toEqual([]);
  });
});

describe("ForecastingDagEngine", () => {
  test("detects overlapping account ranges", () => {
    expect(() =>
      ForecastingDagEngine.validateScenarioDrivers([
        {
          id: "0",
          formulaExpression: "100",
          targetAccountRangeStart: 4000,
          targetAccountRangeEnd: 4999
        },
        {
          id: "1",
          formulaExpression: "200",
          targetAccountRangeStart: 4500,
          targetAccountRangeEnd: 5999
        }
      ])
    ).toThrow();
  });

  test("detects same-period CELL self ref without lag", () => {
    expect(() =>
      ForecastingDagEngine.validateScenarioDrivers([
        {
          id: "0",
          formulaExpression: "CELL[2026-06|4500] + 1",
          targetAccountRangeStart: 4000,
          targetAccountRangeEnd: 4999
        }
      ])
    ).toThrow();
  });

  test("topological sort on acyclic graph", () => {
    const graph = ForecastingDagEngine.buildDriverGraph([
      { id: "a", formulaExpression: "100" },
      { id: "b", formulaExpression: "200" }
    ]);
    const sorted = ForecastingDagEngine.topologicalSort(graph);
    expect(sorted.length).toBeGreaterThan(0);
  });
});
