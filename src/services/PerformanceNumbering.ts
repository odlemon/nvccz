// @ts-nocheck
import { prisma } from "../utils/database";

/**
 * Reference numbers for Performance records (RK-001, CA-001 …). The prefix and width are configurable in
 * performance_settings under the key `numbering` ({ risk: { prefix, pad }, … }); the number is the highest
 * existing one for that prefix plus one, and callers retry on the unique index if two creates race.
 */
export const NUMBERING_DEFAULTS = {
  risk: { prefix: "RK-", pad: 3 },
  corrective: { prefix: "CA-", pad: 3 },
  alert: { prefix: "AL-", pad: 3 },
  document: { prefix: "DOC-", pad: 4 },
  contract: { prefix: "PC-", pad: 4 },
  report: { prefix: "RPT-", pad: 3 }
} as const;

export async function numberingConfig(kind: keyof typeof NUMBERING_DEFAULTS) {
  const row = await prisma.performanceSetting.findUnique({ where: { settingKey: "workflow.numbering" } });
  const v = (row?.value as any) || {};
  const d = NUMBERING_DEFAULTS[kind];
  const prefix = typeof v?.[kind]?.prefix === "string" && v[kind].prefix.trim() ? v[kind].prefix.trim() : d.prefix;
  const pad = Number.isInteger(v?.[kind]?.pad) && v[kind].pad >= 1 && v[kind].pad <= 8 ? v[kind].pad : d.pad;
  return { prefix, pad };
}

export async function nextReference(kind: keyof typeof NUMBERING_DEFAULTS, existing: string[]) {
  const { prefix, pad } = await numberingConfig(kind);
  let highest = 0;
  for (const ref of existing) {
    if (!ref || !ref.startsWith(prefix)) continue;
    const n = Number(ref.slice(prefix.length));
    if (Number.isInteger(n) && n > highest) highest = n;
  }
  return `${prefix}${String(highest + 1).padStart(pad, "0")}`;
}
