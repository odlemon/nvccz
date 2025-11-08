import { prisma } from '../src/utils/database';

async function main() {
  const targetAccounts = ['1502', '4050', '6050', '4100'];
  const accounts = await prisma.chartOfAccounts.findMany({
    where: { accountNo: { in: targetAccounts } },
    select: { accountNo: true, accountName: true }
  });

  const found = new Map(accounts.map(acc => [acc.accountNo, acc.accountName]));

  console.log('✅ Chart of Accounts check');
  for (const accountNo of targetAccounts) {
    if (found.has(accountNo)) {
      console.log(`  • ${accountNo} → ${found.get(accountNo)}`);
    } else {
      console.log(`  ✖ Missing account ${accountNo}`);
    }
  }
}

main()
  .catch(error => {
    console.error('❌ Failed to validate accounts', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
