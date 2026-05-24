/**
 * Targeted reset for one task → individual → department → company goal chain.
 *
 * Dry run:  npm run db:reset:task-progress-chain
 * Apply:     npm run db:reset:task-progress-chain -- --apply
 *
 * Override IDs via env:
 *   TASK_ID, INDIVIDUAL_GOAL_ID, DEPARTMENT_GOAL_ID, COMPANY_GOAL_ID
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const APPLY = process.argv.includes("--apply");

const TASK_ID = process.env.TASK_ID ?? "cmpk6l31p0003kt792xep0hoh";
const INDIVIDUAL_GOAL_ID = process.env.INDIVIDUAL_GOAL_ID ?? "cmpk6l30z0001kt79agp4u5fk";
const DEPARTMENT_GOAL_ID = process.env.DEPARTMENT_GOAL_ID ?? "cmpju3tm40005kt6kz0qshclx";
const COMPANY_GOAL_ID = process.env.COMPANY_GOAL_ID ?? "cmpjts5fo0001kt6k6qy97pms";

const GOAL_IDS = [INDIVIDUAL_GOAL_ID, DEPARTMENT_GOAL_ID, COMPANY_GOAL_ID];

async function deleteJournalEntries(ids: string[]) {
  if (!ids.length) return 0;
  await prisma.$transaction(
    async (tx) => {
      await tx.auditLog.deleteMany({ where: { entityType: "JournalEntry", entityId: { in: ids } } }).catch(() => undefined);
      await tx.reconciliationResult.deleteMany({ where: { journalEntryId: { in: ids } } }).catch(() => undefined);
      await tx.journalEntryLine.deleteMany({ where: { journalEntryId: { in: ids } } });
      await tx.journalEntry.deleteMany({ where: { id: { in: ids } } });
    },
    { timeout: 120000 }
  );
  return ids.length;
}

function stripProgressActivities(activities: unknown): unknown[] {
  if (!Array.isArray(activities)) return [];
  return activities.filter((a) => {
    if (!a || typeof a !== "object") return true;
    const type = String((a as { type?: string }).type || "").toLowerCase();
    return type !== "progress" && type !== "historical_entry";
  });
}

async function main() {
  console.log(`\n=== Reset task progress chain (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);
  console.log("Task:", TASK_ID);
  console.log("Goals:", GOAL_IDS.join(", "));

  const task = await prisma.task.findUnique({ where: { id: TASK_ID } });
  if (!task) {
    console.warn("Task not found — continuing with goals only");
  } else {
    console.log("\nTask before:", {
      monetaryValueAchieved: task.monetaryValueAchieved?.toString(),
      stage: task.stage,
      activityCount: Array.isArray(task.activities) ? task.activities.length : 0
    });
  }

  for (const gid of GOAL_IDS) {
    const g = await prisma.performanceGoal.findUnique({
      where: { id: gid },
      select: { id: true, title: true, type: true, currentValue: true, stage: true, status: true }
    });
    console.log(`Goal ${gid}:`, g ?? "(not found)");
  }

  const events = await prisma.performanceGoalProgressEvent.findMany({
    where: { goalId: { in: GOAL_IDS } },
    select: { id: true, goalId: true, amount: true, source: true, journalEntryId: true }
  });
  console.log(`\nProgress events to delete: ${events.length}`);

  const jeIds = new Set<string>();
  for (const e of events) {
    if (e.journalEntryId) jeIds.add(e.journalEntryId);
  }
  const perfRefs = await prisma.journalEntry.findMany({
    where: {
      OR: [
        { referenceNumber: { startsWith: "PERF-GOAL-" } },
        { referenceNumber: `KPI-GOAL-${COMPANY_GOAL_ID}` },
        { referenceNumber: { startsWith: `PERF-GOAL-${COMPANY_GOAL_ID}` } },
        { referenceNumber: { startsWith: `PERF-GOAL-${INDIVIDUAL_GOAL_ID}` } },
        { referenceNumber: { startsWith: `PERF-GOAL-${DEPARTMENT_GOAL_ID}` } },
        { referenceNumber: `KPI-GOAL-${INDIVIDUAL_GOAL_ID}` },
        { referenceNumber: `KPI-GOAL-${DEPARTMENT_GOAL_ID}` }
      ]
    },
    select: { id: true, referenceNumber: true }
  });
  for (const j of perfRefs) jeIds.add(j.id);
  console.log(`Journal entries to delete: ${jeIds.size}`, perfRefs.map((j) => j.referenceNumber));

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to execute.\n");
    return;
  }

  await prisma.performanceGoalProgressEvent.deleteMany({
    where: { goalId: { in: GOAL_IDS } }
  });
  await deleteJournalEntries([...jeIds]);

  if (task) {
    const keptActivities = stripProgressActivities(task.activities);
    await prisma.task.update({
      where: { id: TASK_ID },
      data: {
        monetaryValueAchieved: 0,
        percentValueAchieved: 0,
        stage: "todo",
        activities: keptActivities as object
      }
    });
  }

  for (const gid of GOAL_IDS) {
    const existing = await prisma.performanceGoal.findUnique({
      where: { id: gid },
      select: { status: true, type: true }
    });
    if (!existing) continue;
    const preserveStatus =
      existing.type === "company" && existing.status === "inactive" ? "inactive" : "active";
    await prisma.performanceGoal.update({
      where: { id: gid },
      data: {
        currentValue: 0,
        preciseCurrentValue: "0",
        progressPercentage: 0,
        monetaryValueAchieved: 0,
        percentValueAchieved: 0,
        stage: "planning",
        status: preserveStatus,
        lastSyncedValue: null,
        lastSyncedAt: null,
        syncConfig: null,
        updatedAt: new Date()
      }
    });
  }

  console.log("\n✅ Reset complete.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
