import { Decimal } from "@prisma/client/runtime/library";

function isPrismaDecimal(v: unknown): v is Decimal {
  return v instanceof Decimal;
}

function decimalToFiniteNumber(d: Decimal): number {
  const n = d.toNumber();
  if (Number.isFinite(n)) return n;
  const p = parseFloat(d.toString());
  return Number.isFinite(p) ? p : 0;
}

/**
 * Recursively turns Prisma `Decimal` values into finite JSON numbers so clients never see
 * Decimal objects (or odd serialization) that break `Number(x)` / `.toFixed()`.
 */
export function serializeDecimalsDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (isPrismaDecimal(value as unknown)) {
    return decimalToFiniteNumber(value as unknown as Decimal) as T;
  }
  if (typeof value === "bigint") {
    return Number(value) as T;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((x) => serializeDecimalsDeep(x)) as T;
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeDecimalsDeep(v);
    }
    return out as T;
  }
  return value;
}
