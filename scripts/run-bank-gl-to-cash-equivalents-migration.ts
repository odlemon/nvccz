/**
 * Remap legacy per-bank chart lines to one Cash and Cash Equivalents CoA; drop unique on banks.glAccountId.
 * Idempotent: re-running after success is mostly a no-op.
 *
 * Uses resolveCashAndCashEquivalentsCoa from src/config (env or CoA fallbacks).
 *
 * Run: npm run db:migrate:bank-gl-to-cash-equivalents
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { resolveCashAndCashEquivalentsCoa } from '../src/config/cashAndCashEquivalents';

const prisma = new PrismaClient();

async function listBankGlUniqueIndexes(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ INDEX_NAME: string; SEQ_IN_INDEX: number }>>(
    `SELECT INDEX_NAME, SEQ_IN_INDEX
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'banks'
       AND COLUMN_NAME = 'glAccountId'
       AND NON_UNIQUE = 0
       AND INDEX_NAME <> 'PRIMARY'
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`
  );
  const multi = new Set<string>();
  const names = new Set<string>();
  for (const r of rows) {
    if (Number(r.SEQ_IN_INDEX) > 1) multi.add(r.INDEX_NAME);
    else names.add(r.INDEX_NAME);
  }
  for (const m of multi) names.delete(m);
  return [...names];
}

async function dropBankGlUniqueIndexes(): Promise<void> {
  const indexes = await listBankGlUniqueIndexes();
  for (const idx of indexes) {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`banks\` DROP INDEX \`${idx}\``);
    console.log(`[ok] dropped unique index on banks.glAccountId: ${idx}`);
  }
  if (indexes.length === 0) {
    console.log('[skip] no unique index on banks.glAccountId (already dropped)');
  }
}

async function main() {
  if (
    !process.env.CASH_AND_CASH_EQUIVALENTS_GL_ACCOUNT_ID?.trim() &&
    !process.env.CASH_AND_CASH_EQUIVALENTS_ACCOUNT_NO?.trim()
  ) {
    throw new Error(
      'Set CASH_AND_CASH_EQUIVALENTS_GL_ACCOUNT_ID or CASH_AND_CASH_EQUIVALENTS_ACCOUNT_NO before running this migration.'
    );
  }

  const target = await resolveCashAndCashEquivalentsCoa(prisma);
  if (!['Current Asset', 'Fixed Asset'].includes(target.accountType)) {
    throw new Error(
      `Cash and Cash Equivalents must be an asset type; got "${target.accountType}" (${target.accountNo}).`
    );
  }

  const bankRows = await prisma.bank.findMany({
    select: { id: true, glAccountId: true },
  });
  const oldIds = [
    ...new Set(
      bankRows.map((b) => b.glAccountId).filter((id): id is string => !!id && id !== target.id)
    ),
  ];

  console.log(`Target CoA: ${target.accountNo} — ${target.accountName} (${target.id})`);
  console.log(`Distinct non-target bank GL ids to remap: ${oldIds.length}`);

  await dropBankGlUniqueIndexes();

  if (oldIds.length > 0) {
    const r1 = await prisma.journalEntryLine.updateMany({
      where: { chartOfAccountId: { in: oldIds } },
      data: { chartOfAccountId: target.id },
    });
    console.log(`[ok] journal_entry_lines updated: ${r1.count}`);

    const r2 = await prisma.cashbookEntry.updateMany({
      where: { glAccountId: { in: oldIds } },
      data: { glAccountId: target.id },
    });
    console.log(`[ok] cashbook_entries updated: ${r2.count}`);

    const r3 = await prisma.cashbookEntryTypeConfig.updateMany({
      where: { defaultGlAccountId: { in: oldIds } },
      data: { defaultGlAccountId: target.id },
    });
    console.log(`[ok] cashbook_entry_type_configs updated: ${r3.count}`);

    const r4 = await prisma.cashbookTemplate.updateMany({
      where: { glAccountId: { in: oldIds } },
      data: { glAccountId: target.id },
    });
    console.log(`[ok] cashbook_templates updated: ${r4.count}`);

    const r5 = await prisma.contraEntryConfig.updateMany({
      where: { glAccountId: { in: oldIds } },
      data: { glAccountId: target.id },
    });
    console.log(`[ok] contra_entry_configs updated: ${r5.count}`);

    const r6a = await prisma.contraEntry.updateMany({
      where: { debitAccountId: { in: oldIds } },
      data: { debitAccountId: target.id },
    });
    const r6b = await prisma.contraEntry.updateMany({
      where: { creditAccountId: { in: oldIds } },
      data: { creditAccountId: target.id },
    });
    console.log(`[ok] contra_entries debit / credit rows: ${r6a.count} / ${r6b.count}`);

    const templates = await prisma.recurringJournalTemplate.findMany({
      select: { id: true, linesJson: true },
    });
    let tplUpdated = 0;
    for (const t of templates) {
      const raw = t.linesJson as unknown;
      if (!Array.isArray(raw)) continue;
      let changed = false;
      const next = raw.map((line) => {
        if (!line || typeof line !== 'object') return line;
        const o = line as Record<string, unknown>;
        const cid = o.chartOfAccountId;
        if (typeof cid === 'string' && oldIds.includes(cid)) {
          changed = true;
          return { ...o, chartOfAccountId: target.id };
        }
        return line;
      });
      if (changed) {
        await prisma.recurringJournalTemplate.update({
          where: { id: t.id },
          data: { linesJson: next },
        });
        tplUpdated++;
      }
    }
    console.log(`[ok] recurring_journal_templates updated: ${tplUpdated}`);
  } else {
    console.log('[skip] no legacy bank-only GL ids to remap in side tables');
  }

  const rBanks = await prisma.bank.updateMany({
    data: { glAccountId: target.id },
  });
  console.log(`[ok] all banks linked to target: ${rBanks.count}`);

  const orphan = await prisma.bank.findFirst({
    where: { OR: [{ glAccountId: null }, { glAccountId: { not: target.id } }] },
  });
  if (orphan) {
    throw new Error('Verify failed: a bank row is not linked to target CoA');
  }

  console.log('\nDone: bank GL → Cash and Cash Equivalents.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
