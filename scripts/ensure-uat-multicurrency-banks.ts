/**
 * Ensures currencies (ZAR, ZWL), shared Cash and Cash Equivalents GL, and three UAT cashbook banks:
 *   USD, ZAR (Rand), ZWL (Zimbabwe dollar).
 *
 * All banks reference the same CoA line (Cash and Cash Equivalents).
 *
 * Run: npx ts-node scripts/ensure-uat-multicurrency-banks.ts
 * Uses DATABASE_URL from .env
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BANK_ACCOUNT_NOS = {
  usd: 'UAT-MCY-USD-001',
  zar: 'UAT-MCY-ZAR-001',
  zwl: 'UAT-MCY-ZWL-001',
} as const;

async function ensureCurrency(code: string, name: string, symbol: string) {
  const upper = code.toUpperCase();
  const existing = await prisma.currency.findUnique({ where: { code: upper } });
  if (existing) {
    return existing;
  }
  return prisma.currency.create({
    data: {
      code: upper,
      name,
      symbol,
      isActive: true,
      isDefault: false,
    },
  });
}

async function ensureSharedCashGl() {
  let coa = await prisma.chartOfAccounts.findFirst({
    where: {
      OR: [
        { accountNo: '1000' },
        { accountName: { contains: 'Cash and Cash Equivalent' } },
      ],
      isActive: true,
    },
    orderBy: { accountNo: 'asc' },
  });
  if (!coa) {
    coa = await prisma.chartOfAccounts.create({
      data: {
        accountNo: '1000',
        accountName: 'Cash and Cash Equivalents',
        accountType: 'Current Asset',
        financialStatement: 'Balance Sheet',
        isActive: true,
      },
    });
    console.log('Created shared GL 1000 — Cash and Cash Equivalents for UAT banks');
  }
  return coa;
}

async function ensureBank(params: {
  name: string;
  accountNumber: string;
  currencyId: string;
  glAccountId: string;
}) {
  const existing = await prisma.bank.findFirst({
    where: { accountNumber: params.accountNumber },
    include: { currency: true, glAccount: true },
  });
  if (existing) {
    if (existing.glAccountId !== params.glAccountId || !existing.isActive) {
      await prisma.bank.update({
        where: { id: existing.id },
        data: { glAccountId: params.glAccountId, isActive: true },
      });
    }
    const refreshed = await prisma.bank.findFirst({
      where: { accountNumber: params.accountNumber },
      include: { currency: true, glAccount: true },
    });
    return { bank: refreshed!, created: false };
  }
  const bank = await prisma.bank.create({
    data: {
      name: params.name,
      accountNumber: params.accountNumber,
      currencyId: params.currencyId,
      glAccountId: params.glAccountId,
      isActive: true,
    },
    include: { currency: true, glAccount: true },
  });
  return { bank, created: true };
}

async function main() {
  console.log('UAT multicurrency banks — shared Cash and Cash Equivalents GL + 3 banks...\n');

  const usd = await ensureCurrency('USD', 'US Dollar', '$');
  const zar = await ensureCurrency('ZAR', 'South African Rand', 'R');
  const zwl = await ensureCurrency('ZWL', 'Zimbabwean Dollar', 'ZWL');

  const glShared = await ensureSharedCashGl();

  console.log('Currencies:', {
    USD: usd.id,
    ZAR: zar.id,
    ZWL: zwl.id,
  });
  console.log('Shared GL:', { id: glShared.id, accountNo: glShared.accountNo, name: glShared.accountName });

  const results = [];

  const usdBank = await ensureBank({
    name: 'UAT Bank — USD',
    accountNumber: BANK_ACCOUNT_NOS.usd,
    currencyId: usd.id,
    glAccountId: glShared.id,
  });
  results.push({ ...usdBank, label: 'USD' });

  const zarBank = await ensureBank({
    name: 'UAT Bank — ZAR (Rand)',
    accountNumber: BANK_ACCOUNT_NOS.zar,
    currencyId: zar.id,
    glAccountId: glShared.id,
  });
  results.push({ ...zarBank, label: 'ZAR' });

  const zwlBank = await ensureBank({
    name: 'UAT Bank — ZWL (Zimbabwe dollar)',
    accountNumber: BANK_ACCOUNT_NOS.zwl,
    currencyId: zwl.id,
    glAccountId: glShared.id,
  });
  results.push({ ...zwlBank, label: 'ZWL' });

  console.log('\nBanks:');
  for (const r of results) {
    const b = r.bank as any;
    console.log(
      `  [${r.label}] ${r.created ? 'CREATED' : 'already existed'}  id=${b.id}  accountNumber=${b.accountNumber}  currency=${b.currency?.code ?? '?'}  GL=${b.glAccount?.accountNo ?? '?'}`
    );
  }

  console.log('\nJSON (for Postman / docs):');
  console.log(
    JSON.stringify(
      {
        uatBankUsd: { id: (results[0].bank as any).id, accountNumber: BANK_ACCOUNT_NOS.usd },
        uatBankZar: { id: (results[1].bank as any).id, accountNumber: BANK_ACCOUNT_NOS.zar },
        uatBankZwl: { id: (results[2].bank as any).id, accountNumber: BANK_ACCOUNT_NOS.zwl },
        currencyUsdId: usd.id,
        currencyZarId: zar.id,
        currencyZwlId: zwl.id,
        cashAndCashEquivalentsGlId: glShared.id,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
