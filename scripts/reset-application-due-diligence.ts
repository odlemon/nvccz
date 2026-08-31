/**
 * Clear due diligence progress on one application so staff can run DD from scratch.
 *
 * Usage:
 *   npx ts-node --transpile-only -r dotenv/config scripts/reset-application-due-diligence.ts --business "NTS"
 *   npx ts-node --transpile-only -r dotenv/config scripts/reset-application-due-diligence.ts --id <applicationId>
 */
import { prisma } from "../src/utils/database";
import { assertDevDatabase } from "./lib/assert-dev-database";
import { PMS_ACTIVE_DD_TASK_CATEGORY } from "../src/services/ActiveDdPmsTaskPackService";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

async function main() {
  await assertDevDatabase(prisma, "reset-application-due-diligence");

  const id = arg("--id");
  const business = arg("--business") || "NTS";
  const dealRef = arg("--ref");

  const app = id
    ? await prisma.application.findUnique({ where: { id } })
    : await prisma.application.findFirst({
        where: dealRef
          ? { dealReference: dealRef }
          : { businessName: business },
        orderBy: { createdAt: "desc" },
      });

  if (!app) {
    console.error(`No application found (business=${business}, id=${id || "-"}, ref=${dealRef || "-"})`);
    process.exit(1);
  }

  console.log(`Resetting DD for ${app.businessName} (${app.dealReference || app.id})`);

  const tasks = await prisma.task.findMany({
    where: {
      OR: [
        { applicationId: app.id },
        { fromDueDiligence: true, applicationId: app.id },
        { category: PMS_ACTIVE_DD_TASK_CATEGORY, applicationId: app.id },
        { description: { contains: `[DueDiligenceApplication:${app.id}]` } },
      ],
    },
    select: { id: true, title: true },
  });

  const taskIds = tasks.map((t) => t.id);
  console.log(`  tasks to remove: ${taskIds.length}`);

  if (taskIds.length) {
    const logs = await prisma.activityLog.deleteMany({
      where: { taskId: { in: taskIds } },
    });
    console.log(`  activity logs deleted: ${logs.count}`);
    const removed = await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
    console.log(`  tasks deleted: ${removed.count}`);
  }

  const dd = await prisma.dueDiligenceReview.findUnique({
    where: { applicationId: app.id },
  });
  if (dd) {
    await prisma.dueDiligenceReview.delete({ where: { applicationId: app.id } });
    console.log(`  due diligence review deleted (${dd.id})`);
  } else {
    console.log("  no due diligence review row");
  }

  await prisma.application.update({
    where: { id: app.id },
    data: {
      dueDiligenceScore: null,
      currentStage: "SCREENING",
      screeningOutcome: app.screeningOutcome || "SHORTLISTED",
    },
  });
  console.log("  application reset to SCREENING (Start due diligence available in UI)");

  console.log("");
  console.log("Done. Open Deal Detail → Due Diligence → Start due diligence.");
  console.log(`  applicationId=${app.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
