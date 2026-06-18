// @ts-nocheck
import type { ForecastDriverType } from "../constants/forecastingEngine";

/** Canonical default templates — hybrid compute uses built-in math when expression matches. */
export const DEFAULT_DRIVER_FORMULAS: Record<string, string> = {
  CAGR_DRIVEN: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
  HEADCOUNT_GROWTH: "parameters.headcount * (1 + parameters.growth_rate)^t * parameters.cost_per_head",
  INFLATION_MULTIPLIER: "HISTORICAL_BASE * (1 + parameters.inflation_rate)^t",
  FX_SCALAR: "HISTORICAL_BASE * parameters.fx_rate",
  LINEAR_REGRESSION: "parameters.slope * t + parameters.intercept"
};

const RESERVED_IDENTIFIERS = new Set([
  "t",
  "HISTORICAL_BASE",
  "IF",
  "THEN",
  "ELSE",
  "END",
  "MIN",
  "MAX",
  "ABS",
  "ROUND",
  "LAG",
  "CELL",
  "parameters"
]);

const LAG_IDENT_PATTERN = /^t-(\d+)$/;

/** Replace CELL[ref] with safe identifiers for the parser. */
export function preprocessCellRefs(expression: string): {
  expression: string;
  cellRefs: string[];
} {
  const cellRefs: string[] = [];
  const expressionOut = expression.replace(/CELL\[([^\]]+)\]/gi, (_match, ref: string) => {
    const idx = cellRefs.length;
    cellRefs.push(String(ref).trim());
    const safe = ref.replace(/[^a-zA-Z0-9_]/g, "_");
    return `__CELL_${idx}_${safe}__`;
  });
  return { expression: expressionOut, cellRefs };
}

function collapseWhitespace(expr: string): string {
  return expr.replace(/\s+/g, " ").trim();
}

/** Rewrite IF cond THEN a ELSE b [END] → IF(cond, a, b) (nested-safe). */
export function normalizeIfThenElse(expression: string): string {
  const upper = expression.toUpperCase();
  let out = "";
  let i = 0;

  while (i < expression.length) {
    const rest = upper.slice(i);
    if (rest.startsWith("IF") && (i === 0 || /\W/.test(expression[i - 1]))) {
      const afterIf = skipWs(expression, i + 2);
      if (expression[afterIf] === "(") {
        out += expression[i];
        i++;
        continue;
      }
      const condEnd = findKeyword(expression, afterIf, "THEN");
      if (!condEnd) {
        out += expression[i];
        i++;
        continue;
      }
      const cond = expression.slice(afterIf, condEnd.start).trim();
      const afterThen = skipWs(expression, condEnd.end);
      const elseEnd = findKeyword(expression, afterThen, "ELSE");
      if (!elseEnd) {
        out += expression[i];
        i++;
        continue;
      }
      const thenExpr = expression.slice(afterThen, elseEnd.start).trim();
      const afterElse = skipWs(expression, elseEnd.end);
      let elseExpr: string;
      let endPos: number;
      const endKw = findKeyword(expression, afterElse, "END");
      if (endKw && endKw.start === afterElse) {
        elseExpr = expression.slice(afterElse, endKw.start).trim();
        endPos = endKw.end;
      } else {
        elseExpr = readBalancedSegment(expression, afterElse);
        endPos = afterElse + elseExpr.length;
      }
      out += `IF(${cond}, ${thenExpr}, ${elseExpr})`;
      i = endPos;
      continue;
    }
    out += expression[i];
    i++;
  }
  return collapseWhitespace(out);
}

function skipWs(s: string, pos: number): number {
  while (pos < s.length && /\s/.test(s[pos])) pos++;
  return pos;
}

function findKeyword(s: string, from: number, keyword: string): { start: number; end: number } | null {
  const upper = s.toUpperCase();
  let depth = 0;
  let i = from;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && upper.slice(i, i + keyword.length) === keyword) {
      const before = i === 0 ? "" : s[i - 1];
      const after = s[i + keyword.length] ?? "";
      if ((!before || /\W/.test(before)) && (!after || /\W/.test(after))) {
        return { start: i, end: i + keyword.length };
      }
    }
    i++;
  }
  return null;
}

