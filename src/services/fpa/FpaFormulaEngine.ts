// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";

const LINE_RE = /LINE\s*\(\s*['"]([^'"]+)['"]\s*\)/gi;
const DRIVER_RE = /DRIVER\s*\(\s*['"]([^'"]+)['"]\s*\)/gi;
const SAFE_EXPR_RE = /^[\d\s+\-*/().,A-Z_'"=<>!&|]+$/i;

export class FpaFormulaEngine {
  static extractLineCodes(expr: string): string[] {
    const codes: string[] = [];
    let m;
    const re = new RegExp(LINE_RE.source, "gi");
    while ((m = re.exec(expr || "")) !== null) codes.push(m[1]);
    return [...new Set(codes)];
  }

  static extractDriverCodes(expr: string): string[] {
    const codes: string[] = [];
    let m;
    const re = new RegExp(DRIVER_RE.source, "gi");
    while ((m = re.exec(expr || "")) !== null) codes.push(m[1]);
    return [...new Set(codes)];
  }

  static validateExpression(expr: string): { valid: boolean; message?: string; lineCodes: string[]; driverCodes: string[] } {
    if (!expr || !String(expr).trim()) {
      return { valid: false, message: "Expression is empty", lineCodes: [], driverCodes: [] };
    }
    const normalized = String(expr).trim();
    const lineCodes = FpaFormulaEngine.extractLineCodes(normalized);
    const driverCodes = FpaFormulaEngine.extractDriverCodes(normalized);
    let probe = normalized
      .replace(LINE_RE, "1")
      .replace(DRIVER_RE, "1")
      .replace(/IF\s*\(/gi, "IF(");
    // Allow IF(cond,a,b) tokens for validation
    probe = probe.replace(/IF\(/gi, "(");
    if (!SAFE_EXPR_RE.test(probe.replace(/,/g, ""))) {
      return { valid: false, message: "Expression contains unsupported characters", lineCodes, driverCodes };
    }
    try {
      FpaFormulaEngine.evaluate(normalized, { lines: {}, drivers: {} });
    } catch (e: any) {
      return { valid: false, message: e?.message || "Invalid expression", lineCodes, driverCodes };
    }
    return { valid: true, lineCodes, driverCodes };
  }

  static detectCircular(deps: Record<string, string[]>): { circular: boolean; path?: string[] } {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const path: string[] = [];

    function dfs(node: string): boolean {
      if (visiting.has(node)) {
        path.push(node);
        return true;
      }
      if (visited.has(node)) return false;
      visiting.add(node);
      path.push(node);
      for (const next of deps[node] || []) {
        if (dfs(next)) return true;
      }
      path.pop();
      visiting.delete(node);
      visited.add(node);
      return false;
    }

    for (const key of Object.keys(deps)) {
      path.length = 0;
      if (dfs(key)) return { circular: true, path: [...path] };
    }
    return { circular: false };
  }

  static evaluate(
    expr: string,
    ctx: { lines: Record<string, number>; drivers: Record<string, number> }
  ): number {
    let s = String(expr || "").trim();
    s = s.replace(LINE_RE, (_, code) => String(Number(ctx.lines[code] ?? 0)));
    s = s.replace(DRIVER_RE, (_, code) => String(Number(ctx.drivers[code] ?? 0)));

    // IF(cond, a, b) — recursive simple form
    const ifRe = /IF\s*\(([^,]+),([^,]+),([^)]+)\)/i;
    while (ifRe.test(s)) {
      s = s.replace(ifRe, (_, cond, a, b) => {
        const c = FpaFormulaEngine.evalArithmetic(String(cond).trim());
        return String(c ? FpaFormulaEngine.evalArithmetic(String(a).trim()) : FpaFormulaEngine.evalArithmetic(String(b).trim()));
      });
    }
    return FpaFormulaEngine.evalArithmetic(s);
  }

  static evalArithmetic(expr: string): number {
    let e = String(expr || "").trim();
    e = e.replace(/<>/g, "!=");
    // Comparison inside IF already reduced; support simple boolean -> 1/0
    if (/[<>!=]/.test(e) && !/^[\d.\s+\-*/()]+$/.test(e)) {
      const m = e.match(/^(.+?)(<=|>=|==|!=|<|>)(.+)$/);
      if (m) {
        const left = FpaFormulaEngine.evalArithmetic(m[1]);
        const right = FpaFormulaEngine.evalArithmetic(m[3]);
        const op = m[2];
        let ok = false;
        if (op === "<") ok = left < right;
        else if (op === ">") ok = left > right;
        else if (op === "<=") ok = left <= right;
        else if (op === ">=") ok = left >= right;
        else if (op === "==" || op === "=") ok = left === right;
        else if (op === "!=") ok = left !== right;
        return ok ? 1 : 0;
      }
    }
    if (!/^[\d.\s+\-*/()]+$/.test(e)) {
      throw new FpaError(400, "INVALID_EXPR", `Cannot evaluate: ${expr}`);
    }
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${e});`);
    const v = fn();
    if (typeof v !== "number" || Number.isNaN(v) || !Number.isFinite(v)) {
      throw new FpaError(400, "INVALID_EXPR", `Non-numeric result for: ${expr}`);
    }
    return v;
  }

  static async dependencyCheck(modelId: string, formulaId: string | null, dependsOnLineItemCodes: string[]) {
    const formulas = await prisma.planningFormula.findMany({
      where: { modelId },
      include: { lineItem: { select: { id: true, code: true } } },
    });
    const codeToFormulaId: Record<string, string> = {};
    for (const f of formulas) {
      if (f.lineItem?.code) codeToFormulaId[f.lineItem.code] = f.id;
    }

    const deps: Record<string, string[]> = {};
    for (const f of formulas) {
      const codes = FpaFormulaEngine.extractLineCodes(f.expression);
      deps[f.id] = codes.map((c) => codeToFormulaId[c]).filter(Boolean);
    }

    const selfId = formulaId || "__NEW__";
    if (!formulaId) {
      deps[selfId] = (dependsOnLineItemCodes || [])
        .map((c) => codeToFormulaId[c])
        .filter(Boolean);
    } else {
      deps[formulaId] = (dependsOnLineItemCodes || [])
        .map((c) => codeToFormulaId[c])
        .filter(Boolean);
    }

    const circular = FpaFormulaEngine.detectCircular(deps);
    return {
      ok: !circular.circular,
      circular: circular.circular,
      path: circular.path || [],
      dependsOnLineItemCodes: dependsOnLineItemCodes || [],
    };
  }
}
