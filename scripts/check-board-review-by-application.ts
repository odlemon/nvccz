// @ts-nocheck
import { prisma } from "../src/utils/database";

const applicationId = "cmhnylrhi0000l7041s2fygls";

async function main() {
  try {
    const boardReview = await prisma.boardReview.findUnique({ where: { applicationId } });
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        businessName: true,
        applicantName: true,
        currentStage: true,
        updatedAt: true
      }
    });

    console.log("Application:", application);
    console.log("Board review record:", boardReview);
  } catch (error) {
    console.error("Error fetching board review", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

