/**
 * Retarget STI-related journal lines to the canonical GL accounts (same set as
 * scripts/remap-sti-gl-mappings.ts: 1502, 1505, 4110, 5510, 4210, 4220).
 *
 * This updates `journal_entry_lines.chart_of_account_id` only. Amounts are unchanged,
 * so each journal entry remains balanced. It is the operational alternative to reversing
 * and reposting every STI JE.
 *
 * Scope (only lines tied to these journal entries):
 *   • reference_number LIKE 'STI-SET-%'  — settlement
 *   • reference_number LIKE 'STI-RFX-%' — realized FX at settlement
 *   • reference_number LIKE 'STI-UFX-%' — month-end unrealized FX
 *   • description LIKE 'Short-term investment accrual —%' on the header — daily accruals
 *
 * Cash/bank line "STI settlement receipt — …" is never changed.
 *
 * Usage:
 *   npx ts-node scripts/retarget-sti-journal-line-accounts.ts        # dry-run counts
 *   npx ts-node scripts/retarget-sti-journal-line-accounts.ts --apply
 */

import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/utils/database';

type TargetKey = 'principal' | 'accrued' | 'interestIncome' | 'negYield' | 'unrealizedFx' | 'realizedFx';

const ACCOUNT_NOS: Record<TargetKey, string> = {
  principal: '1502',
  accrued: '1505',
  interestIncome: '4110',
  negYield: '5510',
  unrealizedFx: '4210',
  realizedFx: '4220',
};

/** DB columns follow Prisma field names (camelCase) unless @map'd. */
function stiJournalPredicateSql(): Prisma.Sql {
  return Prisma.sql`(
    je.referenceNumber LIKE 'STI-SET-%'
    OR je.referenceNumber LIKE 'STI-RFX-%'
    OR je.referenceNumber LIKE 'STI-UFX-%'
    OR je.description LIKE 'Short-term investment accrual —%'
  )`;
}

async function countWouldChange(
  whereLine: Prisma.Sql,
  targetId: string
): Promise<number> {
  const rows = await prisma.$queryRaw<[{ c: bigint }]>(
    Prisma.sql`
    SELECT COUNT(*) AS c
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journalEntryId
    WHERE ${stiJournalPredicateSql()}
    AND (${whereLine})
    AND jel.chartOfAccountId <> ${targetId}
  `
  );
  return Number(rows[0]?.c ?? 0);
}

async function applyUpdate(whereLine: Prisma.Sql, targetId: string): Promise<number> {
  const result = await prisma.$executeRaw(
    Prisma.sql`
    UPDATE journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journalEntryId
    SET jel.chartOfAccountId = ${targetId}
    WHERE ${stiJournalPredicateSql()}
    AND (${whereLine})
    AND jel.chartOfAccountId <> ${targetId}
  `
  );
  return Number(result);
}

