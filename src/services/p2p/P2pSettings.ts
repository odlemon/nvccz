//@ts-nocheck
/**
 * The configuration that drives the purchase-to-pay controls: matching tolerances and enforcement, the PO approval switch and the
 * AI controls. One read path so that a change in Configuration is what every service acts on (short cache, invalidated on save).
 */
import { prisma } from "../../utils/database";

export type P2pConfig = {
  overDeliveryTolerancePct: number;
  matchPriceVariancePct: number;
  matchQtyTolerancePct: number;
  matchValueTolerancePct: number;
  matchTaxTolerancePct: number;
  matchAmountToleranceAbs: number;
  matchEnforcement: "ENFORCE" | "WARN";
  poApprovalRequired: boolean;
  aiEnabled: boolean;
  aiMonthlyDocumentLimit: number | null;
  aiMonthlyCallLimit: number | null;
  aiAllowedRoleCodes: string[];
  aiAllowedDocumentTypes: string[];
};

let cache: { at: number; value: P2pConfig } | null = null;

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return v == null || !Number.isFinite(n) || n < 0 ? fallback : n;
};
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);

export function invalidateP2pConfig() {
  cache = null;
}

export async function getP2pConfig(): Promise<P2pConfig> {
  if (cache && Date.now() - cache.at < 5000) return cache.value;
  const row: any = await prisma.procurementSettings.findUnique({ where: { id: "default" } }).catch(() => null);
  const value: P2pConfig = {
    overDeliveryTolerancePct: num(row?.overDeliveryTolerancePct, 5),
    matchPriceVariancePct: num(row?.matchPriceVariancePct, 2),
    matchQtyTolerancePct: num(row?.matchQtyTolerancePct, 0),
    matchValueTolerancePct: num(row?.matchValueTolerancePct, 2),
    matchTaxTolerancePct: num(row?.matchTaxTolerancePct, 1),
    matchAmountToleranceAbs: num(row?.matchAmountToleranceAbs, 0.5),
    matchEnforcement: String(row?.matchEnforcement || "ENFORCE").toUpperCase() === "WARN" ? "WARN" : "ENFORCE",
    poApprovalRequired: row?.poApprovalRequired === true,
    aiEnabled: row?.aiEnabled !== false,
    aiMonthlyDocumentLimit: row?.aiMonthlyDocumentLimit == null ? null : Number(row.aiMonthlyDocumentLimit),
    aiMonthlyCallLimit: row?.aiMonthlyCallLimit == null ? null : Number(row.aiMonthlyCallLimit),
    aiAllowedRoleCodes: list(row?.aiAllowedRoleCodes),
    aiAllowedDocumentTypes: list(row?.aiAllowedDocumentTypes),
  };
  cache = { at: Date.now(), value };
  return value;
}

/** Normalises and validates a settings patch for the p2p fields. Returns the prisma data and throws a plain message when a value is not valid. */
export function p2pSettingsPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const pct = (key: string, max = 100) => {
    if (patch[key] === undefined) return;
    const n = Number(patch[key]);
    if (patch[key] === null || patch[key] === "" || !Number.isFinite(n) || n < 0 || n > max) throw new Error(`${key} must be a number between 0 and ${max}.`);
    data[key] = n;
  };
  pct("matchValueTolerancePct");
  pct("matchTaxTolerancePct");
  pct("matchAmountToleranceAbs", 1_000_000);
  if (patch.matchEnforcement !== undefined) {
    const v = String(patch.matchEnforcement).toUpperCase();
    if (!["ENFORCE", "WARN"].includes(v)) throw new Error("matchEnforcement must be ENFORCE or WARN.");
    data.matchEnforcement = v;
  }
  if (patch.poApprovalRequired !== undefined) data.poApprovalRequired = patch.poApprovalRequired === true || patch.poApprovalRequired === "true";
  if (patch.aiEnabled !== undefined) data.aiEnabled = patch.aiEnabled === true || patch.aiEnabled === "true";
  for (const key of ["aiMonthlyDocumentLimit", "aiMonthlyCallLimit"]) {
    if (patch[key] === undefined) continue;
    if (patch[key] === null || patch[key] === "") {
      data[key] = null;
      continue;
    }
    const n = Number(patch[key]);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${key} must be a whole number of 0 or more, or empty for no limit.`);
    data[key] = n;
  }
  for (const key of ["aiAllowedRoleCodes", "aiAllowedDocumentTypes"]) {
    if (patch[key] === undefined) continue;
    const raw = patch[key];
    const arr = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
    data[key] = arr.map((x) => String(x).trim()).filter(Boolean);
  }
  return data;
}
