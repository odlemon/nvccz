/**
 * Lists (and optionally repairs) performance goals whose syncConfig still has
 * bscEntryKind = INCLUSION_DIVERSITY_REPORTING but the goal is clearly a **financial**
 * debt–equity / leverage style KPI — a false positive from the legacy validation rule
 * that matched the word "equity" in "Debt–equity ratio".
 *
 * Default: **dry-run** — prints suspected rows only.
 * `--apply`: removes all `bsc*` keys from syncConfig for those goals (stops wrong BSC routing;
 * does not change title, formulaType, or activities). Adds a small non-bsc audit stamp on the JSON.
 *
 * `--list-all`: print every goal with INCLUSION_DIVERSITY_REPORTING (for manual review), not only suspects.
 *
 * Optional: pass a single goal id as the last argument to scope **--apply** to that id (must still be a suspect).
 *
 * Run:
 *   npx ts-node scripts/fix-bsc-inclusion-false-positive-goals.ts
 *   npx ts-node scripts/fix-bsc-inclusion-false-positive-goals.ts --list-all
 *   npx ts-node scripts/fix-bsc-inclusion-false-positive-goals.ts --apply
 *   npx ts-node scripts/fix-bsc-inclusion-false-positive-goals.ts --apply <goalId>
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/utils/database";

const INCLUSION = "INCLUSION_DIVERSITY_REPORTING";

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const apply = flags.has("--apply");
const listAll = flags.has("--list-all");
const maybeGoalId = args[0] || null;

function normaliseFormulaType(raw: unknown) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
}

function haystack(g: { title: string; description: string | null; kpi: { name: string | null } | null }) {
  return [g.title, g.description, g.kpi?.name]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase())
    .join(" | ");
}

/** Strong D&I wording — if present, do not auto-treat as debt–equity false positive. */
function hasDiversityInclusionSignal(h: string) {
  return /(inclusion|diversity|gender|d&i|\bd and i\b|inclusive|inclusivity|demographic|equity.?lens|pay.?equity)/i.test(
    h
  );
}

/**
 * Heuristic: goal was mis-tagged with INCLUSION_DIVERSITY_REPORTING but is really financial debt/equity.
 */
function isSuspectedDebtEquityFalsePositive(g: {
  title: string;
  description: string | null;
  formulaType: string | null;
  kpi: { name: string | null } | null;
}): boolean {
  const h = haystack(g);
  const ft = normaliseFormulaType(g.formulaType);

  if (ft === "DEBT_EQUITY_RATIO") return true;

  if (/debt\s*[-–/]?\s*equity|debt\.to\.equity|debt\sequity|gearing|leverage\s*ratio|solvency/i.test(h)) {
    if (hasDiversityInclusionSignal(h)) return false;
    return true;
  }

  if (h.includes("debt") && (h.includes("shareholders") || h.includes("shareholder")) && h.includes("equity")) {
    if (hasDiversityInclusionSignal(h)) return false;
    return true;
  }

  if (h.includes("debt") && h.includes("equity") && !hasDiversityInclusionSignal(h)) {
    return true;
  }

  return false;
}

function stripBscKeys(syncConfig: Record<string, unknown> | null | undefined) {
  const sc: Record<string, unknown> = syncConfig && typeof syncConfig === "object" && !Array.isArray(syncConfig)
    ? { ...syncConfig }
    : {};
  for (const k of Object.keys(sc)) {
    if (k.startsWith("bsc")) delete sc[k];
  }
  return sc;
}

type InclusionGoalRow = {
  id: string;
  title: string;
  description: string | null;
  formulaType: string | null;
  type: string;
  currentValue: unknown;
  targetValue: unknown;
  syncConfig: unknown;
  kpi: { name: string | null } | null;
  performanceContract: {
    id: string;
    contractType: string;
    title: string;
    periodLabel: string | null;
  } | null;
};

const goalSelect = {
  id: true,
  title: true,
  description: true,
  formulaType: true,
  type: true,
  currentValue: true,
  targetValue: true,
  syncConfig: true,
  kpi: { select: { name: true } },
  performanceContract: { select: { id: true, contractType: true, title: true, periodLabel: true } }
} as const;

