const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const emails = ['logixvine@gmail.com', 'chotoappzw@gmail.com'];

async function main() {
  try {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true, id: true }
    });

    if (users.length === 0) {
      console.log('No users found for the specified emails.');
    } else {
      console.log('User IDs:');
      for (const user of users) {
        console.log(`  ${user.email}: ${user.id}`);
      }
    }
  } catch (error) {
    console.error('Failed to fetch user IDs:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();





