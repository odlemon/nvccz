// @ts-nocheck
/**
 * Canonical planning cell selection — one row per coordinate.
 * Prefer non-null value, then newest updatedAt.
 */

export type CellCoordLike = {
  id?: string;
  lineItemId: string;
  periodDate: Date | string;
  entityId?: string | null;
  departmentId?: string | null;
  costCentreId?: string | null;
  value?: unknown;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export function periodKey(periodDate: Date | string): string {
  return new Date(periodDate).toISOString().slice(0, 10);
}

export function cellCoordKey(c: CellCoordLike): string {
  return [
    c.lineItemId,
    periodKey(c.periodDate),
    c.entityId || "",
    c.departmentId || "",
    c.costCentreId || "",
  ].join("|");
}

/** Prefer non-null value; tie-break by updatedAt/createdAt/id. */
export function isBetterCanonicalCell(candidate: CellCoordLike, incumbent: CellCoordLike): boolean {
  const candVal = candidate.value != null;
  const incVal = incumbent.value != null;
  if (candVal && !incVal) return true;
  if (!candVal && incVal) return false;
  const candTs = new Date(candidate.updatedAt || candidate.createdAt || 0).getTime();
  const incTs = new Date(incumbent.updatedAt || incumbent.createdAt || 0).getTime();
  if (candTs !== incTs) return candTs > incTs;
  return String(candidate.id || "") > String(incumbent.id || "");
}

export function pickCanonicalCells<T extends CellCoordLike>(cells: T[]): T[] {
  const map = new Map<string, T>();
  for (const c of cells) {
    const k = cellCoordKey(c);
    const prev = map.get(k);
    if (!prev || isBetterCanonicalCell(c, prev)) map.set(k, c);
  }
  return [...map.values()];
}

/** Last-wins map but never overwrite a non-null with null. */
export function mergeLineValuesByCode(
  cells: Array<{ lineItem?: { code?: string | null } | null; value?: unknown }>,
  opts: { nullAsZero?: boolean } = {}
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const c of cells) {
    const code = c.lineItem?.code ? String(c.lineItem.code).toUpperCase() : null;
    if (!code) continue;
    const raw = c.value != null ? Number(c.value) : null;
    if (out[code] != null && raw == null) continue;
    if (raw == null) {
      if (opts.nullAsZero && out[code] === undefined) out[code] = 0;
      else if (out[code] === undefined) out[code] = null;
    } else {
      out[code] = raw;
    }
  }
  return out;
}
