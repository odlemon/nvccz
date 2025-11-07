/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const column = await prisma.$queryRawUnsafe<any[]>(
      "SHOW COLUMNS FROM `users` LIKE 'votingPower';"
    );

    console.log('SHOW COLUMNS result:', column);

    const boardReviewIdColumn = await prisma.$queryRawUnsafe<any[]>(
      "SHOW COLUMNS FROM `board_reviews` LIKE 'id';"
    );

    console.log('Board Review id column:', boardReviewIdColumn);

    const table = await prisma.$queryRawUnsafe<any[]>(
      "SHOW TABLES LIKE 'board_review_votes';"
    );

    console.log('SHOW TABLES result:', table);
  } catch (error) {
    console.error('Query failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

