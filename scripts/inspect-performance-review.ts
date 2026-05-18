import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const id = process.argv[2] || "cmou1c7k20003ktk83a8lvwm1";

  const review = await prisma.performanceReview.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      reviewType: true,
      reviewPeriod: true,
      status: true,
      stage: true,
      cycleId: true,
      revieweeId: true,
      reviewerId: true,
      stakeholderId: true,
      reviewStartDate: true,
      reviewEndDate: true,
      dueDate: true,
      completedDate: true,
      isLocked: true,
      lockedAt: true,
      finalizedAt: true,
      finalizedById: true,
      documentStatus: true,
      documentPath: true,
      overallScore: true,
      ratingValue: true,
      rating: true,
      createdAt: true,
      updatedAt: true,
      reviewee: { select: { id: true, firstName: true, lastName: true, email: true } },
      reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
      stakeholder: { select: { id: true, legalName: true, email: true } },
      reviewFeedback: {
        select: {
          id: true,
          feedbackProviderType: true,
          feedbackType: true,
          status: true,
          rating: true,
          submittedAt: true,
        },
      },
    },
  });

  if (!review) {
    console.log(`No PerformanceReview with id=${id}`);
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(review, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
