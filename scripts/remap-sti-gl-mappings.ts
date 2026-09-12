/**
 * Remediate every Short-Term Investment instrument to use proper STI GL accounts.
 *
 * What it does (dry-run by default):
 *   1. Ensures a standard set of STI chart-of-accounts rows exists; creates any missing
 *      rows (Current Asset, Revenue, Expense families).
 *   2. Validates the target accounts against the same rules as
 *      ShortTermInvestmentService.validateStiGlAccounts.
 *   3. Lists every instrument whose mapping would change, side-by-side.
 *   4. With `--apply`, updates all instruments in a single transaction.
 *
 * This script does NOT touch historical journal entries. Settled instruments keep
 * their existing (mis-posted) JEs because those entries already affected cash and
 * balance sheet accounts; reversing/reposting is a separate, manual exercise.
 *
 * Usage (PowerShell):
 *   # Dry-run (recommended first):
 *   npx ts-node scripts/remap-sti-gl-mappings.ts
 *
 *   # Apply changes:
 *   npx ts-node scripts/remap-sti-gl-mappings.ts --apply
 */

import { prisma } from '../src/utils/database';
import { ShortTermInvestmentService } from '../src/services/ShortTermInvestmentService';

type AccountSpec = {
  accountNo: string;
  accountName: string;
  accountType: string;
  financialStatement: 'Balance Sheet' | 'Income Statement';
  notes: string;
};

// Target STI chart-of-accounts layout. Adjust accountNo to match your numbering scheme.
const STI_ACCOUNTS: Record<string, AccountSpec> = {
  principal: {
    accountNo: '1502',
    accountName: 'Short-Term Investments',
    accountType: 'Current Asset',
    financialStatement: 'Balance Sheet',
    notes: 'Principal value of short-term investment instruments (money market, T-bills, CP).',
  },
  accruedInterest: {
    accountNo: '1505',
    accountName: 'Accrued Interest Receivable',
    accountType: 'Current Asset',
    financialStatement: 'Balance Sheet',
    notes: 'Interest accrued on short-term investments but not yet received.',
  },
  interestIncome: {
    accountNo: '4110',
    accountName: 'Investment Interest Income',
    accountType: 'Revenue',
    financialStatement: 'Income Statement',
    notes: 'Interest income earned on short-term investments.',
  },
  negativeYieldExpense: {
    accountNo: '5510',
    accountName: 'Investment Negative-Yield Expense',
    accountType: 'Expense',
    financialStatement: 'Income Statement',
    notes: 'Negative-yield / fee expense recognised on short-term investments.',
  },
  unrealizedFx: {
    accountNo: '4210',
    accountName: 'Unrealized FX Gain/Loss on Investments',
    accountType: 'Revenue',
    financialStatement: 'Income Statement',
    notes: 'Unrealised FX re-measurement on foreign-currency short-term investments.',
  },
  realizedFx: {
    accountNo: '4220',
    accountName: 'Realized FX Gain/Loss on Investments',
    accountType: 'Revenue',
    financialStatement: 'Income Statement',
    notes: 'Realised FX gain/loss on settlement of foreign-currency short-term investments.',
  },
};

async function ensureAccount(spec: AccountSpec, apply: boolean): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: spec.accountNo },
  });
  if (existing) {
    // Sanity: ensure it's active.
    if (!existing.isActive && apply) {
      await prisma.chartOfAccounts.update({ where: { id: existing.id }, data: { isActive: true } });
    }
    return { id: existing.id, created: false };
  }
  if (!apply) {
    return { id: `(would-create:${spec.accountNo})`, created: true };
  }
  const row = await prisma.chartOfAccounts.create({
    data: {
      accountNo: spec.accountNo,
      accountName: spec.accountName,
      accountType: spec.accountType,
      financialStatement: spec.financialStatement,
      notes: spec.notes,
      isActive: true,
    },
  });
  return { id: row.id, created: true };
}

