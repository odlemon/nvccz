/**
 * One-off: delete application(s) by applicant email and rows that block FK (tasks, reviews, etc.).
 * Cascading children on Application (documents, DD, board, term sheet, implementation) are removed by DB/Prisma on delete.
 *
 * Usage: npx ts-node -r dotenv/config scripts/delete-application-by-applicant-email.ts <email> [email2 ...]
 */
import { prisma } from "../src/utils/database";

async function deleteApplicationsForEmail(rawInput: string) {
  const raw = String(rawInput || "").trim();
  const email = raw.toLowerCase();
  if (!email || !email.includes("@")) {
    console.error(JSON.stringify({ ok: false, message: "Invalid email", raw: rawInput }, null, 2));
    return { email: raw, deletedCount: 0, skipped: true as const };
  }

  const emailVariants = Array.from(new Set([raw, raw.toLowerCase(), raw.toUpperCase()]));
  const apps = await prisma.application.findMany({
    where: { applicantEmail: { in: emailVariants } },
    select: { id: true, applicantEmail: true, businessName: true, currentStage: true },
  });

  if (!apps.length) {
    console.log(JSON.stringify({ ok: true, message: "No applications found", email, deleted: 0 }, null, 2));
    return { email, deletedCount: 0, skipped: false as const };
  }

  console.log(JSON.stringify({ found: apps, email }, null, 2));

  for (const app of apps) {
    const id = app.id;
    await prisma.$transaction(
      async (tx) => {
        const tasks = await tx.task.findMany({ where: { applicationId: id }, select: { id: true } });
        const taskIds = tasks.map((t) => t.id);
        if (taskIds.length) {
          await tx.activityLog.deleteMany({ where: { taskId: { in: taskIds } } });
        }
        await tx.activityLog.deleteMany({ where: { applicationId: id } });
        await tx.task.deleteMany({ where: { applicationId: id } });
        await tx.review.deleteMany({ where: { applicationId: id } });
        await tx.document.deleteMany({ where: { applicationId: id } });
        await tx.applicationStage.deleteMany({ where: { applicationId: id } });

        const dps = await tx.dealProgress.findMany({ where: { applicationId: id }, select: { id: true } });
        const dpIds = dps.map((d) => d.id);
        if (dpIds.length) {
          await tx.dealProgressUpdate.deleteMany({ where: { dealProgressId: { in: dpIds } } });
          await tx.dealProgress.deleteMany({ where: { id: { in: dpIds } } });
        }

        await tx.application.delete({ where: { id } });
      },
      { timeout: 120_000, maxWait: 30_000 }
    );
    console.log(JSON.stringify({ deletedApplicationId: id, businessName: app.businessName, email }, null, 2));
  }

  console.log(JSON.stringify({ ok: true, email, deletedCount: apps.length }, null, 2));
  return { email, deletedCount: apps.length, skipped: false as const };
}

async function main() {
  const args = process.argv.slice(2).map((a) => String(a).trim()).filter(Boolean);
  if (!args.length) {
    console.error(
      "Usage: npx ts-node -r dotenv/config scripts/delete-application-by-applicant-email.ts <email> [email2 ...]"
    );
    process.exitCode = 1;
    return;
  }

  const results: Array<{ email: string; deletedCount: number; skipped?: boolean }> = [];
  for (const arg of args) {
    results.push(await deleteApplicationsForEmail(arg));
  }
  console.log(JSON.stringify({ summary: results }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
