/**
 * UAT: Rounding variance — multiple amounts (balanced, micro remainders, cap, reject).
 *
 * Prerequisites:
 *   npm run db:migrate:journal-line-amount-precision
 *   npx prisma generate
 *
 * Run: npm run test:rounding-variance-zig
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { MultiCurrencyService } from '../src/services/MultiCurrencyService';
import { JournalEntryService } from '../src/services/JournalEntryService';

const prisma = new PrismaClient();

const TOL = new Decimal('0.0000001');

async function lineAmountScale(): Promise<{ debit: number | null; credit: number | null }> {
  const rows = await prisma.$queryRawUnsafe<Array<{ col: string; scale: unknown }>>(
    `SELECT COLUMN_NAME AS col, NUMERIC_SCALE AS scale FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journal_entry_lines'
       AND COLUMN_NAME IN ('debitAmount','creditAmount')`
  );
  const toNum = (v: unknown) => (v == null ? null : Number(v));
  return {
    debit: toNum(rows.find((r) => r.col === 'debitAmount')?.scale),
    credit: toNum(rows.find((r) => r.col === 'creditAmount')?.scale)
  };
}

function sumLines(lines: { debitAmount: unknown; creditAmount: unknown }[]) {
  let d = new Decimal(0);
  let c = new Decimal(0);
  for (const l of lines) {
    d = d.plus(l.debitAmount ?? 0);
    c = c.plus(l.creditAmount ?? 0);
  }
  return { dr: d, cr: c, diff: d.minus(c) };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const scales = await lineAmountScale();
  assert(
    scales.debit === 3 && scales.credit === 3,
    'journal_entry_lines must be DECIMAL(15,3). Run: npm run db:migrate:journal-line-amount-precision'
  );

  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  assert(!!user, 'No user');
  const userId = user!.id;

  const bankCoa = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1100', isActive: true }
  });
  const arCoa = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1200', isActive: true }
  });
  assert(!!bankCoa && !!arCoa, 'Need COA 1100 (bank) and 1200 (AR)');

  const cur = await prisma.currency.findFirst({ where: { isActive: true } });
  assert(!!cur, 'No currency');
  const currencyId = cur!.id;

  const mkJe = async (refSuffix: string) =>
    prisma.journalEntry.create({
      data: {
        transactionDate: new Date(),
        referenceNumber: `RV-UAT-${refSuffix}-${Date.now()}`,
        description: `Rounding UAT ${refSuffix}`,
        totalAmount: new Decimal(1),
        currencyId,
        status: 'POSTED',
        createdById: userId
      }
    });

  const addLine = async (
    journalEntryId: string,
    coaId: string,
    dr: string,
    cr: string,
    description: string
  ) =>
    prisma.journalEntryLine.create({
      data: {
        journalEntryId,
        chartOfAccountId: coaId,
        debitAmount: new Decimal(dr),
        creditAmount: new Decimal(cr),
        description,
        vatAmount: new Decimal(0)
      }
    });

  /** Raw deletes avoid Prisma loading STI relations when those tables are absent on older DBs. */
  const cleanup = async (jeId: string) => {
    await prisma.$executeRaw`DELETE FROM journal_entry_lines WHERE journalEntryId = ${jeId}`;
    await prisma.$executeRaw`DELETE FROM journal_entries WHERE id = ${jeId}`;
  };

  console.log('\n=== Rounding variance UAT (multiple values) ===\n');

  // --- 1) Perfectly balanced: no rounding line ---
  {
    const je = await mkJe('balanced');
    try {
      await addLine(je.id, bankCoa!.id, '50.000', '0', 'Dr bank');
      await addLine(je.id, arCoa!.id, '0', '50.000', 'Cr AR');
      const pre = sumLines(await prisma.journalEntryLine.findMany({ where: { journalEntryId: je.id } }));
      assert(pre.diff.abs().lte(TOL), `Expected balanced pre-check, diff=${pre.diff}`);

      const rv = await MultiCurrencyService.applyRoundingVarianceToJournalEntry(je.id, userId);
      assert(!rv.posted, `Balanced JE should not post rounding; got ${JSON.stringify(rv)}`);

      const n = await prisma.journalEntryLine.count({ where: { journalEntryId: je.id } });
      assert(n === 2, `Expected 2 lines, got ${n}`);
      console.log('✅ [1] Balanced 50.000 / 50.000 → no rounding line (posted=false).');
    } finally {
      await cleanup(je.id);
    }
  }

  // --- 2) Dr > Cr by 0.001 → Credit Rounding Variance 0.001 ---
  {
    const je = await mkJe('dr-plus-001');
    try {
      await addLine(je.id, bankCoa!.id, '100.000', '0', 'Dr');
      await addLine(je.id, arCoa!.id, '0', '99.999', 'Cr short');
      assert(sumLines(await prisma.journalEntryLine.findMany({ where: { journalEntryId: je.id } })).diff.eq('0.001'), 'pre 0.001');

      const rv = await MultiCurrencyService.applyRoundingVarianceToJournalEntry(je.id, userId);
      assert(rv.posted && rv.roundingAmount === '0.001', JSON.stringify(rv));

      const after = sumLines(await prisma.journalEntryLine.findMany({ where: { journalEntryId: je.id } }));
      assert(after.diff.abs().lte(TOL), `Unbalanced after: ${after.diff}`);
      assert(JournalEntryService.validateJournalEntryBalance(await prisma.journalEntryLine.findMany({ where: { journalEntryId: je.id } })), 'validate balance');

      const rvLine = await prisma.journalEntryLine.findFirst({
        where: { journalEntryId: je.id, description: { contains: 'Rounding variance' } },
        include: { chartOfAccount: true }
      });
      assert(!!rvLine?.creditAmount && new Decimal(rvLine.creditAmount).eq('0.001'), 'expect Cr 0.001 on rounding line');
      assert(rvLine!.chartOfAccount.accountName?.toLowerCase().includes('rounding'), 'Rounding COA');
      console.log('✅ [2] Dr high by 0.001 → Cr Rounding Variance 0.001; journal ties out.');
    } finally {
      await cleanup(je.id);
    }
  }

  // --- 3) Cr > Dr by 0.001 → Debit Rounding Variance 0.001 ---
  {
    const je = await mkJe('cr-plus-001');
    try {
      await addLine(je.id, bankCoa!.id, '99.999', '0', 'Dr short');
      await addLine(je.id, arCoa!.id, '0', '100.000', 'Cr');
      const pre = sumLines(await prisma.journalEntryLine.findMany({ where: { journalEntryId: je.id } }));
      assert(pre.diff.eq('-0.001'), `expected -0.001, got ${pre.diff}`);

      const rv = await MultiCurrencyService.applyRoundingVarianceToJournalEntry(je.id, userId);
      assert(rv.posted && rv.roundingAmount === '0.001', JSON.stringify(rv));

      const after = sumLines(await prisma.journalEntryLine.findMany({ where: { journalEntryId: je.id } }));
      assert(after.diff.abs().lte(TOL), `after diff ${after.diff}`);

      const rvLine = await prisma.journalEntryLine.findFirst({
        where: { journalEntryId: je.id, description: { contains: 'Rounding variance' } }
      });
      assert(!!rvLine?.debitAmount && new Decimal(rvLine.debitAmount).eq('0.001'), 'expect Dr 0.001');
      console.log('✅ [3] Cr high by 0.001 → Dr Rounding Variance 0.001; journal ties out.');
    } finally {
      await cleanup(je.id);
    }
  }

  // --- 4) Imbalance 0.005 (mid-range) ---
  {
    const je = await mkJe('005');
    try {
      await addLine(je.id, bankCoa!.id, '200.000', '0', 'Dr');
      await addLine(je.id, arCoa!.id, '0', '199.995', 'Cr');
      assert(sumLines(await prisma.journalEntryLine.findMany({ where: { journalEntryId: je.id } })).diff.eq('0.005'), 'pre 0.005');

      const rv = await MultiCurrencyService.applyRoundingVarianceToJournalEntry(je.id, userId);
      assert(rv.posted && rv.roundingAmount === '0.005', JSON.stringify(rv));

      const after = sumLines(await prisma.journalEntryLine.findMany({ where: { journalEntryId: je.id } }));
      assert(after.diff.abs().lte(TOL), `after ${after.diff}`);
      console.log('✅ [4] Dr high by 0.005 → Cr Rounding Variance 0.005.');
    } finally {
      await cleanup(je.id);
    }
  }

  // --- 5) Imbalance exactly 0.010 (at cap, still auto-posted) ---
  {
    const je = await mkJe('010-cap');
    try {
      await addLine(je.id, bankCoa!.id, '10.010', '0', 'Dr');
      await addLine(je.id, arCoa!.id, '0', '10.000', 'Cr');
      const pre = sumLines(await prisma.journalEntryLine.findMany({ where: { journalEntryId: je.id } }));
      assert(pre.diff.eq('0.010'), `pre cap: ${pre.diff}`);

      const rv = await MultiCurrencyService.applyRoundingVarianceToJournalEntry(je.id, userId);
      assert(
        rv.posted && rv.roundingAmount != null && new Decimal(rv.roundingAmount).eq('0.01'),
        JSON.stringify(rv)
      );

      const after = sumLines(await prisma.journalEntryLine.findMany({ where: { journalEntryId: je.id } }));
      assert(after.diff.abs().lte(TOL), `after ${after.diff}`);
      console.log('✅ [5] Dr high by exactly 0.01 (cap) → Cr Rounding Variance 0.01.');
    } finally {
      await cleanup(je.id);
    }
  }

  // --- 6) Imbalance > 0.01 → error (no silent fix) ---
  {
    const je = await mkJe('reject');
    try {
      await addLine(je.id, bankCoa!.id, '1.110', '0', 'Dr');
      await addLine(je.id, arCoa!.id, '0', '1.000', 'Cr');
      let threw = false;
      try {
        await MultiCurrencyService.applyRoundingVarianceToJournalEntry(je.id, userId);
      } catch (e: any) {
        threw = true;
        assert(String(e.message || e).includes('exceeds'), `Expected exceeds cap, got ${e}`);
      }
      assert(threw, 'Should throw when imbalance > 0.01');
      const n = await prisma.journalEntryLine.count({ where: { journalEntryId: je.id } });
      assert(n === 2, 'No rounding line should be added on failure');
      console.log('✅ [6] Imbalance 0.11 → rejected (exceeds 0.01 cap); only 2 lines.');
    } finally {
      await cleanup(je.id);
    }
  }

  // --- 7) Idempotent: second call on already-balanced JE does nothing ---
  {
    const je = await mkJe('idempotent');
    try {
      await addLine(je.id, bankCoa!.id, '75.000', '0', 'Dr');
      await addLine(je.id, arCoa!.id, '0', '74.999', 'Cr');
      await MultiCurrencyService.applyRoundingVarianceToJournalEntry(je.id, userId);
      const rv2 = await MultiCurrencyService.applyRoundingVarianceToJournalEntry(je.id, userId);
      assert(!rv2.posted, 'Second call should not post again');
      const n = await prisma.journalEntryLine.count({ where: { journalEntryId: je.id } });
      assert(n === 3, `Expected 2 + 1 rounding = 3 lines, got ${n}`);
      const after = sumLines(await prisma.journalEntryLine.findMany({ where: { journalEntryId: je.id } }));
      assert(after.diff.abs().lte(TOL), `after idempotent ${after.diff}`);
      console.log('✅ [7] Second apply on balanced JE → posted=false; still 3 lines.');
    } finally {
      await cleanup(je.id);
    }
  }

  console.log('\n=== All rounding variance UAT cases passed ===\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
