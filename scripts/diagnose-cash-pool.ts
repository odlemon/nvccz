/**
 * Diagnostic: enumerate every GL account that the cash flow & balance sheet services
 * treat as "Cash and Cash Equivalents", and compute each one's ending balance as of
 * a given date. Flags:
 *   - Accounts with negative ending balance (suspicious for true cash).
 *   - Accounts whose `accountType` / name looks non-cash (misclassified).
 *   - Accounts NOT linked to any Bank row (i.e. pulled in purely by name/range rule).
 *
 * Usage (PowerShell):
 *   $env:CF_AS_OF="2026-04-30"; npx ts-node scripts/diagnose-cash-pool.ts
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../src/utils/database';
import { BalanceSheetService } from '../src/services/BalanceSheetService';
import { buildJournalEntryWhereForGlReporting } from '../src/utils/journalEntryReportingFilter';

function parseAsOf(input?: string): Date {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split('-').map((n) => parseInt(n, 10));
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

async function main() {
  const asOf = parseAsOf(process.env.CF_AS_OF);
  const currency = await prisma.currency.findFirst({ where: { isActive: true } });
  if (!currency) {
    console.error('No active currency found — aborting');
    process.exit(1);
  }

  console.log(`\n=== Cash Pool Diagnostic ===`);
  console.log(`As of    : ${asOf.toISOString()}`);
  console.log(`Currency : ${currency.code} (${currency.id})\n`);

  // 1. Gather bank GL ids (the "primary" cash accounts linked to Bank records).
  const banks = await prisma.bank.findMany({
    where: { isActive: true, glAccount: { isActive: true } },
    include: { glAccount: true }
  });
  const bankGLAccountIds = new Set<string>();
  const bankMetaByGl = new Map<string, { bankId: string; bankName: string; accountNumber: string | null }>();
  for (const b of banks) {
    if (b.glAccount) {
      bankGLAccountIds.add(b.glAccount.id);
      bankMetaByGl.set(b.glAccount.id, {
        bankId: b.id,
        bankName: b.name,
        accountNumber: (b as any).accountNumber || null
      });
    }
  }

  // 2. Gather the full BS active COA universe and resolve those that qualify as cash/equiv.
  const bsAccounts = await prisma.chartOfAccounts.findMany({
    where: {
      financialStatement: { in: ['Balance Sheet', 'Balance sheet'] },
      isActive: true
    },
    select: {
      id: true,
      accountNo: true,
      accountName: true,
      accountType: true
    }
  });

  const cashAccounts = bsAccounts.filter((a) =>
    BalanceSheetService.isCashOrBankEquivalentForReporting(a, bankGLAccountIds)
  );

  console.log(`Total active Balance-Sheet accounts : ${bsAccounts.length}`);
  console.log(`Qualifying as cash / equivalent     : ${cashAccounts.length}`);
  console.log(`Linked to a Bank row                : ${Array.from(bankGLAccountIds).length}\n`);

  // 3. For each cash account, compute the ending balance up to asOf using the same
  //    reporting filter as CashFlowBalanceService.
  type Row = {
    id: string;
    accountNo: string;
    accountName: string;
    accountType: string;
    bankLinked: boolean;
    bankName: string | null;
    totalDebits: number;
    totalCredits: number;
    balance: number;   // Asset convention: Dr − Cr
    txCount: number;
  };
  const rows: Row[] = [];

  for (const acc of cashAccounts) {
    const lines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: acc.id,
        journalEntry: {
          is: buildJournalEntryWhereForGlReporting({ lte: asOf }, currency.id)
        }
      },
      select: { debitAmount: true, creditAmount: true }
    });
    let dr = new Decimal(0);
    let cr = new Decimal(0);
    for (const l of lines) {
      dr = dr.plus(l.debitAmount as any);
      cr = cr.plus(l.creditAmount as any);
    }
    const balance = dr.minus(cr).toNumber();
    const meta = bankMetaByGl.get(acc.id);
    rows.push({
      id: acc.id,
      accountNo: acc.accountNo,
      accountName: acc.accountName,
      accountType: acc.accountType,
      bankLinked: bankGLAccountIds.has(acc.id),
      bankName: meta?.bankName || null,
      totalDebits: dr.toNumber(),
      totalCredits: cr.toNumber(),
      balance,
      txCount: lines.length
    });
  }

  rows.sort((a, b) => a.accountNo.localeCompare(b.accountNo));

  // 4. Print the full table.
  console.log('--- CASH POOL CONTENTS ---');
  console.log(
    ['#', 'AccountNo', 'AccountType', 'Name', 'BankLinked', 'Bank', 'Dr', 'Cr', 'Balance', 'Txs'].join(' | ')
  );
  let total = new Decimal(0);
  let negativeCount = 0;
  let nonBankLinkedCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    total = total.plus(r.balance);
    if (r.balance < 0) negativeCount += 1;
    if (!r.bankLinked) nonBankLinkedCount += 1;
    console.log(
      [
        String(i + 1).padStart(2, ' '),
        r.accountNo.padEnd(10, ' '),
        (r.accountType || '').padEnd(16, ' '),
        r.accountName.padEnd(45, ' ').slice(0, 45),
        r.bankLinked ? 'YES' : 'no ',
        (r.bankName || '-').padEnd(25, ' ').slice(0, 25),
        r.totalDebits.toFixed(2).padStart(14, ' '),
        r.totalCredits.toFixed(2).padStart(14, ' '),
        r.balance.toFixed(2).padStart(14, ' '),
        String(r.txCount).padStart(5, ' ')
      ].join(' | ')
    );
  }

  console.log('\n--- SUMMARY ---');
  console.log(`Pool ending balance      : ${total.toNumber().toFixed(2)}`);
  console.log(`Accounts with NEGATIVE balance : ${negativeCount}`);
  console.log(`Accounts NOT linked to a Bank  : ${nonBankLinkedCount}`);

  // 5. Flag the most suspicious rows.
  const suspicious = rows.filter(
    (r) => r.balance < 0 || (!r.bankLinked && !/cash|petty|money market|call deposit/i.test(r.accountName))
  );
  if (suspicious.length) {
    console.log('\n--- SUSPICIOUS ROWS (review these first) ---');
    for (const r of suspicious) {
      const reasons: string[] = [];
      if (r.balance < 0) reasons.push(`negative balance ${r.balance.toFixed(2)}`);
      if (!r.bankLinked) reasons.push('not linked to any Bank row');
      console.log(
        `  ${r.accountNo}  ${r.accountName}  [${r.accountType}]  → ${reasons.join(', ')}`
      );
    }
  } else {
    console.log('\nNo suspicious rows — cash pool looks clean.');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
