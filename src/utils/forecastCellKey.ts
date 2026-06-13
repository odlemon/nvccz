// @ts-nocheck
import crypto from "crypto";

export type CellCoordinates = {
  scenarioId: string;
  periodKey: string;
  accountId: string;
  entityId: string;
  fundId?: string | null;
  portfolioCompanyId?: string | null;
  analyticalTag?: string | null;
};

export function normalizeCellDimension(v: string | null | undefined): string {
  return (v ?? "").trim();
}

export function buildCellNaturalKeyHash(coords: CellCoordinates): string {
  const canonical = [
    coords.scenarioId,
    coords.periodKey,
    coords.accountId,
    coords.entityId,
    normalizeCellDimension(coords.fundId),
    normalizeCellDimension(coords.portfolioCompanyId),
    normalizeCellDimension(coords.analyticalTag)
  ].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
