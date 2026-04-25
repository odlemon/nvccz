/**
 * **Destructive (data cleanup)** — deletes all `PerformanceGoal` rows with **no pillar mapping**
 * (`scorecardPillar` null/blank AND `pillar_id` null), plus their **descendants in the goal hierarchy**,
 * and related rows that would block FK constraints:
 * - `tasks` (goalId)
 * - `activity_logs` (goalId)
 * - `performance_sync_jobs` (goalId) — set null; does not store relation in Prisma
 * - BSC child tables cascade on goal delete
 *
 * Default is **dry-run** (no deletes). To execute:
 *   npx ts-node scripts/delete-unmapped-performance-goals.ts --apply
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

function isUnmappedPillar(g: { scorecardPillar: string | null; pillarId: string | null }): boolean {
  const s = g.scorecardPillar != null ? String(g.scorecardPillar).trim() : "";
  return !g.pillarId && !s;
}

/**
 * Delete order: repeatedly remove **leaf** nodes in the induced subgraph (goals in `ids` only),
 * so children are always deleted before parents.
 */
function sortLeafFirstDeleteOrder(ids: Set<string>, parentById: Map<string, string | null>): string[] {
  const out: string[] = [];
  const remaining = new Set(ids);

  // Map parent -> list of children (only edges internal to the delete set)
  const children = new Map<string, Set<string>>();
  for (const id of remaining) {
    const p = parentById.get(id) ?? null;
    if (p && remaining.has(p)) {
      if (!children.has(p)) children.set(p, new Set());
      children.get(p)!.add(id);
    }
  }

  while (remaining.size > 0) {
    // Leaves: nodes in `remaining` with no *internal* child nodes.
    const leaves: string[] = [];
    for (const id of remaining) {
      const hasChild = (children.get(id) || new Set()).size > 0;
      if (!hasChild) {
        leaves.push(id);
      }
    }
    if (leaves.length === 0) {
      // Should only happen for cycles; fall back to deleting the rest arbitrarily.
      for (const id of remaining) {
        out.push(id);
        remaining.delete(id);
      }
      break;
    }
    for (const leaf of leaves) {
      out.push(leaf);
      remaining.delete(leaf);
      // detach from parent edge bookkeeping
      const p = parentById.get(leaf) ?? null;
      if (p && children.has(p)) {
        children.get(p)!.delete(leaf);
        if (children.get(p)!.size === 0) {
          children.delete(p);
        }
      }
    }
  }

  return out;
}

async function main() {
  const allGoals = await prisma.performanceGoal.findMany({
    select: { id: true, parentGoalId: true, scorecardPillar: true, pillarId: true, title: true, type: true }
  });

  const parentById = new Map<string, string | null>();
  const children = new Map<string, string[]>();
  for (const g of allGoals) {
    parentById.set(g.id, g.parentGoalId);
    if (g.parentGoalId) {
      if (!children.has(g.parentGoalId)) children.set(g.parentGoalId, []);
      children.get(g.parentGoalId)!.push(g.id);
    }
  }

  const seed = new Set<string>();
  for (const g of allGoals) {
    if (isUnmappedPillar(g)) {
      seed.add(g.id);
    }
  }

  // Include entire subtrees under unmapped goals (in case a child is somehow mapped; still remove under "bad" parent)
  const toDelete = new Set<string>(seed);
  const q = [...seed];
  while (q.length) {
    const id = q.pop()!;
    for (const c of children.get(id) || []) {
      if (!toDelete.has(c)) {
        toDelete.add(c);
        q.push(c);
      }
    }
  }

  if (toDelete.size === 0) {
    console.log("[info] no unmapped performance goals found.");
    return;
  }

  const ordered = sortLeafFirstDeleteOrder(toDelete, parentById);

  console.log(
    `[${APPLY ? "APPLY" : "DRY-RUN"}] would delete ${toDelete.size} performance goal(s) (including descendants of unmapped roots).`
  );
  if (!APPLY) {
    const sample = allGoals
      .filter((g) => toDelete.has(g.id))
      .slice(0, 30)
      .map((g) => ({ id: g.id, type: g.type, title: g.title, parentGoalId: g.parentGoalId }));
    console.log("[sample up to 30]", JSON.stringify(sample, null, 2));
    console.log("Re-run with --apply to delete.");
    return;
  }

  // Collect counts of related rows
  const taskCount = await prisma.task.count({ where: { goalId: { in: ordered } } });
  const logCount = await prisma.activityLog.count({ where: { goalId: { in: ordered } } });
  const syncCount = await prisma.performanceSyncJob.count({ where: { goalId: { in: ordered } } });

  await prisma.$transaction(
    async (tx) => {
      // Clear FKs that block delete (onDelete: NoAction)
      await tx.task.deleteMany({ where: { goalId: { in: ordered } } });
      await tx.activityLog.deleteMany({ where: { goalId: { in: ordered } } });
      await tx.performanceSyncJob.deleteMany({ where: { goalId: { in: ordered } } });

      for (const id of ordered) {
        await tx.performanceGoal.delete({ where: { id } });
      }
    },
    { timeout: 120_000, maxWait: 60_000 }
  );

  console.log(
    `[ok] deleted goals: ${ordered.length} | tasks: ${taskCount} | activity_logs: ${logCount} | sync_jobs deleted: ${syncCount}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
