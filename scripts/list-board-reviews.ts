// @ts-nocheck
import { prisma } from "../src/utils/database";

async function main() {
  try {
    const reviews = await prisma.boardReview.findMany({
      select: {
        id: true,
        applicationId: true,
        status: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(reviews);
  } catch (error) {
    console.error("Error listing board reviews", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

