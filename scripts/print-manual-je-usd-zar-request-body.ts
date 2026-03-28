/**
 * Prints a ready-to-paste POST body for manual JE (USD line 1, ZAR line 2) using DB + live Zimrate.
 * Run: npx ts-node scripts/print-manual-je-usd-zar-request-body.ts
 */
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaClient } from '@prisma/client';
import { resolveUsdZwgAvgForSnapshot } from '../src/services/UsdZwgRateResolver';
import { fetchZimrateRates, extractZwgPerZar } from '../src/services/ZimrateRateService';

const prisma = new PrismaClient();

async function main() {
  const usd = await prisma.currency.findFirst({ where: { code: 'USD' } });
  const zar = await prisma.currency.findFirst({ where: { code: 'ZAR' } });
  const c1200 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '1200' } });
  const c1000 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '1000' } });

  if (!usd || !zar || !c1200 || !c1000) {
    throw new Error(
      `Missing data: USD=${!!usd} ZAR=${!!zar} COA1200=${!!c1200} COA1000=${!!c1000}`
    );
  }

  const usdAmount = 100;
  const usdZwg = await resolveUsdZwgAvgForSnapshot(prisma);
  const full = await fetchZimrateRates();
  const zarPair = extractZwgPerZar(full);
  if (usdZwg == null || usdZwg <= 0 || zarPair == null) {
    throw new Error('Could not resolve USD→ZiG or ZAR→ZiG rates');
  }
  const zig = new Decimal(usdAmount).mul(usdZwg);
  const zarCredit = zig.div(zarPair.zwgPerZar).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toNumber();

  const body = {
    transactionDate: new Date().toISOString(),
    referenceNumber: `MJ-DEV-${Date.now()}`,
    description: 'Manual JE: USD Dr / ZAR Cr (ZiG balanced)',
    currencyId: usd.id,
    journalEntryLines: [
      {
        chartOfAccountId: c1200.id,
        debitAmount: usdAmount,
        creditAmount: 0,
        description: 'Dr USD (AR)',
        currencyId: usd.id,
      },
      {
        chartOfAccountId: c1000.id,
        debitAmount: 0,
        creditAmount: zarCredit,
        description: 'Cr ZAR (cash)',
        currencyId: zar.id,
      },
    ],
  };

  console.log(JSON.stringify(body, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
