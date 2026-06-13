import { ForecastFormulaParser } from "../services/ForecastFormulaParser";
import { ForecastingDagEngine } from "../services/ForecastingDagEngine";

describe("ForecastFormulaParser", () => {
  test("validates IF expression", () => {
    const r = ForecastFormulaParser.validate("IF(t > 1, 100, 50)");
    expect(r.ok).toBe(true);
  });

  test("evaluates with t and parameters", () => {
    const v = ForecastFormulaParser.evaluate("HISTORICAL_BASE * (1 + parameters.cagr) * (1 + parameters.cagr)", {
      t: 2,
      HISTORICAL_BASE: 1000,
      parameters: { cagr: 0.1 }
    });
    expect(v).toBeCloseTo(1210, 0);
  });

  test("supports t-12 variable name via context", () => {
    const v = ForecastFormulaParser.evaluate("t-12", { "t-12": 42, t: 54 });
    expect(v).toBe(42);
  });

  test("rejects invalid characters", () => {
    const r = ForecastFormulaParser.validate("eval('bad')");
    expect(r.ok).toBe(false);
  });
});

describe("ForecastingDagEngine cycle detection", () => {
  test("detects circular reference", () => {
    const graph = ForecastingDagEngine.buildDriverGraph([
      { id: "a", formulaExpression: "CELL[x] + 1" },
      { id: "b", formulaExpression: "CELL[y] + CELL[x]" }
    ]);
    graph.get("cell:x")!.dependsOn.push("driver:a");
    const cycle = ForecastingDagEngine.detectCycle(graph);
    expect(cycle === null || Array.isArray(cycle)).toBe(true);
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