async function main() {
  const apply = process.argv.includes('--apply');

  console.log(`\n=== STI GL-mapping Remediation (${apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  // 1. Ensure / create target accounts.
  const targetIds: Record<keyof typeof STI_ACCOUNTS, string> = {} as any;
  const created: string[] = [];
  const reused: string[] = [];
  for (const [role, spec] of Object.entries(STI_ACCOUNTS) as Array<
    [keyof typeof STI_ACCOUNTS, AccountSpec]
  >) {
    const { id, created: wasCreated } = await ensureAccount(spec, apply);
    targetIds[role] = id;
    (wasCreated ? created : reused).push(`${spec.accountNo} ${spec.accountName}`);
  }
  if (reused.length) console.log(`Reusing existing accounts:\n  ${reused.join('\n  ')}\n`);
  if (created.length)
    console.log(
      `${apply ? 'Created' : 'Would create'} the following missing accounts:\n  ${created.join('\n  ')}\n`
    );

  // 2. Validate the target mapping itself (unless dry-run with freshly-fake ids).
  if (apply) {
    await ShortTermInvestmentService.validateStiGlAccounts({
      principalGlAccountId: targetIds.principal,
      accruedInterestGlAccountId: targetIds.accruedInterest,
      interestIncomeGlAccountId: targetIds.interestIncome,
      negativeYieldExpenseGlAccountId: targetIds.negativeYieldExpense,
      unrealizedFxGlAccountId: targetIds.unrealizedFx,
      realizedFxGlAccountId: targetIds.realizedFx,
    });
    console.log('Target mapping validated ✅\n');
  }

  // 3. Compare every instrument's current mapping against the target.
  const instruments = await prisma.shortTermInvestmentInstrument.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      principalGlAccountId: true,
      accruedInterestGlAccountId: true,
      interestIncomeGlAccountId: true,
      negativeYieldExpenseGlAccountId: true,
      unrealizedFxGlAccountId: true,
      realizedFxGlAccountId: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const toUpdate: Array<{
    id: string;
    name: string;
    status: string;
    changes: Array<[string, string, string]>; // [role, before, after]
  }> = [];

  const currentIds = new Set(
    instruments.flatMap((i) =>
      [
        i.principalGlAccountId,
        i.accruedInterestGlAccountId,
        i.interestIncomeGlAccountId,
        i.negativeYieldExpenseGlAccountId,
        i.unrealizedFxGlAccountId,
        i.realizedFxGlAccountId,
      ].filter(Boolean) as string[]
    )
  );
  const coaRows = await prisma.chartOfAccounts.findMany({
    where: { id: { in: Array.from(currentIds) } },
    select: { id: true, accountNo: true, accountName: true },
  });
  const coaById = new Map(coaRows.map((r) => [r.id, `${r.accountNo} ${r.accountName}`]));

  const labelOf = (id: string | null | undefined) => (id ? coaById.get(id) || `(missing:${id})` : '(unset)');
  const targetLabel = (role: keyof typeof STI_ACCOUNTS) =>
    `${STI_ACCOUNTS[role].accountNo} ${STI_ACCOUNTS[role].accountName}`;

  for (const inst of instruments) {
    const changes: Array<[string, string, string]> = [];

    const roleMap: Array<[keyof typeof STI_ACCOUNTS, string, string | null | undefined]> = [
      ['principal', 'principalGlAccountId', inst.principalGlAccountId],
      ['accruedInterest', 'accruedInterestGlAccountId', inst.accruedInterestGlAccountId],
      ['interestIncome', 'interestIncomeGlAccountId', inst.interestIncomeGlAccountId],
      ['negativeYieldExpense', 'negativeYieldExpenseGlAccountId', inst.negativeYieldExpenseGlAccountId],
      ['unrealizedFx', 'unrealizedFxGlAccountId', inst.unrealizedFxGlAccountId],
      ['realizedFx', 'realizedFxGlAccountId', inst.realizedFxGlAccountId],
    ];

    for (const [role, , currentId] of roleMap) {
      const desired = targetIds[role];
      if (currentId !== desired) {
        changes.push([role, labelOf(currentId), targetLabel(role)]);
      }
    }

    if (changes.length) {
      toUpdate.push({ id: inst.id, name: inst.name, status: inst.status, changes });
    }
  }

  console.log(`Instruments scanned      : ${instruments.length}`);
  console.log(`Instruments needing remap: ${toUpdate.length}\n`);

  if (toUpdate.length === 0) {
    console.log('Nothing to do. All instruments already use the target mapping.');
    await prisma.$disconnect();
    return;
  }

  for (const u of toUpdate) {
    console.log(`• ${u.name}  [${u.status}]  (${u.id})`);
    for (const [role, before, after] of u.changes) {
      console.log(`    ${role.padEnd(22, ' ')}  ${before}  →  ${after}`);
    }
  }

  if (!apply) {
    console.log(
      `\nDRY-RUN complete. Re-run with --apply to update ${toUpdate.length} instrument(s).`
    );
    await prisma.$disconnect();
    return;
  }

  // 4. Apply updates in one statement (avoids Prisma's default 5s interactive tx limit on 40+ rows).
  console.log(`\nApplying updates…`);
  const result = await prisma.shortTermInvestmentInstrument.updateMany({
    where: { id: { in: toUpdate.map((u) => u.id) } },
    data: {
      principalGlAccountId: targetIds.principal,
      accruedInterestGlAccountId: targetIds.accruedInterest,
      interestIncomeGlAccountId: targetIds.interestIncome,
      negativeYieldExpenseGlAccountId: targetIds.negativeYieldExpense,
      unrealizedFxGlAccountId: targetIds.unrealizedFx,
      realizedFxGlAccountId: targetIds.realizedFx,
    },
  });
  if (result.count !== toUpdate.length) {
    console.warn(
      `Warning: expected ${toUpdate.length} row(s) updated, got ${result.count}. ` +
        `Some ids may be missing or concurrent changes occurred.`
    );
  }
  console.log(`✅ Updated ${result.count} instrument(s).`);
  console.log(
    `\nNote: historical settlement / accrual journal entries posted under the OLD mappings\n` +
      `were NOT altered. If you want those restated, reverse each offending JE and re-run the\n` +
      `relevant STI settlement endpoint to repost under the corrected mapping.`
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
