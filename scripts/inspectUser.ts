import { prisma } from '../src/utils/database';

async function inspectUser(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: true }
  });

  console.log(JSON.stringify(user, null, 2));
}

const email = process.argv[2];

if (!email) {
  console.error('Usage: npx ts-node scripts/inspectUser.ts <email>');
  process.exit(1);
}

inspectUser(email)
  .catch((error) => {
    console.error('Failed to inspect user', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

