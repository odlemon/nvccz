/**
 * Production (or any environment): apply recent performance module DDL migrations and
 * ensure scorecard-related contracts / data fixes in a safe, idempotent order.
 *
 * **Before running against production:**
 * 1. Point `DATABASE_URL` in the shell (or `.env` you load) at the **production** MySQL URL.
 * 2. Take a DB backup / snapshot.
 * 3. Set optional env vars for seeds (see below).
 *
 * **Order:**
 * - DDL: UAT backend → scorecards table → goal risk zone → pillar_id → description TEXT
 * - Data: org BSC pillar reassignment (empty pillar only) → optional COGS reverse-KPI fix
 * - Contracts: CEO → Board → employee contracts → department goal contract links
 *
 * Run: `npm run db:prod:apply-performance-full`
 *
 * **Optional env (seeds):**
 * - `CEO_SEED_YEAR` (default 2026), `CEO_SEED_USER_EMAIL` — CEO subject user
 * - `BOARD_SEED_YEAR` (default 2026), `BOARD_SEED_REVIEWER_EMAIL`, `BOARD_SEED_APPROVER_EMAIL`
 * - `PERFORMANCE_BACKFILL_ACTOR_USER_ID` — user id used as `createdById` for backfills (else earliest user)
 */
import "dotenv/config";
import { execSync } from "child_process";
import path from "path";

const root = path.resolve(__dirname, "..");

function run(step: string, command: string) {
  console.log(`\n${"=".repeat(72)}\n${step}\n${"=".repeat(72)}\n`);
  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  execSync(command, { stdio: "inherit", cwd: root, env: process.env, shell });
}

function main() {
  const url = String(process.env.DATABASE_URL || "").trim();
  if (!url) {
    console.error("DATABASE_URL is not set. Set it to the target database before running.");
    process.exit(1);
  }

  const hostHint = (() => {
    const m = url.match(/@([^/?]+)/);
    return m ? m[1].replace(/^\/\//, "") : "(host not parsed — check DATABASE_URL)";
  })();

  console.log(`Target DB host:port ≈ ${hostHint}`);
  console.log("If this is NOT production, stop and fix DATABASE_URL.\n");

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";

  const steps: Array<{ label: string; cmd: string }> = [
    {
      label: "1/11 — Performance UAT backend (strategies, sync, triggers, …)",
      cmd: `${npx} ts-node scripts/run-performance-uat-backend-migration.ts`
    },
    {
      label: "2/11 — Performance scorecards + contract storage columns",
      cmd: `${npx} ts-node scripts/run-performance-scorecards-migration.ts`
    },
    {
      label: "3/11 — Performance goal risk zone columns",
      cmd: `${npx} ts-node scripts/run-performance-goal-risk-zone-migration.ts`
    },
    {
      label: "4/11 — Performance goal pillar_id + backfill from scorecardPillar",
      cmd: `${npx} ts-node scripts/run-performance-goal-pillar-id-migration.ts`
    },
    {
      label: "5/11 — Performance goal description TEXT column",
      cmd: `${npx} ts-node scripts/run-performance-goal-description-text-migration.ts`
    },
    {
      label: "6/11 — Org BSC: assign scorecardPillar for company goals missing pillar (heuristic)",
      cmd: `${npx} ts-node scripts/reassign-org-bsc-pillar-by-title.ts`
    },
    {
      label: "7/11 — Optional: set isReverseKpi on reduce-COGS-style company goals",
      cmd: `${npx} ts-node scripts/fix-performance-goal-reduce-cogs-reverse-kpi.ts`
    },
    {
      label: "8/11 — Seed CEO performance contract + indicators (idempotent per year)",
      cmd: `${npx} ts-node scripts/seed-ceo-performance-contract.ts`
    },
    {
      label: "9/11 — Seed Board performance contract + indicators (idempotent per year)",
      cmd: `${npx} ts-node scripts/seed-board-performance-contract.ts`
    },
    {
      label: "10/11 — Ensure employee performance contracts (active employees, current year)",
      cmd: `${npx} ts-node scripts/ensure-employee-performance-contracts.ts`
    },
    {
      label: "11/11 — Link orphan department goals to department contracts",
      cmd: `${npx} ts-node scripts/backfill-department-goal-performance-contracts.ts`
    }
  ];

  for (const s of steps) {
    run(s.label, s.cmd);
  }

  console.log(`\n${"=".repeat(72)}\nAll steps finished.\n${"=".repeat(72)}\n`);
}

main();
