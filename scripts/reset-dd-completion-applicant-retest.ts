/**
 * Reset a completed due diligence row so POST /api/applications/:id/due-diligence/complete can run again,
 * set the application back to ACTIVE_DD, and remove the applicant user + portfolio company created for testing.
 *
 * Usage:
 *   npx ts-node scripts/reset-dd-completion-applicant-retest.ts <applicantEmail> [applicationId]
 *
 * Safety: only deletes users with role name "applicant".
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normEmail(s: string): string {
  return s.trim().toLowerCase();
}

async function main(): Promise<void> {
  const applicantEmail = normEmail(process.argv[2] || "");
  const applicationIdArg = (process.argv[3] || "").trim();

  if (!applicantEmail) {
    console.error(
      "Usage: npx ts-node scripts/reset-dd-completion-applicant-retest.ts <applicantEmail> [applicationId]"
    );
    process.exitCode = 2;
    return;
  }

  const application = applicationIdArg
    ? await prisma.application.findUnique({ where: { id: applicationIdArg } })
    : await prisma.application.findFirst({
        where: { applicantEmail: applicantEmail }
      });

  if (!application) {
    console.error("Application not found.");
    process.exitCode = 1;
    return;
  }

  if (normEmail(application.applicantEmail) !== applicantEmail) {
    console.error(
      `Application ${application.id} has applicantEmail=${application.applicantEmail}, expected ${applicantEmail}.`
    );
    process.exitCode = 1;
    return;
  }

  const due = await prisma.dueDiligenceReview.findUnique({
    where: { applicationId: application.id }
  });

  if (!due) {
    console.error("No due_diligence_reviews row for this application.");
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.dueDiligenceReview.update({
      where: { applicationId: application.id },
      data: {
        status: "IN_PROGRESS",
        completedAt: null,
        updatedAt: new Date()
      }
    });

    await tx.application.update({
      where: { id: application.id },
      data: {
        currentStage: "ACTIVE_DD",
        dueDiligenceScore: null,
        updatedAt: new Date()
      }
    });

    await tx.applicationNotification.deleteMany({
      where: {
        applicationId: application.id,
        notificationType: { in: ["DUE_DILIGENCE_COMPLETED", "ACCOUNT_CREATED"] }
      }
    });
  });

  console.log(
    `Reset due diligence to IN_PROGRESS and application ${application.id} to ACTIVE_DD (cleared dueDiligenceScore).`
  );

  const user = await prisma.user.findUnique({
    where: { email: applicantEmail },
    include: { portfolioCompany: true, role: true }
  });

  if (!user) {
    console.log(`No users row for ${applicantEmail} — skipped user/portfolio delete.`);
    return;
  }

  if (user.role?.name !== "applicant") {
    console.error(
      `Refusing to delete user ${applicantEmail}: role is "${user.role?.name}", not "applicant".`
    );
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.termSheet.updateMany({
        where: { applicantSignedById: user.id },
        data: { applicantSignedById: null }
      });
      await tx.termSheet.updateMany({
        where: { investorSignedById: user.id },
        data: { investorSignedById: null }
      });

      await tx.activityLog.deleteMany({ where: { userId: user.id } });
      await tx.document.deleteMany({ where: { uploadedById: user.id } });

      if (user.portfolioCompany) {
        await tx.portfolioCompany.delete({ where: { id: user.portfolioCompany.id } });
      }

      await tx.user.delete({ where: { id: user.id } });
    },
    { maxWait: 30000, timeout: 120000 }
  );

  console.log(`Deleted applicant user and portfolio company for ${applicantEmail}.`);
  console.log("You can call POST /api/applications/{id}/due-diligence/complete again.");
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
