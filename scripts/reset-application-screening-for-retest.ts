/**
 * Dev/UAT: tear down analyst screening + Active DD so you can re-score from SCREENING.
 * Removes due_diligence_reviews row, PMS Active DD task pack tasks, clears analyst screening fields.
 *
 * Usage: npx ts-node scripts/reset-application-screening-for-retest.ts <applicationId>
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const PMS_ACTIVE_DD_TASK_CATEGORY = "PMS_ACTIVE_DD_ENTRY";

const prisma = new PrismaClient();

async function main() {
  const applicationId = String(process.argv[2] || "").trim();
  if (!applicationId) {
    console.error("Usage: npx ts-node scripts/reset-application-screening-for-retest.ts <applicationId>");
    process.exitCode = 2;
    return;
  }

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, dealReference: true, currentStage: true, screeningScore: true }
  });

  if (!app) {
    console.error(`Application not found: ${applicationId}`);
    process.exitCode = 1;
    return;
  }

  const ddDeleted = await prisma.dueDiligenceReview.deleteMany({
    where: { applicationId }
  });
  const tasksDeleted = await prisma.task.deleteMany({
    where: { applicationId, category: PMS_ACTIVE_DD_TASK_CATEGORY }
  });

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      screeningScore: null,
      screeningOutcome: null,
      currentStage: "SCREENING"
    }
  });

  console.log(
    `Reset ${applicationId} (${app.dealReference || "no ref"}): was stage=${app.currentStage}, screeningScore=${app.screeningScore}; deleted DD rows=${ddDeleted.count}, PMS tasks=${tasksDeleted.count}; now SCREENING with screening cleared.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
