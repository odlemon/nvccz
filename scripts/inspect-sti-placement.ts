import { prisma } from '../src/utils/database';

async function main() {
  // 1. Find STI record for cmnvjzgq
  const stiRows = await (prisma as any).shortTermInvestment
    ? await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, name, principalAmount, status, startDate, maturityDate, glAccountId, cashbookAccountId
         FROM ShortTermInvestment WHERE id LIKE '%cmnvjzgq%' LIMIT 5`
      )
    : [];
  console.log('STI rows:', JSON.stringify(stiRows, null, 2));

  // 2. All JEs related to this investment
  const jes = await prisma.journalEntry.findMany({
    where: { referenceNumber: { contains: 'cmnvjzgq' } },
    select: {
      id: true,
      referenceNumber: true,
      description: true,
      status: true,
      transactionDate: true,
      journalEntryLines: {
        select: {
          debitAmount: true,
          creditAmount: true,
          chartOfAccount: { select: { accountNo: true, accountName: true } },
        },
      },
    },
    orderBy: { transactionDate: 'asc' },
  });

  console.log(`\nTotal JEs for cmnvjzgq: ${jes.length}`);
  for (const je of jes) {
    console.log(`\n  ${je.transactionDate.toISOString().slice(0, 10)} | ${je.status} | ${je.referenceNumber}`);
    for (const l of je.journalEntryLines) {
      console.log(
        `    DR ${Number(l.debitAmount).toFixed(2).padStart(10)} | CR ${Number(l.creditAmount).toFixed(2).padStart(10)} | ${l.chartOfAccount.accountNo} ${l.chartOfAccount.accountName}`
      );
    }
  }

  // 3. Bank/cash accounts
  const bankAccs = await prisma.chartOfAccounts.findMany({
    where: { accountType: { in: ['Bank', 'Cash'] }, isActive: true },
    select: { id: true, accountNo: true, accountName: true },
    orderBy: { accountNo: 'asc' },
    take: 10,
  });
  console.log('\nBank/Cash accounts:');
  for (const a of bankAccs) console.log(`  ${a.accountNo} ${a.accountName}  id=${a.id}`);

  // 4. Account 1502 id
  const acc1502 = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1502' },
    select: { id: true, accountNo: true, accountName: true },
  });
  console.log('\nAccount 1502:', acc1502);

  // 5. Duplicate Vexma Tech valuation entries
  const vexmaJEs = await prisma.journalEntry.findMany({
    where: {
      referenceNumber: { in: ['AUTO-1775649277017', 'AUTO-1775667787066'] },
    },
    select: {
      id: true,
      referenceNumber: true,
      description: true,
      status: true,
      transactionDate: true,
      journalEntryLines: {
        select: {
          debitAmount: true,
          creditAmount: true,
          chartOfAccount: { select: { accountNo: true, accountName: true } },
        },
      },
    },
  });
  console.log('\nVexma Tech valuation JEs:');
  for (const je of vexmaJEs) {
    console.log(`  id=${je.id} | ${je.status} | ${je.referenceNumber} | ${je.description}`);
    for (const l of je.journalEntryLines) {
      console.log(
        `    DR ${Number(l.debitAmount).toFixed(2).padStart(10)} | CR ${Number(l.creditAmount).toFixed(2).padStart(10)} | ${l.chartOfAccount.accountNo} ${l.chartOfAccount.accountName}`
      );
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
