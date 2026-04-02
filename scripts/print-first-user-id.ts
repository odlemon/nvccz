import { prisma } from '../src/utils/database';

async function main() {
  const u = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  console.log(u?.id ?? 'NO_USER');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
