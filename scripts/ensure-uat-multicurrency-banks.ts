/**
 * Ensures currencies (ZAR, ZWL), GL accounts, and three UAT cashbook banks:
 *   USD, ZAR (Rand), ZWL (Zimbabwe dollar).
 *
 * Run: npx ts-node scripts/ensure-uat-multicurrency-banks.ts
 * Uses DATABASE_URL from .env
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BANK_ACCOUNT_NOS = {
  usd: 'UAT-MCY-USD-001',
  zar: 'UAT-MCY-ZAR-001',
  zwl: 'UAT-MCY-ZWL-001'
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
      isDefault: false
    }
  });
}

async function ensureCoa(accountNo: string, accountName: string) {
  const existing = await prisma.chartOfAccounts.findUnique({ where: { accountNo } });
  if (existing) {
    return existing;
  }
  return prisma.chartOfAccounts.create({
    data: {
      accountNo,
      accountName,
      accountType: 'Current Asset',
      financialStatement: 'Balance Sheet',
      isActive: true
    }
  });
}

/** First listed COA that exists, is active, and is not already linked to a bank. */
async function pickUnlinkedGl(preferredAccountNos: string[]) {
  for (const accountNo of preferredAccountNos) {
    const coa = await prisma.chartOfAccounts.findFirst({
      where: { accountNo, isActive: true }
    });
    if (!coa) continue;
    const taken = await prisma.bank.findFirst({ where: { glAccountId: coa.id } });
    if (!taken) {
      return coa;
    }
  }
  return null;
}

async function ensureBank(params: {
  name: string;
  accountNumber: string;
  currencyId: string;
  glAccountId: string;
}) {
  const existing = await prisma.bank.findFirst({
    where: { accountNumber: params.accountNumber },
    include: { currency: true, glAccount: true }
  });
  if (existing) {
    return { bank: existing, created: false };
  }
  const bank = await prisma.bank.create({
    data: {
      name: params.name,
      accountNumber: params.accountNumber,
      currencyId: params.currencyId,
      glAccountId: params.glAccountId,
      isActive: true
    },
    include: { currency: true, glAccount: true }
  });
  return { bank, created: true };
}

async function main() {
  console.log('UAT multicurrency banks — ensuring currencies, GL, and 3 banks...\n');

  const usd = await ensureCurrency('USD', 'US Dollar', '$');
  const zar = await ensureCurrency('ZAR', 'South African Rand', 'R');
  const zwl = await ensureCurrency('ZWL', 'Zimbabwean Dollar', 'ZWL');

  console.log('Currencies:', {
    USD: usd.id,
    ZAR: zar.id,
    ZWL: zwl.id
  });

  // USD: prefer spare standard bank GLs
  let glUsd = await pickUnlinkedGl(['1020', '1030', '1101', '1110', '1120', '1010']);
  if (!glUsd) {
    glUsd = await ensureCoa('1055', 'UAT — Operating Bank USD');
    console.log('Created GL 1055 for USD (no free standard bank GL left)');
  }

  // ZAR: 1040 "Bank Account - ZAR" from seeds, else dedicated UAT line
  let glZar = await pickUnlinkedGl(['1040']);
  if (!glZar) {
    glZar = await ensureCoa('1045', 'UAT — Operating Bank ZAR');
    console.log('Using / created GL for ZAR:', glZar.accountNo);
  }

  // ZWL: dedicated COA so we do not collide with USD petty cash
  let glZwl = await pickUnlinkedGl(['1050']);
  if (!glZwl) {
    glZwl = await ensureCoa('1051', 'UAT — Operating Bank ZWL');
  }

  const results = [];

  const usdBank = await ensureBank({
    name: 'UAT Bank — USD',
    accountNumber: BANK_ACCOUNT_NOS.usd,
    currencyId: usd.id,
    glAccountId: glUsd.id
  });
  results.push({ ...usdBank, label: 'USD' });

  const zarBank = await ensureBank({
    name: 'UAT Bank — ZAR (Rand)',
    accountNumber: BANK_ACCOUNT_NOS.zar,
    currencyId: zar.id,
    glAccountId: glZar.id
  });
  results.push({ ...zarBank, label: 'ZAR' });

  const zwlBank = await ensureBank({
    name: 'UAT Bank — ZWL (Zimbabwe dollar)',
    accountNumber: BANK_ACCOUNT_NOS.zwl,
    currencyId: zwl.id,
    glAccountId: glZwl.id
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
        currencyZwlId: zwl.id
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
