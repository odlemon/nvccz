import { prisma } from '../src/utils/database';

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error('Usage: npx ts-node scripts/get-accounts.ts <accountId> [accountId...]');
    process.exit(1);
  }

  const rows = await prisma.chartOfAccounts.findMany({
    where: { id: { in: ids } },
    select: { id: true, accountNo: true, accountName: true }
  });

  console.table(rows);
}

main()
  .catch(error => {
    console.error('❌ Failed to fetch accounts', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
