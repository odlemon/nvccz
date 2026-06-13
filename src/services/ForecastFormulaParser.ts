// @ts-nocheck
import { FORECAST_FORMULA_MAX_LENGTH } from "../constants/forecastingEngine";

type Token =
  | { type: "number"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" };

export type FormulaValidationResult = { ok: true } | { ok: false; errors: string[] };

export type FormulaEvalContext = {
  t?: number;
  "t-1"?: number;
  "t-12"?: number;
  HISTORICAL_BASE?: number;
  parameters?: Record<string, number>;
  [key: string]: unknown;
};

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      tokens.push({ type: "number", value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[a-zA-Z0-9_.-]/.test(input[j])) j++;
      tokens.push({ type: "ident", value: input.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/^><=!".includes(ch)) {
      let op = ch;
      if (i + 1 < input.length && "<>=!".includes(ch) && input[i + 1] === "=") {
        op += "=";
        i++;
      }
      tokens.push({ type: "op", value: op });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    throw new Error(`Unexpected character '${ch}' at position ${i}`);
  }
  return tokens;
}

type AstNode =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "unary"; op: string; arg: AstNode }
  | { kind: "binary"; op: string; left: AstNode; right: AstNode }
  | { kind: "call"; name: string; args: AstNode[] };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  consume(): Token {
    return this.tokens[this.pos++];
  }

  parseExpression(): AstNode {
    return this.parseComparison();
  }

  parseComparison(): AstNode {
    let node = this.parseAddSub();
    while (this.peek()?.type === "op" && ["<", "<=", ">", ">=", "==", "!="].includes((this.peek() as any).value)) {
      const op = (this.consume() as any).value;
      const right = this.parseAddSub();
      node = { kind: "binary", op, left: node, right };
    }
    return node;
  }

  parseAddSub(): AstNode {
    let node = this.parseMulDiv();
    while (this.peek()?.type === "op" && ["+", "-"].includes((this.peek() as any).value)) {
      const op = (this.consume() as any).value;
      const right = this.parseMulDiv();
      node = { kind: "binary", op, left: node, right };
    }
    return node;
  }

  parseMulDiv(): AstNode {
    let node = this.parseUnary();
    while (this.peek()?.type === "op" && ["*", "/", "^"].includes((this.peek() as any).value)) {
      const op = (this.consume() as any).value;
      const right = this.parseUnary();
      node = { kind: "binary", op, left: node, right };
    }
    return node;
  }

  parseUnary(): AstNode {
    if (this.peek()?.type === "op" && (this.peek() as any).value === "-") {
      this.consume();
      return { kind: "unary", op: "-", arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary(): AstNode {
    const tok = this.peek();
    if (!tok) throw new Error("Unexpected end of expression");
    if (tok.type === "number") {
      this.consume();
      return { kind: "num", value: tok.value };
    }
    if (tok.type === "ident") {
      const name = tok.value;
      this.consume();
      if (this.peek()?.type === "lparen") {
        this.consume();
        const args: AstNode[] = [];
        if (this.peek()?.type !== "rparen") {
          args.push(this.parseExpression());
          while (this.peek()?.type === "comma") {
            this.consume();
            args.push(this.parseExpression());
          }
        }
        if (this.peek()?.type !== "rparen") throw new Error("Expected ')'");
        this.consume();
        return { kind: "call", name: name.toUpperCase(), args };
      }
      return { kind: "var", name };
    }
    if (tok.type === "lparen") {
      this.consume();
      const node = this.parseExpression();
      if (this.peek()?.type !== "rparen") throw new Error("Expected ')'");
      this.consume();
      return node;
    }
    throw new Error(`Unexpected token ${JSON.stringify(tok)}`);
  }
}

function resolveVar(name: string, ctx: FormulaEvalContext): number {
  if (name in ctx && typeof ctx[name] === "number") return ctx[name] as number;
  if (name.startsWith("parameters.")) {
    const key = name.slice("parameters.".length);
    const v = ctx.parameters?.[key];
    if (typeof v === "number") return v;
  }
  if (ctx.parameters && name in ctx.parameters) {
    return Number(ctx.parameters[name]);
  }
  return 0;
}

function evalAst(node: AstNode, ctx: FormulaEvalContext): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "var":
      return resolveVar(node.name, ctx);
    case "unary":
      return node.op === "-" ? -evalAst(node.arg, ctx) : evalAst(node.arg, ctx);
    case "binary": {
      const l = evalAst(node.left, ctx);
      const r = evalAst(node.right, ctx);
      switch (node.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          return r === 0 ? 0 : l / r;
        case "^":
          return Math.pow(l, r);
        case "<":
          return l < r ? 1 : 0;
        case "<=":
          return l <= r ? 1 : 0;
        case ">":
          return l > r ? 1 : 0;
        case ">=":
          return l >= r ? 1 : 0;
        case "==":
          return l === r ? 1 : 0;
        case "!=":
          return l !== r ? 1 : 0;
        default:
          throw new Error(`Unknown operator ${node.op}`);
      }
    }
    case "call": {
      const args = node.args.map((a) => evalAst(a, ctx));
      switch (node.name) {
        case "IF":
          return args[0] ? args[1] : args[2] ?? 0;
        case "MIN":
          return Math.min(...args);
        case "MAX":
          return Math.max(...args);
        case "ABS":
          return Math.abs(args[0] ?? 0);
        case "ROUND":
          return Math.round((args[0] ?? 0) * Math.pow(10, args[1] ?? 0)) / Math.pow(10, args[1] ?? 0);
        default:
          throw new Error(`Unknown function ${node.name}`);
      }
    }
    default:
      return 0;
  }
}

export class ForecastFormulaParser {
  static validate(expression: string): FormulaValidationResult {
    const errors: string[] = [];
    if (!expression || typeof expression !== "string") {
      return { ok: false, errors: ["Expression is required"] };
    }
    if (expression.length > FORECAST_FORMULA_MAX_LENGTH) {
      errors.push(`Expression exceeds max length ${FORECAST_FORMULA_MAX_LENGTH}`);
    }
    if (!/^[\d\s+\-*/^().,<>=!a-zA-Z_\-]+$/.test(expression)) {
      errors.push("Expression contains disallowed characters");
    }
    try {
      const tokens = tokenize(expression);
      const parser = new Parser(tokens);
      parser.parseExpression();
      if (parser.peek()) {
        errors.push("Unexpected tokens after expression end");
      }
    } catch (e: any) {
      errors.push(e?.message || "Parse error");
    }
    return errors.length ? { ok: false, errors } : { ok: true };
  }

  static parse(expression: string): AstNode {
    const tokens = tokenize(expression);
    const parser = new Parser(tokens);
    const ast = parser.parseExpression();
    if (parser.peek()) throw new Error("Unexpected tokens after expression end");
    return ast;
  }

  static evaluate(expression: string, ctx: FormulaEvalContext): number {
    const validation = ForecastFormulaParser.validate(expression);
    if (!validation.ok) {
      throw new Error(validation.errors.join("; "));
    }
    const ast = ForecastFormulaParser.parse(expression);
    const result = evalAst(ast, ctx);
    if (!Number.isFinite(result)) return 0;
    return result;
  }

  static extractCellRefs(expression: string): string[] {
    const refs: string[] = [];
    const re = /CELL\[([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(expression))) {
      refs.push(m[1]);
    }
    return refs;
  }
}
