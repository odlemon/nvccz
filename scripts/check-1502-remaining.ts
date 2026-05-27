import { prisma } from '../src/utils/database';

async function main() {
  const acc1502 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '1502' } });
  if (!acc1502) { console.log('1502 not found'); return; }

  // All POSTED lines on 1502
  const lines = await prisma.journalEntryLine.findMany({
    where: { chartOfAccountId: acc1502.id, journalEntry: { status: 'POSTED' } },
    select: {
      debitAmount: true, creditAmount: true, description: true,
      journalEntry: { select: { referenceNumber: true, description: true, transactionDate: true, status: true } }
    },
    orderBy: { journalEntry: { transactionDate: 'asc' } }
  });

  let dr = 0, cr = 0;
  console.log('All POSTED lines on 1502:');
  for (const l of lines) {
    const d = Number(l.debitAmount), c = Number(l.creditAmount);
    dr += d; cr += c;
    const date = l.journalEntry.transactionDate.toISOString().slice(0,10);
    console.log(`  ${date} | DR ${d.toFixed(2).padStart(10)} | CR ${c.toFixed(2).padStart(10)} | ${l.journalEntry.referenceNumber}`);
    if (l.description) console.log(`    ${l.description}`);
  }
  console.log(`\nTotals: DR=${dr.toFixed(2)}  CR=${cr.toFixed(2)}  Net=${(dr-cr).toFixed(2)}`);

  // CBZ Market instrument
  const cbzJEs = await prisma.journalEntry.findMany({
    where: { referenceNumber: { contains: 'cmo30k23' } },
    select: { id: true, referenceNumber: true, description: true, status: true, transactionDate: true,
      journalEntryLines: { select: { debitAmount: true, creditAmount: true,
        chartOfAccount: { select: { accountNo: true, accountName: true } } } } }
  });
  console.log('\nCBZ Market (cmo30k23) JEs:');
  for (const je of cbzJEs) {
    console.log(`  ${je.transactionDate.toISOString().slice(0,10)} | ${je.status} | ${je.referenceNumber}`);
    for (const l of je.journalEntryLines) {
      console.log(`    DR ${Number(l.debitAmount).toFixed(2).padStart(10)} | CR ${Number(l.creditAmount).toFixed(2).padStart(10)} | ${l.chartOfAccount.accountNo} ${l.chartOfAccount.accountName}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
