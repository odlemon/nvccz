import { prisma } from '../src/utils/database';

async function main() {
  const usd = await prisma.currency.findFirst({ where: { code: 'USD' } });
  const asOf = new Date('2026-12-31T21:59:59.999Z');

  const accounts = await prisma.chartOfAccounts.findMany({
    where: {
      isActive: true,
      accountType: { in: ['Fixed Asset', 'Long-Term Asset', 'Non-Current Asset', 'Contra-Asset'] },
    },
    select: { id: true, accountNo: true, accountName: true, accountType: true, financialStatement: true },
    orderBy: { accountNo: 'asc' },
  });

  const balanceRows = await prisma.$queryRaw<
    Array<{ accountId: string; debit: unknown; credit: unknown }>
  >`
    SELECT jel.chartOfAccountId AS accountId, SUM(jel.debitAmount) AS debit, SUM(jel.creditAmount) AS credit
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journalEntryId
    WHERE je.status = 'POSTED' AND je.currencyId = ${usd!.id}
      AND je.transactionDate <= ${asOf}
      AND je.referenceNumber NOT LIKE 'VR-%' AND je.referenceNumber NOT LIKE 'REV-%'
    GROUP BY jel.chartOfAccountId
  `;
  const byId = new Map(balanceRows.map((r) => [r.accountId, { dr: Number(r.debit), cr: Number(r.credit) }]));

  console.log('Fixed / long-term / non-current assets (USD, as of period end):\n');
  let fixedTotal = 0;
  let accumDepr = 0;
  for (const a of accounts) {
    const t = byId.get(a.id) ?? { dr: 0, cr: 0 };
    const name = a.accountName.toLowerCase();
    const isAccum =
      (name.includes('accumulated') && name.includes('depreciation')) || a.accountType === 'Contra-Asset';
    let balance: number;
    if (isAccum) balance = t.cr - t.dr;
    else balance = t.dr - t.cr;

    if (Math.abs(balance) < 0.01) continue;
    if (isAccum) {
      accumDepr += balance;
      console.log(`  ${a.accountNo} ${a.accountName} | accum depr component: ${balance.toFixed(2)} | fs=${a.financialStatement}`);
    } else {
      fixedTotal += balance;
      console.log(`  ${a.accountNo} ${a.accountName} | net: ${balance.toFixed(2)} | type=${a.accountType} | fs=${a.financialStatement}`);
    }
  }
  console.log(`\nSum (excl accum in rows): ${fixedTotal.toFixed(2)}`);
  console.log(`Accum depr (contra, stored negative on dashboard): ${(-Math.abs(accumDepr)).toFixed(2)}`);
  console.log(`Dashboard-style fixed total: ${(fixedTotal - Math.abs(accumDepr)).toFixed(2)}`);

  for (const no of ['1502', '1520']) {
    const a = await prisma.chartOfAccounts.findFirst({ where: { accountNo: no } });
    if (!a) continue;
    const lines = await prisma.journalEntryLine.findMany({
      where: { chartOfAccountId: a.id, journalEntry: { status: 'POSTED' } },
      select: {
        debitAmount: true,
        creditAmount: true,
        journalEntry: { select: { referenceNumber: true, currency: { select: { code: true } } } },
      },
    });
    console.log(`\n${no} all currencies:`);
    let dr = 0, cr = 0;
    for (const l of lines) {
      dr += Number(l.debitAmount);
      cr += Number(l.creditAmount);
      console.log(`  ${l.journalEntry.currency.code} | ${l.journalEntry.referenceNumber} | DR ${Number(l.debitAmount)} CR ${Number(l.creditAmount)}`);
    }
    console.log(`  Net all curr: ${(dr - cr).toFixed(2)}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
