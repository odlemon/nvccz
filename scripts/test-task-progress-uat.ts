/**
 * UAT: post task activities and verify goal chain + PERF-GOAL journals.
 *
 * Usage:
 *   npx ts-node --transpile-only -r dotenv/config scripts/test-task-progress-uat.ts
 *   npx ts-node --transpile-only -r dotenv/config scripts/test-task-progress-uat.ts --reset
 */
import "dotenv/config";
import { execSync } from "child_process";
import { prisma } from "../src/utils/database";
import { TaskService } from "../src/services/TaskService";

const TASK_ID = process.env.TASK_ID ?? "cmpk6l31p0003kt792xep0hoh";
const INDIVIDUAL_GOAL_ID = process.env.INDIVIDUAL_GOAL_ID ?? "cmpk6l30z0001kt79agp4u5fk";
const DEPARTMENT_GOAL_ID = process.env.DEPARTMENT_GOAL_ID ?? "cmpju3tm40005kt6kz0qshclx";
const COMPANY_GOAL_ID = process.env.COMPANY_GOAL_ID ?? "cmpjts5fo0001kt6k6qy97pms";
const RESET = process.argv.includes("--reset");

async function snapshot(label: string) {
  const task = await prisma.task.findUnique({
    where: { id: TASK_ID },
    select: { monetaryValueAchieved: true, stage: true, monetaryValue: true }
  });
  const goals = await prisma.performanceGoal.findMany({
    where: { id: { in: [INDIVIDUAL_GOAL_ID, DEPARTMENT_GOAL_ID, COMPANY_GOAL_ID] } },
    select: { id: true, type: true, currentValue: true, progressPercentage: true, stage: true }
  });
  const jes = await prisma.journalEntry.findMany({
    where: {
      referenceNumber: { startsWith: "PERF-GOAL-" },
      OR: [
        { referenceNumber: { contains: COMPANY_GOAL_ID } },
        { description: { contains: COMPANY_GOAL_ID } }
      ]
    },
    select: { id: true, referenceNumber: true, totalAmount: true, status: true },
    orderBy: { createdAt: "asc" }
  });
  console.log(`\n--- ${label} ---`);
  console.log("Task:", {
    achieved: task?.monetaryValueAchieved?.toString(),
    target: task?.monetaryValue?.toString(),
    stage: task?.stage
  });
  for (const g of goals) {
    console.log(`Goal ${g.type}:`, {
      id: g.id,
      currentValue: g.currentValue?.toString(),
      progressPercentage: g.progressPercentage,
      stage: g.stage
    });
  }
  console.log(
    "PERF-GOAL JEs:",
    jes.map((j) => ({ ref: j.referenceNumber, amount: j.totalAmount?.toString(), status: j.status }))
  );
  return { task, goals, jes };
}

async function main() {
  if (RESET) {
    console.log("Resetting chain...");
    execSync("npm run db:reset:task-progress-chain -- --apply", { stdio: "inherit" });
  }

  const task = await prisma.task.findUnique({
    where: { id: TASK_ID },
    select: { createdBy: true, kpi: true }
  });
  if (!task?.createdBy) {
    throw new Error("Task or createdBy not found");
  }

  await snapshot("Before");

  await TaskService.postTaskActivity(TASK_ID, {
    type: "progress",
    activity: "UAT increment 500",
    userId: task.createdBy,
    monetaryValueAchieved: 500
  });
  await snapshot("After +500");

  await TaskService.postTaskActivity(TASK_ID, {
    type: "progress",
    activity: "UAT increment 200",
    userId: task.createdBy,
    monetaryValueAchieved: 200
  });
  const after = await snapshot("After +200 (expect 700)");

  const achieved = Number(after.task?.monetaryValueAchieved ?? 0);
  const company = after.goals.find((g) => g.id === COMPANY_GOAL_ID);
  const companyCurrent = Number(company?.currentValue ?? 0);

  const errors: string[] = [];
  if (achieved !== 700) errors.push(`Task achieved expected 700, got ${achieved}`);
  if (companyCurrent !== 700) errors.push(`Company currentValue expected 700, got ${companyCurrent}`);
  const perfJes = after.jes.filter((j) => j.status === "POSTED");
  if (perfJes.length < 2) {
    errors.push(`Expected at least 2 POSTED PERF-GOAL JEs, got ${perfJes.length}`);
  }

  if (errors.length) {
    console.error("\n❌ UAT FAILED:");
    errors.forEach((e) => console.error("  -", e));
    process.exit(1);
  }

  console.log("\n✅ UAT passed: 500+200=700, company goal synced, incremental JEs posted.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
