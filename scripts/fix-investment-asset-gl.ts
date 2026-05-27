/**
 * fix-investment-asset-gl.ts
 *
 * Fixes two issues on account 1502 (Investment Asset):
 *
 * FIX 1 — Missing placement journal for STI cmnvjzgq ($90,000, 2025-07-01)
 *   The settlement JE correctly CR'd 1502 for $90k but the matching DR
 *   (cash → Investment Asset when the investment was placed) was never posted.
 *   We post a backdated correcting entry: DR 1502 $90,000 / CR Bank (1117) $90,000
 *   dated 2025-07-01, marked POSTED, with a clear audit description.
 *   Idempotent: skips if a JE with referenceNumber STI-PLC-CORR-cmnvjzgq already exists.
 *
 * FIX 2 — Duplicate Vexma Tech valuation JE (AUTO-1775667787066)
 *   Two identical PENDING valuation adjustments for Vexma Tech exist (each DR 1502 $30k,
 *   CR 4050 $30k). The first (AUTO-1775649277017) is kept; the second
 *   (AUTO-1775667787066) is voided.
 *   Idempotent: skips if already VOID.
 */
import { prisma } from '../src/utils/database';
import { createJournalEntryWithAuditSequence } from '../src/services/AuditTrailSequenceService';

const CORRECTING_REF_CMNVJZGQ = 'STI-PLC-CORR-cmnvjzgq';
const CORRECTING_REF_CMO30K23 = 'STI-PLC-CORR-cmo30k23';
const DUPLICATE_JE_REF = 'AUTO-1775667787066';

async function postPlacementCorrection(opts: {
  ref: string;
  amount: number;
  dateIso: string;
  stiId: string;
  stiName: string;
  acc1502: { id: string };
  acc1117: { id: string };
  currencyId: string;
  sysUserId: string;
}) {
  const existing = await prisma.journalEntry.findFirst({ where: { referenceNumber: opts.ref } });
  if (existing) {
    console.log(`  SKIPPED — correcting JE already exists (id=${existing.id}, status=${existing.status})`);
    return;
  }

  const je = await createJournalEntryWithAuditSequence({
    transactionDate: new Date(`${opts.dateIso}T00:00:00.000Z`),
    referenceNumber: opts.ref,
    description: `CORRECTING ENTRY: STI placement DR missing for ${opts.stiId} — Investment Asset $${opts.amount.toLocaleString()} deployed ${opts.dateIso}`,
    totalAmount: opts.amount,
    currencyId: opts.currencyId,
    status: 'POSTED',
    createdById: opts.sysUserId,
  });

  await prisma.journalEntryLine.create({
    data: { journalEntryId: je.id, chartOfAccountId: opts.acc1502.id,
      debitAmount: opts.amount, creditAmount: 0,
      description: `CORR: Investment principal placed — STI ${opts.stiId} (${opts.stiName})` },
  });
  await prisma.journalEntryLine.create({
    data: { journalEntryId: je.id, chartOfAccountId: opts.acc1117.id,
      debitAmount: 0, creditAmount: opts.amount,
      description: `CORR: Cash deployed to STI ${opts.stiId} (${opts.stiName}) — CBZ Account` },
  });

  console.log(`  DONE — correcting JE posted: id=${je.id}, ref=${opts.ref}`);
  console.log(`    DR 1502 Investment Asset   $${opts.amount.toLocaleString()}`);
  console.log(`    CR 1117 Bank - CBZ Account $${opts.amount.toLocaleString()}`);
}

async function fix1MissingPlacementJournals() {
  console.log('\n=== FIX 1: Missing STI placement journals ===');

  const acc1502 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '1502', isActive: true } });
  const acc1117 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '1117', isActive: true } });
  if (!acc1502) throw new Error('Account 1502 not found');
  if (!acc1117) throw new Error('Account 1117 not found');

  const sysUser = await prisma.user.findFirst({ where: { role: { name: 'admin' } }, select: { id: true } })
    ?? await prisma.user.findFirst({ select: { id: true } });
  if (!sysUser) throw new Error('No user found');

  const currency = await prisma.currency.findFirst({ where: { code: 'USD' } });
  if (!currency) throw new Error('USD currency not found');

  // STI cmnvjzgq — $90,000 placed 2025-07-01
  console.log('\n  1a. STI cmnvjzgq ($90,000 — 2025-07-01):');
  await postPlacementCorrection({
    ref: CORRECTING_REF_CMNVJZGQ, amount: 90000, dateIso: '2025-07-01',
    stiId: 'cmnvjzgq', stiName: 'b',
    acc1502, acc1117, currencyId: currency.id, sysUserId: sysUser.id,
  });

  // STI cmo30k23 — $10,000 placed (settlement date 2026-04-19, so placement before that)
  console.log('\n  1b. STI cmo30k23 ($10,000 — CBZ Market, placed before 2026-04-19):');
  await postPlacementCorrection({
    ref: CORRECTING_REF_CMO30K23, amount: 10000, dateIso: '2026-04-18',
    stiId: 'cmo30k23', stiName: 'CBZ Market',
    acc1502, acc1117, currencyId: currency.id, sysUserId: sysUser.id,
  });
}

async function fix2VoidDuplicateVexmaValuation() {
  console.log('\n=== FIX 2: Void duplicate Vexma Tech valuation JE ===');

  const dupJE = await prisma.journalEntry.findFirst({
    where: { referenceNumber: DUPLICATE_JE_REF },
    select: { id: true, status: true, referenceNumber: true },
  });

  if (!dupJE) {
    console.log(`  SKIPPED — JE with ref ${DUPLICATE_JE_REF} not found`);
    return;
  }
  if (dupJE.status === 'VOID') {
    console.log(`  SKIPPED — JE id=${dupJE.id} is already VOID`);
    return;
  }

  await prisma.journalEntry.update({
    where: { id: dupJE.id },
    data: { status: 'VOID' },
  });

  console.log(`  DONE — JE id=${dupJE.id} (${DUPLICATE_JE_REF}) voided`);
  console.log(`  Kept: AUTO-1775649277017 (first/canonical valuation adjustment)`);
}

async function verifyAccount1502() {
  console.log('\n=== Verification: Account 1502 balance after fixes ===');

  const acc = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '1502' } });
  if (!acc) return;

  const agg = await prisma.journalEntryLine.aggregate({
    where: { chartOfAccountId: acc.id, journalEntry: { status: 'POSTED' } },
    _sum: { debitAmount: true, creditAmount: true },
  });
  const dr = Number(agg._sum.debitAmount ?? 0);
  const cr = Number(agg._sum.creditAmount ?? 0);
  console.log(`  POSTED DR: $${dr.toFixed(2)}`);
  console.log(`  POSTED CR: $${cr.toFixed(2)}`);
  console.log(`  Net (DR-CR): $${(dr - cr).toFixed(2)}`);
  if (dr - cr > 0) {
    console.log('  ✓ Account 1502 is now positive — correct for an asset account');
  } else {
    console.log('  ✗ Account 1502 is still negative — further investigation needed');
  }
}

async function main() {
  await fix1MissingPlacementJournals();
  await fix2VoidDuplicateVexmaValuation();
  await verifyAccount1502();
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
