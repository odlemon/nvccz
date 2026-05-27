import { prisma } from '../src/utils/database';

async function main() {
  // 1. Find all Fixed/Long-Term asset accounts
  const investmentAccounts = await prisma.chartOfAccounts.findMany({
    where: {
      OR: [
        { accountName: { contains: 'Investment' } },
        { accountName: { contains: 'Asset' } },
        { accountType: { in: ['Fixed Asset', 'Long-Term Asset', 'Non-Current Asset'] } },
      ],
    },
    select: { id: true, accountNo: true, accountName: true, accountType: true, isActive: true },
    orderBy: { accountNo: 'asc' },
  });

  console.log('=== Fixed/Investment GL accounts ===');
  for (const a of investmentAccounts) {
    // compute net balance
    const agg = await prisma.journalEntryLine.aggregate({
      where: {
        chartOfAccountId: a.id,
        journalEntry: { status: 'POSTED' },
      },
      _sum: { debitAmount: true, creditAmount: true },
    });
    const dr = Number(agg._sum.debitAmount ?? 0);
    const cr = Number(agg._sum.creditAmount ?? 0);
    const net = dr - cr;
    if (Math.abs(net) < 0.01 && dr === 0) continue;
    console.log(`\n  ${a.accountNo.padEnd(8)} ${a.accountName.padEnd(40)} type=${a.accountType}`);
    console.log(`    DR=${dr.toFixed(2)}  CR=${cr.toFixed(2)}  Net(DR-CR)=${net.toFixed(2)}`);
  }

  // 2. Detailed lines for any account with negative net balance
  console.log('\n\n=== Detailed lines for NEGATIVE-balance Fixed/Investment accounts ===');
  for (const a of investmentAccounts) {
    const agg = await prisma.journalEntryLine.aggregate({
      where: { chartOfAccountId: a.id, journalEntry: { status: 'POSTED' } },
      _sum: { debitAmount: true, creditAmount: true },
    });
    const dr = Number(agg._sum.debitAmount ?? 0);
    const cr = Number(agg._sum.creditAmount ?? 0);
    const net = dr - cr;
    if (net >= -0.01) continue; // only negatives

    console.log(`\n--- ${a.accountNo} ${a.accountName} (Net=${net.toFixed(2)}) ---`);
    const lines = await prisma.journalEntryLine.findMany({
      where: { chartOfAccountId: a.id },
      select: {
        debitAmount: true,
        creditAmount: true,
        description: true,
        journalEntry: {
          select: {
            referenceNumber: true,
            description: true,
            transactionDate: true,
            status: true,
          },
        },
      },
      orderBy: { journalEntry: { transactionDate: 'asc' } },
    });

    for (const l of lines) {
      const date = l.journalEntry.transactionDate.toISOString().slice(0, 10);
      const d = Number(l.debitAmount).toFixed(2).padStart(12);
      const c = Number(l.creditAmount).toFixed(2).padStart(12);
      console.log(
        `  ${date} | ${l.journalEntry.status.padEnd(7)} | DR ${d} | CR ${c}`
      );
      console.log(`    JE : ${l.journalEntry.referenceNumber} — ${l.journalEntry.description.slice(0, 80)}`);
      if (l.description) console.log(`    Line: ${l.description.slice(0, 80)}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
