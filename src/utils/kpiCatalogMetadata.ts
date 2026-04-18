// @ts-nocheck
import type { HardcodedKPI } from "../config/hardcodedKPIs";
import { HARDCODED_KPIS } from "../config/hardcodedKPIs";

/**
 * Resolves accounting config for a KPI row: prefer DB catalog fields when fully populated,
 * else fall back to `HARDCODED_KPIS` by name or code (legacy).
 */
export function resolveKpiAccountingConfig(kpi: {
  name: string;
  code: string | null;
  catalogDescription: string | null;
  catalogDepartmentName: string | null;
  accountType: string | null;
  accountNumber: string | null;
  journalEntryType: string | null;
  isFinancial: boolean;
}): HardcodedKPI | null {
  const descOk =
    kpi.catalogDescription != null && String(kpi.catalogDescription).trim() !== "";
  const fullDb =
    kpi.code &&
    descOk &&
    kpi.catalogDepartmentName &&
    kpi.accountType &&
    kpi.journalEntryType;

  if (fullDb) {
    return {
      code: kpi.code,
      name: kpi.name,
      department: kpi.catalogDepartmentName,
      description: String(kpi.catalogDescription),
      accountType: kpi.accountType as HardcodedKPI["accountType"],
      accountNumber: kpi.accountNumber ?? undefined,
      journalEntryType: kpi.journalEntryType as HardcodedKPI["journalEntryType"],
      isFinancial: kpi.isFinancial,
    };
  }

  const byName = HARDCODED_KPIS.find(
    (h) => String(h.name).toLowerCase().trim() === String(kpi.name).toLowerCase().trim()
  );
  if (byName) {
    return byName;
  }
  if (kpi.code) {
    return HARDCODED_KPIS.find((h) => h.code === kpi.code) ?? null;
  }
  return null;
}

/**
 * Shapes enrichment payload for list endpoints: DB catalog wins over file-based match.
 */
export function buildHardcodedDetailsForResponse(
  kpi: {
    code: string | null;
    catalogDescription: string | null;
    catalogDepartmentName: string | null;
    accountType: string | null;
    accountNumber: string | null;
    journalEntryType: string | null;
    isFinancial: boolean;
  },
  hardcodedByName: HardcodedKPI | undefined | null
): {
  code: string;
  description: string;
  department: string;
  accountType: HardcodedKPI["accountType"];
  accountNumber?: string;
  journalEntryType: HardcodedKPI["journalEntryType"];
  isFinancial: boolean;
} | null {
  const descOk =
    kpi.catalogDescription != null && String(kpi.catalogDescription).trim() !== "";
  const hasDb =
    kpi.code &&
    descOk &&
    kpi.catalogDepartmentName &&
    kpi.accountType &&
    kpi.journalEntryType;

  if (hasDb) {
    return {
      code: kpi.code,
      description: String(kpi.catalogDescription),
      department: kpi.catalogDepartmentName,
      accountType: kpi.accountType as HardcodedKPI["accountType"],
      accountNumber: kpi.accountNumber ?? undefined,
      journalEntryType: kpi.journalEntryType as HardcodedKPI["journalEntryType"],
      isFinancial: kpi.isFinancial,
    };
  }

  if (hardcodedByName) {
    return {
      code: hardcodedByName.code,
      description: hardcodedByName.description,
      department: hardcodedByName.department,
      accountType: hardcodedByName.accountType,
      accountNumber: hardcodedByName.accountNumber,
      journalEntryType: hardcodedByName.journalEntryType,
      isFinancial: hardcodedByName.isFinancial,
    };
  }

  return null;
}
