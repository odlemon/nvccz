/**
 * Audit existing Short-Term Investment instruments for mis-configured GL accounts.
 * Uses the same rules as ShortTermInvestmentService.validateStiGlAccounts but reports
 * findings instead of throwing — so you can fix historical data safely.
 *
 * Usage (PowerShell):
 *   npx ts-node scripts/audit-sti-gl-mappings.ts
 */

import { prisma } from '../src/utils/database';
import { ShortTermInvestmentService } from '../src/services/ShortTermInvestmentService';

type Finding = {
  instrumentId: string;
  instrumentName: string;
  status: string;
  errors: string[];
};

async function main() {
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

  console.log(`\n=== STI GL-mapping Audit ===`);
  console.log(`Instruments scanned: ${instruments.length}\n`);

  const findings: Finding[] = [];

  for (const inst of instruments) {
    const errors: string[] = [];
    try {
      await ShortTermInvestmentService.validateStiGlAccounts({
        principalGlAccountId: inst.principalGlAccountId,
        accruedInterestGlAccountId: inst.accruedInterestGlAccountId,
        interestIncomeGlAccountId: inst.interestIncomeGlAccountId,
        negativeYieldExpenseGlAccountId: inst.negativeYieldExpenseGlAccountId,
        unrealizedFxGlAccountId: inst.unrealizedFxGlAccountId,
        realizedFxGlAccountId: inst.realizedFxGlAccountId,
      });
    } catch (e: any) {
      errors.push(String(e?.message || e));
    }

    // The validator throws on the first failure; re-run per-field to collect all issues.
    const allIds = Array.from(
      new Set(
        [
          inst.principalGlAccountId,
          inst.accruedInterestGlAccountId,
          inst.interestIncomeGlAccountId,
          inst.negativeYieldExpenseGlAccountId,
          inst.unrealizedFxGlAccountId || undefined,
          inst.realizedFxGlAccountId || undefined,
        ].filter(Boolean) as string[]
      )
    );
    const rows = await prisma.chartOfAccounts.findMany({
      where: { id: { in: allIds } },
      select: { id: true, accountNo: true, accountName: true, accountType: true, isActive: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const label = (role: string, id: string | null | undefined) => {
      if (!id) return `${role}: (unset)`;
      const r = byId.get(id);
      return r
        ? `${role}: ${r.accountNo} ${r.accountName} [${r.accountType}${r.isActive ? '' : ' INACTIVE'}]`
        : `${role}: (missing id=${id})`;
    };

    if (errors.length) {
      findings.push({ instrumentId: inst.id, instrumentName: inst.name, status: inst.status, errors });
      console.log(`❌ ${inst.name}  [${inst.status}]  (id=${inst.id})`);
      console.log(`     ${label('principal   ', inst.principalGlAccountId)}`);
      console.log(`     ${label('accruedInt  ', inst.accruedInterestGlAccountId)}`);
      console.log(`     ${label('interestIncm', inst.interestIncomeGlAccountId)}`);
      console.log(`     ${label('negYieldExp ', inst.negativeYieldExpenseGlAccountId)}`);
      console.log(`     ${label('unrealFx    ', inst.unrealizedFxGlAccountId)}`);
      console.log(`     ${label('realFx      ', inst.realizedFxGlAccountId)}`);
      for (const e of errors) console.log(`     → ${e}`);
      console.log();
    } else {
      console.log(`✅ ${inst.name}  [${inst.status}]`);
    }
  }

  console.log(`\n--- SUMMARY ---`);
  console.log(`Mis-configured instruments: ${findings.length} / ${instruments.length}`);
  if (findings.length) {
    console.log(`\nAffected instrument IDs (for remediation):`);
    for (const f of findings) {
      console.log(`  ${f.instrumentId}  ${f.instrumentName}`);
    }
    console.log(
      `\nRemediation: the instrument's principal / accruedInterest / interestIncome GL fields\n` +
        `need to point at the correct Short-Term Investments, Accrued Interest Receivable, and\n` +
        `Interest Income chart-of-accounts rows. Since the posting code itself is correct, any\n` +
        `historical settlement JEs that used the wrong accounts should be reversed and the\n` +
        `settlement re-posted after the mapping is fixed. (No update endpoint exists yet; update\n` +
        `via a targeted prisma.shortTermInvestmentInstrument.update script or DB tool.)`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