/** Read until top-level keyword ELSE/END sibling or end of string (for ELSE branch). */
function readBalancedSegment(s: string, from: number): string {
  let depth = 0;
  let i = from;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const upper = s.toUpperCase();
      if (upper.slice(i, i + 4) === " END" || upper.slice(i).startsWith("END")) break;
      if (upper.slice(i, i + 3) === " IF" || (i > from && upper.slice(i).startsWith("IF"))) break;
    }
    i++;
  }
  return s.slice(from, i).trim();
}

export function normalizeFormulaDialect(expression: string): string {
  if (!expression || typeof expression !== "string") return "";
  const withCells = preprocessCellRefs(expression);
  const normalized = normalizeIfThenElse(withCells.expression);
  return collapseWhitespace(normalized);
}

export function isDefaultDriverFormula(driverType: string, expression: string): boolean {
  const defaultExpr = DEFAULT_DRIVER_FORMULAS[driverType];
  if (!defaultExpr) return false;
  return normalizeFormulaDialect(expression) === normalizeFormulaDialect(defaultExpr);
}

export function resolveDefaultDriverFormula(driverType: string): string | null {
  return DEFAULT_DRIVER_FORMULAS[driverType] ?? null;
}

export type FormulaDependencies = {
  parameterKeys: string[];
  cellRefs: string[];
  lagPeriods: number[];
};

export function extractFormulaDependencies(expression: string): FormulaDependencies {
  const normalized = normalizeFormulaDialect(expression);
  const { cellRefs } = preprocessCellRefs(expression);
  const parameterKeys = new Set<string>();
  const lagPeriods = new Set<number>();

  const lagCallRe = /\bLAG\s*\(\s*(\d+)\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = lagCallRe.exec(normalized))) {
    lagPeriods.add(Number(m[1]));
  }

  const identRe = /\b([a-zA-Z_][a-zA-Z0-9_.-]*)\b/g;
  while ((m = identRe.exec(normalized))) {
    const name = m[1];
    if (name.startsWith("__CELL_")) continue;
    if (RESERVED_IDENTIFIERS.has(name.toUpperCase()) || name === "t") continue;
    const lagMatch = name.match(LAG_IDENT_PATTERN);
    if (lagMatch) {
      lagPeriods.add(Number(lagMatch[1]));
      continue;
    }
    if (name.startsWith("parameters.")) {
      parameterKeys.add(name.slice("parameters.".length));
    } else if (name !== "parameters") {
      parameterKeys.add(name);
    }
  }

  if (/\bHISTORICAL_BASE\b/.test(normalized)) {
    parameterKeys.add("historical_base");
  }

  return {
    parameterKeys: [...parameterKeys],
    cellRefs,
    lagPeriods: [...lagPeriods].sort((a, b) => a - b)
  };
}

/** Parameter keys that may be non-numeric strings in the parameters panel. */
export const NON_NUMERIC_PARAMETER_KEYS = new Set(["tx_currency"]);

export function validateDriverParameters(
  expression: string,
  parameters: Record<string, unknown> | null | undefined
): { missing: string[]; invalid: Array<{ key: string; message: string }> } {
  const required = extractFormulaDependencies(expression).parameterKeys;
  const missing: string[] = [];
  const invalid: Array<{ key: string; message: string }> = [];

  if (required.length && (parameters == null || typeof parameters !== "object")) {
    return {
      missing: required,
      invalid: [{ key: "*", message: "parameters object is required when the formula references driver parameters" }]
    };
  }

  const params = parameters || {};
  for (const key of required) {
    if (!(key in params)) {
      missing.push(key);
      continue;
    }
    if (NON_NUMERIC_PARAMETER_KEYS.has(key)) continue;
    const v = params[key];
    if (v === null || v === undefined || v === "") {
      invalid.push({ key, message: `Parameter "${key}" must be a number` });
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) {
      invalid.push({ key, message: `Parameter "${key}" must be a valid number` });
    }
  }

  return { missing, invalid };
}

export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
