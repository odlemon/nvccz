// @ts-nocheck
import crypto from "crypto";

export type CellCoordinates = {
  scenarioId: string;
  periodKey: string;
  accountId: string;
  /** ForecastEntity id (maps to entity_id column). Replaces old companyProfileId. */
  entityId: string;
  /** @deprecated Alias for entityId — accepted for backwards compat during transition. */
  companyProfileId?: string;
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
    // Accept either entityId or legacy companyProfileId (hash position preserved)
    coords.entityId ?? coords.companyProfileId ?? "",
    normalizeCellDimension(coords.fundId),
    normalizeCellDimension(coords.portfolioCompanyId),
    normalizeCellDimension(coords.analyticalTag)
  ].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