async function main() {
  const apply = process.argv.includes('--apply');

  const coa = await prisma.chartOfAccounts.findMany({
    where: { accountNo: { in: Object.values(ACCOUNT_NOS) } },
    select: { id: true, accountNo: true, accountName: true },
  });
  const byNo = new Map(coa.map((r) => [r.accountNo, r]));
  const missing = Object.values(ACCOUNT_NOS).filter((no) => !byNo.has(no));
  if (missing.length) {
    console.error(
      `Missing chart-of-accounts rows for: ${missing.join(', ')}. Run npm run db:remap:sti-gl-mappings -- --apply first.`
    );
    process.exit(1);
  }

  const id = (k: TargetKey) => byNo.get(ACCOUNT_NOS[k])!.id;

  type Rule = { name: string; where: Prisma.Sql };
  const rules: Rule[] = [
    {
      name: "Settlement: Principal — …",
      where: Prisma.sql`je.referenceNumber LIKE 'STI-SET-%' AND jel.description LIKE 'Principal —%'`,
    },
    {
      name: "Settlement: Accrued interest — …",
      where: Prisma.sql`je.referenceNumber LIKE 'STI-SET-%' AND jel.description LIKE 'Accrued interest —%'`,
    },
    {
      name: "Settlement: Settlement plug (premium|shortfall)",
      where: Prisma.sql`je.referenceNumber LIKE 'STI-SET-%' AND (
          jel.description LIKE 'Settlement plug (premium)%' OR jel.description LIKE 'Settlement plug (shortfall)%'
        )`,
    },
    {
      name: "Realized FX: gain/loss P&L line",
      where: Prisma.sql`je.referenceNumber LIKE 'STI-RFX-%' AND (
          jel.description = 'Realized FX gain (functional)' OR jel.description = 'Realized FX loss (functional)'
        )`,
    },
    {
      name: "Realized FX: carrying value settlement (functional)",
      where: Prisma.sql`je.referenceNumber LIKE 'STI-RFX-%' AND jel.description = 'STI carrying value settlement (functional)'`,
    },
    {
      name: "Unrealized FX: gain/loss P&L line",
      where: Prisma.sql`je.referenceNumber LIKE 'STI-UFX-%' AND (
          jel.description = 'Unrealized FX gain (functional)' OR jel.description = 'Unrealized FX loss (functional)'
        )`,
    },
    {
      name: "Unrealized FX: carrying revaluation (functional)",
      where: Prisma.sql`je.referenceNumber LIKE 'STI-UFX-%' AND jel.description = 'STI carrying value revaluation (functional)'`,
    },
    {
      name: "Accrual: Accrued interest (tick, not settlement)",
      where: Prisma.sql`je.description LIKE 'Short-term investment accrual —%' AND jel.description LIKE 'Accrued interest %' AND jel.description NOT LIKE 'Accrued interest —%' AND jel.description NOT LIKE 'Accrued interest (reduction)%'`,
    },
    {
      name: "Accrual: Accrued interest (reduction)",
      where: Prisma.sql`je.description LIKE 'Short-term investment accrual —%' AND jel.description LIKE 'Accrued interest (reduction)%'`,
    },
    {
      name: "Accrual: Interest income …",
      where: Prisma.sql`je.description LIKE 'Short-term investment accrual —%' AND jel.description LIKE 'Interest income %'`,
    },
    {
      name: "Accrual: Negative yield expense …",
      where: Prisma.sql`je.description LIKE 'Short-term investment accrual —%' AND jel.description LIKE 'Negative yield expense %'`,
    },
  ];

  const targets: TargetKey[] = [
    'principal',
    'accrued',
    'interestIncome',
    'realizedFx',
    'principal',
    'unrealizedFx',
    'principal',
    'accrued',
    'accrued',
    'interestIncome',
    'negYield',
  ];

  if (rules.length !== targets.length) {
    throw new Error('rules/targets length mismatch');
  }

  console.log(`\n=== Retarget STI journal lines (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);
  for (const r of coa) {
    console.log(`  ${r.accountNo}  ${r.accountName}  (${r.id})`);
  }
  console.log('');

  let totalWould = 0;
  let totalApplied = 0;

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    const tk = targets[i]!;
    const tid = id(tk);
    const n = await countWouldChange(rule.where, tid);
    totalWould += n;
    console.log(`[${rule.name}] → ${ACCOUNT_NOS[tk]}  (${n} line(s) to fix)`);
    if (apply && n > 0) {
      const updated = await applyUpdate(rule.where, tid);
      totalApplied += updated;
    }
  }

  console.log(`\n--- SUMMARY ---`);
  console.log(`Lines needing retarget (distinct rules): ${totalWould}`);
  if (apply) {
    console.log(`Rows updated (MySQL affected rows): ${totalApplied}`);
  } else {
    console.log(`Re-run with --apply to execute updates.`);
  }

  console.log(
    `\nCash line "STI settlement receipt — …" was not modified. If any rule shows unexpected counts, review descriptions in DB.`
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