/** MySQL JSON_EXTRACT: reliable across Prisma MySQL driver versions. */
async function findInclusionBscGoals(): Promise<InclusionGoalRow[]> {
  const idRows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM performance_goals
    WHERE syncConfig IS NOT NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(syncConfig, '$.bscEntryKind')) = ${INCLUSION}
  `);
  if (idRows.length === 0) return [];

  return prisma.performanceGoal.findMany({
    where: { id: { in: idRows.map((r) => r.id) } },
    select: goalSelect
  });
}

function printRow(g: InclusionGoalRow, mark: "SUSPECT" | "inclusion BSC (review)") {
  const pc = g.performanceContract;
  const contract = pc ? `${pc.contractType} ${pc.periodLabel || ""} (${pc.title})` : "(no contract)";
  console.log(
    [
      `[${mark}]`,
      g.id,
      `"${g.title}"`,
      `formulaType=${g.formulaType || "—"}`,
      `contract=${contract}`
    ].join(" \t")
  );
}

async function main() {
  const goals = await findInclusionBscGoals();
  if (goals.length === 0) {
    console.log("No goals with syncConfig.bscEntryKind = INCLUSION_DIVERSITY_REPORTING.");
    return;
  }

  const scoped = maybeGoalId ? goals.filter((g) => g.id === maybeGoalId) : goals;
  if (maybeGoalId && scoped.length === 0) {
    console.error(`Goal id ${maybeGoalId} not found among inclusion-BSC goals (or not INCLUSION_DIVERSITY).`);
    process.exit(1);
  }

  const suspects = scoped.filter((g) => isSuspectedDebtEquityFalsePositive(g));

  if (listAll) {
    console.log(`All goals with bscEntryKind INCLUSION_DIVERSITY_REPORTING: ${scoped.length}\n`);
    for (const g of scoped) {
      printRow(g, isSuspectedDebtEquityFalsePositive(g) ? "SUSPECT" : "inclusion BSC (review)");
    }
    console.log(`\nSuspect (auto-fixable) count: ${suspects.length}`);
    return;
  }

  if (suspects.length === 0) {
    console.log(
      `Found ${goals.length} goal(s) with INCLUSION_DIVERSITY_REPORTING; none matched the debt–equity false-positive heuristic.`
    );
    console.log("Use --list-all to see every row, or check titles/formula types.");
    return;
  }

  console.log(
    `Goals with INCLUSION_DIVERSITY_REPORTING that look like debt–equity / leverage (suspected legacy false positive): ${suspects.length}\n`
  );
  for (const g of suspects) {
    printRow(g, "SUSPECT");
    console.log(`   haystack: ${haystack(g).slice(0, 200)}${haystack(g).length > 200 ? "…" : ""}`);
  }

  if (!apply) {
    console.log(
      "\nDry-run only. Re-run with --apply to clear bsc* keys on syncConfig for the suspect goals above (plus audit fields)."
    );
    return;
  }

  const toFix = maybeGoalId ? suspects.filter((g) => g.id === maybeGoalId) : suspects;
  if (maybeGoalId && toFix.length === 0) {
    console.error("That goal id is not in the suspect set; refusing to --apply (safety).");
    process.exit(1);
  }

  const stamp = new Date().toISOString();
  let updated = 0;
  for (const g of toFix) {
    const sc = stripBscKeys(g.syncConfig as Record<string, unknown>);
    sc.inclusionDiversityBscLinkClearedAt = stamp;
    sc.inclusionDiversityBscLinkClearedReason =
      "Legacy false positive: debt–equity / equity text matched old INCLUSION_DIVERSITY validation; cleared by scripts/fix-bsc-inclusion-false-positive-goals.ts";

    await prisma.performanceGoal.update({
      where: { id: g.id },
      data: { syncConfig: sc as object }
    });
    updated += 1;
    console.log(`Updated ${g.id} — removed bsc* routing from syncConfig.`);
  }

  console.log(`\nDone. Updated ${updated} goal(s). Re-link the correct BSC entry kind when a dedicated endpoint exists, or set actuals manually.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
